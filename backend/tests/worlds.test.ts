import { describe, it, expect } from "vitest"
import { app, request, signup, authed, createWorld, addMember } from "./helpers"

describe("world permissions", () => {
  it("User A cannot access User B's private world (any resource)", async () => {
    const a = await signup("A")
    const b = await signup("B")
    const w = await createWorld(b.token, { name: "B private", access: "private" })
    await request(app).post(`/worlds/${w}/tasks`).set(authed(b.token)).send({ title: "secret" })

    for (const path of ["", "/pages", "/tasks", "/projects", "/transactions", "/people", "/files", "/ideas", "/activity", "/members"]) {
      const res = await request(app).get(`/worlds/${w}${path}`).set(authed(a.token))
      expect(res.status, path).toBe(404) // 404, not 403: existence isn't confirmed
    }
    const write = await request(app).post(`/worlds/${w}/tasks`).set(authed(a.token)).send({ title: "hack" })
    expect(write.status).toBe(404)
    const list = await request(app).get("/worlds").set(authed(a.token))
    expect(list.body.worlds.find((x: any) => x.id === w)).toBeUndefined()
  })

  it("enforces roles: viewer read-only, commenter cannot edit pages, editor can write, only owner manages", async () => {
    const owner = await signup(), viewer = await signup(), commenter = await signup(), editor = await signup()
    const w = await createWorld(owner.token)
    await addMember(owner.token, w, viewer, "viewer")
    await addMember(owner.token, w, commenter, "commenter")
    await addMember(owner.token, w, editor, "editor")

    expect((await request(app).get(`/worlds/${w}/tasks`).set(authed(viewer.token))).status).toBe(200)
    expect((await request(app).post(`/worlds/${w}/tasks`).set(authed(viewer.token)).send({ title: "x" })).status).toBe(403)
    expect((await request(app).post(`/worlds/${w}/tasks`).set(authed(editor.token)).send({ title: "x" })).status).toBe(201)

    const page = await request(app).post(`/worlds/${w}/pages`).set(authed(editor.token)).send({ title: "P" })
    const pid = page.body.page.id
    expect((await request(app).patch(`/worlds/${w}/pages/${pid}`).set(authed(commenter.token)).send({ title: "no" })).status).toBe(403)
    expect((await request(app).post(`/worlds/${w}/comments`).set(authed(commenter.token)).send({ entityType: "page", entityId: pid, body: "hi" })).status).toBe(201)
    expect((await request(app).post(`/worlds/${w}/comments`).set(authed(viewer.token)).send({ entityType: "page", entityId: pid, body: "hi" })).status).toBe(403)

    expect((await request(app).patch(`/worlds/${w}`).set(authed(editor.token)).send({ archived: true })).status).toBe(403)
    expect((await request(app).delete(`/worlds/${w}`).set(authed(editor.token))).status).toBe(403)
    expect((await request(app).patch(`/worlds/${w}/members/${viewer.id}`).set(authed(editor.token)).send({ role: "editor" })).status).toBe(403)
    expect((await request(app).patch(`/worlds/${w}/members/${viewer.id}`).set(authed(owner.token)).send({ role: "editor" })).status).toBe(200)
  })

  it("supports rename, archive and delete by the owner", async () => {
    const o = await signup()
    const w = await createWorld(o.token)
    expect((await request(app).patch(`/worlds/${w}`).set(authed(o.token)).send({ name: "Renamed" })).body.world.name).toBe("Renamed")
    expect((await request(app).patch(`/worlds/${w}`).set(authed(o.token)).send({ archived: true })).body.world.archived).toBe(true)
    expect((await request(app).delete(`/worlds/${w}`).set(authed(o.token))).status).toBe(204)
    expect((await request(app).get(`/worlds/${w}`).set(authed(o.token))).status).toBe(404)
  })

  it("won't let the last owner be demoted, and invites only work for the invited email", async () => {
    const o = await signup(), other = await signup(), stranger = await signup()
    const w = await createWorld(o.token)
    expect((await request(app).patch(`/worlds/${w}/members/${o.id}`).set(authed(o.token)).send({ role: "editor" })).status).toBe(403)
    const inv = await request(app).post(`/worlds/${w}/members/invites`).set(authed(o.token)).send({ email: other.email, role: "editor" })
    const token = inv.body.inviteLink.split("token=")[1]
    expect((await request(app).post(`/invites/${token}/accept`).set(authed(stranger.token))).status).toBe(403)
    expect((await request(app).post(`/invites/${token}/accept`).set(authed(other.token))).status).toBe(200)
  })

  it("blocks cross-world access by resource id (IDOR)", async () => {
    const a = await signup(), b = await signup()
    const wa = await createWorld(a.token), wb = await createWorld(b.token)
    const task = await request(app).post(`/worlds/${wb}/tasks`).set(authed(b.token)).send({ title: "B's task" })
    const id = task.body.task.id
    // A is an owner of world wa and tries to touch B's task through A's own world path
    expect((await request(app).patch(`/worlds/${wa}/tasks/${id}`).set(authed(a.token)).send({ title: "pwned" })).status).toBe(404)
    expect((await request(app).delete(`/worlds/${wa}/tasks/${id}`).set(authed(a.token))).status).toBe(404)
    const still = await request(app).get(`/worlds/${wb}/tasks`).set(authed(b.token))
    expect(still.body.tasks[0].title).toBe("B's task")
  })
})
