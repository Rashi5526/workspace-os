import React, { useEffect, useMemo, useRef, useState } from "react"
import { useStore, uid, iso } from "./store"
import { Icon, Modal, Avatar, money } from "./ui"

interface Result { id: string; icon: React.ReactNode; label: string; sub?: string; run: () => void; group: string }

export function CommandPalette({ onClose, open }: { onClose: () => void; open: (v: string, id?: string) => void }) {
  const { s, set, activeWorld, log } = useStore()
  const [q, setQ] = useState("")
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo<Result[]>(() => {
    const query = q.toLowerCase().trim()
    const out: Result[] = []

    // Commands (quick create)
    const createPage = () => {
      const id = uid()
      set((d) => { d.pages.unshift({ id, worldId: activeWorld.id, title: query.replace(/^create (page|note|doc(ument)?)/i, "").trim() || "Untitled", icon: "📄", blocks: [{ id: uid(), type: "text", text: "" }], tags: [], createdAt: Date.now(), updatedAt: Date.now(), updatedBy: d.me }); d.recent.unshift(id) })
      log("created a page"); open("page", id); onClose()
    }
    const commands: Result[] = [
      { id: "c-page", icon: <Icon.doc />, label: "Create page", sub: "New blank page in " + activeWorld.name, run: createPage, group: "Create" },
      { id: "c-calc", icon: <Icon.finance />, label: "Create calculator", sub: "New pricing / cost calculator", run: () => { const id = uid(); set((d) => { d.pages.unshift({ id, worldId: activeWorld.id, title: "New Calculator", icon: "🧮", blocks: [{ id: uid(), type: "calculator", calc: [{ id: uid(), label: "Item", value: 0 }], meta: { price: 0 } }], tags: ["finance"], createdAt: Date.now(), updatedAt: Date.now(), updatedBy: d.me }); d.recent.unshift(id) }); open("page", id); onClose() }, group: "Create" },
      { id: "c-task", icon: <Icon.task />, label: "Create task", run: () => { open("tasks"); onClose() }, group: "Create" },
      { id: "c-tx", icon: <Icon.finance />, label: "Add expense", run: () => { open("finance"); onClose() }, group: "Create" },
      { id: "c-idea", icon: <Icon.idea />, label: "Capture idea", run: () => { open("ideas"); onClose() }, group: "Create" },
      { id: "c-ai", icon: <Icon.ai />, label: "Ask AI", run: () => { open("ai"); onClose() }, group: "Create" },
    ]

    // Navigation
    const nav: Result[] = [
      { id: "n-home", icon: <Icon.home />, label: "Go to Home", run: () => { open("home"); onClose() }, group: "Navigate" },
      { id: "n-tasks", icon: <Icon.task />, label: "Go to Tasks", run: () => { open("tasks"); onClose() }, group: "Navigate" },
      { id: "n-finance", icon: <Icon.finance />, label: "Go to Finance", run: () => { open("finance"); onClose() }, group: "Navigate" },
      { id: "n-files", icon: <Icon.files />, label: "Go to Files", run: () => { open("files"); onClose() }, group: "Navigate" },
      { id: "n-people", icon: <Icon.people />, label: "Go to People", run: () => { open("people"); onClose() }, group: "Navigate" },
    ]

    // Worlds
    s.worlds.filter((w) => !w.archived).forEach((w) => out.push({
      id: "w-" + w.id, icon: <span>{w.icon}</span>, label: `Switch to ${w.name}`, sub: "World", group: "Worlds",
      run: () => { set((d) => { d.activeWorld = w.id }); open("world"); onClose() },
    }))

    // Search content
    s.pages.forEach((p) => out.push({ id: "p-" + p.id, icon: <span>{p.icon}</span>, label: p.title, sub: "Page · " + (s.worlds.find((w) => w.id === p.worldId)?.name), group: "Pages", run: () => { set((d) => { d.activeWorld = p.worldId; d.recent = [p.id, ...d.recent.filter((x) => x !== p.id)] }); open("page", p.id); onClose() } }))
    s.tasks.forEach((t) => out.push({ id: "t-" + t.id, icon: <Icon.task />, label: t.title, sub: "Task · " + t.status, group: "Tasks", run: () => { set((d) => { d.activeWorld = t.worldId }); open("tasks"); onClose() } }))
    s.people.forEach((pe) => out.push({ id: "pe-" + pe.id, icon: <Icon.people />, label: pe.name, sub: "Person · " + pe.company, group: "People", run: () => { set((d) => { d.activeWorld = pe.worldId }); open("people"); onClose() } }))
    s.transactions.forEach((tx) => out.push({ id: "tx-" + tx.id, icon: <Icon.finance />, label: tx.description, sub: `${tx.category} · ${money(tx.amount)}`, group: "Finance", run: () => { set((d) => { d.activeWorld = tx.worldId }); open("finance"); onClose() } }))

    const all = [...commands, ...nav, ...out]
    if (!query) return all.filter((r) => r.group === "Create" || r.group === "Navigate" || r.group === "Worlds")
    return all.filter((r) => r.label.toLowerCase().includes(query) || r.sub?.toLowerCase().includes(query)).slice(0, 40)
  }, [q, s, activeWorld])

  useEffect(() => { setSel(0) }, [q])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, results.length - 1)) }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)) }
      if (e.key === "Enter") { e.preventDefault(); results[sel]?.run() }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [results, sel])

  let lastGroup = ""
  return (
    <Modal onClose={onClose}>
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)]">
        <Icon.search className="w-4 h-4 text-[var(--fg-faint)]" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or type a command…" className="flex-1 bg-transparent text-[15px] focus:outline-none placeholder:text-[var(--fg-faint)]" />
        <kbd className="mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--panel-2)] border border-[var(--border)] text-[var(--fg-faint)]">ESC</kbd>
      </div>
      <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
        {results.length === 0 && <div className="px-3 py-8 text-center text-[13px] text-[var(--fg-faint)]">No results for "{q}"</div>}
        {results.map((r, i) => {
          const showGroup = r.group !== lastGroup
          lastGroup = r.group
          return (
            <React.Fragment key={r.id}>
              {showGroup && <div className="mono text-[10px] uppercase tracking-widest text-[var(--fg-faint)] px-3 pt-3 pb-1">{r.group}</div>}
              <button onMouseEnter={() => setSel(i)} onClick={r.run} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left ${i === sel ? "bg-[var(--hover)]" : ""}`}>
                <span className="w-5 h-5 grid place-items-center text-[var(--fg-muted)]">{r.icon}</span>
                <span className="flex-1 text-[14px] truncate">{r.label}</span>
                {r.sub && <span className="mono text-[11px] text-[var(--fg-faint)] truncate max-w-[45%]">{r.sub}</span>}
              </button>
            </React.Fragment>
          )
        })}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// AI assistant — answers from workspace data (local, deterministic)
// ---------------------------------------------------------------------------
export function AIAssistant() {
  const { s, activeWorld } = useStore()
  const [msgs, setMsgs] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: `Hi — I'm your workspace assistant. Ask me about ${activeWorld.name}: finances, tasks, ideas, or people. Try "what did we spend on packaging?"` },
  ])
  const [q, setQ] = useState("")

  const answer = (query: string): string => {
    const ql = query.toLowerCase()
    const tx = s.transactions.filter((t) => t.worldId === activeWorld.id)
    if (/(spend|spent|cost|expense).*(packaging|ingredient|rent|venue|food|\w+)/.test(ql) || /packaging|ingredient/.test(ql)) {
      const cat = ["packaging", "ingredients", "rent", "venue", "food", "subscriptions", "sales"].find((c) => ql.includes(c))
      if (cat) { const total = tx.filter((t) => t.type === "expense" && t.category.toLowerCase() === cat).reduce((a, b) => a + b.amount, 0); return `You've spent ${money(total)} on ${cat} in ${activeWorld.name}.` }
    }
    if (/spent|expense/.test(ql)) { const total = tx.filter((t) => t.type === "expense").reduce((a, b) => a + b.amount, 0); return `Total expenses in ${activeWorld.name}: ${money(total)}.` }
    if (/revenue|income|earn|made/.test(ql)) { const total = tx.filter((t) => t.type === "income").reduce((a, b) => a + b.amount, 0); return `Total revenue in ${activeWorld.name}: ${money(total)}.` }
    if (/profit|margin/.test(ql)) { const r = tx.filter((t) => t.type === "income").reduce((a, b) => a + b.amount, 0); const e = tx.filter((t) => t.type === "expense").reduce((a, b) => a + b.amount, 0); return `Profit for ${activeWorld.name}: ${money(r - e)} (${r ? (((r - e) / r) * 100).toFixed(1) : 0}% margin).` }
    if (/task|todo|unfinished|pending|do/.test(ql)) { const open = s.tasks.filter((t) => t.worldId === activeWorld.id && t.status !== "done"); return open.length ? `${open.length} open tasks in ${activeWorld.name}:\n` + open.map((t) => `• ${t.title} (${t.priority})`).join("\n") : "All tasks are done here. 🎉" }
    if (/idea/.test(ql)) { const ideas = s.ideas.filter((i) => i.worldId === activeWorld.id); return `${ideas.length} ideas:\n` + ideas.map((i) => `• ${i.title} — ${i.status}`).join("\n") }
    if (/who|people|contact|client|lead/.test(ql)) { const p = s.people.filter((x) => x.worldId === activeWorld.id); return `${p.length} contacts:\n` + p.map((x) => `• ${x.name} (${x.company}) — ${x.stage}`).join("\n") }
    if (/summar/.test(ql)) { const t = s.tasks.filter((x) => x.worldId === activeWorld.id); const r = tx.filter((x) => x.type === "income").reduce((a, b) => a + b.amount, 0); const e = tx.filter((x) => x.type === "expense").reduce((a, b) => a + b.amount, 0); return `${activeWorld.name} summary:\n• Revenue ${money(r)}, expenses ${money(e)}, profit ${money(r - e)}\n• ${t.filter((x) => x.status !== "done").length} open tasks\n• ${s.pages.filter((p) => p.worldId === activeWorld.id).length} pages, ${s.people.filter((p) => p.worldId === activeWorld.id).length} contacts` }
    return `I can answer questions about ${activeWorld.name}'s finances, tasks, ideas and people. Try "summarize this world" or "which tasks are pending?"`
  }

  const send = () => { if (!q.trim()) return; const query = q; setMsgs((m) => [...m, { role: "user", text: query }, { role: "ai", text: answer(query) }]); setQ("") }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-8 pt-8 pb-5 border-b border-[var(--border)]">
        <span style={{ color: activeWorld.accent }}><Icon.ai className="w-5 h-5" /></span>
        <h1 className="text-2xl font-semibold tracking-tight">AI Assistant</h1>
      </div>
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl mx-auto space-y-4">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] whitespace-pre-wrap ${m.role === "user" ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "bg-[var(--panel)] border border-[var(--border)]"}`}>{m.text}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="p-6 border-t border-[var(--border)]">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask about your workspace…" className="flex-1 bg-[var(--panel-2)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[14px] focus:border-[var(--accent)] focus:outline-none" />
          <button onClick={send} className="grid place-items-center w-11 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]"><Icon.chevron className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  )
}
