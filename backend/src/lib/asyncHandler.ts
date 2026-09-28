import type { NextFunction, Request, Response } from "express"

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<any>

export function asyncHandler(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const badRequest = (msg: string, code = "bad_request") => new HttpError(400, code, msg)
export const unauthorized = (msg = "Unauthorized", code = "unauthorized") => new HttpError(401, code, msg)
export const forbidden = (msg = "Forbidden", code = "forbidden") => new HttpError(403, code, msg)
export const notFound = (msg = "Not found", code = "not_found") => new HttpError(404, code, msg)
export const conflict = (msg: string, code = "conflict") => new HttpError(409, code, msg)
