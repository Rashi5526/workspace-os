import bcrypt from "bcryptjs"
import crypto from "crypto"
import jwt, { type SignOptions } from "jsonwebtoken"
import { env } from "../config/env"

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export interface AccessTokenPayload {
  sub: string // user id
  email: string
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.accessTokenTtl } as SignOptions)
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload
}

// Refresh tokens are opaque random strings; only their hash is stored in the
// DB (so a leaked database dump doesn't hand out usable tokens).
export function generateOpaqueToken(): string {
  return crypto.randomBytes(48).toString("hex")
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export function refreshTokenExpiry(): Date {
  const d = new Date()
  d.setDate(d.getDate() + env.refreshTokenTtlDays)
  return d
}
