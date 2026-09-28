import { describe, it, expect } from "vitest"
import request from "supertest"
import { app, signupUser, authed } from "./helpers"

describe("transactions & expense splitting", () => {
  it("computes a 50/50 split exactly like the spec example: ₹4,500 paid, friend owes ₹2,250", async () => {
    const rashi = await signupUser("rashi@split.test", "Rashi")
    const friend = await signupUser("friend@split.test", "Friend")

    const world = await request(app).post("/worlds").set(authed(rashi.accessToken)).send({ name: "Shared Expenses", access: "shared" })
    const worldId = world.body.world.id
    const invite = await request(app).post(`/worlds/${worldId}/members/invites`).set(authed(rashi.accessToken)).send({ email: friend.email, role: "editor" })
    const token = invite.body.inviteLink.split("token=")[1]
    await request(app).post(`/invites/${token}/accept`).set(authed(friend.accessToken))

    const tx = await request(app)
      .post(`/worlds/${worldId}/transactions`)
      .set(authed(rashi.accessToken))
      .send({
        type: "expense",
        amount: 4500,
        date: "2026-01-01",
        category: "Venue",
        description: "Rooftop booking",
        payerId: rashi.userId,
        split: { shares: { [rashi.userId]: 50, [friend.userId]: 50 } },
      })

    expect(tx.status).toBe(201)
    expect(tx.body.transaction.split).toBe(true)
    const friendRow = tx.body.transaction.splitParticipants.find((p: any) => p.userId === friend.userId)
    const rashiRow = tx.body.transaction.splitParticipants.find((p: any) => p.userId === rashi.userId)
    expect(friendRow.owedAmount).toBe(2250) // friend owes Rashi ₹2,250 — computed, not hardcoded
    expect(rashiRow.owedAmount).toBe(0) // the payer doesn't owe themselves

    const balances = await request(app).get(`/worlds/${worldId}/transactions/balances`).set(authed(rashi.accessToken))
    const entry = balances.body.balances.find((b: any) => b.owedByUserId === friend.userId && b.owedToUserId === rashi.userId)
    expect(entry.amount).toBe(2250)
  })

  it("rejects split shares that don't sum to 100", async () => {
    const user = await signupUser("badsplit@test.com", "Bad Split")
    const world = await request(app).post("/worlds").set(authed(user.accessToken)).send({ name: "World" })
    const worldId = world.body.world.id

    const tx = await request(app)
      .post(`/worlds/${worldId}/transactions`)
      .set(authed(user.accessToken))
      .send({ type: "expense", amount: 1000, date: "2026-01-01", payerId: user.userId, split: { shares: { [user.userId]: 60 } } })
    expect(tx.status).toBe(400)
  })

  it("settle-up marks split transactions settled and balances drop to zero", async () => {
    const a = await signupUser("settleA@test.com", "A")
    const b = await signupUser("settleB@test.com", "B")
    const world = await request(app).post("/worlds").set(authed(a.accessToken)).send({ name: "Settle World", access: "shared" })
    const worldId = world.body.world.id
    const invite = await request(app).post(`/worlds/${worldId}/members/invites`).set(authed(a.accessToken)).send({ email: b.email, role: "editor" })
    const token = invite.body.inviteLink.split("token=")[1]
    await request(app).post(`/invites/${token}/accept`).set(authed(b.accessToken))

    await request(app)
      .post(`/worlds/${worldId}/transactions`)
      .set(authed(a.accessToken))
      .send({ type: "expense", amount: 1000, date: "2026-01-01", payerId: a.userId, split: { shares: { [a.userId]: 50, [b.userId]: 50 } } })

    const before = await request(app).get(`/worlds/${worldId}/transactions/balances`).set(authed(a.accessToken))
    expect(before.body.balances.length).toBe(1)

    await request(app).post(`/worlds/${worldId}/transactions/settle`).set(authed(a.accessToken))

    const after = await request(app).get(`/worlds/${worldId}/transactions/balances`).set(authed(a.accessToken))
    expect(after.body.balances.length).toBe(0)
  })
})
