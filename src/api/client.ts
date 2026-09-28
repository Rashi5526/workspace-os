// Thin typed HTTP client for the Workspace OS backend.
// - Attaches the access token to every request.
// - On 401 "token_expired" it refreshes once (single-flight) and retries.
// - Normalises failures into ApiError so callers can tell "offline" from
//   "server said no" (this drives the autosave retry policy).

export const API_URL: string = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:4000"

export class ApiError extends Error {
  status: number
  code: string
  network: boolean
  constructor(status: number, code: string, message: string, network = false) {
    super(message)
    this.status = status
    this.code = code
    this.network = network
  }
}

export interface AuthUser { id: string; email: string; name: string; initials: string; color: string; avatarUrl: string | null }

const ACCESS = "wos.accessToken"
const REFRESH = "wos.refreshToken"

export const session = {
  get access() { return localStorage.getItem(ACCESS) },
  get refresh() { return localStorage.getItem(REFRESH) },
  set(access: string, refresh: string) { localStorage.setItem(ACCESS, access); localStorage.setItem(REFRESH, refresh); listeners.forEach((l) => l(access)) },
  clear() { localStorage.removeItem(ACCESS); localStorage.removeItem(REFRESH) },
}

const listeners = new Set<(token: string) => void>()
export const onTokenChange = (fn: (token: string) => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }

let authLostHandler: (() => void) | null = null
export const onAuthLost = (fn: () => void) => { authLostHandler = fn }

let socketIdGetter: () => string | undefined = () => undefined
export const setSocketIdGetter = (fn: () => string | undefined) => { socketIdGetter = fn }

let refreshing: Promise<boolean> | null = null
async function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const rt = session.refresh
    if (!rt) return false
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: rt }) })
      if (!res.ok) return false
      const data = await res.json()
      session.set(data.accessToken, data.refreshToken)
      return true
    } catch {
      return false
    } finally {
      setTimeout(() => { refreshing = null }, 0)
    }
  })()
  return refreshing
}

async function raw(method: string, path: string, body?: unknown, isForm = false): Promise<Response> {
  const headers: Record<string, string> = {}
  if (!isForm && body !== undefined) headers["Content-Type"] = "application/json"
  if (session.access) headers.Authorization = `Bearer ${session.access}`
  const sid = socketIdGetter()
  if (sid) headers["x-socket-id"] = sid
  try {
    return await fetch(`${API_URL}${path}`, { method, headers, body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError(0, "network", "Cannot reach the server", true)
  }
}

export async function request<T = any>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  let res = await raw(method, path, body, isForm)
  if (res.status === 401 && session.refresh && !path.startsWith("/auth/")) {
    if (await refreshTokens()) res = await raw(method, path, body, isForm)
  }
  if (res.status === 204) return undefined as T
  let data: any = null
  try { data = await res.json() } catch { /* non-JSON */ }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) { session.clear(); authLostHandler?.() }
    const e = data?.error
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? `Request failed (${res.status})`)
  }
  return data as T
}

export const api = {
  get: <T = any>(p: string) => request<T>("GET", p),
  post: <T = any>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  patch: <T = any>(p: string, b: unknown) => request<T>("PATCH", p, b),
  del: <T = any>(p: string) => request<T>("DELETE", p),
  upload: <T = any>(p: string, form: FormData) => request<T>("POST", p, form, true),
}

// ---- auth ---------------------------------------------------------------
export const auth = {
  async signup(name: string, email: string, password: string): Promise<AuthUser> {
    const r = await request("POST", "/auth/signup", { name, email, password })
    session.set(r.accessToken, r.refreshToken)
    return r.user
  },
  async login(email: string, password: string): Promise<AuthUser> {
    const r = await request("POST", "/auth/login", { email, password })
    session.set(r.accessToken, r.refreshToken)
    return r.user
  },
  async logout() {
    const rt = session.refresh
    try { await request("POST", "/auth/logout", { refreshToken: rt }) } catch { /* still clear locally */ }
    session.clear()
  },
  async me(): Promise<AuthUser> { return (await request("GET", "/auth/me")).user },
  forgot: (email: string) => request("POST", "/auth/forgot-password", { email }),
  reset: (token: string, newPassword: string) => request("POST", "/auth/reset-password", { token, newPassword }),
}

export async function downloadFile(worldId: string, fileId: string, name: string) {
  const res = await raw("GET", `/worlds/${worldId}/files/${fileId}/download`)
  if (!res.ok) throw new ApiError(res.status, "download_failed", "Download failed")
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
