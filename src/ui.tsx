import React, { useEffect } from "react"

// ---------------------------------------------------------------------------
// Icons — minimal, consistent 1.5px line set
// ---------------------------------------------------------------------------
type IProps = { className?: string }
const S = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className || "w-4 h-4"}>{children}</svg>
)

export const Icon = {
  home: (p: IProps) => <S {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></S>,
  search: (p: IProps) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></S>,
  pin: (p: IProps) => <S {...p}><path d="M9 4h6l-1 6 3 3H7l3-3-1-6Z" /><path d="M12 16v4" /></S>,
  doc: (p: IProps) => <S {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 13h7M9 17h7" /></S>,
  sheet: (p: IProps) => <S {...p}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 9h18M3 14h18M9 4v16M15 4v16" /></S>,
  finance: (p: IProps) => <S {...p}><path d="M3 3v18h18" /><path d="M7 14l3-4 3 3 5-7" /></S>,
  calendar: (p: IProps) => <S {...p}><rect x="3" y="5" width="18" height="16" rx="1.5" /><path d="M3 9h18M8 3v4M16 3v4" /></S>,
  task: (p: IProps) => <S {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12 3 3 5-6" /></S>,
  files: (p: IProps) => <S {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></S>,
  people: (p: IProps) => <S {...p}><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8M21 20a6 6 0 0 0-4-5.6" /></S>,
  idea: (p: IProps) => <S {...p}><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3Z" /></S>,
  analytics: (p: IProps) => <S {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></S>,
  ai: (p: IProps) => <S {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><rect x="7" y="7" width="10" height="10" rx="2.5" /><circle cx="12" cy="12" r="1.4" /></S>,
  archive: (p: IProps) => <S {...p}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></S>,
  settings: (p: IProps) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></S>,
  plus: (p: IProps) => <S {...p}><path d="M12 5v14M5 12h14" /></S>,
  chevron: (p: IProps) => <S {...p}><path d="m9 6 6 6-6 6" /></S>,
  chevronDown: (p: IProps) => <S {...p}><path d="m6 9 6 6 6-6" /></S>,
  collapse: (p: IProps) => <S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></S>,
  command: (p: IProps) => <S {...p}><path d="M6 9V7a2 2 0 1 1 2 2H6Zm0 6v2a2 2 0 1 0 2-2H6Zm12-6V7a2 2 0 1 0-2 2h2Zm0 6v2a2 2 0 1 1-2-2h2Z" /><rect x="8" y="9" width="8" height="6" rx="1" /></S>,
  sun: (p: IProps) => <S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" /></S>,
  moon: (p: IProps) => <S {...p}><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z" /></S>,
  bell: (p: IProps) => <S {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></S>,
  clock: (p: IProps) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>,
  dots: (p: IProps) => <S {...p}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></S>,
  x: (p: IProps) => <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>,
  grid: (p: IProps) => <S {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></S>,
  graph: (p: IProps) => <S {...p}><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M6 8l5 8M18 8l-5 8" /></S>,
  trash: (p: IProps) => <S {...p}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></S>,
  copy: (p: IProps) => <S {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V4h12" /></S>,
  drag: (p: IProps) => <S {...p}><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></S>,
  inbox: (p: IProps) => <S {...p}><path d="M3 12h5l2 3h4l2-3h5" /><path d="M5 5h14l2 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" /></S>,
  bolt: (p: IProps) => <S {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></S>,
  check: (p: IProps) => <S {...p}><path d="m5 12 5 5L20 7" /></S>,
  filter: (p: IProps) => <S {...p}><path d="M3 5h18l-7 8v6l-4-2v-4z" /></S>,
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
export function Btn({ children, onClick, variant = "ghost", className = "", title, type = "button" }: {
  children: React.ReactNode; onClick?: (e: React.MouseEvent) => void; variant?: "primary" | "ghost" | "outline" | "subtle"; className?: string; title?: string; type?: "button" | "submit"
}) {
  const base = "inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium transition-colors select-none disabled:opacity-50"
  const styles = {
    primary: "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 px-3 py-1.5",
    outline: "border border-[var(--border-strong)] hover:bg-[var(--hover)] px-3 py-1.5",
    ghost: "hover:bg-[var(--hover)] px-2.5 py-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)]",
    subtle: "bg-[var(--panel-2)] border border-[var(--border)] hover:bg-[var(--hover)] px-3 py-1.5",
  }[variant]
  return <button type={type} title={title} onClick={onClick} className={`${base} ${styles} ${className}`}>{children}</button>
}

export function IconBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick?: () => void; title?: string; active?: boolean }) {
  return (
    <button title={title} onClick={onClick} className={`grid place-items-center w-8 h-8 rounded-md transition-colors ${active ? "bg-[var(--hover)] text-[var(--fg)]" : "text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--hover)]"}`}>{children}</button>
  )
}

export function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/40 animate-overlay" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-[var(--shadow-lg)] animate-pop`}>{children}</div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mono text-[11px] uppercase tracking-wider text-[var(--fg-faint)] mb-1.5">{label}</div>
      {children}
    </label>
  )
}

export const inputCls = "w-full bg-[var(--panel-2)] border border-[var(--border)] rounded-md px-3 py-2 text-[14px] focus:border-[var(--accent)] transition-colors placeholder:text-[var(--fg-faint)]"

export function Avatar({ name, color, initials, size = 26 }: { name?: string; color: string; initials: string; size?: number }) {
  return (
    <span title={name} className="inline-grid place-items-center rounded-full text-white font-semibold shrink-0" style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}>{initials}</span>
  )
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--panel-2)] border border-[var(--border)] text-[var(--fg-muted)]">#{children}</span>
}

export function money(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN")
}

export function timeAgo(t: number) {
  const d = Date.now() - t
  const m = Math.floor(d / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  return `${days}d ago`
}

export function StatusDot({ color }: { color: string }) {
  return <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
}
