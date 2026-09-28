/**
 * Optional, idempotent seed script for local development.
 *
 * This does NOT hardcode any user identity into application logic — it just
 * creates two ordinary accounts (with real emails/passwords you set below)
 * so you have something to log in with and look at. Delete or ignore this
 * script entirely for a production deployment; real users sign up via
 * POST /auth/signup.
 *
 * Run with: npm run seed
 */
import { PrismaClient, WorldAccess } from "@prisma/client"
import { hashPassword } from "../src/lib/auth"

const prisma = new PrismaClient()

const DEMO_PASSWORD = "password123" // change after first login

async function upsertDemoUser(email: string, name: string, initials: string, color: string) {
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  return prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, profile: { create: { name, initials, color } } },
    update: {},
    include: { profile: true },
  })
}

async function main() {
  const owner = await upsertDemoUser("owner@workspace.local", "Alex Owner", "AO", "#4b5bff")
  const collaborator = await upsertDemoUser("collaborator@workspace.local", "Jordan Collaborator", "JC", "#e0567a")

  const worldsSpec: { key: string; name: string; icon: string; accent: string; description: string; access: WorldAccess; sandbox?: boolean }[] = [
    { key: "personal", name: "Personal", icon: "🏠", accent: "#7c5cff", description: "Private life, notes and finance.", access: "private" },
    { key: "hive", name: "HIVE", icon: "🐝", accent: "#f0a020", description: "Community events and gatherings.", access: "shared" },
    { key: "goodguts", name: "Good Guts", icon: "🥑", accent: "#2fae6a", description: "Gut-health food startup.", access: "shared" },
    { key: "lamberio", name: "Lamberio", icon: "◆", accent: "#e0567a", description: "Design studio experiments.", access: "shared" },
    { key: "sandbox", name: "Sandbox", icon: "🧪", accent: "#8a8f98", description: "Experiments and throwaway work.", access: "private", sandbox: true },
  ]

  const worlds: Record<string, string> = {}
  for (const spec of worldsSpec) {
    const isPrivate = spec.access === "private"
    const existing = await prisma.world.findFirst({ where: { name: spec.name, ownerId: owner.id } })
    const world =
      existing ??
      (await prisma.world.create({
        data: {
          name: spec.name,
          icon: spec.icon,
          accent: spec.accent,
          description: spec.description,
          access: spec.access,
          sandbox: !!spec.sandbox,
          ownerId: owner.id,
          members: {
            create: [
              { userId: owner.id, role: "owner" },
              ...(isPrivate ? [] : [{ userId: collaborator.id, role: "editor" as const }]),
            ],
          },
        },
      }))
    worlds[spec.key] = world.id
  }

  // A little sample content in Good Guts so the app isn't empty on first login.
  const gg = worlds.goodguts
  const existingProject = await prisma.project.findFirst({ where: { worldId: gg, name: "Corporate Breakfast" } })
  const project =
    existingProject ??
    (await prisma.project.create({
      data: { worldId: gg, name: "Corporate Breakfast", status: "active", description: "B2B subscription breakfast for offices.", investment: 48200, goal: "150 subscribers by Q1" },
    }))

  const pageExists = await prisma.page.findFirst({ where: { worldId: gg, title: "Corporate Proposal" } })
  if (!pageExists) {
    await prisma.page.create({
      data: {
        worldId: gg,
        title: "Corporate Proposal",
        icon: "📄",
        pinned: true,
        updatedById: owner.id,
        blocks: {
          create: [
            { type: "heading", position: 0, content: { text: "Corporate Breakfast Subscription" } },
            { type: "text", position: 1, content: { text: "Good Guts proposes a monthly corporate wellness breakfast delivered to offices across the city." } },
            { type: "callout", position: 2, content: { text: "Target: 150 subscribers by Q1. Pilot with 3 anchor clients.", meta: { tone: "accent" } } },
          ],
        },
      },
    })
  }

  const taskExists = await prisma.task.findFirst({ where: { worldId: gg, title: "Finalise supplier shortlist" } })
  if (!taskExists) {
    await prisma.task.create({
      data: { worldId: gg, projectId: project.id, title: "Finalise supplier shortlist", status: "doing", priority: "high", assigneeId: collaborator.id },
    })
  }

  console.log("Seed complete.")
  console.log(`  Owner login:         owner@workspace.local / ${DEMO_PASSWORD}`)
  console.log(`  Collaborator login:  collaborator@workspace.local / ${DEMO_PASSWORD}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
