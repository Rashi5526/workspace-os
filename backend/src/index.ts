import http from "http"
import { createApp } from "./app"
import { initRealtime } from "./realtime/socket"
import { env } from "./config/env"

const app = createApp()
const server = http.createServer(app)
initRealtime(server)

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Workspace OS backend listening on http://localhost:${env.port}`)
})

process.on("SIGTERM", () => server.close(() => process.exit(0)))
process.on("SIGINT", () => server.close(() => process.exit(0)))
