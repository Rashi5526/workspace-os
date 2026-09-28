import { describe, it, expect } from "vitest"
import { app, request, signup, authed, createWorld, addMember } from "./helpers"

describe("files", () => {
  it("uploads, lists, downloads identical bytes, renames, moves, and deletes", async () => {
    const u = await signup(); const w = await createWorld(u.token); const h = authed(u.token)
    const bytes = Buffer.from("%PDF-1.4 hello workspace os")
    const up = await request(app).post(`/worlds/${w}/files/upload`).set(h).field("folderName", "Invoices").attach("file", bytes, { filename: "inv.pdf", contentType: "application/pdf" })
    expect(up.status).toBe(201)
    expect(up.body.file).toMatchObject({ name: "inv.pdf", kind: "pdf", folder: "Invoices" })
    const id = up.body.file.id

    const dl = await request(app).get(`/worlds/${w}/files/${id}/download`).set(h).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks)))
    })
    expect(dl.status).toBe(200)
    expect((dl.body as Buffer).equals(bytes)).toBe(true)

    const ren = await request(app).patch(`/worlds/${w}/files/${id}`).set(h).send({ name: "renamed.pdf", folderName: "Documents" })
    expect(ren.body.file).toMatchObject({ name: "renamed.pdf", folder: "Documents" })
    expect((await request(app).delete(`/worlds/${w}/files/${id}`).set(h)).status).toBe(204)
    expect((await request(app).get(`/worlds/${w}/files`).set(h)).body.files).toHaveLength(0)
  })

  it("does not let non-members or viewers touch files", async () => {
    const owner = await signup(), outsider = await signup(), viewer = await signup()
    const w = await createWorld(owner.token, { access: "private" }); await addMember(owner.token, w, viewer, "viewer")
    const up = await request(app).post(`/worlds/${w}/files/upload`).set(authed(owner.token)).attach("file", Buffer.from("secret"), "s.txt")
    const id = up.body.file.id
    expect((await request(app).get(`/worlds/${w}/files/${id}/download`).set(authed(outsider.token))).status).toBe(404)
    expect((await request(app).post(`/worlds/${w}/files/upload`).set(authed(viewer.token)).attach("file", Buffer.from("x"), "x.txt")).status).toBe(403)
    expect((await request(app).get(`/worlds/${w}/files/${id}/download`).set(authed(viewer.token))).status).toBe(200)
  })
})
