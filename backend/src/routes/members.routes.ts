import { Router } from "express"
import { z } from "zod"
import { WorldRole } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/asyncHandler"
import { requireAuth, type AuthedRequest } from "../middleware/auth"
import { requireWorldRole, type WorldScopedRequest } from "../middleware/worldAccess"
import { generateOpaqueToken, hashOpaqueToken } from "../lib/auth"
import { logActivity } from "../services/activityService"
import { env } from "../config/env"

export const membersRouter = Router({ mergeParams: true })
membersRouter.use(requireAuth)

membersRouter.get(
  "/",
  requireWorldRole("viewer"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const members = await prisma.worldMember.findMany({
      where: { worldId: req.worldId! },
      include: { user: { include: { profile: true } } },
    })
    res.json({
      members: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        name: m.user.profile?.name ?? m.user.email,
        initials: m.user.profile?.initials ?? "U",
        color: m.user.profile?.color ?? "#4b5bff",
        email: m.user.email,
        joinedAt: m.joinedAt,
      })),
    })
  })
)

const inviteSchema = z.object({ email: z.string().email(), role: z.nativeEnum(WorldRole).default("editor") })

membersRouter.post(
  "/invites",
  requireWorldRole("editor"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = inviteSchema.parse(req.body)
    if (body.role === "owner") throw badRequest("Cannot invite someone directly as owner")

    const token = generateOpaqueToken()
    const invite = await prisma.worldInvite.create({
      data: {
        worldId: req.worldId!,
        email: body.email.toLowerCase(),
        role: body.role,
        tokenHash: hashOpaqueToken(token),
        invitedById: req.userId!,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "member.invited", text: `invited ${body.email} as ${body.role}` })

    // No email provider is configured in this environment — the invite link
    // (containing the raw token) is returned directly to the caller so the
    // frontend can show/copy it, and logged in dev for convenience.
    const inviteLink = `/invites/accept?token=${token}`
    if (env.nodeEnv !== "production") {
      // eslint-disable-next-line no-console
      console.log(`[dev only] Invite link for ${body.email}: ${inviteLink}`)
    }
    res.status(201).json({ invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt }, inviteLink })
  })
)

const roleSchema = z.object({ role: z.nativeEnum(WorldRole) })

membersRouter.patch(
  "/:userId",
  requireWorldRole("owner"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const body = roleSchema.parse(req.body)
    const targetUserId = req.params.userId
    const target = await prisma.worldMember.findUnique({ where: { worldId_userId: { worldId: req.worldId!, userId: targetUserId } } })
    if (!target) throw notFound("Member not found")
    if (target.role === "owner" && body.role !== "owner") {
      const ownerCount = await prisma.worldMember.count({ where: { worldId: req.worldId!, role: "owner" } })
      if (ownerCount <= 1) throw forbidden("A world must always have at least one owner")
    }
    const updated = await prisma.worldMember.update({
      where: { worldId_userId: { worldId: req.worldId!, userId: targetUserId } },
      data: { role: body.role },
    })
    await logActivity({ worldId: req.worldId!, actorId: req.userId!, action: "member.role_changed", text: `changed a member's role to ${body.role}` })
    res.json({ member: { userId: updated.userId, role: updated.role } })
  })
)

membersRouter.delete(
  "/:userId",
  requireWorldRole("owner"),
  asyncHandler(async (req: WorldScopedRequest, res) => {
    const targetUserId = req.params.userId
    const target = await prisma.worldMember.findUnique({ where: { worldId_userId: { worldId: req.worldId!, userId: targetUserId } } })
    if (!target) throw notFound("Member not found")
    if (target.role === "owner") throw forbidden("Cannot remove the world owner")
    await prisma.worldMember.delete({ where: { worldId_userId: { worldId: req.worldId!, userId: targetUserId } } })
    res.status(204).send()
  })
)

export const invitesRouter = Router()
invitesRouter.use(requireAuth)

invitesRouter.post(
  "/:token/accept",
  asyncHandler(async (req: AuthedRequest, res) => {
    const tokenHash = hashOpaqueToken(req.params.token)
    const invite = await prisma.worldInvite.findUnique({ where: { tokenHash } })
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw badRequest("Invite is invalid or has expired", "invite_invalid")
    }
    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
    if (me.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw forbidden("This invite was sent to a different email address")
    }

    await prisma.$transaction([
      prisma.worldMember.upsert({
        where: { worldId_userId: { worldId: invite.worldId, userId: req.userId! } },
        create: { worldId: invite.worldId, userId: req.userId!, role: invite.role },
        update: { role: invite.role },
      }),
      prisma.worldInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    ])
    await logActivity({ worldId: invite.worldId, actorId: req.userId!, action: "member.joined", text: `${me.email} joined the world` })

    res.json({ worldId: invite.worldId, role: invite.role })
  })
)
