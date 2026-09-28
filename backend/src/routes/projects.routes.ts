import { scopeParam } from "../lib/scope"
import { Router } from "express"
import { z } from "zod"
import { ProjectStatus } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { asyncHandler, forbidden } from "../lib/asyncHandler"
import { requireAuth } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"
import { logActivity } from "../services/activityService"
import { broadcastToWorld } from "../realtime/socket"

export const projectsRouter = Router({ mergeParams: true })
projectsRouter.use(requireAuth)
scopeParam(projectsRouter, "projectId", "project")

projectsRouter.get(
  "/",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const projects = await prisma.project.findMany({ where: { worldId: req.worldId!, deletedAt: null }, orderBy: { createdAt: "desc" } })
    res.json({ projects: projects.map(serializeProject) })
  })
)

const createSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(150),
  status: z.nativeEnum(ProjectStatus).default("idea"),
  description: z.string().default(""),
  investment: z.number().default(0),
  goal: z.string().default(""),
})

projectsRouter.post(
  "/",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = createSchema.parse(req.body)
    const project = await prisma.project.create({ data: { ...body, worldId: req.worldId! } })
    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "project.created", text: `created project "${project.name}"`, entityType: "project", entityId: project.id })
    broadcastToWorld(req.worldId!, "project.upserted", serializeProject(project))
    res.status(201).json({ project: serializeProject(project) })
  })
)

const updateSchema = createSchema.partial()

projectsRouter.patch(
  "/:projectId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = updateSchema.parse(req.body)
    const project = await prisma.project.update({ where: { id: req.params.projectId }, data: body })
    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "project.updated", text: `updated project "${project.name}"`, entityType: "project", entityId: project.id })
    broadcastToWorld(req.worldId!, "project.upserted", serializeProject(project))
    res.json({ project: serializeProject(project) })
  })
)

projectsRouter.delete(
  "/:projectId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    if (req.worldRole === "viewer" || req.worldRole === "commenter") throw forbidden()
    await prisma.project.update({ where: { id: req.params.projectId }, data: { deletedAt: new Date() } })
    broadcastToWorld(req.worldId!, "project.deleted", { id: req.params.projectId })
    res.status(204).send()
  })
)

function serializeProject(p: any) {
  return { id: p.id, worldId: p.worldId, name: p.name, status: p.status, description: p.description, investment: p.investment, goal: p.goal }
}
