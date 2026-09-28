import { scopeParam } from "../lib/scope"
import { Router } from "express"
import { z } from "zod"
import { CommentEntityType } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { asyncHandler, forbidden } from "../lib/asyncHandler"
import { requireAuth } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"
import { broadcastToWorld } from "../realtime/socket"

export const commentsRouter = Router({ mergeParams: true })
commentsRouter.use(requireAuth)
scopeParam(commentsRouter, "commentId", "comment")

commentsRouter.get(
  "/",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const { entityType, entityId } = z.object({ entityType: z.nativeEnum(CommentEntityType), entityId: z.string() }).parse(req.query)
    const comments = await prisma.comment.findMany({
      where: { worldId: req.worldId!, entityType, entityId, deletedAt: null },
      include: { author: { include: { profile: true } } },
      orderBy: { createdAt: "asc" },
    })
    res.json({ comments: comments.map(serializeComment) })
  })
)

const createSchema = z.object({
  entityType: z.nativeEnum(CommentEntityType),
  entityId: z.string(),
  body: z.string().min(1).max(5000),
})

commentsRouter.post(
  "/",
  requireWorldRole("commenter"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    if (req.worldRole === "viewer") throw forbidden("Viewers cannot comment")
    const body = createSchema.parse(req.body)
    const comment = await prisma.comment.create({
      data: {
        worldId: req.worldId!,
        entityType: body.entityType,
        entityId: body.entityId,
        pageId: body.entityType === "page" ? body.entityId : undefined,
        authorId: req.userId!,
        body: body.body,
      },
      include: { author: { include: { profile: true } } },
    })
    broadcastToWorld(req.worldId!, "comment.created", serializeComment(comment))
    res.status(201).json({ comment: serializeComment(comment) })
  })
)

commentsRouter.delete(
  "/:commentId",
  requireWorldRole("commenter"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const comment = await prisma.comment.findFirstOrThrow({ where: { id: req.params.commentId, worldId: req.worldId! } })
    if (comment.authorId !== req.userId! && req.worldRole !== "owner") throw forbidden("Can only delete your own comments")
    await prisma.comment.update({ where: { id: comment.id }, data: { deletedAt: new Date() } })
    res.status(204).send()
  })
)

function serializeComment(c: any) {
  return {
    id: c.id,
    entityType: c.entityType,
    entityId: c.entityId,
    body: c.body,
    authorId: c.authorId,
    authorName: c.author.profile?.name ?? c.author.email,
    createdAt: c.createdAt,
  }
}
