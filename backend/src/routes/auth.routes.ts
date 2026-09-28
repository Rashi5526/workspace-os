import { Router } from "express"
import { z } from "zod"
import rateLimit from "express-rate-limit"
import { prisma } from "../lib/prisma"
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  refreshTokenExpiry,
  signAccessToken,
  verifyPassword,
} from "../lib/auth"
import { asyncHandler, badRequest, conflict, unauthorized } from "../lib/asyncHandler"
import { requireAuth, type AuthedRequest } from "../middleware/auth"
import { env } from "../config/env"

export const authRouter = Router()

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: env.authRateLimitMax, standardHeaders: true, legacyHeaders: false })

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(80),
})

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "U"
}

const COLORS = ["#4b5bff", "#e0567a", "#2fae6a", "#f0a020", "#8a5cf6", "#0aa5c2"]

authRouter.post(
  "/signup",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = signupSchema.parse(req.body)
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })
    if (existing) throw conflict("An account with this email already exists")

    const passwordHash = await hashPassword(body.password)
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash,
        profile: {
          create: {
            name: body.name,
            initials: initialsOf(body.name),
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
          },
        },
      },
      include: { profile: true },
    })

    const tokens = await issueTokens(user.id, user.email)
    res.status(201).json({ user: toPublicUser(user), ...tokens })
  })
)

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

authRouter.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() }, include: { profile: true } })
    if (!user) throw unauthorized("Invalid email or password", "invalid_credentials")

    const ok = await verifyPassword(body.password, user.passwordHash)
    if (!ok) throw unauthorized("Invalid email or password", "invalid_credentials")

    const tokens = await issueTokens(user.id, user.email)
    res.json({ user: toPublicUser(user), ...tokens })
  })
)

const refreshSchema = z.object({ refreshToken: z.string().min(1) })

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const body = refreshSchema.parse(req.body)
    const tokenHash = hashOpaqueToken(body.refreshToken)
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash } })
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw unauthorized("Refresh token invalid or expired", "refresh_invalid")
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: record.userId } })

    // Rotate: revoke the used token, issue a new pair. Prevents replay of a
    // stolen refresh token past its first use.
    await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } })
    const tokens = await issueTokens(user.id, user.email)
    res.json(tokens)
  })
)

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const body = refreshSchema.partial().parse(req.body)
    if (body.refreshToken) {
      const tokenHash = hashOpaqueToken(body.refreshToken)
      await prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } })
    }
    res.status(204).send()
  })
)

const forgotSchema = z.object({ email: z.string().email() })

authRouter.post(
  "/forgot-password",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = forgotSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })
    // Always respond 200 regardless of whether the account exists, so this
    // endpoint can't be used to enumerate registered emails.
    if (user) {
      const token = generateOpaqueToken()
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
      await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashOpaqueToken(token), expiresAt } })
      // In production this token is emailed to the user via a transactional
      // email provider — wiring that up is outside this task's scope (no
      // email provider was specified). For now it's returned only in
      // non-production environments so the reset flow is testable end to end.
      if (env.nodeEnv !== "production") {
        // eslint-disable-next-line no-console
        console.log(`[dev only] Password reset token for ${user.email}: ${token}`)
      }
    }
    res.status(200).json({ message: "If that email exists, a reset link has been sent." })
  })
)

const resetSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(8) })

authRouter.post(
  "/reset-password",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = resetSchema.parse(req.body)
    const tokenHash = hashOpaqueToken(body.token)
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw badRequest("Reset token is invalid or has expired", "reset_invalid")
    }

    const passwordHash = await hashPassword(body.newPassword)
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Revoke all existing sessions on password reset.
      prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ])

    res.status(200).json({ message: "Password updated. Please log in again." })
  })
)

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, include: { profile: true } })
    res.json({ user: toPublicUser(user) })
  })
)

async function issueTokens(userId: string, email: string) {
  const accessToken = signAccessToken({ sub: userId, email })
  const refreshToken = generateOpaqueToken()
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashOpaqueToken(refreshToken), expiresAt: refreshTokenExpiry() },
  })
  return { accessToken, refreshToken }
}

function toPublicUser(user: { id: string; email: string; profile: { name: string; initials: string; color: string; avatarUrl: string | null } | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.profile?.name ?? user.email,
    initials: user.profile?.initials ?? "U",
    color: user.profile?.color ?? "#4b5bff",
    avatarUrl: user.profile?.avatarUrl ?? null,
  }
}
