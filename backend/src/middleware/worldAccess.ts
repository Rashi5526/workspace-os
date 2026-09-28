import type { NextFunction, Response } from "express"
import { WorldRole } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { forbidden, notFound, unauthorized } from "../lib/asyncHandler"
import type { AuthedRequest } from "./auth"

const ROLE_RANK: Record<WorldRole, number> = {
  viewer: 0,
  commenter: 1,
  editor: 2,
  owner: 3,
}

export interface WorldScopedRequest extends AuthedRequest {
  worldId?: string
  worldRole?: WorldRole
}

/**
 * Resolves :worldId from the route (or from a resource looked up by id — see
 * `resolveWorldIdFromResource`), loads the caller's membership for that
 * world, and rejects the request if:
 *   - the world doesn't exist / is soft-deleted
 *   - the caller has no membership row for it (private data leak prevention)
 *   - the caller's role is below `minRole`
 *
 * This is the ONLY place authorization for world-scoped resources is
 * decided. Every world-scoped route uses this middleware — the client's own
 * notion of role/access is never trusted.
 */
export function requireWorldRole(minRole: WorldRole) {
  return async (req: WorldScopedRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.userId) return next(unauthorized())
      const worldId = req.params.worldId ?? req.worldId
      if (!worldId) return next(notFound("World not specified"))

      const world = await prisma.world.findFirst({ where: { id: worldId, deletedAt: null } })
      if (!world) return next(notFound("World not found"))

      const membership = await prisma.worldMember.findUnique({
        where: { worldId_userId: { worldId, userId: req.userId } },
      })

      if (!membership) {
        // Private worlds (and shared worlds you were never added to) must
        // return 404, not 403 — we don't want to confirm a private world's
        // existence to non-members.
        return next(notFound("World not found"))
      }

      if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
        return next(forbidden(`Requires ${minRole} role or higher in this world`))
      }

      req.worldId = worldId
      req.worldRole = membership.role
      next()
    } catch (err) {
      next(err)
    }
  }
}

export { ROLE_RANK }
