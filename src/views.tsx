import React, { useMemo, useState } from "react"
import { useStore, uid, iso, Task, TaskStatus, Priority, Transaction, Person, Idea, IdeaStatus, Project, ProjectStatus, ID } from "./store"
import { Icon, Btn, IconBtn, Avatar, Tag, money, timeAgo, Field, inputCls, Modal, StatusDot } from "./ui"

// Helper: filter to active world
function useWorldData() {
  const { s, activeWorld } = useStore()
  const w = activeWorld.id
  return {
    pages: s.pages.filter((p) => p.worldId === w && !p.archived),
    tasks: s.tasks.filter((t) => t.worldId === w),
    tx: s.transactions.filter((t) => t.worldId === w),
    people: s.people.filter((p) => p.worldId === w),
    files: s.files.filter((f) => f.worldId === w),
    ideas: s.ideas.filter((i) => i.worldId === w),
    projects: s.projects.filter((p) => p.worldId === w),
    activity: s.activity.filter((a) => a.worldId === w),
  }
}

export function ViewHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between px-8 pt-8 pb-5 border-b border-[var(--border)]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="text-[13px] text-[var(--fg-muted)] mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function Stat({ label, value, accent, delta }: { label: string; value: string; accent?: string; delta?: string }) {
  return (
    <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4">
      <div className="mono text-[11px] uppercase tracking-wider text-[var(--fg-faint)]">{label}</div>
      <div className="text-2xl font-semibold tracking-tight mt-2" style={accent ? { color: accent } : undefined}>{value}</div>
      {delta && <div className="text-[12px] text-[var(--fg-muted)] mt-0.5">{delta}</div>}
    </div>
  )
}

// ===========================================================================
// HOME
// ===========================================================================
export function Home({ open }: { open: (v: string, id?: string) => void }) {
  const { s, me, activeWorld, set } = useStore()
  const hour = new Date().getHours()
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const all = { tasks: s.tasks, tx: s.transactions }
  const today = iso(Date.now())
  const dueToday = all.tasks.filter((t) => t.due === today && t.status !== "done")
  const overdue = all.tasks.filter((t) => t.due && t.due < today && t.status !== "done")
  const revenue = all.tx.filter((t) => t.type === "income").reduce((a, b) => a + b.amount, 0)
  const spent = all.tx.filter((t) => t.type === "expense").reduce((a, b) => a + b.amount, 0)
  const recent = s.recent.map((id) => s.pages.find((p) => p.id === id)).filter(Boolean).slice(0, 5) as any[]
  const activeWorlds = s.worlds.filter((w) => !w.archived).length
  const activeProjects = s.projects.filter((p) => p.status === "active").length

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="mb-8">
          <div className="mono text-[12px] text-[var(--fg-faint)] uppercase tracking-widest">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1 className="text-4xl font-bold tracking-tight mt-1">{greet}, {me.name}</h1>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          <Stat label="Active worlds" value={String(activeWorlds)} />
          <Stat label="Active projects" value={String(activeProjects)} />
          <Stat label="Revenue" value={money(revenue)} accent="#2fae6a" />
          <Stat label="Spent" value={money(spent)} accent="#e0567a" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section>
              <SecTitle>Continue where you left off</SecTitle>
              <div className="grid sm:grid-cols-2 gap-3">
                {recent.map((p) => {
                  const w = s.worlds.find((x) => x.id === p.worldId)!
                  return (
                    <button key={p.id} onClick={() => { set((d) => { d.activeWorld = p.worldId }); open("page", p.id) }}
                      className="group text-left bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--border-strong)] transition-colors">
                      <div className="flex items-center gap-2 mb-3">
                        <StatusDot color={w.accent} />
                        <span className="mono text-[11px] uppercase tracking-wider text-[var(--fg-faint)]">{w.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{p.icon}</span>
                        <span className="font-medium group-hover:text-[var(--accent)] transition-colors">{p.title}</span>
                      </div>
                      <div className="text-[12px] text-[var(--fg-faint)] mt-2">Edited {timeAgo(p.updatedAt)}</div>
                    </button>
                  )
                })}
              </div>
            </section>

            <section>
              <SecTitle>Today · {dueToday.length + overdue.length} tasks need attention</SecTitle>
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
                {[...overdue, ...dueToday].slice(0, 6).map((t) => {
                  const w = s.worlds.find((x) => x.id === t.worldId)!
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                      <PriorityDot p={t.priority} />
                      <span className="flex-1 text-[14px]">{t.title}</span>
                      <StatusDot color={w.accent} /><span className="mono text-[11px] text-[var(--fg-faint)]">{w.name}</span>
                      {t.due && t.due < today && <span className="mono text-[11px] text-[#e0567a]">overdue</span>}
                    </div>
                  )
                })}
                {dueToday.length + overdue.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-[var(--fg-faint)]">Nothing due. Enjoy the calm.</div>}
              </div>
            </section>
          </div>

          <div className="space-y-8">
            <section>
              <SecTitle>Your worlds</SecTitle>
              <div className="space-y-2">
                {s.worlds.filter((w) => !w.archived).map((w) => (
                  <button key={w.id} onClick={() => { set((d) => { d.activeWorld = w.id }); open("world") }}
                    className="w-full flex items-center gap-3 bg-[var(--panel)] border border-[var(--border)] rounded-lg px-3 py-2.5 hover:border-[var(--border-strong)] transition-colors">
                    <span className="w-8 h-8 grid place-items-center rounded-md text-[16px]" style={{ background: `color-mix(in srgb, ${w.accent} 16%, transparent)` }}>{w.icon}</span>
                    <div className="text-left flex-1 min-w-0">
                      <div className="text-[14px] font-medium truncate">{w.name}</div>
                      <div className="text-[11px] text-[var(--fg-faint)] capitalize">{w.access}</div>
                    </div>
                    <Icon.chevron className="w-4 h-4 text-[var(--fg-faint)]" />
                  </button>
                ))}
              </div>
            </section>

            <section>
              <SecTitle>Activity</SecTitle>
              <ActivityList items={s.activity.slice(0, 7)} />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mono text-[11px] uppercase tracking-widest text-[var(--fg-faint)] mb-3">{children}</h2>
}
function PriorityDot({ p }: { p: Priority }) {
  const c = { low: "#8a8f98", medium: "#f0a020", high: "#e07a20", urgent: "#e0567a" }[p]
  return <span className="w-1.5 h-6 rounded-full shrink-0" style={{ background: c }} title={p} />
}

function ActivityList({ items }: { items: any[] }) {
  const { s } = useStore()
  return (
    <div className="space-y-3">
      {items.map((a) => {
        const u = s.users.find((x) => x.id === a.who)!
        return (
          <div key={a.id} className="flex gap-2.5 items-start">
            <Avatar {...u} size={22} />
            <div className="text-[13px] leading-snug">
              <span className="font-medium">{u.name}</span> <span className="text-[var(--fg-muted)]">{a.text}</span>
              <div className="text-[11px] text-[var(--fg-faint)] mono mt-0.5">{timeAgo(a.at)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ===========================================================================
// WORLD OVERVIEW
// ===========================================================================
export function WorldView({ open }: { open: (v: string, id?: string) => void }) {
  const { activeWorld } = useStore()
  const d = useWorldData()
  const revenue = d.tx.filter((t) => t.type === "income").reduce((a, b) => a + b.amount, 0)
  const expenses = d.tx.filter((t) => t.type === "expense").reduce((a, b) => a + b.amount, 0)
  const profit = revenue - expenses
  const openTasks = d.tasks.filter((t) => t.status !== "done").length

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="flex items-center gap-4 mb-8">
          <span className="w-14 h-14 grid place-items-center rounded-xl text-3xl" style={{ background: `color-mix(in srgb, ${activeWorld.accent} 16%, transparent)` }}>{activeWorld.icon}</span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{activeWorld.name}</h1>
            <p className="text-[14px] text-[var(--fg-muted)]">{activeWorld.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          <Stat label="Revenue" value={money(revenue)} accent="#2fae6a" />
          <Stat label="Expenses" value={money(expenses)} accent="#e0567a" />
          <Stat label="Profit" value={money(profit)} accent={activeWorld.accent} delta={revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}% margin` : "—"} />
          <Stat label="Open tasks" value={String(openTasks)} />
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <section>
            <SecTitle>Pages</SecTitle>
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
              {d.pages.map((p) => (
                <button key={p.id} onClick={() => open("page", p.id)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--hover)] text-left">
                  <span>{p.icon}</span><span className="flex-1 text-[14px] font-medium">{p.title}</span>
                  {p.pinned && <Icon.pin className="w-3.5 h-3.5 text-[var(--fg-faint)]" />}
                  <span className="mono text-[11px] text-[var(--fg-faint)]">{timeAgo(p.updatedAt)}</span>
                </button>
              ))}
              {d.pages.length === 0 && <Empty label="No pages yet" />}
            </div>
          </section>
          <section>
            <SecTitle>Projects</SecTitle>
            <div className="space-y-2">
              {d.projects.map((p) => <ProjectCard key={p.id} p={p} open={open} />)}
              {d.projects.length === 0 && <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl"><Empty label="No projects yet" /></div>}
            </div>
            <div className="mt-8"><SecTitle>Recent activity</SecTitle><ActivityList items={d.activity.slice(0, 6)} /></div>
          </section>
        </div>
      </div>
    </div>
  )
}

const PROJECT_COLORS: Record<ProjectStatus, string> = {
  idea: "#8a8f98", planning: "#f0a020", active: "#2fae6a", blocked: "#e0567a", completed: "#4b5bff", archived: "#6b6f76",
}
function ProjectCard({ p, open }: { p: Project; open: (v: string, id?: string) => void }) {
  const { s } = useStore()
  const tx = s.transactions.filter((t) => t.projectId === p.id)
  const rev = tx.filter((t) => t.type === "income").reduce((a, b) => a + b.amount, 0)
  const exp = tx.filter((t) => t.type === "expense").reduce((a, b) => a + b.amount, 0)
  return (
    <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <StatusDot color={PROJECT_COLORS[p.status]} />
        <span className="font-medium flex-1">{p.name}</span>
        <span className="mono text-[11px] uppercase tracking-wider text-[var(--fg-faint)]">{p.status}</span>
      </div>
      <p className="text-[13px] text-[var(--fg-muted)] mb-3">{p.description}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Rev" value={money(rev)} />
        <MiniStat label="Exp" value={money(exp)} />
        <MiniStat label="Profit" value={money(rev - exp)} />
      </div>
    </div>
  )
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="bg-[var(--panel-2)] rounded-md py-1.5"><div className="mono text-[10px] uppercase text-[var(--fg-faint)]">{label}</div><div className="text-[13px] font-medium mono">{value}</div></div>
}
function Empty({ label }: { label: string }) {
  return <div className="px-4 py-8 text-center text-[13px] text-[var(--fg-faint)]">{label}</div>
}

// ===========================================================================
// TASKS
// ===========================================================================
const TASK_COLS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "To Do" }, { key: "doing", label: "In Progress" }, { key: "waiting", label: "Waiting" }, { key: "done", label: "Done" },
]
export function Tasks() {
  const { activeWorld, set, s, log } = useStore()
  const d = useWorldData()
  const [view, setView] = useState<"board" | "list">("board")
  const [adding, setAdding] = useState(false)

  const move = (id: string, status: TaskStatus) => set((dr) => { const t = dr.tasks.find((x) => x.id === id); if (t) t.status = status })

  return (
    <div className="flex flex-col h-full">
      <ViewHeader title="Tasks" sub={`${d.tasks.filter((t) => t.status !== "done").length} open in ${activeWorld.name}`}>
        <div className="flex rounded-md border border-[var(--border)] overflow-hidden">
          {(["board", "list"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-[13px] capitalize ${view === v ? "bg-[var(--hover)] text-[var(--fg)]" : "text-[var(--fg-muted)]"}`}>{v}</button>
          ))}
        </div>
        <Btn variant="primary" onClick={() => setAdding(true)}><Icon.plus className="w-4 h-4" /> New task</Btn>
      </ViewHeader>

      <div className="flex-1 overflow-auto p-8">
        {view === "board" ? (
          <div className="grid grid-cols-4 gap-4 min-w-[900px]">
            {TASK_COLS.map((col) => {
              const items = d.tasks.filter((t) => t.status === col.key)
              return (
                <div key={col.key} className="min-w-0"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { const id = e.dataTransfer.getData("id"); if (id) { move(id, col.key); log("moved a task") } }}>
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className="mono text-[11px] uppercase tracking-wider text-[var(--fg-faint)]">{col.label}</span>
                    <span className="mono text-[11px] text-[var(--fg-faint)]">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((t) => <TaskCard key={t.id} t={t} />)}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)] max-w-4xl">
            {d.tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => move(t.id, t.status === "done" ? "todo" : "done")} className="w-4 h-4 rounded border grid place-items-center shrink-0" style={t.status === "done" ? { background: activeWorld.accent, borderColor: activeWorld.accent } : { borderColor: "var(--border-strong)" }}>{t.status === "done" && <Icon.check className="w-3 h-3 text-white" />}</button>
                <span className={`flex-1 text-[14px] ${t.status === "done" ? "line-through text-[var(--fg-faint)]" : ""}`}>{t.title}</span>
                {t.due && <span className="mono text-[11px] text-[var(--fg-faint)]">{t.due}</span>}
                {t.assignee && <Ava id={t.assignee} />}
                <PriorityDot p={t.priority} />
              </div>
            ))}
          </div>
        )}
      </div>
      {adding && <TaskModal onClose={() => setAdding(false)} />}
    </div>
  )
}

function Ava({ id }: { id: ID }) {
  const { s } = useStore()
  const u = s.users.find((x) => x.id === id)
  return u ? <Avatar {...u} size={22} /> : null
}

function TaskCard({ t }: { t: Task }) {
  const { s } = useStore()
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData("id", t.id)}
      className="bg-[var(--panel)] border border-[var(--border)] rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-[var(--border-strong)] transition-colors">
      <div className="flex items-start gap-2">
        <PriorityDot p={t.priority} />
        <span className="text-[14px] leading-snug flex-1">{t.title}</span>
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        {t.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
        <div className="flex-1" />
        {t.due && <span className="mono text-[11px] text-[var(--fg-faint)]">{t.due.slice(5)}</span>}
        {t.assignee && <Ava id={t.assignee} />}
      </div>
    </div>
  )
}

function TaskModal({ onClose, presetStatus }: { onClose: () => void; presetStatus?: TaskStatus }) {
  const { set, activeWorld, s, log } = useStore()
  const [title, setTitle] = useState("")
  const [priority, setPriority] = useState<Priority>("medium")
  const [assignee, setAssignee] = useState<ID>(s.me)
  const [due, setDue] = useState("")
  const save = () => {
    if (!title.trim()) return
    set((d) => { d.tasks.unshift({ id: uid(), worldId: activeWorld.id, title, status: presetStatus || "todo", priority, assignee, due: due || undefined, tags: [], createdAt: Date.now() }) })
    log(`created task "${title}"`)
    onClose()
  }
  return (
    <Modal onClose={onClose}>
      <div className="p-5 space-y-4">
        <h3 className="font-semibold text-lg">New task</h3>
        <Field label="Title"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className={inputCls} placeholder="What needs doing?" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Priority"><select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputCls}>{["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
          <Field label="Assignee"><select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputCls}>{s.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <Field label="Due"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-1"><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save}>Create task</Btn></div>
      </div>
    </Modal>
  )
}

// ===========================================================================
// FINANCE
// ===========================================================================
export function Finance() {
  const { activeWorld, s, set, log } = useStore()
  const d = useWorldData()
  const [adding, setAdding] = useState(false)
  const revenue = d.tx.filter((t) => t.type === "income").reduce((a, b) => a + b.amount, 0)
  const expenses = d.tx.filter((t) => t.type === "expense").reduce((a, b) => a + b.amount, 0)

  // Expense splitting: shared expenses split 50/50 between the two users
  const [rashi, sam] = s.users
  let balance = 0 // positive = sam owes rashi
  d.tx.filter((t) => t.type === "expense" && t.split).forEach((t) => {
    const half = t.amount / 2
    if (t.person === rashi.id) balance += half
    else balance -= half
  })

  const byCat = useMemo(() => {
    const m: Record<string, number> = {}
    d.tx.filter((t) => t.type === "expense").forEach((t) => { m[t.category] = (m[t.category] || 0) + t.amount })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [d.tx])
  const maxCat = Math.max(1, ...byCat.map((c) => c[1]))

  return (
    <div className="flex flex-col h-full">
      <ViewHeader title="Finance" sub={activeWorld.name}><Btn variant="primary" onClick={() => setAdding(true)}><Icon.plus className="w-4 h-4" /> Add transaction</Btn></ViewHeader>
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Revenue" value={money(revenue)} accent="#2fae6a" />
            <Stat label="Expenses" value={money(expenses)} accent="#e0567a" />
            <Stat label="Net" value={money(revenue - expenses)} accent={activeWorld.accent} />
            <Stat label="Transactions" value={String(d.tx.length)} />
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <SecTitle>Transactions</SecTitle>
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
                {d.tx.map((t) => {
                  const u = s.users.find((x) => x.id === t.person)!
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-8 h-8 grid place-items-center rounded-md shrink-0" style={{ background: t.type === "income" ? "color-mix(in srgb,#2fae6a 15%,transparent)" : "color-mix(in srgb,#e0567a 15%,transparent)" }}>
                        {t.type === "income" ? "↓" : "↑"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium truncate">{t.description}</div>
                        <div className="text-[11px] text-[var(--fg-faint)] mono">{t.category} · {t.date} · {u.name}{t.split ? " · split" : ""}</div>
                      </div>
                      <span className={`mono text-[14px] font-semibold ${t.type === "income" ? "text-[#2fae6a]" : "text-[#e0567a]"}`}>{t.type === "income" ? "+" : "−"}{money(t.amount)}</span>
                    </div>
                  )
                })}
                {d.tx.length === 0 && <Empty label="No transactions yet" />}
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <SecTitle>Split balance</SecTitle>
                <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4">
                  {balance === 0 ? <div className="text-[13px] text-[var(--fg-muted)]">All settled up. 🎉</div> : (
                    <div>
                      <div className="text-[13px] text-[var(--fg-muted)]">{balance > 0 ? sam.name : rashi.name} owes {balance > 0 ? rashi.name : sam.name}</div>
                      <div className="text-2xl font-semibold mono mt-1" style={{ color: activeWorld.accent }}>{money(Math.abs(balance))}</div>
                      <Btn variant="outline" className="mt-3 w-full justify-center" onClick={() => { set((dr) => { dr.transactions = dr.transactions.map((t) => t.worldId === activeWorld.id ? { ...t, split: false } : t) }); log("settled shared balance") }}>Settle up</Btn>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <SecTitle>Expenses by category</SecTitle>
                <div className="space-y-2.5">
                  {byCat.map(([cat, amt]) => (
                    <div key={cat}>
                      <div className="flex justify-between text-[12px] mb-1"><span className="text-[var(--fg-muted)]">{cat}</span><span className="mono">{money(amt)}</span></div>
                      <div className="h-1.5 rounded-full bg-[var(--panel-2)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(amt / maxCat) * 100}%`, background: activeWorld.accent }} /></div>
                    </div>
                  ))}
                  {byCat.length === 0 && <Empty label="No expenses" />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {adding && <TxModal onClose={() => setAdding(false)} />}
    </div>
  )
}

function TxModal({ onClose }: { onClose: () => void }) {
  const { set, activeWorld, s, log } = useStore()
  const [type, setType] = useState<"income" | "expense">("expense")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("General")
  const [person, setPerson] = useState(s.me)
  const [split, setSplit] = useState(false)
  const save = () => {
    if (!amount || !description.trim()) return
    set((d) => { d.transactions.unshift({ id: uid(), worldId: activeWorld.id, type, amount: +amount, date: iso(Date.now()), category, description, person, method: "Card", split: type === "expense" && split }) })
    log(`added a ${money(+amount)} ${type}`)
    onClose()
  }
  return (
    <Modal onClose={onClose}>
      <div className="p-5 space-y-4">
        <h3 className="font-semibold text-lg">Add transaction</h3>
        <div className="flex rounded-md border border-[var(--border)] overflow-hidden w-fit">
          {(["expense", "income"] as const).map((t) => <button key={t} onClick={() => setType(t)} className={`px-4 py-1.5 text-[13px] capitalize ${type === t ? "bg-[var(--hover)]" : "text-[var(--fg-muted)]"}`}>{t}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><input autoFocus type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} placeholder="0" /></Field>
          <Field label="Category"><input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="What was it for?" /></Field>
        <Field label="Paid by"><select value={person} onChange={(e) => setPerson(e.target.value)} className={inputCls}>{s.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        {type === "expense" && <label className="flex items-center gap-2 text-[13px] cursor-pointer"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> Split 50/50 between {s.users[0].name} and {s.users[1].name}</label>}
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save}>Add</Btn></div>
      </div>
    </Modal>
  )
}

// ===========================================================================
// PEOPLE / CRM
// ===========================================================================
const STAGES = ["new", "contacted", "meeting", "proposal", "won", "lost"] as const
export function People() {
  const { activeWorld } = useStore()
  const d = useWorldData()
  const [sel, setSel] = useState<Person | null>(null)
  return (
    <div className="flex flex-col h-full">
      <ViewHeader title="People" sub={`CRM · ${d.people.length} contacts in ${activeWorld.name}`} />
      <div className="flex-1 overflow-auto p-8">
        <div className="flex gap-4 min-w-[1000px]">
          {STAGES.map((stage) => {
            const items = d.people.filter((p) => p.stage === stage)
            return (
              <div key={stage} className="flex-1 min-w-[160px]">
                <div className="mono text-[11px] uppercase tracking-wider text-[var(--fg-faint)] mb-3 capitalize">{stage} · {items.length}</div>
                <div className="space-y-2">
                  {items.map((p) => (
                    <button key={p.id} onClick={() => setSel(p)} className="w-full text-left bg-[var(--panel)] border border-[var(--border)] rounded-lg p-3 hover:border-[var(--border-strong)] transition-colors">
                      <div className="font-medium text-[14px]">{p.name}</div>
                      <div className="text-[12px] text-[var(--fg-muted)]">{p.role}</div>
                      <div className="text-[11px] text-[var(--fg-faint)] mono mt-1">{p.company}</div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {sel && <Modal onClose={() => setSel(null)}><div className="p-6">
        <div className="flex items-center gap-3 mb-4"><Avatar name={sel.name} color={activeWorld.accent} initials={sel.name.split(" ").map((x) => x[0]).join("").slice(0, 2)} size={44} /><div><div className="text-lg font-semibold">{sel.name}</div><div className="text-[13px] text-[var(--fg-muted)]">{sel.role} · {sel.company}</div></div></div>
        <div className="space-y-2 text-[14px]">
          <InfoRow label="Email" value={sel.email} /><InfoRow label="Phone" value={sel.phone} /><InfoRow label="Stage" value={sel.stage} />
          <div className="pt-2"><div className="mono text-[11px] uppercase text-[var(--fg-faint)] mb-1">Notes</div><p className="text-[14px] text-[var(--fg-muted)]">{sel.notes}</p></div>
        </div>
      </div></Modal>}
    </div>
  )
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-[var(--fg-faint)]">{label}</span><span className="capitalize">{value}</span></div>
}

// ===========================================================================
// FILES
// ===========================================================================
export function Files() {
  const { activeWorld, uploadFile, downloadFile } = useStore()
  const d = useWorldData()
  const folders = ["Documents", "Images", "Invoices", "Proposals", "Brand Assets", "Research"]
  const [folder, setFolder] = useState<string | null>(null)
  const list = folder ? d.files.filter((f) => f.folder === folder) : d.files
  const kindIcon = (k: string) => k === "pdf" ? "📄" : k === "image" ? "🖼️" : "📁"

  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    void uploadFile(f, folder || "Documents")
    e.target.value = ""
  }

  return (
    <div className="flex flex-col h-full">
      <ViewHeader title="Files" sub={activeWorld.name}>
        <label className="cursor-pointer"><Btn variant="primary"><Icon.plus className="w-4 h-4" /> Upload</Btn><input type="file" className="hidden" onChange={upload} /></label>
      </ViewHeader>
      <div className="flex-1 overflow-auto p-8">
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setFolder(null)} className={`px-3 py-1.5 rounded-md text-[13px] border ${!folder ? "border-[var(--border-strong)] bg-[var(--hover)]" : "border-[var(--border)] text-[var(--fg-muted)]"}`}>All</button>
          {folders.map((f) => <button key={f} onClick={() => setFolder(f)} className={`px-3 py-1.5 rounded-md text-[13px] border ${folder === f ? "border-[var(--border-strong)] bg-[var(--hover)]" : "border-[var(--border)] text-[var(--fg-muted)]"}`}>{f}</button>)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {list.map((f) => (
            <div key={f.id} onClick={() => void downloadFile(f)} title="Download" className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--border-strong)] transition-colors cursor-pointer">
              <div className="text-3xl mb-3">{kindIcon(f.kind)}</div>
              <div className="text-[13px] font-medium truncate">{f.name}</div>
              <div className="text-[11px] text-[var(--fg-faint)] mono mt-1">{f.size} · {f.folder}</div>
            </div>
          ))}
          {list.length === 0 && <div className="col-span-full bg-[var(--panel)] border border-dashed border-[var(--border-strong)] rounded-xl py-12 text-center text-[13px] text-[var(--fg-faint)]">Drop a file here or click Upload</div>}
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// IDEAS
// ===========================================================================
const IDEA_STAGES: { key: IdeaStatus; label: string }[] = [
  { key: "thought", label: "Random thought" }, { key: "exploring", label: "Exploring" }, { key: "researching", label: "Researching" }, { key: "building", label: "Building" }, { key: "live", label: "Live" }, { key: "killed", label: "Killed" },
]
export function Ideas() {
  const { activeWorld, set, log } = useStore()
  const d = useWorldData()
  const [text, setText] = useState("")
  const add = () => { if (!text.trim()) return; set((dr) => { dr.ideas.unshift({ id: uid(), worldId: activeWorld.id, title: text, note: "", status: "thought", createdAt: Date.now() }) }); log(`captured idea "${text}"`); setText("") }
  return (
    <div className="flex flex-col h-full">
      <ViewHeader title="Idea Vault" sub={activeWorld.name} />
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2 mb-8">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Capture a thought…" className={inputCls} />
            <Btn variant="primary" onClick={add}><Icon.bolt className="w-4 h-4" /> Capture</Btn>
          </div>
          <div className="space-y-3">
            {d.ideas.map((i) => (
              <div key={i.id} className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg">💡</span>
                  <div className="flex-1">
                    <div className="font-medium">{i.title}</div>
                    {i.note && <p className="text-[13px] text-[var(--fg-muted)] mt-1">{i.note}</p>}
                  </div>
                  <select value={i.status} onChange={(e) => set((dr) => { const x = dr.ideas.find((y) => y.id === i.id); if (x) x.status = e.target.value as IdeaStatus })}
                    className="bg-[var(--panel-2)] border border-[var(--border)] rounded-md px-2 py-1 text-[12px] mono">
                    {IDEA_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            ))}
            {d.ideas.length === 0 && <Empty label="No ideas captured yet" />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// ACTIVITY
// ===========================================================================
export function ActivityFeed() {
  const { s } = useStore()
  return (
    <div className="flex flex-col h-full">
      <ViewHeader title="Activity" sub="Everything happening across your workspace" />
      <div className="flex-1 overflow-auto p-8"><div className="max-w-2xl mx-auto"><ActivityList items={s.activity} /></div></div>
    </div>
  )
}

// ===========================================================================
// CALENDAR (simple month grid)
// ===========================================================================
export function Calendar() {
  const { s, activeWorld } = useStore()
  const now = new Date()
  const year = now.getFullYear(), month = now.getMonth()
  const first = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const events = s.tasks.filter((t) => t.due && t.worldId === activeWorld.id)
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  return (
    <div className="flex flex-col h-full">
      <ViewHeader title="Calendar" sub={now.toLocaleDateString(undefined, { month: "long", year: "numeric" })} />
      <div className="flex-1 overflow-auto p-8">
        <div className="grid grid-cols-7 gap-px bg-[var(--border)] border border-[var(--border)] rounded-xl overflow-hidden">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="bg-[var(--panel-2)] py-2 text-center mono text-[11px] uppercase text-[var(--fg-faint)]">{d}</div>)}
          {cells.map((c, i) => {
            const dateStr = c ? iso(new Date(year, month, c).getTime()) : ""
            const evs = events.filter((e) => e.due === dateStr)
            const isToday = c === now.getDate()
            return (
              <div key={i} className="bg-[var(--panel)] min-h-[100px] p-2">
                {c && <div className={`text-[12px] mono mb-1 ${isToday ? "text-[var(--accent)] font-semibold" : "text-[var(--fg-faint)]"}`}>{c}</div>}
                <div className="space-y-1">
                  {evs.map((e) => <div key={e.id} className="text-[11px] px-1.5 py-0.5 rounded truncate" style={{ background: `color-mix(in srgb, ${activeWorld.accent} 16%, transparent)` }}>{e.title}</div>)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// SETTINGS
// ===========================================================================
export function Settings() {
  const { s, set, me, reset } = useStore()
  return (
    <div className="flex flex-col h-full">
      <ViewHeader title="Settings" />
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl space-y-8">
          <section>
            <SecTitle>Appearance</SecTitle>
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 flex items-center justify-between">
              <div><div className="font-medium text-[14px]">Theme</div><div className="text-[12px] text-[var(--fg-muted)]">Switch between light and dark</div></div>
              <div className="flex rounded-md border border-[var(--border)] overflow-hidden">
                {(["light", "dark"] as const).map((t) => <button key={t} onClick={() => set((d) => { d.theme = t })} className={`px-4 py-1.5 text-[13px] capitalize ${s.theme === t ? "bg-[var(--hover)]" : "text-[var(--fg-muted)]"}`}>{t}</button>)}
              </div>
            </div>
          </section>
          <section>
            <SecTitle>Members</SecTitle>
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
              {s.users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar {...u} size={32} />
                  <div className="flex-1"><div className="text-[14px] font-medium">{u.name}{u.id === me.id ? " (you)" : ""}</div><div className="text-[12px] text-[var(--fg-faint)]">{u.email}</div></div>
                  <span className="mono text-[11px] text-[var(--fg-faint)]">{u.id === me.id ? "Owner" : "Editor"}</span>
                </div>
              ))}
            </div>
          </section>
          <section>
            <SecTitle>Data</SecTitle>
            <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 flex items-center justify-between">
              <div><div className="font-medium text-[14px]">Reload workspace</div><div className="text-[12px] text-[var(--fg-muted)]">Re-fetch everything from the server.</div></div>
              <Btn variant="outline" onClick={() => confirm("Reload all data from the server? Unsaved local edits will be discarded.") && reset()}>Reload</Btn>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
