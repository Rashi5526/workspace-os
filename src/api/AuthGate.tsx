import React, { useEffect, useState } from "react"
import { auth, onAuthLost, session, ApiError, type AuthUser } from "./client"

// Minimal sign-in shell. It only exists because the original app had no
// login at all; it reuses the app's CSS variables and adds no other UI.
type Mode = "login" | "signup" | "forgot" | "reset"

const field = "w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--panel)] text-[13px] outline-none focus:border-[var(--border-strong)]"
const primary = "w-full px-3 py-2 rounded-md text-[13px] font-medium bg-[var(--fg)] text-[var(--bg)] disabled:opacity-50"

export function AuthGate({ children }: { children: (user: AuthUser, signOut: () => void) => React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checking, setChecking] = useState(!!session.access)
  const [mode, setMode] = useState<Mode>("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [token, setToken] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Restore the session on page load.
  useEffect(() => {
    if (!session.access) return
    auth.me().then(setUser).catch((e: ApiError) => { if (e.network) setErr("Cannot reach the server."); else session.clear() }).finally(() => setChecking(false))
  }, [])

  // Expired/invalid session mid-use → back to the login screen.
  useEffect(() => { onAuthLost(() => { setUser(null); setErr("Your session expired. Please sign in again.") }) }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null); setMsg(null)
    try {
      if (mode === "login") setUser(await auth.login(email, password))
      else if (mode === "signup") setUser(await auth.signup(name, email, password))
      else if (mode === "forgot") { await auth.forgot(email); setMsg("If that email exists, a reset token has been sent."); setMode("reset") }
      else { await auth.reset(token, password); setMsg("Password updated. Please sign in."); setMode("login"); setPassword("") }
    } catch (e2) {
      setErr((e2 as ApiError).message)
    } finally { setBusy(false) }
  }

  const signOut = async () => { await auth.logout(); setUser(null); setPassword("") }

  if (checking) return <div className="h-screen grid place-items-center text-[13px] text-[var(--fg-faint)]" style={{ background: "var(--bg)" }}>Loading…</div>
  if (user) return <>{children(user, signOut)}</>

  const title = { login: "Sign in", signup: "Create account", forgot: "Reset password", reset: "Choose a new password" }[mode]
  return (
    <div className="h-screen grid place-items-center text-[var(--fg)]" style={{ background: "var(--bg)" }}>
      <form onSubmit={submit} className="w-[340px] space-y-3">
        <div className="text-[18px] font-semibold mb-2">{title}</div>
        {mode === "signup" && <input className={field} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />}
        {mode !== "reset" && <input className={field} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
        {mode === "reset" && <input className={field} placeholder="Reset token" value={token} onChange={(e) => setToken(e.target.value)} required />}
        {mode !== "forgot" && <input className={field} type="password" placeholder={mode === "reset" ? "New password (min 8)" : "Password"} minLength={mode === "login" ? 1 : 8} value={password} onChange={(e) => setPassword(e.target.value)} required />}
        {err && <div className="text-[12px] text-[#e0567a]">{err}</div>}
        {msg && <div className="text-[12px] text-[var(--fg-muted)]">{msg}</div>}
        <button className={primary} disabled={busy}>{busy ? "…" : title}</button>
        <div className="flex justify-between text-[12px] text-[var(--fg-muted)]">
          {mode === "login" ? <><button type="button" onClick={() => setMode("signup")}>Create account</button><button type="button" onClick={() => setMode("forgot")}>Forgot password?</button></>
            : <button type="button" onClick={() => setMode("login")}>Back to sign in</button>}
        </div>
      </form>
    </div>
  )
}
