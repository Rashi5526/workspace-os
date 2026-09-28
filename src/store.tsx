import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { api, API_URL, ApiError, downloadFile as downloadFromApi, onTokenChange, session, setSocketIdGetter, type AuthUser } from "./api/client"
import { SyncEngine } from "./api/sync"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ID = string

export interface User {
  id: ID
  name: string
  initials: string
  color: string
  email: string
}

export type Access = "private" | "shared"

export interface World {
  id: ID
  name: string
  icon: string
  accent: string
  description: string
  access: Access
  archived?: boolean
  sandbox?: boolean
}

export type BlockType =
  | "heading"
  | "text"
  | "checklist"
  | "callout"
  | "divider"
  | "quote"
  | "table"
  | "calculator"
  | "kanban"

export interface Block {
  id: ID
  type: BlockType
  text?: string
  items?: { id: ID; text: string; done: boolean }[]
  rows?: string[][]
  calc?: CalcLine[]
  meta?: Record<string, any>
}

export interface CalcLine {
  id: ID
  label: string
  value: number
}

export interface Page {
  id: ID
  worldId: ID
  title: string
  icon: string
  blocks: Block[]
  tags: string[]
  createdAt: number
  updatedAt: number
  updatedBy: ID
  pinned?: boolean
  archived?: boolean
  template?: boolean
}

export type ProjectStatus = "idea" | "planning" | "active" | "blocked" | "completed" | "archived"

export interface Project {
  id: ID
  worldId: ID
  name: string
  status: ProjectStatus
  description: string
  investment: number
  goal: string
}

export type TaskStatus = "todo" | "doing" | "waiting" | "done"
export type Priority = "low" | "medium" | "high" | "urgent"

export interface Task {
  id: ID
  worldId: ID
  projectId?: ID
  title: string
  status: TaskStatus
  priority: Priority
  assignee?: ID
  due?: string
  tags: string[]
  createdAt: number
}

export type TxType = "income" | "expense"

export interface Transaction {
  id: ID
  worldId: ID
  projectId?: ID
  type: TxType
  amount: number
  date: string
  category: string
  description: string
  person: ID
  method: string
  split?: boolean // shared 50/50 for expense
}

export interface Person {
  id: ID
  worldId: ID
  name: string
  company: string
  role: string
  email: string
  phone: string
  stage: "new" | "contacted" | "meeting" | "proposal" | "won" | "lost"
  notes: string
}

export interface FileItem {
  id: ID
  worldId: ID
  name: string
  kind: string
  size: string
  folder: string
  date: string
}

export type IdeaStatus = "thought" | "exploring" | "researching" | "building" | "live" | "killed"

export interface Idea {
  id: ID
  worldId: ID
  title: string
  note: string
  status: IdeaStatus
  createdAt: number
}

export interface Activity {
  id: ID
  worldId?: ID
  who: ID
  text: string
  at: number
}

export interface State {
  users: User[]
  me: ID
  worlds: World[]
  pages: Page[]
  projects: Project[]
  tasks: Task[]
  transactions: Transaction[]
  people: Person[]
  files: FileItem[]
  ideas: Idea[]
  activity: Activity[]
  theme: "light" | "dark"
  activeWorld: ID
  recent: ID[] // page ids
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)

export function iso(t: number) {
  return new Date(t).toISOString().slice(0, 10)
}

// The backend database is the source of truth. localStorage is only used for
// per-device UI preferences (theme, last active world, recent pages).
const UI_KEY = "workspace-os-ui-prefs"
interface UiPrefs { theme: "light" | "dark"; activeWorld: ID; recent: ID[] }
function loadUi(): Partial<UiPrefs> {
  try { return JSON.parse(localStorage.getItem(UI_KEY) || "{}") } catch { return {} }
}

export type SaveStatus = "saved" | "saving" | "error"

interface Ctx {
  s: State
  set: (fn: (draft: State) => void) => void
  me: User
  activeWorld: World
  saving: boolean
  saveStatus: SaveStatus
  saveError: string | null
  retrySave: () => void
  log: (text: string, worldId?: ID) => void
  reset: () => void
  uploadFile: (file: File, folder?: string) => Promise<void>
  downloadFile: (f: FileItem) => Promise<void>
  membersOf: (worldId: ID) => User[]
  signOut: () => void
}

const StoreCtx = createContext<Ctx>(null as any)
export const useStore = () => useContext(StoreCtx)

// ---------------------------------------------------------------------------
// Loading from the backend
// ---------------------------------------------------------------------------
const toUser = (m: any): User => ({ id: m.userId ?? m.id, name: m.name, initials: m.initials, color: m.color, email: m.email })

async function fetchWorld(worldId: ID) {
  const b = `/worlds/${worldId}`
  const [pages, projects, tasks, transactions, people, files, ideas, activity, members] = await Promise.all([
    api.get(`${b}/pages`), api.get(`${b}/projects`), api.get(`${b}/tasks`), api.get(`${b}/transactions`),
    api.get(`${b}/people`), api.get(`${b}/files`), api.get(`${b}/ideas`), api.get(`${b}/activity`), api.get(`${b}/members`),
  ])
  return {
    pages: pages.pages as Page[], projects: projects.projects as Project[], tasks: tasks.tasks as Task[],
    transactions: transactions.transactions as Transaction[], people: people.people as Person[],
    files: files.files as FileItem[], ideas: ideas.ideas as Idea[], activity: activity.activity as Activity[],
    members: (members.members as any[]).map(toUser),
  }
}

async function loadAll(user: AuthUser) {
  let { worlds } = await api.get("/worlds")
  if (!worlds.length) {
    // Brand-new account: give it a private starter world so the UI always has one.
    const r = await api.post("/worlds", { name: "Personal", icon: "🏠", accent: "#7c5cff", description: "Private life, notes and finance.", access: "private" })
    worlds = [r.world]
  }
  const results = await Promise.allSettled(worlds.map((w: any) => fetchWorld(w.id)))
  const net = results.find((r) => r.status === "rejected" && (r.reason as ApiError).network) as PromiseRejectedResult | undefined
  if (net) throw net.reason

  const members: Record<string, User[]> = {}
  const state: State = {
    users: [], me: user.id, worlds: worlds.map(({ myRole, ...w }: any) => w as World),
    pages: [], projects: [], tasks: [], transactions: [], people: [], files: [], ideas: [], activity: [],
    theme: "dark", activeWorld: "", recent: [],
  }
  const users = new Map<string, User>([[user.id, { id: user.id, name: user.name, initials: user.initials, color: user.color, email: user.email }]])
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return
    const w = r.value
    state.pages.push(...w.pages); state.projects.push(...w.projects); state.tasks.push(...w.tasks)
    state.transactions.push(...w.transactions); state.people.push(...w.people); state.files.push(...w.files)
    state.ideas.push(...w.ideas); state.activity.push(...w.activity)
    members[worlds[i].id] = w.members
    w.members.forEach((m: User) => users.set(m.id, m))
  })
  state.users = [...users.values()]
  state.activity.sort((a, b) => b.at - a.at)

  const ui = loadUi()
  state.theme = ui.theme ?? "dark"
  const visible = state.worlds.filter((w) => !w.archived)
  state.activeWorld = state.worlds.some((w) => w.id === ui.activeWorld) ? ui.activeWorld! : (visible[0] ?? state.worlds[0]).id
  state.recent = (ui.recent ?? []).filter((id) => state.pages.some((p) => p.id === id))
  return { state, members }
}

const upsert = <T extends { id: string }>(arr: T[], item: T): T[] => {
  const i = arr.findIndex((x) => x.id === item.id)
  if (i < 0) return [item, ...arr]
  if (JSON.stringify(arr[i]) === JSON.stringify(item)) return arr
  const copy = arr.slice(); copy[i] = item; return copy
}

const REMOTE: Record<string, [any, keyof State]> = {
  page: ["page", "pages"], project: ["project", "projects"], task: ["task", "tasks"], transaction: ["tx", "transactions"],
  person: ["person", "people"], file: ["file", "files"], idea: ["idea", "ideas"], world: ["world", "worlds"],
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function StoreProvider({ user, onSignOut, children }: { user: AuthUser; onSignOut: () => void; children: React.ReactNode }) {
  const [s, setS] = useState<State | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [status, setStatus] = useState<{ pending: number; error: string | null }>({ pending: 0, error: null })
  const [extraError, setExtraError] = useState<string | null>(null)
  const [uploads, setUploads] = useState(0)

  const stateRef = useRef<State | null>(null)
  const membersRef = useRef<Record<string, User[]>>({})
  const socketRef = useRef<Socket | null>(null)
  const engineRef = useRef<SyncEngine | null>(null)

  const commit = useCallback((next: State) => { stateRef.current = next; setS(next) }, [])

  const reloadWorld = useCallback(async (worldId: ID) => {
    try {
      const w = await fetchWorld(worldId)
      const prev = stateRef.current
      if (!prev) return
      const keep = <T extends { worldId?: ID }>(a: T[]) => a.filter((x) => x.worldId !== worldId)
      membersRef.current[worldId] = w.members
      commit({
        ...prev,
        pages: [...keep(prev.pages), ...w.pages], projects: [...keep(prev.projects), ...w.projects], tasks: [...keep(prev.tasks), ...w.tasks],
        transactions: [...keep(prev.transactions), ...w.transactions], people: [...keep(prev.people), ...w.people],
        files: [...keep(prev.files), ...w.files], ideas: [...keep(prev.ideas), ...w.ideas], activity: [...keep(prev.activity), ...w.activity].sort((a, b) => b.at - a.at),
      })
      w.pages.forEach((p) => engineRef.current?.markKnown("page", p.id))
      w.projects.forEach((p) => engineRef.current?.markKnown("project", p.id))
      w.tasks.forEach((p) => engineRef.current?.markKnown("task", p.id))
      w.transactions.forEach((p) => engineRef.current?.markKnown("tx", p.id))
      w.people.forEach((p) => engineRef.current?.markKnown("person", p.id))
      w.files.forEach((p) => engineRef.current?.markKnown("file", p.id))
      w.ideas.forEach((p) => engineRef.current?.markKnown("idea", p.id))
    } catch { /* keep current state; error already surfaced by the failed save */ }
  }, [commit])

  if (!engineRef.current) {
    engineRef.current = new SyncEngine({
      getState: () => stateRef.current!,
      getMembers: (wid) => membersRef.current[wid] ?? [],
      onStatus: setStatus,
      onResync: (wid) => { void reloadWorld(wid) },
      onFlushed: (wids) => {
        wids.forEach((wid) => {
          socketRef.current?.emit("world:join", wid)
          api.get(`/worlds/${wid}/activity`).then((r) => {
            const prev = stateRef.current
            if (!prev) return
            commit({ ...prev, activity: [...prev.activity.filter((a) => a.worldId !== wid), ...(r.activity as Activity[])].sort((a, b) => b.at - a.at) })
          }).catch(() => {})
        })
      },
    })
  }
  const engine = engineRef.current

  // Initial load (and reload)
  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadAll(user).then(({ state, members }) => {
      if (cancelled) return
      membersRef.current = members
      engine.known = new Set()
      state.worlds.forEach((w) => engine.markKnown("world", w.id))
      state.pages.forEach((p) => engine.markKnown("page", p.id))
      state.projects.forEach((p) => engine.markKnown("project", p.id))
      state.tasks.forEach((p) => engine.markKnown("task", p.id))
      state.transactions.forEach((p) => engine.markKnown("tx", p.id))
      state.people.forEach((p) => engine.markKnown("person", p.id))
      state.files.forEach((p) => engine.markKnown("file", p.id))
      state.ideas.forEach((p) => engine.markKnown("idea", p.id))
      commit(state)
    }).catch((e: ApiError) => { if (!cancelled) setLoadError(e.network ? "Cannot reach the server. Check your connection and that the backend is running." : e.message) })
    return () => { cancelled = true }
  }, [user.id, reloadKey, commit, engine])

  // Realtime
  const ready = s !== null
  useEffect(() => {
    if (!ready) return
    const socket = io(API_URL, { auth: { token: session.access } })
    socketRef.current = socket
    setSocketIdGetter(() => socket.id)
    const join = () => stateRef.current?.worlds.forEach((w) => socket.emit("world:join", w.id))
    socket.on("connect", join)
    socket.on("connect_error", async (err) => {
      if (err.message === "unauthorized") {
        try { await api.get("/auth/me"); socket.auth = { token: session.access }; socket.connect() } catch { /* auth-lost handler takes over */ }
      }
    })
    const offToken = onTokenChange((t) => { socket.auth = { token: t } })

    const applyUpsert = (name: string, payload: any) => {
      const [kind, col] = REMOTE[name]
      const prev = stateRef.current
      if (!prev || !payload?.id || engine.hasPending(kind, payload.id)) return
      const list = upsert(prev[col] as any[], payload)
      if (list === prev[col]) return
      engine.markKnown(kind, payload.id)
      commit({ ...prev, [col]: list } as State)
    }
    const applyDelete = (name: string, payload: any) => {
      const [kind, col] = REMOTE[name]
      const prev = stateRef.current
      if (!prev || !payload?.id) return
      const list = (prev[col] as any[]).filter((x) => x.id !== payload.id)
      if (list.length === (prev[col] as any[]).length) return
      engine.known.delete(`${kind}:${payload.id}`)
      if (name === "world" && list.length === 0) { setReloadKey((k) => k + 1); return }
      const next = { ...prev, [col]: list } as State
      if (name === "world" && next.activeWorld === payload.id) next.activeWorld = (list as World[]).find((w) => !w.archived)?.id ?? (list as World[])[0].id
      commit(next)
    }
    Object.keys(REMOTE).forEach((n) => {
      socket.on(`${n}.upserted`, (p) => applyUpsert(n, p))
      socket.on(`${n}.deleted`, (p) => applyDelete(n, p))
    })
    socket.on("activity.created", (p: any) => {
      const prev = stateRef.current
      if (!prev || prev.activity.some((a) => a.id === p.id)) return
      commit({ ...prev, activity: [{ id: p.id, worldId: p.worldId, who: p.actorId, text: p.text, at: new Date(p.createdAt).getTime() }, ...prev.activity].slice(0, 200) })
    })
    return () => { offToken(); setSocketIdGetter(() => undefined); socket.disconnect(); socketRef.current = null }
  }, [ready, commit, engine])

  // Persist UI-only prefs; apply theme.
  useEffect(() => {
    if (!s) return
    document.documentElement.classList.toggle("dark", s.theme === "dark")
    try { localStorage.setItem(UI_KEY, JSON.stringify({ theme: s.theme, activeWorld: s.activeWorld, recent: s.recent })) } catch { /* ignore */ }
  }, [s?.theme, s?.activeWorld, s?.recent])

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (engine.pending.size > 0) { e.preventDefault(); e.returnValue = "" } }
    window.addEventListener("beforeunload", h)
    return () => window.removeEventListener("beforeunload", h)
  }, [engine])

  const set = useCallback((fn: (draft: State) => void) => {
    const prev = stateRef.current
    if (!prev) return
    const next = structuredClone(prev)
    fn(next)
    next.me = prev.me // identity comes from the authenticated session, never from client state
    commit(next)
    engine.record(prev, next)
  }, [commit, engine])

  const uploadFile = useCallback(async (file: File, folder?: string) => {
    const st = stateRef.current
    if (!st) return
    const worldId = st.activeWorld
    setUploads((n) => n + 1)
    try {
      const form = new FormData()
      if (folder) form.append("folderName", folder)
      form.append("file", file)
      const r = await api.upload(`/worlds/${worldId}/files/upload`, form)
      engine.markKnown("file", r.file.id)
      const prev = stateRef.current!
      commit({ ...prev, files: upsert(prev.files, r.file as FileItem) })
      setExtraError(null)
    } catch (e) {
      setExtraError(`Upload failed: ${(e as ApiError).message}`)
    } finally {
      setUploads((n) => n - 1)
    }
  }, [commit, engine])

  const downloadFile = useCallback(async (f: FileItem) => {
    try { await downloadFromApi(f.worldId, f.id, f.name) } catch (e) { setExtraError(`Download failed: ${(e as ApiError).message}`) }
  }, [])

  const signOut = useCallback(() => {
    if (engine.pending.size > 0 && !window.confirm("Some changes haven't been saved yet. Sign out anyway?")) return
    onSignOut()
  }, [engine, onSignOut])

  const retrySave = useCallback(() => { setExtraError(null); engine.retryNow() }, [engine])
  const log = useCallback(() => { /* the server records activity for every action */ }, [])
  const reset = useCallback(() => setReloadKey((k) => k + 1), [])
  const membersOf = useCallback((wid: ID) => membersRef.current[wid] ?? [], [])

  const error = extraError ?? status.error
  const saveStatus: SaveStatus = error ? "error" : status.pending > 0 || uploads > 0 ? "saving" : "saved"

  const value = useMemo<Ctx | null>(() => {
    if (!s) return null
    const me = s.users.find((u) => u.id === s.me)!
    const activeWorld = s.worlds.find((w) => w.id === s.activeWorld) || s.worlds[0]
    return { s, set, me, activeWorld, saving: saveStatus === "saving", saveStatus, saveError: error, retrySave, log, reset, uploadFile, downloadFile, membersOf, signOut }
  }, [s, saveStatus, error, set, retrySave, log, reset, uploadFile, downloadFile, membersOf, signOut])

  if (!value) {
    return (
      <div className="h-screen grid place-items-center text-[var(--fg)]" style={{ background: "var(--bg)" }}>
        {loadError ? (
          <div className="text-center max-w-sm">
            <div className="text-[15px] font-semibold mb-2">Couldn't load your workspace</div>
            <div className="text-[13px] text-[var(--fg-muted)] mb-4">{loadError}</div>
            <button className="px-3 py-1.5 rounded-md border border-[var(--border)] text-[13px]" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
          </div>
        ) : <div className="text-[13px] text-[var(--fg-faint)]">Loading workspace…</div>}
      </div>
    )
  }
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export { uid }
