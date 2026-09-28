import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    env: {
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "test-access-secret",
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret",
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_DIR: "./.test-uploads",
      AUTH_RATE_LIMIT_MAX: "10000",
      NODE_ENV: "test",
    },
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    // Tests share one Postgres schema and reset it between files, so run
    // them one at a time to avoid cross-test interference.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
