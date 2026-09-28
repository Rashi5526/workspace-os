import type { Router, Request, Response, NextFunction } from "express"
import { prisma } from "./prisma"
import { notFound, badRequest } from "./asyncHandler"

type ScopedModel = "page" | "project" | "task" | "transaction" | "person" | "file" | "idea" | "calendarEvent" | "template" | "comment" | "version"

/**
 * Anti-IDOR guard. Registers a router.param() hook so that every route using
 * `:<param>` first verifies that the referenced row actually belongs to the
 * world in the URL (`:worldId`). Without this, an editor in World A could
 * PATCH /worlds/A/tasks/<id-of-a-task-in-World-B>. Runs before the role
 * middleware, but a missing/foreign row and a non-member both yield 404, so
 * nothing extra is revealed.
 */
export function scopeParam(router: Router, param: string, model: ScopedModel) {
  router.param(param, async (req: Request, _res: Response, next: NextFunction, id: string) => {
    try {
      const row = await (prisma as any)[model].findFirst({ where: { id, worldId: req.params.worldId }, select: { id: true } })
      if (!row) return next(notFound())
      next()
    } catch (e) {
      next(e)
    }
  })
}

export function scopeSubtaskParam(router: Router, param = "subtaskId") {
  router.param(param, async (req: Request, _res: Response, next: NextFunction, id: string) => {
    try {
      const row = await prisma.subtask.findFirst({ where: { id, taskId: req.params.taskId, task: { worldId: req.params.worldId } }, select: { id: true } })
      if (!row) return next(notFound())
      next()
    } catch (e) {
      next(e)
    }
  })
}

/** Reject references (projectId etc.) that point at another world's data. */
export async function assertProjectInWorld(worldId: string, projectId?: string | null) {
  if (!projectId) return
  const p = await prisma.project.findFirst({ where: { id: projectId, worldId }, select: { id: true } })
  if (!p) throw badRequest("projectId does not belong to this world")
}

export async function assertMember(worldId: string, userId?: string | null) {
  if (!userId) return
  const m = await prisma.worldMember.findUnique({ where: { worldId_userId: { worldId, userId } } })
  if (!m) throw badRequest("User is not a member of this world")
}
