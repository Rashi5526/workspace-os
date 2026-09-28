import type { NextFunction, Request, Response } from "express"
import { Prisma } from "@prisma/client"
import { HttpError } from "../lib/asyncHandler"

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } })
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: { code: "conflict", message: "A record with this value already exists." } })
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: { code: "not_found", message: "Record not found." } })
    }
    return res.status(400).json({ error: { code: "db_error", message: "Database request error." } })
  }

  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err)
  const message = err instanceof Error ? err.message : "Internal server error"
  return res.status(500).json({ error: { code: "internal_error", message: process.env.NODE_ENV === "production" ? "Internal server error" : message } })
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } })
}
