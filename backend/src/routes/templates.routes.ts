import { scopeParam } from "../lib/scope"
import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { asyncHandler } from "../lib/asyncHandler"
import { requireAuth } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"

export const templatesRouter = Router({ mergeParams: true })
templatesRouter.use(requireAuth)
scopeParam(templatesRouter, "templateId", "template")

templatesRouter.get(
  "/",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const templates = await prisma.template.findMany({ where: { worldId: req.worldId! }, orderBy: { createdAt: "desc" } })
    res.json({ templates })
  })
)

const createSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().default(""),
  icon: z.string().default("📄"),
  blocksSnapshot: z.array(z.any()).default([]),
})

templatesRouter.post(
  "/",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = createSchema.parse(req.body)
    const template = await prisma.template.create({ data: { ...body, worldId: req.worldId! } })
    res.status(201).json({ template })
  })
)

// Instantiate a template into a new Page.
templatesRouter.post(
  "/:templateId/use",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const template = await prisma.template.findFirstOrThrow({ where: { id: req.params.templateId, worldId: req.worldId! } })
    const blocks = (template.blocksSnapshot as any[]) ?? []
    const page = await prisma.page.create({
      data: {
        worldId: req.worldId!,
        title: template.name,
        icon: template.icon,
        updatedById: req.userId!,
        blocks: { create: blocks.map((b, i) => ({ type: b.type, position: i, content: b.content ?? {} })) },
      },
      include: { blocks: true },
    })
    res.status(201).json({ page })
  })
)

templatesRouter.delete(
  "/:templateId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    await prisma.template.delete({ where: { id: req.params.templateId } })
    res.status(204).send()
  })
)
