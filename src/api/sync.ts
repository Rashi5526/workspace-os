// Sync engine: turns local state changes (made through the store's set())
// into backend REST calls, with debounce, ordering, retry and error reporting.
// The UI keeps mutating a plain State object exactly as before; this layer
// diffs before/after and persists the difference. Nothing is dropped
// silently: retryable failures stay queued, other failures surface an error.
import { api, ApiError } from "./client"
import type { State } from "../store"

type Kind = "world" | "project" | "page" | "task" | "tx" | "person" | "idea" | "file" | "settle"

interface Op { kind: Kind; id: string; worldId: string }

const COLS: [Exclude<Kind, "settle">, keyof State][] = [
  ["world", "worlds"], ["project", "projects"], ["page", "pages"], ["task", "tasks"],
  ["tx", "transactions"], ["person", "people"], ["idea", "ideas"], ["file", "files"],
]

const PRIORITY: Record<Kind, number> = { world: 0, project: 1, page: 2, person: 2, idea: 2, task: 3, tx: 3, file: 3, settle: 4 }

const PATHS: Record<Exclude<Kind, "world" | "settle">, string> = {
  project: "projects", page: "pages", task: "tasks", tx: "transactions", person: "people", idea: "ideas", file: "files",
}

export interface SyncHooks {
  getState: () => State
  getMembers: (worldId: string) => { id: string }[]
  onStatus: (status: { pending: number; error: string | null }) => void
  onResync: (worldId: string) => void
  onFlushed: (worldIds: string[]) => void
}

const toIsoDateTime = (d: string) => new Date(`${d}T00:00:00.000Z`).toISOString()

export class SyncEngine {
  known = new Set<string>()
  pending = new Map<string, Op & { deleted: boolean }>()
  private timer: any = null
  private retryTimer: any = null
  private retryDelay = 3000
  private running: Promise<void> = Promise.resolve()
  private inflight = 0
  private error: string | null = null

  constructor(private h: SyncHooks) {
    window.addEventListener("online", () => this.flushSoon(0))
  }

  keyOf(kind: Kind, id: string) { return `${kind}:${id}` }
  hasPending(kind: Kind, id: string) { return this.pending.has(this.keyOf(kind, id)) }
  markKnown(kind: Kind, id: string) { this.known.add(this.keyOf(kind, id)) }

  /** Compare two states and queue an op for every created/changed/deleted entity. */
  record(prev: State, next: State) {
    for (const [kind, col] of COLS) {
      const a = prev[col] as any[]
      const b = next[col] as any[]
      if (a === b) continue
      const pm = new Map(a.map((x) => [x.id, x]))
      const nm = new Map(b.map((x) => [x.id, x]))
      for (const [id, item] of nm) {
        const old = pm.get(id)
        if (!old || JSON.stringify(old) !== JSON.stringify(item)) {
          this.mark({ kind, id, worldId: kind === "world" ? id : item.worldId }, false)
          if (kind === "tx" && old && old.split && !item.split) this.mark({ kind: "settle", id: item.worldId, worldId: item.worldId }, false)
        }
      }
      for (const [id, item] of pm) if (!nm.has(id)) this.mark({ kind, id, worldId: kind === "world" ? id : item.worldId }, true)
    }
    this.flushSoon(500)
  }

  private mark(op: Op, deleted: boolean) {
    this.pending.set(this.keyOf(op.kind, op.id), { ...op, deleted })
    this.publish()
  }

  private publish() {
    this.h.onStatus({ pending: this.pending.size + this.inflight, error: this.error })
  }

  flushSoon(ms: number) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.running = this.running.then(() => this.flush()) }, ms)
  }

  retryNow() { this.error = null; this.flushSoon(0) }

  private async flush() {
    if (this.pending.size === 0) return
    const ops = [...this.pending.values()].sort((x, y) => (PRIORITY[x.kind] + (x.deleted ? 10 : 0)) - (PRIORITY[y.kind] + (y.deleted ? 10 : 0)))
    const touched = new Set<string>()
    let retryable = false
    for (const op of ops) {
      const key = this.keyOf(op.kind, op.id)
      if (this.pending.get(key) !== op) continue // superseded by a newer edit while we were busy
      this.pending.delete(key)
      this.inflight++
      this.publish()
      try {
        await this.run(op)
        touched.add(op.worldId)
        this.error = null
      } catch (e) {
        const err = e as ApiError
        if (err.network || err.status >= 500 || err.status === 429) {
          // Keep the change; try again later.
          if (!this.pending.has(key)) this.pending.set(key, op)
          this.error = err.network ? "Offline — your changes are kept and will retry" : `Server error (${err.status}) — will retry`
          retryable = true
        } else if (err.status === 401) {
          if (!this.pending.has(key)) this.pending.set(key, op)
          this.error = "Session expired — please sign in again"
        } else {
          this.error = `Could not save: ${err.message}`
          this.h.onResync(op.worldId) // reload server truth for that world
        }
      } finally {
        this.inflight--
        this.publish()
      }
      if (retryable) break // preserve ordering; stop until connectivity returns
    }
    if (touched.size) this.h.onFlushed([...touched])
    if (retryable) {
      clearTimeout(this.retryTimer)
      this.retryTimer = setTimeout(() => this.flushSoon(0), this.retryDelay)
      this.retryDelay = Math.min(this.retryDelay * 2, 30000)
    } else {
      this.retryDelay = 3000
      if (this.pending.size) this.flushSoon(0)
    }
  }

  private async run(op: Op & { deleted: boolean }) {
    const st = this.h.getState()
    const key = this.keyOf(op.kind, op.id)

    if (op.kind === "settle") { await api.post(`/worlds/${op.worldId}/transactions/settle`); return }

    const path = op.kind === "world" ? `/worlds/${op.id}` : `/worlds/${op.worldId}/${PATHS[op.kind]}/${op.id}`
    const collectionPath = op.kind === "world" ? `/worlds` : `/worlds/${op.worldId}/${PATHS[op.kind]}`

    if (op.deleted) {
      if (!this.known.has(key)) return // created and deleted before ever reaching the server
      try { await api.del(path) } catch (e) { if ((e as ApiError).status !== 404) throw e }
      this.known.delete(key)
      return
    }

    const entity = this.find(st, op)
    if (!entity) return
    const existing = this.known.has(key)
    if (existing) {
      await api.patch(path, this.payload(op.kind, entity, false))
      return
    }
    try {
      await api.post(collectionPath, this.payload(op.kind, entity, true))
    } catch (e) {
      // Already there (e.g. an earlier response was lost): fall back to update.
      if ((e as ApiError).status === 409) await api.patch(path, this.payload(op.kind, entity, false))
      else throw e
    }
    this.known.add(key)
  }

  private find(st: State, op: Op): any {
    const col = COLS.find(([k]) => k === op.kind)![1]
    return (st[col] as any[]).find((x) => x.id === op.id)
  }

  private payload(kind: Kind, e: any, create: boolean): any {
    switch (kind) {
      case "world":
        return { ...(create ? { id: e.id, sandbox: !!e.sandbox } : {}), name: e.name, icon: e.icon, accent: e.accent, description: e.description ?? "", access: e.access, ...(create ? {} : { archived: !!e.archived }) }
      case "project":
        return { ...(create ? { id: e.id } : {}), name: e.name, status: e.status, description: e.description ?? "", investment: Number(e.investment) || 0, goal: e.goal ?? "" }
      case "page":
        return {
          ...(create ? { id: e.id } : {}),
          title: e.title || "Untitled", icon: e.icon, pinned: !!e.pinned, archived: !!e.archived, isTemplate: !!e.template,
          tags: e.tags ?? [],
          blocks: (e.blocks ?? []).map(({ id, type, ...content }: any) => ({ id, type, content })),
        }
      case "task": {
        const due = e.due ? toIsoDateTime(e.due) : null
        return create
          ? { id: e.id, projectId: e.projectId || undefined, title: e.title, status: e.status, priority: e.priority, assigneeId: e.assignee || undefined, due: due ?? undefined, tags: e.tags ?? [] }
          : { projectId: e.projectId ?? null, title: e.title, status: e.status, priority: e.priority, assigneeId: e.assignee ?? null, due, tags: e.tags ?? [] }
      }
      case "tx": {
        const base = { projectId: e.projectId || undefined, type: e.type, amount: Number(e.amount), date: e.date, category: e.category, description: e.description ?? "", method: e.method, payerId: e.person }
        if (!create) return base
        let split: any
        if (e.split && e.type === "expense") {
          // Two-person split: payer + the other world member, 50/50. The server computes the owed amounts.
          const other = this.h.getMembers(e.worldId).find((m) => m.id !== e.person)
          if (other) split = { shares: { [e.person]: 50, [other.id]: 50 } }
        }
        return { id: e.id, ...base, ...(split ? { split } : {}) }
      }
      case "person":
        return { ...(create ? { id: e.id } : {}), name: e.name, companyName: e.company ?? "", role: e.role ?? "", email: e.email ?? "", phone: e.phone ?? "", stage: e.stage, notes: e.notes ?? "" }
      case "idea":
        return { ...(create ? { id: e.id } : {}), title: e.title, note: e.note ?? "", status: e.status }
      case "file":
        return { name: e.name, folderName: e.folder || undefined }
      default:
        return {}
    }
  }
}
