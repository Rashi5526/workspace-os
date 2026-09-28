import { prisma } from "../lib/prisma"
import { broadcastToWorld } from "../realtime/socket"

export async function logActivity(opts: {
  worldId: string
  actorId: string
  action: string
  text: string
  entityType?: string
  entityId?: string
}) {
  const entry = await prisma.activityLog.create({
    data: {
      worldId: opts.worldId,
      actorId: opts.actorId,
      action: opts.action,
      text: opts.text,
      entityType: opts.entityType,
      entityId: opts.entityId,
    },
  })
  broadcastToWorld(opts.worldId, "activity.created", entry)
  return entry
}
