import React, { useCallback, useEffect, useState } from 'react'
import {
  createUser,
  deleteUser,
  getAuthUser,
  listUsers,
  patchUser,
  type AuthUser,
  type UserRole
} from '../platform/auth'

interface AdminUsersModalProps {
  onClose: () => void
}

export function AdminUsersModal({ onClose }: AdminUsersModalProps): JSX.Element {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('member')
  const [creating, setCreating] = useState(false)
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const currentUser = getAuthUser()

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await listUsers()
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setUsers(result.users)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    const result = await createUser({ email: email.trim(), password, role })
    setCreating(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setEmail('')
    setPassword('')
    setRole('member')
    await refresh()
  }

  const handleRoleChange = async (id: string, next: UserRole) => {
    setBusyId(id)
    setError(null)
    const result = await patchUser(id, { role: next })
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      await refresh()
      return
    }
    await refresh()
  }

  const handleResetPassword = async (id: string) => {
    const nextPassword = passwordDrafts[id] ?? ''
    if (nextPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setBusyId(id)
    setError(null)
    setSavedId(null)
    const result = await patchUser(id, { password: nextPassword })
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPasswordDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setSavedId(id)
    window.setTimeout(() => setSavedId((current) => (current === id ? null : current)), 2000)
  }

  const handleDelete = async (u: AuthUser) => {
    if (!confirm(`Delete account “${u.email}”? Their templates will also be removed.`)) return
    setBusyId(u.id)
    setError(null)
    const result = await deleteUser(u.id)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPasswordDrafts((prev) => {
      const next = { ...prev }
      delete next[u.id]
      return next
    })
    await refresh()
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-text">Users</h2>
            <p className="text-[10px] text-muted">
              Manage every account. Passwords are stored securely and cannot be viewed — set a new
              one for any user below.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-muted hover:bg-surface3 hover:text-text"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {error && (
            <p className="mb-3 rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          )}

          <form onSubmit={handleCreate} className="mb-4 space-y-2 rounded-lg border border-border bg-surface2 p-3">
            <p className="text-xs font-medium text-text-dim">Create account</p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@company.com"
              className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 6)"
              className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
            />
            <div className="flex items-center gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
              <button
                type="submit"
                disabled={creating}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>

          {loading ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-xs text-muted">No accounts found.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-muted">
                {users.length} account{users.length === 1 ? '' : 's'} — create more above, or set a
                new password for any row.
              </p>
              <ul className="space-y-2">
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id
                  const draft = passwordDrafts[u.id] ?? ''
                  return (
                    <li
                      key={u.id}
                      className="rounded-lg border border-border bg-surface2/40 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-[140px] flex-1">
                          <p className="truncate text-xs font-medium text-text">
                            {u.email}
                            {isSelf && (
                              <span className="ml-1.5 text-[10px] font-normal text-accent">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-muted">
                            {u.role} · joined {u.createdAt?.slice(0, 10)}
                          </p>
                        </div>
                        <select
                          value={u.role}
                          disabled={busyId === u.id}
                          onChange={(e) => void handleRoleChange(u.id, e.target.value as UserRole)}
                          className="rounded-md border border-border bg-bg px-2 py-1 text-[11px] text-text outline-none focus:border-accent disabled:opacity-50"
                          aria-label={`Role for ${u.email}`}
                        >
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>
                        <div className="flex min-w-[220px] flex-1 items-center gap-2">
                          <input
                            type="password"
                            minLength={6}
                            value={draft}
                            disabled={busyId === u.id}
                            onChange={(e) => {
                              setError(null)
                              setSavedId(null)
                              setPasswordDrafts((prev) => ({
                                ...prev,
                                [u.id]: e.target.value
                              }))
                            }}
                            placeholder="New password (min 6)"
                            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent disabled:opacity-50"
                            aria-label={`New password for ${u.email}`}
                          />
                          <button
                            type="button"
                            disabled={busyId === u.id || draft.length < 6}
                            onClick={() => void handleResetPassword(u.id)}
                            className="shrink-0 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                          >
                            {busyId === u.id ? 'Saving…' : 'Set password'}
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => void handleDelete(u)}
                          className="rounded-md px-2 py-1 text-[11px] text-danger hover:bg-surface3 disabled:opacity-50"
                          title={isSelf ? 'Cannot delete the last admin' : 'Delete account'}
                        >
                          Delete
                        </button>
                      </div>
                      {savedId === u.id && (
                        <p className="mt-2 text-[10px] text-emerald-400">
                          Password updated for {u.email}.
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
