import { scopeParam, assertProjectInWorld } from "../lib/scope"
import { Router } from "express"
import multer from "multer"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { asyncHandler, notFound } from "../lib/asyncHandler"
import { requireAuth } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"
import { logActivity } from "../services/activityService"
import { broadcastToWorld } from "../realtime/socket"
import { storage, makeStorageKey } from "../storage/storageProvider"

export const filesRouter = Router({ mergeParams: true })
filesRouter.use(requireAuth)
scopeParam(filesRouter, "fileId", "file")

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }) // 50MB

function kindFromMime(mime: string): string {
  if (mime.startsWith("image/")) return "image"
  if (mime === "application/pdf") return "pdf"
  return "file"
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

filesRouter.get(
  "/",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const files = await prisma.file.findMany({ where: { worldId: req.worldId!, deletedAt: null }, include: { folder: true }, orderBy: { createdAt: "desc" } })
    res.json({ files: files.map(serializeFile) })
  })
)

const folderNameSchema = z.object({ folderName: z.string().optional() })

async function resolveFolder(worldId: string, name?: string): Promise<string | null> {
  const trimmed = name?.trim()
  if (!trimmed) return null
  const existing = await prisma.folder.findFirst({ where: { worldId, name: trimmed, parentId: null } })
  if (existing) return existing.id
  const created = await prisma.folder.create({ data: { worldId, name: trimmed } })
  return created.id
}

filesRouter.post(
  "/upload",
  requireWorldRole("editor"),
  upload.single("file"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    if (!req.file) throw notFound("No file uploaded under field name 'file'")
    const { folderName, projectId } = folderNameSchema.extend({ projectId: z.string().optional() }).parse(req.body)

    const folderId = await resolveFolder(req.worldId!, folderName)
    const key = makeStorageKey(req.worldId!, req.file.originalname)
    await storage.put(key, req.file.buffer, req.file.mimetype)

    const file = await prisma.file.create({
      data: {
        worldId: req.worldId!,
        folderId,
        projectId,
        name: req.file.originalname,
        kind: kindFromMime(req.file.mimetype),
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        storageKey: key,
        uploadedById: req.userId!,
      },
      include: { folder: true },
    })

    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "file.uploaded", text: `uploaded ${file.name}`, entityType: "file", entityId: file.id })
    broadcastToWorld(req.worldId!, "file.upserted", serializeFile(file))
    res.status(201).json({ file: serializeFile(file) })
  })
)

filesRouter.get(
  "/:fileId/download",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const file = await prisma.file.findFirstOrThrow({ where: { id: req.params.fileId, worldId: req.worldId! } })

    const signedUrl = await storage.getSignedUrl(file.storageKey)
    if (signedUrl) return res.redirect(signedUrl)

    const buffer = await storage.getBuffer(file.storageKey)
    if (!buffer) throw notFound("File bytes not found in storage")
    res.setHeader("Content-Type", file.mimeType)
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`)
    res.send(buffer)
  })
)

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  folderName: z.string().optional(),
  archived: z.boolean().optional(),
})

filesRouter.patch(
  "/:fileId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = updateSchema.parse(req.body)
    const folderId = body.folderName !== undefined ? await resolveFolder(req.worldId!, body.folderName) : undefined
    const file = await prisma.file.update({
      where: { id: req.params.fileId },
      data: { name: body.name, archived: body.archived, ...(body.folderName !== undefined ? { folderId } : {}) },
      include: { folder: true },
    })
    broadcastToWorld(req.worldId!, "file.upserted", serializeFile(file))
    res.json({ file: serializeFile(file) })
  })
)

filesRouter.delete(
  "/:fileId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const file = await prisma.file.update({ where: { id: req.params.fileId }, data: { deletedAt: new Date() } })
    // Bytes are kept until a background reaper permanently purges
    // soft-deleted rows past a retention window — avoids losing data on an
    // accidental delete. Immediate hard-delete of bytes is intentionally not
    // wired here.
    void file
    broadcastToWorld(req.worldId!, "file.deleted", { id: req.params.fileId })
    res.status(204).send()
  })
)

function serializeFile(f: any) {
  return {
    id: f.id,
    worldId: f.worldId,
    name: f.name,
    kind: f.kind,
    size: humanSize(f.sizeBytes),
    folder: f.folder?.name ?? "",
    date: f.createdAt.toISOString().slice(0, 10),
  }
}
