import React, { useState } from "react"
import { Block, BlockType, CalcLine, Page, useStore, uid } from "./store"
import { Icon, Btn, money } from "./ui"

// ---------------------------------------------------------------------------
// Calculator block — persistent, reactive
// ---------------------------------------------------------------------------
export function Calculator({ calc, price, onChange, accent }: {
  calc: CalcLine[]; price: number; onChange: (calc: CalcLine[], price: number) => void; accent: string
}) {
  const total = calc.reduce((s, l) => s + (l.value || 0), 0)
  const profit = price - total
  const margin = price > 0 ? (profit / price) * 100 : 0

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--panel-2)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <span style={{ color: accent }}><Icon.bolt className="w-3.5 h-3.5" /></span>
        <span className="mono text-[11px] uppercase tracking-wider text-[var(--fg-faint)]">Cost Calculator</span>
      </div>
      <div className="p-1">
        {calc.map((l, i) => (
          <div key={l.id} className="group flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--hover)]">
            <input value={l.label} onChange={(e) => { const c = [...calc]; c[i] = { ...l, label: e.target.value }; onChange(c, price) }}
              className="flex-1 bg-transparent text-[14px] py-1 focus:outline-none" placeholder="Item" />
            <span className="text-[var(--fg-faint)]">₹</span>
            <input type="number" value={l.value} onChange={(e) => { const c = [...calc]; c[i] = { ...l, value: +e.target.value }; onChange(c, price) }}
              className="w-24 bg-transparent text-[14px] text-right mono py-1 focus:outline-none" />
            <button onClick={() => onChange(calc.filter((x) => x.id !== l.id), price)} className="opacity-0 group-hover:opacity-100 text-[var(--fg-faint)] hover:text-[var(--fg)]"><Icon.x className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <button onClick={() => onChange([...calc, { id: uid(), label: "", value: 0 }], price)} className="flex items-center gap-1.5 px-2 py-1.5 text-[13px] text-[var(--fg-faint)] hover:text-[var(--fg)]"><Icon.plus className="w-3.5 h-3.5" /> Add line</button>
      </div>
      <div className="border-t border-[var(--border)] px-4 py-3 space-y-2 bg-[var(--panel)]">
        <Row label="Total cost" value={money(total)} />
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-[var(--fg-muted)]">Selling price</span>
          <div className="flex items-center gap-1">
            <span className="text-[var(--fg-faint)]">₹</span>
            <input type="number" value={price} onChange={(e) => onChange(calc, +e.target.value)} className="w-24 bg-transparent text-[14px] text-right mono font-semibold focus:outline-none" />
          </div>
        </div>
        <div className="h-px bg-[var(--border)]" />
        <Row label="Profit" value={money(profit)} strong color={profit >= 0 ? "#2fae6a" : "#e0567a"} />
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-[var(--fg-muted)]">Margin</span>
          <span className="mono text-[13px] font-semibold" style={{ color: accent }}>{margin.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-[var(--fg-muted)]">{label}</span>
      <span className={`mono text-[13px] ${strong ? "font-semibold" : ""}`} style={color ? { color } : undefined}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Block renderer
// ---------------------------------------------------------------------------
function BlockView({ block, accent, onChange, onDelete }: { block: Block; accent: string; onChange: (b: Block) => void; onDelete: () => void }) {
  const [hover, setHover] = useState(false)

  const content = () => {
    switch (block.type) {
      case "heading":
        return <input value={block.text || ""} onChange={(e) => onChange({ ...block, text: e.target.value })} placeholder="Heading" className="w-full bg-transparent text-2xl font-semibold tracking-tight focus:outline-none placeholder:text-[var(--fg-faint)]" />
      case "text":
        return <TextArea value={block.text || ""} onChange={(v) => onChange({ ...block, text: v })} placeholder="Write something, or press / for blocks…" className="text-[15px] leading-relaxed text-[var(--fg)]" />
      case "quote":
        return <div className="border-l-2 pl-4" style={{ borderColor: accent }}><TextArea value={block.text || ""} onChange={(v) => onChange({ ...block, text: v })} placeholder="Quote" className="text-[15px] italic text-[var(--fg-muted)]" /></div>
      case "callout":
        return <div className="flex gap-3 rounded-lg p-3.5" style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 24%, transparent)` }}>
          <span>💡</span><TextArea value={block.text || ""} onChange={(v) => onChange({ ...block, text: v })} placeholder="Callout" className="text-[14px] flex-1" /></div>
      case "divider":
        return <div className="h-px bg-[var(--border)] my-2" />
      case "checklist":
        return <div className="space-y-1">
          {(block.items || []).map((it) => (
            <div key={it.id} className="group/i flex items-center gap-2.5">
              <button onClick={() => onChange({ ...block, items: block.items!.map((x) => x.id === it.id ? { ...x, done: !x.done } : x) })}
                className="w-4 h-4 rounded border grid place-items-center shrink-0 transition-colors" style={it.done ? { background: accent, borderColor: accent } : { borderColor: "var(--border-strong)" }}>
                {it.done && <Icon.check className="w-3 h-3 text-white" />}
              </button>
              <input value={it.text} onChange={(e) => onChange({ ...block, items: block.items!.map((x) => x.id === it.id ? { ...x, text: e.target.value } : x) })}
                className={`flex-1 bg-transparent text-[14px] py-0.5 focus:outline-none ${it.done ? "line-through text-[var(--fg-faint)]" : ""}`} />
            </div>
          ))}
          <button onClick={() => onChange({ ...block, items: [...(block.items || []), { id: uid(), text: "", done: false }] })} className="flex items-center gap-1.5 text-[13px] text-[var(--fg-faint)] hover:text-[var(--fg)] pt-1"><Icon.plus className="w-3.5 h-3.5" /> Add item</button>
        </div>
      case "table":
        return <TableBlock rows={block.rows || [["", ""]]} onChange={(rows) => onChange({ ...block, rows })} />
      case "calculator":
        return <Calculator calc={block.calc || []} price={block.meta?.price || 0} accent={accent} onChange={(calc, price) => onChange({ ...block, calc, meta: { ...block.meta, price } })} />
      case "kanban":
        return <KanbanBlock block={block} accent={accent} onChange={onChange} />
    }
  }

  return (
    <div className="group relative -mx-8 px-8" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className={`absolute left-1 top-0.5 flex gap-0.5 transition-opacity ${hover ? "opacity-100" : "opacity-0"}`}>
        <button onClick={onDelete} className="p-1 rounded text-[var(--fg-faint)] hover:text-[#e0567a] hover:bg-[var(--hover)]"><Icon.trash className="w-3.5 h-3.5" /></button>
      </div>
      <div className="py-1">{content()}</div>
    </div>
  )
}

function TextArea({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <textarea value={value} onChange={(e) => { onChange(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px" }}
      placeholder={placeholder} rows={1} ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px" } }}
      className={`w-full bg-transparent resize-none focus:outline-none placeholder:text-[var(--fg-faint)] ${className}`} />
  )
}

function TableBlock({ rows, onChange }: { rows: string[][]; onChange: (r: string[][]) => void }) {
  const set = (r: number, c: number, v: string) => { const n = rows.map((x) => [...x]); n[r][c] = v; onChange(n) }
  return (
    <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
      <table className="w-full text-[14px]">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className={r === 0 ? "bg-[var(--panel-2)]" : ""}>
              {row.map((cell, c) => (
                <td key={c} className="border border-[var(--border)] p-0">
                  <input value={cell} onChange={(e) => set(r, c, e.target.value)} className={`w-full bg-transparent px-3 py-2 focus:outline-none focus:bg-[var(--hover)] ${r === 0 ? "font-medium" : ""}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2 p-2 border-t border-[var(--border)]">
        <button onClick={() => onChange([...rows, rows[0].map(() => "")])} className="text-[12px] text-[var(--fg-faint)] hover:text-[var(--fg)]">+ Row</button>
        <button onClick={() => onChange(rows.map((r) => [...r, ""]))} className="text-[12px] text-[var(--fg-faint)] hover:text-[var(--fg)]">+ Column</button>
      </div>
    </div>
  )
}

function KanbanBlock({ block, accent, onChange }: { block: Block; accent: string; onChange: (b: Block) => void }) {
  const cols: Record<string, string[]> = block.meta?.cols || {}
  const add = (col: string) => {
    const text = prompt("Card text")
    if (!text) return
    onChange({ ...block, meta: { ...block.meta, cols: { ...cols, [col]: [...cols[col], text] } } })
  }
  return (
    <div className="grid grid-cols-3 gap-3">
      {Object.entries(cols).map(([col, cards]) => (
        <div key={col} className="bg-[var(--panel-2)] border border-[var(--border)] rounded-lg p-2">
          <div className="mono text-[11px] uppercase tracking-wider text-[var(--fg-faint)] px-1 pb-2">{col} · {cards.length}</div>
          <div className="space-y-1.5">
            {cards.map((c, i) => <div key={i} className="bg-[var(--panel)] border border-[var(--border)] rounded-md px-2.5 py-2 text-[13px]">{c}</div>)}
          </div>
          <button onClick={() => add(col)} className="w-full mt-1.5 text-left px-2 py-1 text-[12px] text-[var(--fg-faint)] hover:text-[var(--fg)]">+ Add</button>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Block insert menu
// ---------------------------------------------------------------------------
const BLOCK_OPTS: { type: BlockType; label: string; icon: string }[] = [
  { type: "text", label: "Text", icon: "¶" },
  { type: "heading", label: "Heading", icon: "H" },
  { type: "checklist", label: "Checklist", icon: "☑" },
  { type: "table", label: "Table", icon: "▦" },
  { type: "calculator", label: "Calculator", icon: "🧮" },
  { type: "callout", label: "Callout", icon: "💡" },
  { type: "quote", label: "Quote", icon: "❝" },
  { type: "kanban", label: "Kanban", icon: "▤" },
  { type: "divider", label: "Divider", icon: "―" },
]

function newBlock(type: BlockType): Block {
  const b: Block = { id: uid(), type }
  if (type === "checklist") b.items = [{ id: uid(), text: "", done: false }]
  if (type === "table") b.rows = [["Column", "Column"], ["", ""]]
  if (type === "calculator") { b.calc = [{ id: uid(), label: "Item", value: 0 }]; b.meta = { price: 0 } }
  if (type === "kanban") b.meta = { cols: { "To do": [], "Doing": [], "Done": [] } }
  return b
}

// ---------------------------------------------------------------------------
// Page editor
// ---------------------------------------------------------------------------
export function PageEditor({ page }: { page: Page }) {
  const { set, activeWorld, log, s } = useStore()
  const [menu, setMenu] = useState(false)
  const accent = activeWorld.accent

  const update = (fn: (p: Page) => void) => set((d) => {
    const p = d.pages.find((x) => x.id === page.id)
    if (p) { fn(p); p.updatedAt = Date.now(); p.updatedBy = d.me }
  })

  const updateBlock = (b: Block) => update((p) => { const i = p.blocks.findIndex((x) => x.id === b.id); if (i >= 0) p.blocks[i] = b })
  const deleteBlock = (id: string) => update((p) => { p.blocks = p.blocks.filter((x) => x.id !== id) })
  const addBlock = (type: BlockType) => { update((p) => { p.blocks.push(newBlock(type)) }); setMenu(false); log(`edited ${page.title}`) }

  const editor = s.users.find((u) => u.id === page.updatedBy)

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="flex items-center gap-3 mb-1">
        <button className="text-3xl leading-none" onClick={() => { const e = prompt("Icon (emoji)", page.icon); if (e) update((p) => { p.icon = e }) }}>{page.icon}</button>
      </div>
      <input value={page.title} onChange={(e) => update((p) => { p.title = e.target.value })} placeholder="Untitled"
        className="w-full bg-transparent text-4xl font-bold tracking-tight py-2 focus:outline-none placeholder:text-[var(--fg-faint)]" />
      <div className="flex items-center gap-3 text-[12px] text-[var(--fg-faint)] mb-8 mono">
        <span>Edited by {editor?.name} · {new Date(page.updatedAt).toLocaleDateString()}</span>
        {page.tags.map((t) => <span key={t} className="text-[var(--fg-muted)]">#{t}</span>)}
      </div>

      <div className="space-y-1">
        {page.blocks.map((b) => <BlockView key={b.id} block={b} accent={accent} onChange={updateBlock} onDelete={() => deleteBlock(b.id)} />)}
      </div>

      <div className="relative mt-4">
        <Btn variant="ghost" onClick={() => setMenu((m) => !m)} className="!px-2"><Icon.plus className="w-4 h-4" /> Add block <span className="mono text-[11px] text-[var(--fg-faint)]">/</span></Btn>
        {menu && (
          <div className="absolute z-20 mt-1 w-56 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-[var(--shadow-lg)] p-1 animate-pop">
            {BLOCK_OPTS.map((o) => (
              <button key={o.type} onClick={() => addBlock(o.type)} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--hover)] text-left text-[13px]">
                <span className="w-6 h-6 grid place-items-center rounded border border-[var(--border)] text-[13px] bg-[var(--panel-2)]">{o.icon}</span>{o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
