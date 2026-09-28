import { scopeParam, scopeSubtaskParam, assertProjectInWorld, assertMember } from "../lib/scope"
import { Router } from "express"
import { z } from "zod"
import { TaskStatus, Priority } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { asyncHandler } from "../lib/asyncHandler"
import { requireAuth } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"
import { logActivity } from "../services/activityService"
import { broadcastToWorld } from "../realtime/socket"

export const tasksRouter = Router({ mergeParams: true })
tasksRouter.use(requireAuth)
scopeParam(tasksRouter, "taskId", "task")
scopeSubtaskParam(tasksRouter)

tasksRouter.get(
  "/",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const tasks = await prisma.task.findMany({
      where: { worldId: req.worldId!, deletedAt: null },
      include: { subtasks: { orderBy: { position: "asc" } }, tags: { include: { tag: true } } },
      orderBy: { createdAt: "desc" },
    })
    res.json({ tasks: tasks.map(serializeTask) })
  })
)

const createSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  title: z.string().min(1).max(300),
  description: z.string().default(""),
  status: z.nativeEnum(TaskStatus).default("todo"),
  priority: z.nativeEnum(Priority).default("medium"),
  assigneeId: z.string().optional(),
  due: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
})

tasksRouter.post(
  "/",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = createSchema.parse(req.body)
    await assertProjectInWorld(req.worldId!, body.projectId)
    await assertMember(req.worldId!, body.assigneeId)
    const task = await prisma.task.create({
      data: {
        id: body.id,
        worldId: req.worldId!,
        projectId: body.projectId,
        title: body.title,
        description: body.description,
        status: body.status,
        priority: body.priority,
        assigneeId: body.assigneeId,
        due: body.due ? new Date(body.due) : undefined,
      },
      include: { subtasks: true, tags: { include: { tag: true } } },
    })
    await Promise.all(body.tags.map((name) => attachTag(req.worldId!, task.id, name)))
    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "task.created", text: `created task "${task.title}"`, entityType: "task", entityId: task.id })
    const full = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: { subtasks: true, tags: { include: { tag: true } } } })
    broadcastToWorld(req.worldId!, "task.upserted", serializeTask(full))
    res.status(201).json({ task: serializeTask(full) })
  })
)

const updateSchema = z.object({
  projectId: z.string().nullable().optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  assigneeId: z.string().nullable().optional(),
  due: z.string().datetime().nullable().optional(),
  tags: z.array(z.string()).optional(),
})

tasksRouter.patch(
  "/:taskId",
  requireWorldRole("commenter"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = updateSchema.parse(req.body)
    await assertProjectInWorld(req.worldId!, body.projectId)
    await assertMember(req.worldId!, body.assigneeId)
    const { tags, due, ...rest } = body
    const wasStatusChange = rest.status !== undefined

    const task = await prisma.task.update({
      where: { id: req.params.taskId },
      data: { ...rest, due: due === null ? null : due ? new Date(due) : undefined },
    })

    if (tags) {
      await prisma.taggedItem.deleteMany({ where: { taskId: task.id } })
      await Promise.all(tags.map((name) => attachTag(req.worldId!, task.id, name)))
    }

    await logActivity({
      worldId: req.worldId!,
      actorId: req.userId!,
      action: wasStatusChange && rest.status === "done" ? "task.completed" : "task.updated",
      text: wasStatusChange && rest.status === "done" ? `completed "${task.title}"` : `updated "${task.title}"`,
      entityType: "task",
      entityId: task.id,
    })

    const full = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: { subtasks: true, tags: { include: { tag: true } } } })
    broadcastToWorld(req.worldId!, "task.upserted", serializeTask(full))
    res.json({ task: serializeTask(full) })
  })
)

tasksRouter.delete(
  "/:taskId",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    await prisma.task.update({ where: { id: req.params.taskId }, data: { deletedAt: new Date() } })
    broadcastToWorld(req.worldId!, "task.deleted", { id: req.params.taskId })
    res.status(204).send()
  })
)

// --- Subtasks ------------------------------------------------------------

const subtaskSchema = z.object({ title: z.string().min(1).max(300) })

tasksRouter.post(
  "/:taskId/subtasks",
  requireWorldRole("commenter"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = subtaskSchema.parse(req.body)
    const count = await prisma.subtask.count({ where: { taskId: req.params.taskId } })
    const subtask = await prisma.subtask.create({ data: { taskId: req.params.taskId, title: body.title, position: count } })
    const full = await prisma.task.findUniqueOrThrow({ where: { id: req.params.taskId }, include: { subtasks: true, tags: { include: { tag: true } } } })
    broadcastToWorld(req.worldId!, "task.upserted", serializeTask(full))
    res.status(201).json({ subtask })
  })
)

tasksRouter.patch(
  "/:taskId/subtasks/:subtaskId",
  requireWorldRole("commenter"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = z.object({ title: z.string().optional(), done: z.boolean().optional() }).parse(req.body)
    await prisma.subtask.update({ where: { id: req.params.subtaskId }, data: body })
    const full = await prisma.task.findUniqueOrThrow({ where: { id: req.params.taskId }, include: { subtasks: true, tags: { include: { tag: true } } } })
    broadcastToWorld(req.worldId!, "task.upserted", serializeTask(full))
    res.json({ task: serializeTask(full) })
  })
)

tasksRouter.delete(
  "/:taskId/subtasks/:subtaskId",
  requireWorldRole("commenter"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    await prisma.subtask.delete({ where: { id: req.params.subtaskId } })
    res.status(204).send()
  })
)

async function attachTag(worldId: string, taskId: string, name: string) {
  const tag = await prisma.tag.upsert({ where: { worldId_name: { worldId, name } }, create: { worldId, name }, update: {} })
  await prisma.taggedItem.create({ data: { tagId: tag.id, itemType: "task", itemId: taskId, taskId } })
}

function serializeTask(t: any) {
  return {
    id: t.id,
    worldId: t.worldId,
    projectId: t.projectId ?? undefined,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assignee: t.assigneeId ?? undefined,
    due: t.due ? t.due.toISOString().slice(0, 10) : undefined,
    tags: (t.tags ?? []).map((x: any) => x.tag.name),
    subtasks: (t.subtasks ?? []).map((s: any) => ({ id: s.id, title: s.title, done: s.done })),
    createdAt: t.createdAt.getTime?.() ?? t.createdAt,
  }
}
