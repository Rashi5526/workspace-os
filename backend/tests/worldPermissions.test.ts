import { describe, it, expect } from "vitest"
import request from "supertest"
import { app, signupUser, authed } from "./helpers"

describe("world permissions & isolation", () => {
  it("User A cannot see or access User B's private world", async () => {
    const a = await signupUser("a@iso.test", "User A")
    const b = await signupUser("b@iso.test", "User B")

    const create = await request(app).post("/worlds").set(authed(b.accessToken)).send({ name: "B's Private World", access: "private" })
    expect(create.status).toBe(201)
    const worldId = create.body.world.id

    // Not in A's world list.
    const list = await request(app).get("/worlds").set(authed(a.accessToken))
    expect(list.body.worlds.find((w: any) => w.id === worldId)).toBeUndefined()

    // Direct GET returns 404, not 403 — existence itself is not confirmed to a non-member.
    const direct = await request(app).get(`/worlds/${worldId}`).set(authed(a.accessToken))
    expect(direct.status).toBe(404)

    // Cannot read pages/tasks/transactions/people/files inside it either.
    const pages = await request(app).get(`/worlds/${worldId}/pages`).set(authed(a.accessToken))
    expect(pages.status).toBe(404)
    const tasks = await request(app).get(`/worlds/${worldId}/tasks`).set(authed(a.accessToken))
    expect(tasks.status).toBe(404)

    // Cannot write into it either.
    const write = await request(app).post(`/worlds/${worldId}/pages`).set(authed(a.accessToken)).send({ title: "Sneaky page" })
    expect(write.status).toBe(404)
  })

  it("a shared world is visible to an invited member but not to a stranger", async () => {
    const owner = await signupUser("owner@share.test", "Owner")
    const invitee = await signupUser("invitee@share.test", "Invitee")
    const stranger = await signupUser("stranger@share.test", "Stranger")

    const create = await request(app).post("/worlds").set(authed(owner.accessToken)).send({ name: "Shared World", access: "shared" })
    const worldId = create.body.world.id

    const invite = await request(app).post(`/worlds/${worldId}/members/invites`).set(authed(owner.accessToken)).send({ email: invitee.email, role: "editor" })
    expect(invite.status).toBe(201)
    const token = invite.body.inviteLink.split("token=")[1]

    const accept = await request(app).post(`/invites/${token}/accept`).set(authed(invitee.accessToken))
    expect(accept.status).toBe(200)

    const inviteeSees = await request(app).get(`/worlds/${worldId}`).set(authed(invitee.accessToken))
    expect(inviteeSees.status).toBe(200)

    const strangerSees = await request(app).get(`/worlds/${worldId}`).set(authed(stranger.accessToken))
    expect(strangerSees.status).toBe(404)
  })

  it("viewers cannot create pages; editors can; only the owner can archive the world", async () => {
    const owner = await signupUser("owner2@role.test", "Owner2")
    const viewerUser = await signupUser("viewer@role.test", "Viewer")
    const editorUser = await signupUser("editor@role.test", "Editor")

    const create = await request(app).post("/worlds").set(authed(owner.accessToken)).send({ name: "Role World", access: "shared" })
    const worldId = create.body.world.id

    for (const [user, role] of [[viewerUser, "viewer"], [editorUser, "editor"]] as const) {
      const invite = await request(app).post(`/worlds/${worldId}/members/invites`).set(authed(owner.accessToken)).send({ email: user.email, role })
      const token = invite.body.inviteLink.split("token=")[1]
      await request(app).post(`/invites/${token}/accept`).set(authed(user.accessToken))
    }

    const viewerCreatePage = await request(app).post(`/worlds/${worldId}/pages`).set(authed(viewerUser.accessToken)).send({ title: "Nope" })
    expect(viewerCreatePage.status).toBe(403)

    const editorCreatePage = await request(app).post(`/worlds/${worldId}/pages`).set(authed(editorUser.accessToken)).send({ title: "Yes" })
    expect(editorCreatePage.status).toBe(201)

    const editorArchive = await request(app).patch(`/worlds/${worldId}`).set(authed(editorUser.accessToken)).send({ archived: true })
    expect(editorArchive.status).toBe(403)

    const ownerArchive = await request(app).patch(`/worlds/${worldId}`).set(authed(owner.accessToken)).send({ archived: true })
    expect(ownerArchive.status).toBe(200)
    expect(ownerArchive.body.world.archived).toBe(true)
  })

  it("cannot demote the last remaining owner", async () => {
    const owner = await signupUser("solo@owner.test", "Solo Owner")
    const create = await request(app).post("/worlds").set(authed(owner.accessToken)).send({ name: "Solo World" })
    const worldId = create.body.world.id

    const res = await request(app).patch(`/worlds/${worldId}/members/${owner.userId}`).set(authed(owner.accessToken)).send({ role: "editor" })
    expect(res.status).toBe(403)
  })
})
