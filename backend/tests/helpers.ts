import request from "supertest"
import { createApp } from "../src/app"
import { prisma } from "../src/lib/prisma"

export const app = createApp()

export async function resetDb() {
  // Safety: this TRUNCATEs every table. Only ever run against a dedicated test database.
  if (!/test/i.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing to reset DB: DATABASE_URL must contain \"test\" (use a dedicated test database)")
  // Order matters only for FKs; CASCADE handles the rest.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User", "World", "Relationship", "PasswordResetToken" RESTART IDENTITY CASCADE`)
}

let n = 0
export async function signup(name = "User") {
  n++
  const email = `user${n}_${Date.now()}@test.local`
  const res = await request(app).post("/auth/signup").send({ name: `${name} ${n}`, email, password: "password123" })
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`)
  return { id: res.body.user.id as string, email, token: res.body.accessToken as string, refresh: res.body.refreshToken as string }
}

export const authed = (token: string) => ({ Authorization: `Bearer ${token}` })

export async function createWorld(token: string, body: Record<string, unknown> = {}) {
  const res = await request(app).post("/worlds").set(authed(token)).send({ name: "W", access: "shared", ...body })
  if (res.status !== 201) throw new Error(`createWorld failed: ${res.status}`)
  return res.body.world.id as string
}

/** Invite `email` to a world as `role` and accept it as that user. */
export async function addMember(ownerToken: string, worldId: string, user: { email: string; token: string }, role: string) {
  const inv = await request(app).post(`/worlds/${worldId}/members/invites`).set(authed(ownerToken)).send({ email: user.email, role })
  const token = (inv.body.inviteLink as string).split("token=")[1]
  const acc = await request(app).post(`/invites/${token}/accept`).set(authed(user.token))
  if (acc.status !== 200) throw new Error(`accept failed: ${acc.status}`)
}

export { prisma, request }

/** Compatibility helper used by the earlier test files (pages/tasks/transactions/worldPermissions). */
export async function signupUser(email: string, name = "User", password = "password123") {
  const res = await request(app).post("/auth/signup").send({ name, email, password })
  if (res.status !== 201) throw new Error(`signupUser failed: ${res.status} ${JSON.stringify(res.body)}`)
  return { id: res.body.user.id as string, email, user: res.body.user, accessToken: res.body.accessToken as string, refreshToken: res.body.refreshToken as string }
}
