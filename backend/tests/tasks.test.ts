import { describe, it, expect } from "vitest"
import request from "supertest"
import { app, signupUser, authed } from "./helpers"

describe("tasks", () => {
  it("creates, updates status to done (logged as completed), and lists tasks", async () => {
    const user = await signupUser("tasks1@test.com", "Tasks User")
    const world = await request(app).post("/worlds").set(authed(user.accessToken)).send({ name: "Tasks World" })
    const worldId = world.body.world.id

    const create = await request(app).post(`/worlds/${worldId}/tasks`).set(authed(user.accessToken)).send({ title: "Ship it", priority: "high" })
    expect(create.status).toBe(201)
    expect(create.body.task.status).toBe("todo")

    const update = await request(app).patch(`/worlds/${worldId}/tasks/${create.body.task.id}`).set(authed(user.accessToken)).send({ status: "done" })
    expect(update.status).toBe(200)
    expect(update.body.task.status).toBe("done")

    const activity = await request(app).get(`/worlds/${worldId}/activity`).set(authed(user.accessToken))
    expect(activity.body.activity.some((a: any) => a.text.includes("completed"))).toBe(true)

    const list = await request(app).get(`/worlds/${worldId}/tasks`).set(authed(user.accessToken))
    expect(list.body.tasks).toHaveLength(1)
  })

  it("supports subtasks", async () => {
    const user = await signupUser("tasks2@test.com", "Tasks User 2")
    const world = await request(app).post("/worlds").set(authed(user.accessToken)).send({ name: "Tasks World 2" })
    const worldId = world.body.world.id
    const task = await request(app).post(`/worlds/${worldId}/tasks`).set(authed(user.accessToken)).send({ title: "Parent task" })

    const sub = await request(app).post(`/worlds/${worldId}/tasks/${task.body.task.id}/subtasks`).set(authed(user.accessToken)).send({ title: "Step 1" })
    expect(sub.status).toBe(201)

    const done = await request(app)
      .patch(`/worlds/${worldId}/tasks/${task.body.task.id}/subtasks/${sub.body.subtask.id}`)
      .set(authed(user.accessToken))
      .send({ done: true })
    expect(done.body.task.subtasks[0].done).toBe(true)
  })
})
