import type { Server as HttpServer } from "http"
import { Server, type Socket } from "socket.io"
import { verifyAccessToken } from "../lib/auth"
import { prisma } from "../lib/prisma"
import { env } from "../config/env"

let io: Server | undefined

export function initRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
  })

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined
      if (!token) return next(new Error("unauthorized"))
      const payload = verifyAccessToken(token)
      socket.data.userId = payload.sub
      next()
    } catch {
      next(new Error("unauthorized"))
    }
  })

  io.on("connection", (socket: Socket) => {
    // Client asks to join a world's room; we verify membership server-side
    // before letting them subscribe — a socket can never listen to a world
    // it isn't a member of, regardless of what the client claims.
    socket.on("world:join", async (worldId: string) => {
      const userId = socket.data.userId as string
      const member = await prisma.worldMember.findUnique({
        where: { worldId_userId: { worldId, userId } },
      })
      if (member) socket.join(roomFor(worldId))
    })

    socket.on("world:leave", (worldId: string) => {
      socket.leave(roomFor(worldId))
    })
  })

  return io
}

function roomFor(worldId: string) {
  return `world:${worldId}`
}

export type RealtimeEvent =
  | "page.upserted" | "page.deleted"
  | "block.upserted" | "block.deleted"
  | "project.upserted" | "project.deleted"
  | "task.upserted" | "task.deleted"
  | "transaction.upserted" | "transaction.deleted"
  | "person.upserted" | "person.deleted"
  | "file.upserted" | "file.deleted"
  | "idea.upserted" | "idea.deleted"
  | "world.upserted" | "world.deleted"
  | "activity.created"
  | "comment.created"

/** Broadcast a change to every other client currently viewing this world. */
export function broadcastToWorld(worldId: string, event: RealtimeEvent, payload: unknown, exceptSocketId?: string) {
  if (!io) return
  const target = exceptSocketId ? io.to(roomFor(worldId)).except(exceptSocketId) : io.to(roomFor(worldId))
  target.emit(event, payload)
}
