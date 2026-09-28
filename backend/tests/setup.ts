import { beforeAll, afterAll } from "vitest"
import { prisma, resetDb } from "./helpers"

beforeAll(async () => { await resetDb() })
afterAll(async () => { await prisma.$disconnect() })
