import React, { useState } from 'react'
import { login } from '../platform/auth'

interface LoginScreenProps {
  onLoggedIn: () => void
}

export function LoginScreen({ onLoggedIn }: LoginScreenProps): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await login(email.trim(), password)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onLoggedIn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-bg text-text">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 20% 10%, rgba(99,102,241,0.22), transparent 55%),' +
            'radial-gradient(ellipse 70% 50% at 90% 80%, rgba(45,45,66,0.9), transparent 50%),' +
            'linear-gradient(180deg, #0d0d10 0%, #12121a 100%)'
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(232,232,240,0.35) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(232,232,240,0.35) 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }}
      />

      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-sm px-6"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent shadow-lg shadow-accent/30">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="white" stroke="none" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">Kitteasy</h1>
          <p className="mt-1.5 text-sm text-muted">Sign in to your template library</p>
        </div>

        <label className="mb-1.5 block text-xs font-medium text-text-dim">Email</label>
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent"
          placeholder="you@company.com"
        />

        <label className="mb-1.5 block text-xs font-medium text-text-dim">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent"
          placeholder="••••••••"
        />

        {error && (
          <p className="mb-3 rounded-lg border border-red-800/60 bg-red-950/50 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="mt-6 text-center text-[11px] text-muted">
          Accounts are created by an administrator.
        </p>
      </form>
    </div>
  )
}
