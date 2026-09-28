import { scopeParam } from "../lib/scope"
import { Router } from "express"
import { z } from "zod"
import { BlockType } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { asyncHandler, forbidden } from "../lib/asyncHandler"
import { requireAuth } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"
import { logActivity } from "../services/activityService"
import { broadcastToWorld } from "../realtime/socket"
import { snapshotPageVersion, restorePageVersion } from "../services/versionService"

export const pagesRouter = Router({ mergeParams: true })
pagesRouter.use(requireAuth)
scopeParam(pagesRouter, "pageId", "page")
scopeParam(pagesRouter, "versionId", "version")

function requireEditor(req: WorldScopedRequest) {
  if (req.worldRole === "viewer") throw forbidden("Viewers cannot modify pages")
}

pagesRouter.get(
  "/",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const pages = await prisma.page.findMany({
      where: { worldId: req.worldId!, deletedAt: null },
      include: { blocks: { orderBy: { position: "asc" } }, tags: { include: { tag: true } } },
      orderBy: { updatedAt: "desc" },
    })
    res.json({ pages: pages.map(serializePage) })
  })
)

const blockInput = z.object({
  id: z.string().optional(), // client-generated id, preserved for optimistic UI reconciliation
  type: z.nativeEnum(BlockType),
  content: z.record(z.any()).default({}),
})

const createPageSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200).default("Untitled"),
  icon: z.string().default("📄"),
  tags: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
  isTemplate: z.boolean().default(false),
  blocks: z.array(blockInput).default([]),
})

pagesRouter.post(
  "/",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = createPageSchema.parse(req.body)
    const page = await prisma.page.create({
      data: {
        id: body.id,
        worldId: req.worldId!,
        title: body.title,
        icon: body.icon,
        pinned: body.pinned,
        isTemplate: body.isTemplate,
        updatedById: req.userId!,
        blocks: { create: body.blocks.map((b, i) => ({ id: b.id, type: b.type, position: i, content: b.content })) },
      },
      include: { blocks: { orderBy: { position: "asc" } }, tags: { include: { tag: true } } },
    })
    await Promise.all(body.tags.map((name) => attachTag(req.worldId!, "page", page.id, name)))
    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "page.created", text: "created a page", entityType: "page", entityId: page.id })
    await snapshotPageVersion(page.id, req.userId!)
    const full = await prisma.page.findUniqueOrThrow({ where: { id: page.id }, include: { blocks: { orderBy: { position: "asc" } }, tags: { include: { tag: true } } } })
    broadcastToWorld(req.worldId!, "page.upserted", serializePage(full))
    res.status(201).json({ page: serializePage(full) })
  })
)

pagesRouter.get(
  "/:pageId",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const page = await prisma.page.findFirstOrThrow({
      where: { id: req.params.pageId, worldId: req.worldId! },
      include: { blocks: { orderBy: { position: "asc" } }, tags: { include: { tag: true } } },
    })
    res.json({ page: serializePage(page) })
  })
)

const updatePageSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  icon: z.string().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  isTemplate: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  blocks: z.array(blockInput).optional(), // full replace of block list, order preserved
})

pagesRouter.patch(
  "/:pageId",
  requireWorldRole("commenter"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    requireEditor(req)
    const body = updatePageSchema.parse(req.body)
    const { blocks, tags, ...pageFields } = body

    await prisma.$transaction(async (tx) => {
      await tx.page.update({
        where: { id: req.params.pageId },
        data: { ...pageFields, updatedById: req.userId! },
      })
      if (blocks) {
        await tx.block.deleteMany({ where: { pageId: req.params.pageId } })
        await tx.block.createMany({
          data: blocks.map((b, i) => ({ id: b.id, pageId: req.params.pageId, type: b.type, position: i, content: b.content })),
        })
      }
    })

    if (tags) {
      await prisma.taggedItem.deleteMany({ where: { pageId: req.params.pageId } })
      await Promise.all(tags.map((name) => attachTag(req.worldId!, "page", req.params.pageId, name)))
    }

    await snapshotPageVersion(req.params.pageId, req.userId!, { minIntervalMs: 2 * 60 * 1000 })
    const full = await prisma.page.findUniqueOrThrow({ where: { id: req.params.pageId }, include: { blocks: { orderBy: { position: "asc" } }, tags: { include: { tag: true } } } })
    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "page.updated", text: `edited "${full.title}"`, entityType: "page", entityId: full.id })
    broadcastToWorld(req.worldId!, "page.upserted", serializePage(full), req.headers["x-socket-id"] as string)
    res.json({ page: serializePage(full) })
  })
)

pagesRouter.delete(
  "/:pageId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    await prisma.page.update({ where: { id: req.params.pageId }, data: { deletedAt: new Date() } })
    broadcastToWorld(req.worldId!, "page.deleted", { id: req.params.pageId })
    res.status(204).send()
  })
)

pagesRouter.post(
  "/:pageId/duplicate",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const src = await prisma.page.findFirstOrThrow({ where: { id: req.params.pageId, worldId: req.worldId! }, include: { blocks: { orderBy: { position: "asc" } } } })
    const copy = await prisma.page.create({
      data: {
        worldId: req.worldId!,
        title: `${src.title} (copy)`,
        icon: src.icon,
        updatedById: req.userId!,
        blocks: { create: src.blocks.map((b) => ({ type: b.type, position: b.position, content: b.content as any })) },
      },
      include: { blocks: { orderBy: { position: "asc" } }, tags: { include: { tag: true } } },
    })
    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "page.duplicated", text: `duplicated "${src.title}"`, entityType: "page", entityId: copy.id })
    broadcastToWorld(req.worldId!, "page.upserted", serializePage(copy))
    res.status(201).json({ page: serializePage(copy) })
  })
)

pagesRouter.post(
  "/:pageId/restore",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    await prisma.page.update({ where: { id: req.params.pageId }, data: { deletedAt: null, archived: false } })
    const full = await prisma.page.findUniqueOrThrow({ where: { id: req.params.pageId }, include: { blocks: { orderBy: { position: "asc" } }, tags: { include: { tag: true } } } })
    broadcastToWorld(req.worldId!, "page.upserted", serializePage(full))
    res.json({ page: serializePage(full) })
  })
)

// --- Version history ---------------------------------------------------

// Explicit "save a version" (autosaves are throttled snapshots).
pagesRouter.post(
  "/:pageId/versions",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const v = await snapshotPageVersion(req.params.pageId, req.userId!)
    res.status(201).json({ version: { id: v.id, versionNumber: v.versionNumber, createdAt: v.createdAt } })
  })
)

pagesRouter.get(
  "/:pageId/versions",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const versions = await prisma.version.findMany({
      where: { entityType: "page", entityId: req.params.pageId },
      orderBy: { versionNumber: "desc" },
      include: { author: { include: { profile: true } } },
    })
    res.json({
      versions: versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        authorName: v.author.profile?.name ?? v.author.email,
      })),
    })
  })
)

pagesRouter.get(
  "/:pageId/versions/:versionId",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const version = await prisma.version.findFirstOrThrow({ where: { id: req.params.versionId, entityId: req.params.pageId } })
    res.json({ version })
  })
)

pagesRouter.post(
  "/:pageId/versions/:versionId/restore",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    await restorePageVersion(req.params.pageId, req.params.versionId, req.userId!)
    const full = await prisma.page.findUniqueOrThrow({ where: { id: req.params.pageId }, include: { blocks: { orderBy: { position: "asc" } }, tags: { include: { tag: true } } } })
    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "page.version_restored", text: `restored a previous version of "${full.title}"`, entityType: "page", entityId: full.id })
    broadcastToWorld(req.worldId!, "page.upserted", serializePage(full))
    res.json({ page: serializePage(full) })
  })
)

async function attachTag(worldId: string, itemType: "page", itemId: string, name: string) {
  const tag = await prisma.tag.upsert({
    where: { worldId_name: { worldId, name } },
    create: { worldId, name },
    update: {},
  })
  await prisma.taggedItem.create({ data: { tagId: tag.id, itemType, itemId, pageId: itemId } })
}

function serializePage(p: any) {
  return {
    id: p.id,
    worldId: p.worldId,
    title: p.title,
    icon: p.icon,
    pinned: p.pinned,
    archived: p.archived,
    template: p.isTemplate,
    tags: (p.tags ?? []).map((t: any) => t.tag.name),
    blocks: p.blocks.map((b: any) => ({ id: b.id, type: b.type, ...(b.content as object) })),
    createdAt: p.createdAt.getTime?.() ?? p.createdAt,
    updatedAt: p.updatedAt.getTime?.() ?? p.updatedAt,
    updatedBy: p.updatedById,
  }
}
