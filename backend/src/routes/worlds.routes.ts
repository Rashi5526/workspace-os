import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { asyncHandler, forbidden } from "../lib/asyncHandler"
import { requireAuth, type AuthedRequest } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"
import { logActivity } from "../services/activityService"
import { broadcastToWorld } from "../realtime/socket"

export const worldsRouter = Router()
worldsRouter.use(requireAuth)

// List every world the caller is a member of (owner or invited).
worldsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const memberships = await prisma.worldMember.findMany({
      where: { userId: req.userId! },
      include: { world: true },
    })
    const worlds = memberships
      .filter((m) => !m.world.deletedAt)
      .map((m) => ({ ...serializeWorld(m.world), myRole: m.role }))
    res.json({ worlds })
  })
)

const createSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(100),
  icon: z.string().default("🗂️"),
  accent: z.string().default("#4b5bff"),
  description: z.string().default(""),
  access: z.enum(["private", "shared"]).default("private"),
  sandbox: z.boolean().default(false),
})

worldsRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = createSchema.parse(req.body)
    const world = await prisma.world.create({
      data: {
        ...body,
        ownerId: req.userId!,
        members: { create: { userId: req.userId!, role: "owner" } },
      },
    })
    await logActivity({ worldId: world.id, actorId: req.userId!, action: "world.created", text: `created world "${world.name}"` })
    res.status(201).json({ world: serializeWorld(world) })
  })
)

worldsRouter.get(
  "/:worldId",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const world = await prisma.world.findUniqueOrThrow({ where: { id: req.worldId! } })
    res.json({ world: serializeWorld(world), myRole: req.worldRole })
  })
)

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().optional(),
  accent: z.string().optional(),
  description: z.string().optional(),
  access: z.enum(["private", "shared"]).optional(),
  archived: z.boolean().optional(),
})

worldsRouter.patch(
  "/:worldId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = updateSchema.parse(req.body)
    // Only an owner may change access (private/shared) or archive the world.
    if ((body.access !== undefined || body.archived !== undefined) && req.worldRole !== "owner") {
      throw forbidden("Only the world owner can change access or archive this world")
    }
    const world = await prisma.world.update({ where: { id: req.worldId! }, data: body })
    await logActivity({
      worldId: world.id,
      actorId: req.userId!,
      action: "world.updated",
      text: body.archived ? `archived world "${world.name}"` : `updated world "${world.name}"`,
    })
    broadcastToWorld(world.id, "world.upserted", serializeWorld(world))
    res.json({ world: serializeWorld(world) })
  })
)

worldsRouter.delete(
  "/:worldId",
  requireWorldRole("owner"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    await prisma.world.update({ where: { id: req.worldId! }, data: { deletedAt: new Date() } })
    broadcastToWorld(req.worldId!, "world.deleted", { id: req.worldId })
    res.status(204).send()
  })
)

function serializeWorld(w: { id: string; name: string; icon: string; accent: string; description: string; access: string; archived: boolean; sandbox: boolean }) {
  return {
    id: w.id,
    name: w.name,
    icon: w.icon,
    accent: w.accent,
    description: w.description,
    access: w.access,
    archived: w.archived,
    sandbox: w.sandbox,
  }
}
