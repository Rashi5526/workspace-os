import { scopeParam, assertProjectInWorld } from "../lib/scope"
import { Router } from "express"
import { z } from "zod"
import { TxType } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { asyncHandler, badRequest, notFound } from "../lib/asyncHandler"
import { requireAuth } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"
import { logActivity } from "../services/activityService"
import { broadcastToWorld } from "../realtime/socket"
import { computeSplitShares, computeWorldBalances } from "../services/splitService"

export const transactionsRouter = Router({ mergeParams: true })
transactionsRouter.use(requireAuth)
scopeParam(transactionsRouter, "txId", "transaction")

transactionsRouter.get(
  "/",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const transactions = await prisma.transaction.findMany({
      where: { worldId: req.worldId!, deletedAt: null },
      include: { splitParticipants: true },
      orderBy: { date: "desc" },
    })
    res.json({ transactions: transactions.map(serializeTx) })
  })
)

// Live balances: who owes whom, computed from unsettled split transactions.
transactionsRouter.get(
  "/balances",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    res.json({ balances: await computeWorldBalances(req.worldId!) })
  })
)

const createSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  type: z.nativeEnum(TxType),
  amount: z.number().positive(),
  date: z.string(), // ISO date
  category: z.string().default("General"),
  description: z.string().default(""),
  method: z.string().default("Other"),
  payerId: z.string(), // must be a world member
  // When splitting: userId -> share percent. Must sum to 100 and include the payer.
  split: z
    .object({
      shares: z.record(z.number().positive()),
    })
    .optional(),
})

transactionsRouter.post(
  "/",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = createSchema.parse(req.body)
    await assertProjectInWorld(req.worldId!, body.projectId)

    const payerMembership = await prisma.worldMember.findUnique({ where: { worldId_userId: { worldId: req.worldId!, userId: body.payerId } } })
    if (!payerMembership) throw badRequest("payerId must be a member of this world")

    let splitRows: { userId: string; sharePercent: number; owedAmount: number; isPayer: boolean }[] = []
    if (body.split) {
      if (!(body.payerId in body.split.shares)) throw badRequest("Split shares must include the payer")
      for (const uid of Object.keys(body.split.shares)) {
        const m = await prisma.worldMember.findUnique({ where: { worldId_userId: { worldId: req.worldId!, userId: uid } } })
        if (!m) throw badRequest(`Split participant ${uid} is not a member of this world`)
      }
      try {
        splitRows = computeSplitShares(body.amount, { shares: body.split.shares, payerId: body.payerId })
      } catch (e: any) {
        throw badRequest(e.message)
      }
    }

    const tx = await prisma.transaction.create({
      data: {
        id: body.id,
        worldId: req.worldId!,
        projectId: body.projectId,
        type: body.type,
        amount: body.amount,
        date: new Date(body.date),
        category: body.category,
        description: body.description,
        method: body.method,
        payerId: body.payerId,
        isSplit: !!body.split,
        splitParticipants: body.split
          ? { create: splitRows.map((r) => ({ userId: r.userId, sharePercent: r.sharePercent, owedAmount: r.owedAmount, isPayer: r.isPayer })) }
          : undefined,
      },
      include: { splitParticipants: true },
    })

    await logActivity({
      worldId: req.worldId!,
      actorId: req.userId!,
      action: "transaction.created",
      text: `added a ₹${body.amount.toLocaleString("en-IN")} ${body.type}${body.split ? " (split)" : ""}`,
      entityType: "transaction",
      entityId: tx.id,
    })
    broadcastToWorld(req.worldId!, "transaction.upserted", serializeTx(tx))
    res.status(201).json({ transaction: serializeTx(tx) })
  })
)

const updateSchema = createSchema.partial().omit({ split: true })

transactionsRouter.patch(
  "/:txId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = updateSchema.parse(req.body)
    const tx = await prisma.transaction.update({
      where: { id: req.params.txId },
      data: { ...body, date: body.date ? new Date(body.date) : undefined },
      include: { splitParticipants: true },
    })
    broadcastToWorld(req.worldId!, "transaction.upserted", serializeTx(tx))
    res.json({ transaction: serializeTx(tx) })
  })
)

transactionsRouter.delete(
  "/:txId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    await prisma.transaction.update({ where: { id: req.params.txId }, data: { deletedAt: new Date() } })
    broadcastToWorld(req.worldId!, "transaction.deleted", { id: req.params.txId })
    res.status(204).send()
  })
)

// Marks every currently-split, unsettled transaction in the world as
// settled — mirrors the frontend's "Settle up" button, done server-side so
// the settlement is real and auditable (settledAt timestamp) rather than a
// client-side flag flip.
transactionsRouter.post(
  "/settle",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const result = await prisma.transaction.updateMany({
      where: { worldId: req.worldId!, isSplit: true, settledAt: null, deletedAt: null },
      data: { settledAt: new Date() },
    })
    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "transaction.settled", text: "settled shared balance" })
    const settled = await prisma.transaction.findMany({ where: { worldId: req.worldId!, isSplit: true, deletedAt: null }, include: { splitParticipants: true } })
    for (const t of settled) broadcastToWorld(req.worldId!, "transaction.upserted", serializeTx(t))
    res.json({ settledCount: result.count })
  })
)

function serializeTx(t: any) {
  return {
    id: t.id,
    worldId: t.worldId,
    projectId: t.projectId ?? undefined,
    type: t.type,
    amount: t.amount,
    date: t.date.toISOString().slice(0, 10),
    category: t.category,
    description: t.description,
    person: t.payerId,
    method: t.method,
    split: t.isSplit,
    settled: !!t.settledAt,
    splitParticipants: (t.splitParticipants ?? []).map((s: any) => ({ userId: s.userId, sharePercent: s.sharePercent, owedAmount: s.owedAmount, isPayer: s.isPayer })),
  }
}
