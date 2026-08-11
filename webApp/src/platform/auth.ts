export type UserRole = 'member' | 'admin'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  createdAt: string
}

export interface ServerTemplate {
  id: string
  name: string
  ownerId: string
  ownerEmail: string
  isOwn: boolean
  createdAt: string
  updatedAt: string
}

type Listener = (user: AuthUser | null) => void

let currentUser: AuthUser | null = null
const listeners = new Set<Listener>()

function notify(): void {
  listeners.forEach((cb) => cb(currentUser))
}

export function getAuthUser(): AuthUser | null {
  return currentUser
}

export function subscribeAuth(cb: Listener): () => void {
  listeners.add(cb)
  cb(currentUser)
  return () => {
    listeners.delete(cb)
  }
}

export function setAuthUser(user: AuthUser | null): void {
  currentUser = user
  notify()
}

const API_FETCH_TIMEOUT_MS = 8000

async function api<T>(
  path: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(path, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {})
      },
      signal: controller.signal,
      ...init
    })
    const text = await res.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = { error: text }
      }
    }
    if (!res.ok) {
      const err =
        body && typeof body === 'object' && body !== null && 'error' in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${res.status}`
      return { ok: false, error: err, status: res.status }
    }
    return { ok: true, data: body as T }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: 'Request timed out', status: 0 }
    }
    return { ok: false, error: String(e), status: 0 }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchMe(): Promise<AuthUser | null> {
  const result = await api<{ user: AuthUser }>('/api/auth/me')
  if (!result.ok) {
    setAuthUser(null)
    return null
  }
  setAuthUser(result.data.user)
  return result.data.user
}

export async function login(
  email: string,
  password: string
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const result = await api<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
  if (!result.ok) return { ok: false, error: result.error }
  setAuthUser(result.data.user)
  return { ok: true, user: result.data.user }
}

export async function logout(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST' })
  setAuthUser(null)
}

export async function listTemplates(): Promise<
  { ok: true; templates: ServerTemplate[] } | { ok: false; error: string }
> {
  const result = await api<{ templates: ServerTemplate[] }>('/api/templates')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, templates: result.data.templates }
}

export async function getTemplate(id: string): Promise<
  | { ok: true; template: ServerTemplate; data: Record<string, unknown> }
  | { ok: false; error: string }
> {
  const result = await api<{ template: ServerTemplate; data: Record<string, unknown> }>(
    `/api/templates/${encodeURIComponent(id)}`
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, template: result.data.template, data: result.data.data }
}

export async function createTemplate(payload: {
  name: string
  description?: string
  logos?: unknown
  favicons?: unknown
}): Promise<{ ok: true; template: ServerTemplate } | { ok: false; error: string }> {
  const result = await api<{ template: ServerTemplate }>('/api/templates', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      data: {
        name: payload.name,
        description: payload.description ?? '',
        logos: payload.logos ?? [],
        favicons: payload.favicons ?? []
      }
    })
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, template: result.data.template }
}

export async function deleteTemplate(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await api<{ ok: boolean }>(`/api/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

export async function copyTemplate(
  id: string,
  name?: string
): Promise<{ ok: true; template: ServerTemplate } | { ok: false; error: string }> {
  const result = await api<{ template: ServerTemplate }>(
    `/api/templates/${encodeURIComponent(id)}/copy`,
    {
      method: 'POST',
      body: JSON.stringify(name ? { name } : {})
    }
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, template: result.data.template }
}

export async function loadWorkspace(): Promise<
  { ok: true; versions: unknown[] } | { ok: false; error: string }
> {
  const result = await api<{ versions: unknown[] }>('/api/workspace')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, versions: Array.isArray(result.data.versions) ? result.data.versions : [] }
}

export async function saveWorkspace(
  versions: unknown[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await api<{ ok: boolean }>('/api/workspace', {
    method: 'PUT',
    body: JSON.stringify({ versions })
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

export async function listUsers(): Promise<
  { ok: true; users: AuthUser[] } | { ok: false; error: string }
> {
  const result = await api<{ users: AuthUser[] }>('/api/users')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, users: result.data.users }
}

export async function createUser(input: {
  email: string
  password: string
  role: UserRole
}): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const result = await api<{ user: AuthUser }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(input)
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, user: result.data.user }
}

/** Change role and/or password (admin). */
export async function patchUser(
  id: string,
  patch: { role?: UserRole; password?: string }
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const result = await api<{ user: AuthUser }>(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, user: result.data.user }
}

export async function patchUserRole(
  id: string,
  role: UserRole
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  return patchUser(id, { role })
}

export async function deleteUser(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await api<{ ok: boolean }>(`/api/users/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

/** Import server template JSON into the editor via existing listeners. */
export function importTemplateIntoEditor(data: Record<string, unknown>, fallbackName: string): void {
  const now = new Date().toISOString()
  const version = {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: (data.name as string) || fallbackName,
    description: (data.description as string) || '',
    createdAt: now,
    updatedAt: now,
    logos: (data.logos as unknown[]) ?? [],
    favicons: (data.favicons as unknown[]) ?? []
  }
  window.dispatchEvent(new CustomEvent('web:template-imported', { detail: version }))
}

export const WEB_OPEN_TEMPLATES = 'web:open-templates'
export const WEB_OPEN_ADMIN = 'web:open-admin'
