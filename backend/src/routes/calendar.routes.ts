import { scopeParam } from "../lib/scope"
import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { asyncHandler } from "../lib/asyncHandler"
import { requireAuth } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"

export const calendarRouter = Router({ mergeParams: true })
calendarRouter.use(requireAuth)
scopeParam(calendarRouter, "eventId", "calendarEvent")

calendarRouter.get(
  "/",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const events = await prisma.calendarEvent.findMany({ where: { worldId: req.worldId!, deletedAt: null }, orderBy: { startsAt: "asc" } })
    res.json({ events: events.map(serializeEvent) })
  })
)

const createSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  title: z.string().min(1).max(200),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  allDay: z.boolean().default(false),
  location: z.string().default(""),
})

calendarRouter.post(
  "/",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = createSchema.parse(req.body)
    const event = await prisma.calendarEvent.create({
      data: { ...body, startsAt: new Date(body.startsAt), endsAt: body.endsAt ? new Date(body.endsAt) : undefined, worldId: req.worldId!, ownerId: req.userId! },
    })
    res.status(201).json({ event: serializeEvent(event) })
  })
)

const updateSchema = createSchema.partial()

calendarRouter.patch(
  "/:eventId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = updateSchema.parse(req.body)
    const event = await prisma.calendarEvent.update({
      where: { id: req.params.eventId },
      data: { ...body, startsAt: body.startsAt ? new Date(body.startsAt) : undefined, endsAt: body.endsAt ? new Date(body.endsAt) : undefined },
    })
    res.json({ event: serializeEvent(event) })
  })
)

calendarRouter.delete(
  "/:eventId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    await prisma.calendarEvent.update({ where: { id: req.params.eventId }, data: { deletedAt: new Date() } })
    res.status(204).send()
  })
)

function serializeEvent(e: any) {
  return { id: e.id, worldId: e.worldId, projectId: e.projectId ?? undefined, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, allDay: e.allDay, location: e.location }
}
