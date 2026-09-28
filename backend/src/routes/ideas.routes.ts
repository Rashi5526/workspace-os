import { scopeParam } from "../lib/scope"
import { Router } from "express"
import { z } from "zod"
import { IdeaStatus } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { asyncHandler } from "../lib/asyncHandler"
import { requireAuth } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"
import { logActivity } from "../services/activityService"
import { broadcastToWorld } from "../realtime/socket"

export const ideasRouter = Router({ mergeParams: true })
ideasRouter.use(requireAuth)
scopeParam(ideasRouter, "ideaId", "idea")

ideasRouter.get(
  "/",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const ideas = await prisma.idea.findMany({ where: { worldId: req.worldId!, deletedAt: null }, orderBy: { createdAt: "desc" } })
    res.json({ ideas: ideas.map(serializeIdea) })
  })
)

const createSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  note: z.string().default(""),
  status: z.nativeEnum(IdeaStatus).default("thought"),
})

ideasRouter.post(
  "/",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = createSchema.parse(req.body)
    const idea = await prisma.idea.create({ data: { ...body, worldId: req.worldId!, createdById: req.userId! } })
    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "idea.created", text: `captured idea "${idea.title}"`, entityType: "idea", entityId: idea.id })
    broadcastToWorld(req.worldId!, "idea.upserted", serializeIdea(idea))
    res.status(201).json({ idea: serializeIdea(idea) })
  })
)

const updateSchema = createSchema.partial()

ideasRouter.patch(
  "/:ideaId",
  requireWorldRole("commenter"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = updateSchema.parse(req.body)
    const idea = await prisma.idea.update({ where: { id: req.params.ideaId }, data: body })
    broadcastToWorld(req.worldId!, "idea.upserted", serializeIdea(idea))
    res.json({ idea: serializeIdea(idea) })
  })
)

ideasRouter.delete(
  "/:ideaId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    await prisma.idea.update({ where: { id: req.params.ideaId }, data: { deletedAt: new Date() } })
    broadcastToWorld(req.worldId!, "idea.deleted", { id: req.params.ideaId })
    res.status(204).send()
  })
)

function serializeIdea(i: any) {
  return { id: i.id, worldId: i.worldId, title: i.title, note: i.note, status: i.status, createdAt: i.createdAt.getTime?.() ?? i.createdAt }
}
