import { describe, it, expect } from "vitest"
import { computeSplitShares } from "../src/services/splitService"
import { app, request, signup, authed, createWorld, addMember } from "./helpers"

describe("expense splitting (pure)", () => {
  it("₹4,500 paid by A, 50/50 → B owes ₹2,250", () => {
    const rows = computeSplitShares(4500, { payerId: "A", shares: { A: 50, B: 50 } })
    expect(rows.find((r) => r.userId === "B")!.owedAmount).toBe(2250)
    expect(rows.find((r) => r.userId === "A")).toMatchObject({ isPayer: true, owedAmount: 0 })
  })
  it("handles uneven splits and rounds to paise", () => {
    const rows = computeSplitShares(1000, { payerId: "A", shares: { A: 66.67, B: 33.33 } })
    expect(rows.find((r) => r.userId === "B")!.owedAmount).toBe(333.3)
  })
  it("rejects shares that don't sum to 100", () => {
    expect(() => computeSplitShares(100, { payerId: "A", shares: { A: 50, B: 40 } })).toThrow()
  })
})

describe("transactions API", () => {
  it("stores a split expense, computes balances server-side, and settles", async () => {
    const a = await signup("Payer"), b = await signup("Friend")
    const w = await createWorld(a.token)
    await addMember(a.token, w, b, "editor")
    const h = authed(a.token)

    const tx = await request(app).post(`/worlds/${w}/transactions`).set(h).send({
      type: "expense", amount: 4500, date: "2026-09-20", category: "Venue", description: "Rooftop", method: "Card",
      payerId: a.id, split: { shares: { [a.id]: 50, [b.id]: 50 } },
    })
    expect(tx.status).toBe(201)
    const friend = tx.body.transaction.splitParticipants.find((s: any) => s.userId === b.id)
    expect(friend.owedAmount).toBe(2250)

    const bal = await request(app).get(`/worlds/${w}/transactions/balances`).set(h)
    expect(bal.body.balances).toEqual([{ owedToUserId: a.id, owedByUserId: b.id, amount: 2250 }])

    const settle = await request(app).post(`/worlds/${w}/transactions/settle`).set(h)
    expect(settle.body.settledCount).toBe(1)
    expect((await request(app).get(`/worlds/${w}/transactions/balances`).set(h)).body.balances).toEqual([])
  })

  it("supports all transaction types and rejects bad splits / non-member payers / client-supplied amounts", async () => {
    const a = await signup(), b = await signup(), outsider = await signup()
    const w = await createWorld(a.token); await addMember(a.token, w, b, "editor")
    const h = authed(a.token)
    for (const type of ["income", "expense", "investment", "reimbursement", "settlement"]) {
      const r = await request(app).post(`/worlds/${w}/transactions`).set(h).send({ type, amount: 10, date: "2026-09-01", payerId: a.id })
      expect(r.status, type).toBe(201)
    }
    const base = { type: "expense", amount: 100, date: "2026-09-01", payerId: a.id }
    expect((await request(app).post(`/worlds/${w}/transactions`).set(h).send({ ...base, split: { shares: { [a.id]: 50, [b.id]: 30 } } })).status).toBe(400)
    expect((await request(app).post(`/worlds/${w}/transactions`).set(h).send({ ...base, payerId: outsider.id })).status).toBe(400)
    expect((await request(app).post(`/worlds/${w}/transactions`).set(h).send({ ...base, split: { shares: { [a.id]: 50, [outsider.id]: 50 } } })).status).toBe(400)
    // a client-supplied owedAmount is ignored; the server derives it
    const sneaky = await request(app).post(`/worlds/${w}/transactions`).set(h).send({ ...base, split: { shares: { [a.id]: 50, [b.id]: 50 }, owedAmount: 1 } })
    expect(sneaky.body.transaction.splitParticipants.find((s: any) => s.userId === b.id).owedAmount).toBe(50)
  })

  it("viewers cannot add transactions", async () => {
    const a = await signup(), v = await signup()
    const w = await createWorld(a.token); await addMember(a.token, w, v, "viewer")
    const r = await request(app).post(`/worlds/${w}/transactions`).set(authed(v.token)).send({ type: "income", amount: 5, date: "2026-09-01", payerId: v.id })
    expect(r.status).toBe(403)
  })
})
