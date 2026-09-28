import { describe, it, expect } from "vitest"
import { app, request, signup, authed } from "./helpers"

describe("authentication", () => {
  it("signs up, logs in, and returns the current user", async () => {
    const u = await signup("Ada")
    const login = await request(app).post("/auth/login").send({ email: u.email, password: "password123" })
    expect(login.status).toBe(200)
    const me = await request(app).get("/auth/me").set(authed(login.body.accessToken))
    expect(me.body.user.email).toBe(u.email)
    expect(me.body.user.passwordHash).toBeUndefined()
  })

  it("rejects duplicate emails and wrong passwords", async () => {
    const u = await signup()
    const dup = await request(app).post("/auth/signup").send({ name: "x", email: u.email, password: "password123" })
    expect(dup.status).toBe(409)
    const bad = await request(app).post("/auth/login").send({ email: u.email, password: "wrong-password" })
    expect(bad.status).toBe(401)
  })

  it("rejects short passwords and missing tokens", async () => {
    const short = await request(app).post("/auth/signup").send({ name: "x", email: "a@b.co", password: "short" })
    expect(short.status).toBeGreaterThanOrEqual(400)
    expect((await request(app).get("/worlds")).status).toBe(401)
    expect((await request(app).get("/worlds").set(authed("garbage"))).status).toBe(401)
  })

  it("rotates refresh tokens and revokes them on logout", async () => {
    const u = await signup()
    const r1 = await request(app).post("/auth/refresh").send({ refreshToken: u.refresh })
    expect(r1.status).toBe(200)
    // the old token is single-use
    expect((await request(app).post("/auth/refresh").send({ refreshToken: u.refresh })).status).toBe(401)
    await request(app).post("/auth/logout").send({ refreshToken: r1.body.refreshToken })
    expect((await request(app).post("/auth/refresh").send({ refreshToken: r1.body.refreshToken })).status).toBe(401)
  })

  it("does not reveal whether an email exists on forgot-password", async () => {
    const res = await request(app).post("/auth/forgot-password").send({ email: "nobody@nowhere.test" })
    expect(res.status).toBe(200)
  })
})
