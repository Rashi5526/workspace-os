import type { NextFunction, Request, Response } from "express"
import { verifyAccessToken } from "../lib/auth"
import { unauthorized } from "../lib/asyncHandler"

export interface AuthedRequest extends Request {
  userId?: string
  userEmail?: string
}

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined
  if (!token) return next(unauthorized("Missing access token"))

  try {
    const payload = verifyAccessToken(token)
    req.userId = payload.sub
    req.userEmail = payload.email
    next()
  } catch {
    next(unauthorized("Invalid or expired access token", "token_expired"))
  }
}
