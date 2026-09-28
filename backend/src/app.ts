import express from "express"
import cors from "cors"
import helmet from "helmet"
import { env } from "./config/env"
import { authRouter } from "./routes/auth.routes"
import { worldsRouter } from "./routes/worlds.routes"
import { membersRouter, invitesRouter } from "./routes/members.routes"
import { pagesRouter } from "./routes/pages.routes"
import { projectsRouter } from "./routes/projects.routes"
import { tasksRouter } from "./routes/tasks.routes"
import { transactionsRouter } from "./routes/transactions.routes"
import { peopleRouter } from "./routes/people.routes"
import { filesRouter } from "./routes/files.routes"
import { ideasRouter } from "./routes/ideas.routes"
import { calendarRouter } from "./routes/calendar.routes"
import { commentsRouter } from "./routes/comments.routes"
import { notificationsRouter } from "./routes/notifications.routes"
import { templatesRouter } from "./routes/templates.routes"
import { activityRouter } from "./routes/activity.routes"
import { errorHandler, notFoundHandler } from "./middleware/errorHandler"

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors({ origin: env.corsOrigins, credentials: true }))
  app.use(express.json({ limit: "5mb" }))

  app.get("/health", (_req, res) => res.json({ ok: true }))

  app.use("/auth", authRouter)
  app.use("/invites", invitesRouter)
  app.use("/notifications", notificationsRouter)
  app.use("/worlds", worldsRouter)

  // Everything scoped to a single World nests under /worlds/:worldId/...
  // Each sub-router calls requireWorldRole itself, so role checks happen
  // exactly once per request, close to the data being touched.
  app.use("/worlds/:worldId/members", membersRouter)
  app.use("/worlds/:worldId/pages", pagesRouter)
  app.use("/worlds/:worldId/projects", projectsRouter)
  app.use("/worlds/:worldId/tasks", tasksRouter)
  app.use("/worlds/:worldId/transactions", transactionsRouter)
  app.use("/worlds/:worldId/people", peopleRouter)
  app.use("/worlds/:worldId/files", filesRouter)
  app.use("/worlds/:worldId/ideas", ideasRouter)
  app.use("/worlds/:worldId/calendar", calendarRouter)
  app.use("/worlds/:worldId/comments", commentsRouter)
  app.use("/worlds/:worldId/templates", templatesRouter)
  app.use("/worlds/:worldId/activity", activityRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
