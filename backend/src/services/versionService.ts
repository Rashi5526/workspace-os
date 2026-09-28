import { prisma } from "../lib/prisma"

/** Snapshot a page's full current state (title/icon/blocks) as a new version. */
export async function snapshotPageVersion(pageId: string, authorId: string, opts: { minIntervalMs?: number } = {}) {
  const page = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { blocks: { orderBy: { position: "asc" } } },
  })

  const last = await prisma.version.findFirst({
    where: { entityType: "page", entityId: pageId },
    orderBy: { versionNumber: "desc" },
  })

  if (opts.minIntervalMs && last && Date.now() - last.createdAt.getTime() < opts.minIntervalMs) return last

  return prisma.version.create({
    data: {
      worldId: page.worldId,
      entityType: "page",
      entityId: pageId,
      pageId,
      versionNumber: (last?.versionNumber ?? 0) + 1,
      authorId,
      snapshot: {
        title: page.title,
        icon: page.icon,
        blocks: page.blocks.map((b) => ({ id: b.id, type: b.type, position: b.position, content: b.content })),
      },
    },
  })
}

/** Restore a page to a previous version's snapshot (replaces current blocks). */
export async function restorePageVersion(pageId: string, versionId: string, authorId: string) {
  const version = await prisma.version.findFirstOrThrow({ where: { id: versionId, pageId } })
  const snapshot = version.snapshot as { title: string; icon: string; blocks: any[] }

  return prisma.$transaction(async (tx) => {
    await tx.block.deleteMany({ where: { pageId } })
    await tx.page.update({
      where: { id: pageId },
      data: {
        title: snapshot.title,
        icon: snapshot.icon,
        updatedById: authorId,
        blocks: {
          create: snapshot.blocks.map((b, i) => ({
            type: b.type,
            position: b.position ?? i,
            content: b.content ?? {},
          })),
        },
      },
    })
    // Restoring creates a new version too, so history is append-only.
    return snapshotPageVersion(pageId, authorId)
  })
}
