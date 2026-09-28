import { Router } from "express"
import { prisma } from "../lib/prisma"
import { asyncHandler } from "../lib/asyncHandler"
import { requireAuth, type AuthedRequest } from "../middleware/auth"

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
    res.json({ notifications })
  })
)

notificationsRouter.post(
  "/:id/read",
  asyncHandler(async (req: AuthedRequest, res) => {
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.userId! }, data: { readAt: new Date() } })
    res.status(204).send()
  })
)

notificationsRouter.post(
  "/read-all",
  asyncHandler(async (req: AuthedRequest, res) => {
    await prisma.notification.updateMany({ where: { userId: req.userId!, readAt: null }, data: { readAt: new Date() } })
    res.status(204).send()
  })
)
