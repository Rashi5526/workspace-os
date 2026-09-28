import { describe, it, expect } from "vitest"
import request from "supertest"
import { app, signupUser, authed } from "./helpers"

async function makeWorld(token: string, name = "Pages World") {
  const res = await request(app).post("/worlds").set(authed(token)).send({ name })
  return res.body.world.id as string
}

describe("pages & blocks", () => {
  it("creates a page with blocks and reads it back with blocks intact", async () => {
    const user = await signupUser("pages1@test.com", "Pages User")
    const worldId = await makeWorld(user.accessToken)

    const create = await request(app)
      .post(`/worlds/${worldId}/pages`)
      .set(authed(user.accessToken))
      .send({
        title: "My Page",
        icon: "📄",
        blocks: [
          { type: "heading", content: { text: "Hello" } },
          { type: "checklist", content: { items: [{ id: "i1", text: "Do thing", done: false }] } },
        ],
      })
    expect(create.status).toBe(201)
    expect(create.body.page.blocks).toHaveLength(2)
    expect(create.body.page.blocks[0].text).toBe("Hello")

    const get = await request(app).get(`/worlds/${worldId}/pages/${create.body.page.id}`).set(authed(user.accessToken))
    expect(get.status).toBe(200)
    expect(get.body.page.title).toBe("My Page")
    expect(get.body.page.blocks[1].items[0].text).toBe("Do thing")
  })

  it("updating a page's blocks creates a new version, and restoring a version brings old content back", async () => {
    const user = await signupUser("pages2@test.com", "Pages User 2")
    const worldId = await makeWorld(user.accessToken)

    const create = await request(app)
      .post(`/worlds/${worldId}/pages`)
      .set(authed(user.accessToken))
      .send({ title: "Versioned", blocks: [{ type: "text", content: { text: "v1" } }] })
    const pageId = create.body.page.id

    await request(app)
      .patch(`/worlds/${worldId}/pages/${pageId}`)
      .set(authed(user.accessToken))
      .send({ blocks: [{ type: "text", content: { text: "v2" } }] })

    const versions = await request(app).get(`/worlds/${worldId}/pages/${pageId}/versions`).set(authed(user.accessToken))
    expect(versions.body.versions.length).toBeGreaterThanOrEqual(2)
    const firstVersionId = versions.body.versions[versions.body.versions.length - 1].id // oldest = v1

    const restore = await request(app).post(`/worlds/${worldId}/pages/${pageId}/versions/${firstVersionId}/restore`).set(authed(user.accessToken))
    expect(restore.status).toBe(200)
    expect(restore.body.page.blocks[0].text).toBe("v1")
  })

  it("soft-deletes a page (excluded from list) and can duplicate a page", async () => {
    const user = await signupUser("pages3@test.com", "Pages User 3")
    const worldId = await makeWorld(user.accessToken)
    const create = await request(app).post(`/worlds/${worldId}/pages`).set(authed(user.accessToken)).send({ title: "To duplicate" })
    const pageId = create.body.page.id

    const dup = await request(app).post(`/worlds/${worldId}/pages/${pageId}/duplicate`).set(authed(user.accessToken))
    expect(dup.status).toBe(201)
    expect(dup.body.page.title).toBe("To duplicate (copy)")

    const del = await request(app).delete(`/worlds/${worldId}/pages/${pageId}`).set(authed(user.accessToken))
    expect(del.status).toBe(204)

    const list = await request(app).get(`/worlds/${worldId}/pages`).set(authed(user.accessToken))
    expect(list.body.pages.find((p: any) => p.id === pageId)).toBeUndefined()
    expect(list.body.pages.find((p: any) => p.id === dup.body.page.id)).toBeDefined()
  })
})
