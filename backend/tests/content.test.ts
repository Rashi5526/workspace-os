import { describe, it, expect } from "vitest"
import { app, request, signup, authed, createWorld } from "./helpers"

describe("pages & blocks", () => {
  it("creates, reads, updates blocks, duplicates, archives, restores, deletes", async () => {
    const u = await signup(); const w = await createWorld(u.token); const h = authed(u.token)
    const created = await request(app).post(`/worlds/${w}/pages`).set(h).send({
      id: "client-page-1", title: "Doc", tags: ["a"],
      blocks: [{ id: "b1", type: "heading", content: { text: "Hello" } }, { id: "b2", type: "checklist", content: { items: [{ id: "i1", text: "t", done: false }] } }],
    })
    expect(created.status).toBe(201)
    expect(created.body.page.id).toBe("client-page-1") // client ids are preserved
    expect(created.body.page.blocks[0]).toMatchObject({ id: "b1", type: "heading", text: "Hello" })
    expect(created.body.page.tags).toEqual(["a"])

    const upd = await request(app).patch(`/worlds/${w}/pages/client-page-1`).set(h).send({
      title: "Doc 2", blocks: [{ id: "b2", type: "checklist", content: { items: [{ id: "i1", text: "t", done: true }] } }, { id: "b3", type: "divider", content: {} }],
    })
    expect(upd.body.page.title).toBe("Doc 2")
    expect(upd.body.page.blocks.map((b: any) => b.id)).toEqual(["b2", "b3"])
    expect(upd.body.page.blocks[0].items[0].done).toBe(true)

    const dup = await request(app).post(`/worlds/${w}/pages/client-page-1/duplicate`).set(h)
    expect(dup.body.page.title).toBe("Doc 2 (copy)")
    expect((await request(app).patch(`/worlds/${w}/pages/client-page-1`).set(h).send({ archived: true })).body.page.archived).toBe(true)
    expect((await request(app).post(`/worlds/${w}/pages/client-page-1/restore`).set(h)).body.page.archived).toBe(false)
    expect((await request(app).delete(`/worlds/${w}/pages/client-page-1`).set(h)).status).toBe(204)
    const list = await request(app).get(`/worlds/${w}/pages`).set(h)
    expect(list.body.pages.map((p: any) => p.id)).not.toContain("client-page-1")
  })

  it("records versions and restores an earlier one", async () => {
    const u = await signup(); const w = await createWorld(u.token); const h = authed(u.token)
    const p = await request(app).post(`/worlds/${w}/pages`).set(h).send({ title: "V1", blocks: [{ type: "text", content: { text: "one" } }] })
    const pid = p.body.page.id
    await request(app).patch(`/worlds/${w}/pages/${pid}`).set(h).send({ title: "V2", blocks: [{ type: "text", content: { text: "two" } }] })
    await request(app).post(`/worlds/${w}/pages/${pid}/versions`).set(h) // explicit version of V2
    const versions = await request(app).get(`/worlds/${w}/pages/${pid}/versions`).set(h)
    expect(versions.body.versions.length).toBeGreaterThanOrEqual(2)
    const first = versions.body.versions[versions.body.versions.length - 1]
    const view = await request(app).get(`/worlds/${w}/pages/${pid}/versions/${first.id}`).set(h)
    expect(view.body.version.snapshot.title).toBe("V1")
    const restored = await request(app).post(`/worlds/${w}/pages/${pid}/versions/${first.id}/restore`).set(h)
    expect(restored.status).toBe(200)
    expect(restored.body.page.title).toBe("V1")
    expect(restored.body.page.blocks[0].text).toBe("one")
  })
})

describe("projects & tasks", () => {
  it("creates projects and tasks linked together, logs activity, completes tasks", async () => {
    const u = await signup(); const w = await createWorld(u.token); const h = authed(u.token)
    const pr = await request(app).post(`/worlds/${w}/projects`).set(h).send({ name: "Launch", status: "active", investment: 1000 })
    expect(pr.status).toBe(201)
    const t = await request(app).post(`/worlds/${w}/tasks`).set(h).send({
      title: "Ship", projectId: pr.body.project.id, assigneeId: u.id, priority: "high", due: "2026-10-01T00:00:00.000Z", tags: ["x", "y"],
    })
    expect(t.status).toBe(201)
    expect(t.body.task).toMatchObject({ projectId: pr.body.project.id, assignee: u.id, priority: "high", due: "2026-10-01" })
    expect(t.body.task.tags.sort()).toEqual(["x", "y"])

    const done = await request(app).patch(`/worlds/${w}/tasks/${t.body.task.id}`).set(h).send({ status: "done" })
    expect(done.body.task.status).toBe("done")
    const sub = await request(app).post(`/worlds/${w}/tasks/${t.body.task.id}/subtasks`).set(h).send({ title: "step" })
    expect(sub.status).toBe(201)

    const act = await request(app).get(`/worlds/${w}/activity`).set(h)
    const texts = act.body.activity.map((a: any) => a.text)
    expect(texts.some((x: string) => x.includes("completed"))).toBe(true)
    expect(texts.some((x: string) => x.includes("created project"))).toBe(true)
  })

  it("rejects linking a task to another world's project or a non-member assignee", async () => {
    const a = await signup(), b = await signup()
    const wa = await createWorld(a.token), wb = await createWorld(b.token)
    const foreign = await request(app).post(`/worlds/${wb}/projects`).set(authed(b.token)).send({ name: "B proj" })
    const bad = await request(app).post(`/worlds/${wa}/tasks`).set(authed(a.token)).send({ title: "x", projectId: foreign.body.project.id })
    expect(bad.status).toBe(400)
    const bad2 = await request(app).post(`/worlds/${wa}/tasks`).set(authed(a.token)).send({ title: "x", assigneeId: b.id })
    expect(bad2.status).toBe(400)
  })
})
