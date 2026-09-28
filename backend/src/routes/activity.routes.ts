import { Router } from "express"
import { prisma } from "../lib/prisma"
import { asyncHandler } from "../lib/asyncHandler"
import { requireAuth } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"

export const activityRouter = Router({ mergeParams: true })
activityRouter.use(requireAuth)

activityRouter.get(
  "/",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const entries = await prisma.activityLog.findMany({
      where: { worldId: req.worldId! },
      orderBy: { createdAt: "desc" },
      take: 80,
    })
    res.json({
      activity: entries.map((a) => ({ id: a.id, worldId: a.worldId, who: a.actorId, text: a.text, at: a.createdAt.getTime() })),
    })
  })
)
