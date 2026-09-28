import React, { useEffect, useState } from "react"
import { useStore, uid } from "./store"
import { Icon, IconBtn, Avatar, Btn, Modal, Field, inputCls, StatusDot } from "./ui"
import { Home, WorldView, Tasks, Finance, People, Files, Ideas, ActivityFeed, Calendar, Settings } from "./views"
import { PageEditor } from "./blocks"
import { CommandPalette, AIAssistant } from "./CommandPalette"

type View =
  | "home" | "world" | "page" | "tasks" | "finance" | "people" | "files"
  | "ideas" | "activity" | "calendar" | "settings" | "ai" | "search"

const ACCENTS = ["#4b5bff", "#2fae6a", "#e0567a", "#f0a020", "#7c5cff", "#20b8c0", "#e07a20"]
const WORLD_ICONS = ["🏠", "🐝", "🥑", "◆", "🧪", "🚀", "💼", "🎨", "📚", "⚡", "🌱", "🔮"]

function Shell() {
  const { s, set, me, activeWorld, saving, saveStatus, saveError, retrySave, signOut, log } = useStore()
  const [view, setView] = useState<View>("home")
  const [pageId, setPageId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [cmd, setCmd] = useState(false)
  const [newWorld, setNewWorld] = useState(false)
  const [notif, setNotif] = useState(false)

  const open = (v: string, id?: string) => {
    setView(v as View)
    if (v === "page" && id) { setPageId(id); set((d) => { d.recent = [id, ...d.recent.filter((x) => x !== id)].slice(0, 12) }) }
  }

  // Global keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === "k") { e.preventDefault(); setCmd((c) => !c) }
      if (mod && e.key === "j") { e.preventDefault(); set((d) => { d.theme = d.theme === "dark" ? "light" : "dark" }) }
      if (mod && /^[1-5]$/.test(e.key)) { e.preventDefault(); const w = s.worlds.filter((x) => !x.archived)[+e.key - 1]; if (w) { set((d) => { d.activeWorld = w.id }); open("world") } }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [s.worlds])

  const page = pageId ? s.pages.find((p) => p.id === pageId) : null
  const worldPages = s.pages.filter((p) => p.worldId === activeWorld.id && !p.archived)
  const pinned = s.pages.filter((p) => p.pinned && !p.archived)
  const recent = s.recent.map((id) => s.pages.find((p) => p.id === id)).filter(Boolean).slice(0, 5) as any[]

  const TOOLS: { v: View; label: string; icon: React.FC<any> }[] = [
    { v: "tasks", label: "Tasks", icon: Icon.task },
    { v: "finance", label: "Finance", icon: Icon.finance },
    { v: "calendar", label: "Calendar", icon: Icon.calendar },
    { v: "files", label: "Files", icon: Icon.files },
    { v: "people", label: "People", icon: Icon.people },
    { v: "ideas", label: "Ideas", icon: Icon.idea },
    { v: "activity", label: "Activity", icon: Icon.analytics },
    { v: "ai", label: "AI", icon: Icon.ai },
  ]

  return (
    <div className="flex h-screen overflow-hidden text-[var(--fg)]" style={{ ["--accent" as any]: activeWorld.accent }}>
      {/* Sidebar */}
      <aside className={`${collapsed ? "w-[60px]" : "w-[248px]"} shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--panel)] transition-[width] duration-200`}>
        {/* World switcher */}
        <div className="p-3 border-b border-[var(--border)]">
          <WorldSwitcher collapsed={collapsed} onNew={() => setNewWorld(true)} onOpen={() => open("world")} />
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-4">
          <div className="space-y-0.5">
            <NavItem icon={Icon.home} label="Home" active={view === "home"} collapsed={collapsed} onClick={() => open("home")} />
            <NavItem icon={Icon.search} label="Search" collapsed={collapsed} onClick={() => setCmd(true)} kbd="⌘K" />
            <NavItem icon={Icon.grid} label={activeWorld.name} active={view === "world"} collapsed={collapsed} onClick={() => open("world")} />
          </div>

          {!collapsed && (
            <>
              <Section label="Pages" action={() => { const id = uid(); set((d) => { d.pages.unshift({ id, worldId: activeWorld.id, title: "Untitled", icon: "📄", blocks: [{ id: uid(), type: "text", text: "" }], tags: [], createdAt: Date.now(), updatedAt: Date.now(), updatedBy: d.me }); d.recent.unshift(id) }); log("created a page"); open("page", id) }}>
                {worldPages.map((p) => (
                  <button key={p.id} onClick={() => open("page", p.id)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-left transition-colors ${view === "page" && pageId === p.id ? "bg-[var(--hover)] text-[var(--fg)]" : "text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"}`}>
                    <span className="text-[13px]">{p.icon}</span><span className="truncate flex-1">{p.title}</span>{p.pinned && <Icon.pin className="w-3 h-3 opacity-50" />}
                  </button>
                ))}
              </Section>

              {pinned.length > 0 && <Section label="Pinned">
                {pinned.map((p) => <button key={p.id} onClick={() => { set((d) => { d.activeWorld = p.worldId }); open("page", p.id) }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-left text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"><span>{p.icon}</span><span className="truncate">{p.title}</span></button>)}
              </Section>}

              <Section label="Tools">
                {TOOLS.map((t) => <NavItem key={t.v} icon={t.icon} label={t.label} active={view === t.v} collapsed={false} onClick={() => open(t.v)} />)}
              </Section>

              {recent.length > 0 && <Section label="Recent">
                {recent.map((p) => <button key={p.id} onClick={() => { set((d) => { d.activeWorld = p.worldId }); open("page", p.id) }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-left text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"><Icon.clock className="w-3.5 h-3.5 opacity-50" /><span className="truncate">{p.title}</span></button>)}
              </Section>}
            </>
          )}
          {collapsed && <div className="space-y-0.5">{TOOLS.map((t) => <NavItem key={t.v} icon={t.icon} label={t.label} active={view === t.v} collapsed onClick={() => open(t.v)} />)}</div>}
        </div>

        <div className="p-2 border-t border-[var(--border)] space-y-0.5">
          <NavItem icon={Icon.settings} label="Settings" active={view === "settings"} collapsed={collapsed} onClick={() => open("settings")} />
          <button onClick={() => setCollapsed((c) => !c)} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] text-[var(--fg-muted)] hover:bg-[var(--hover)]"><Icon.collapse className="w-4 h-4" />{!collapsed && "Collapse"}</button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-[var(--border)] bg-[var(--panel)]">
          <div className="flex items-center gap-1.5 text-[13px] text-[var(--fg-muted)] min-w-0">
            <StatusDot color={activeWorld.accent} />
            <button onClick={() => open("world")} className="hover:text-[var(--fg)]">{activeWorld.name}</button>
            {view === "page" && page && <><Icon.chevron className="w-3.5 h-3.5 opacity-40" /><span className="text-[var(--fg)] truncate">{page.title}</span></>}
            {view !== "page" && view !== "world" && view !== "home" && <><Icon.chevron className="w-3.5 h-3.5 opacity-40" /><span className="text-[var(--fg)] capitalize">{view}</span></>}
          </div>
          <div className="flex-1" />
          <button onClick={() => setCmd(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] text-[13px] text-[var(--fg-faint)] hover:border-[var(--border-strong)] transition-colors">
            <Icon.search className="w-3.5 h-3.5" /> Search… <kbd className="mono text-[10px]">⌘K</kbd>
          </button>
          <span className="mono text-[11px] text-[var(--fg-faint)] flex items-center gap-1.5 w-20">{saveStatus === "error" ? <button onClick={retrySave} title={`${saveError ?? "Save failed"} — click to retry`} className="flex items-center gap-1.5 text-[#e0567a]"><span className="w-1.5 h-1.5 rounded-full bg-[#e0567a]" />Error</button> : saving ? <><span className="w-1.5 h-1.5 rounded-full bg-[var(--fg-faint)] animate-pulse" />Saving...</> : <><Icon.check className="w-3.5 h-3.5 text-[#2fae6a]" />Saved</>}</span>
          <IconBtn title="Notifications" onClick={() => setNotif((n) => !n)}><Icon.bell /></IconBtn>
          <IconBtn title="Toggle theme" onClick={() => set((d) => { d.theme = d.theme === "dark" ? "light" : "dark" })}>{s.theme === "dark" ? <Icon.sun /> : <Icon.moon />}</IconBtn>
          <button onClick={signOut} title={`Signed in as ${me.name} — click to sign out`}><Avatar {...me} size={28} /></button>
        </header>

        {notif && <NotifPanel onClose={() => setNotif(false)} />}

        {/* View */}
        <main className="flex-1 overflow-hidden bg-[var(--bg)]">
          <div key={view + (pageId || "")} className="h-full animate-fade-up">
            {view === "home" && <Home open={open} />}
            {view === "world" && <WorldView open={open} />}
            {view === "page" && page && <div className="h-full overflow-y-auto"><PageEditor page={page} /></div>}
            {view === "page" && !page && <div className="h-full grid place-items-center text-[var(--fg-faint)]">Page not found</div>}
            {view === "tasks" && <Tasks />}
            {view === "finance" && <Finance />}
            {view === "people" && <People />}
            {view === "files" && <Files />}
            {view === "ideas" && <Ideas />}
            {view === "activity" && <ActivityFeed />}
            {view === "calendar" && <Calendar />}
            {view === "ai" && <AIAssistant />}
            {view === "settings" && <Settings />}
          </div>
        </main>
      </div>

      {cmd && <CommandPalette onClose={() => setCmd(false)} open={open} />}
      {newWorld && <NewWorldModal onClose={() => setNewWorld(false)} onCreate={() => open("world")} />}
    </div>
  )
}

function Section({ label, children, action }: { label: string; children: React.ReactNode; action?: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between px-2 mb-1">
        <span className="mono text-[10px] uppercase tracking-widest text-[var(--fg-faint)]">{label}</span>
        {action && <button onClick={action} className="text-[var(--fg-faint)] hover:text-[var(--fg)]"><Icon.plus className="w-3.5 h-3.5" /></button>}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function NavItem({ icon: I, label, active, collapsed, onClick, kbd }: { icon: React.FC<any>; label: string; active?: boolean; collapsed: boolean; onClick: () => void; kbd?: string }) {
  return (
    <button onClick={onClick} title={collapsed ? label : undefined} className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors ${active ? "bg-[var(--hover)] text-[var(--fg)] font-medium" : "text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"} ${collapsed ? "justify-center" : ""}`}>
      <I className="w-4 h-4 shrink-0" />
      {!collapsed && <><span className="flex-1 text-left truncate">{label}</span>{kbd && <kbd className="mono text-[10px] text-[var(--fg-faint)]">{kbd}</kbd>}</>}
    </button>
  )
}

function WorldSwitcher({ collapsed, onNew, onOpen }: { collapsed: boolean; onNew: () => void; onOpen: () => void }) {
  const { s, set, activeWorld } = useStore()
  const [open, setOpen] = useState(false)
  const worlds = s.worlds.filter((w) => !w.archived)
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-[var(--hover)] transition-colors">
        <span className="w-8 h-8 grid place-items-center rounded-md text-[16px] shrink-0" style={{ background: `color-mix(in srgb, ${activeWorld.accent} 18%, transparent)` }}>{activeWorld.icon}</span>
        {!collapsed && <><div className="flex-1 min-w-0 text-left"><div className="text-[14px] font-semibold truncate">{activeWorld.name}</div><div className="text-[11px] text-[var(--fg-faint)] capitalize">{activeWorld.access}</div></div><Icon.chevronDown className="w-4 h-4 text-[var(--fg-faint)]" /></>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 left-0 right-0 mt-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-[var(--shadow-lg)] p-1.5 animate-pop min-w-[220px]">
            <div className="mono text-[10px] uppercase tracking-widest text-[var(--fg-faint)] px-2 py-1">Worlds</div>
            {worlds.map((w, i) => (
              <button key={w.id} onClick={() => { set((d) => { d.activeWorld = w.id }); setOpen(false); onOpen() }} className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left hover:bg-[var(--hover)] ${w.id === activeWorld.id ? "bg-[var(--hover)]" : ""}`}>
                <span className="w-6 h-6 grid place-items-center rounded text-[13px]" style={{ background: `color-mix(in srgb, ${w.accent} 18%, transparent)` }}>{w.icon}</span>
                <span className="flex-1 text-[13px] font-medium truncate">{w.name}</span>
                {w.access === "shared" && <span className="mono text-[10px] text-[var(--fg-faint)]">shared</span>}
                <kbd className="mono text-[10px] text-[var(--fg-faint)]">⌘{i + 1}</kbd>
              </button>
            ))}
            <div className="h-px bg-[var(--border)] my-1" />
            <button onClick={() => { setOpen(false); onNew() }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"><Icon.plus className="w-4 h-4" /> New world</button>
          </div>
        </>
      )}
    </div>
  )
}

function NewWorldModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const { set, log } = useStore()
  const [name, setName] = useState("")
  const [icon, setIcon] = useState(WORLD_ICONS[5])
  const [accent, setAccent] = useState(ACCENTS[0])
  const [access, setAccess] = useState<"private" | "shared">("private")
  const create = () => {
    if (!name.trim()) return
    const id = uid()
    set((d) => { d.worlds.push({ id, name, icon, accent, description: "", access }); d.activeWorld = id })
    log(`created world "${name}"`, id)
    onClose(); onCreate()
  }
  return (
    <Modal onClose={onClose}>
      <div className="p-5 space-y-4">
        <h3 className="font-semibold text-lg">Create a world</h3>
        <div className="flex gap-3">
          <span className="w-12 h-12 grid place-items-center rounded-lg text-2xl shrink-0" style={{ background: `color-mix(in srgb, ${accent} 18%, transparent)` }}>{icon}</span>
          <div className="flex-1"><Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} className={inputCls} placeholder="e.g. Startup Ideas" /></Field></div>
        </div>
        <Field label="Icon"><div className="flex flex-wrap gap-1.5">{WORLD_ICONS.map((i) => <button key={i} onClick={() => setIcon(i)} className={`w-8 h-8 grid place-items-center rounded-md text-[16px] ${icon === i ? "bg-[var(--hover)] ring-1 ring-[var(--border-strong)]" : "hover:bg-[var(--hover)]"}`}>{i}</button>)}</div></Field>
        <Field label="Accent"><div className="flex gap-2">{ACCENTS.map((c) => <button key={c} onClick={() => setAccent(c)} className="w-7 h-7 rounded-full transition-transform hover:scale-110" style={{ background: c, outline: accent === c ? `2px solid ${c}` : "none", outlineOffset: 2 }} />)}</div></Field>
        <Field label="Access"><div className="flex rounded-md border border-[var(--border)] overflow-hidden w-fit">{(["private", "shared"] as const).map((a) => <button key={a} onClick={() => setAccess(a)} className={`px-4 py-1.5 text-[13px] capitalize ${access === a ? "bg-[var(--hover)]" : "text-[var(--fg-muted)]"}`}>{a}</button>)}</div></Field>
        <div className="flex justify-end gap-2 pt-1"><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={create}>Create world</Btn></div>
      </div>
    </Modal>
  )
}

function NotifPanel({ onClose }: { onClose: () => void }) {
  const { s } = useStore()
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute z-40 right-4 top-12 w-80 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-[var(--shadow-lg)] animate-pop overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] font-semibold text-[14px]">Notifications</div>
        <div className="max-h-96 overflow-y-auto divide-y divide-[var(--border)]">
          {s.activity.slice(0, 10).map((a) => {
            const u = s.users.find((x) => x.id === a.who)!
            const w = s.worlds.find((x) => x.id === a.worldId)
            return (
              <div key={a.id} className="flex gap-2.5 px-4 py-3">
                <Avatar {...u} size={24} />
                <div className="text-[13px] leading-snug"><span className="font-medium">{u.name}</span> <span className="text-[var(--fg-muted)]">{a.text}</span>{w && <div className="text-[11px] text-[var(--fg-faint)] mono mt-0.5">{w.name}</div>}</div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// StoreProvider (backend-backed) is mounted in main.tsx, inside the auth gate.
export default function App() {
  return <Shell />
}
