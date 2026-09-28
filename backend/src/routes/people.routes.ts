import { scopeParam, assertProjectInWorld } from "../lib/scope"
import { Router } from "express"
import { z } from "zod"
import { PersonStage } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { asyncHandler } from "../lib/asyncHandler"
import { requireAuth } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"
import { logActivity } from "../services/activityService"
import { broadcastToWorld } from "../realtime/socket"

export const peopleRouter = Router({ mergeParams: true })
peopleRouter.use(requireAuth)
scopeParam(peopleRouter, "personId", "person")

peopleRouter.get(
  "/",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const people = await prisma.person.findMany({ where: { worldId: req.worldId!, deletedAt: null }, include: { company: true }, orderBy: { createdAt: "desc" } })
    res.json({ people: people.map(serializePerson) })
  })
)

const createSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  name: z.string().min(1).max(150),
  companyName: z.string().optional(), // free text; resolved/created as a Company row
  role: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  stage: z.nativeEnum(PersonStage).default("new"),
  notes: z.string().default(""),
})

async function resolveCompany(worldId: string, name?: string): Promise<string | null> {
  const trimmed = name?.trim()
  if (!trimmed) return null
  const company = await prisma.company.upsert({
    where: { worldId_name: { worldId, name: trimmed } },
    create: { worldId, name: trimmed },
    update: {},
  })
  return company.id
}

peopleRouter.post(
  "/",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = createSchema.parse(req.body)
    await assertProjectInWorld(req.worldId!, body.projectId)
    const companyId = await resolveCompany(req.worldId!, body.companyName)
    const person = await prisma.person.create({
      data: {
        id: body.id,
        worldId: req.worldId!,
        projectId: body.projectId,
        name: body.name,
        companyId,
        role: body.role,
        email: body.email,
        phone: body.phone,
        stage: body.stage,
        notes: body.notes,
      },
      include: { company: true },
    })
    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "person.created", text: `added ${person.name} to CRM`, entityType: "person", entityId: person.id })
    broadcastToWorld(req.worldId!, "person.upserted", serializePerson(person))
    res.status(201).json({ person: serializePerson(person) })
  })
)

const updateSchema = createSchema.partial()

peopleRouter.patch(
  "/:personId",
  requireWorldRole("commenter"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = updateSchema.parse(req.body)
    const { companyName, ...rest } = body
    const companyId = companyName !== undefined ? await resolveCompany(req.worldId!, companyName) : undefined
    const person = await prisma.person.update({
      where: { id: req.params.personId },
      data: { ...rest, ...(companyName !== undefined ? { companyId } : {}) },
      include: { company: true },
    })
    broadcastToWorld(req.worldId!, "person.upserted", serializePerson(person))
    res.json({ person: serializePerson(person) })
  })
)

peopleRouter.delete(
  "/:personId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    await prisma.person.update({ where: { id: req.params.personId }, data: { deletedAt: new Date() } })
    broadcastToWorld(req.worldId!, "person.deleted", { id: req.params.personId })
    res.status(204).send()
  })
)

function serializePerson(p: any) {
  return {
    id: p.id,
    worldId: p.worldId,
    projectId: p.projectId ?? undefined,
    name: p.name,
    company: p.company?.name ?? "",
    role: p.role,
    email: p.email,
    phone: p.phone,
    stage: p.stage,
    notes: p.notes,
  }
}
