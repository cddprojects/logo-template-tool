import { Router } from 'express'
import {
  COOKIE,
  clearCookieOptions,
  publicUser,
  requireAuth,
  setSessionCookie,
  verifyPassword
} from '../auth.js'

export function authRoutes(db) {
  const router = Router()

  router.post('/login', (req, res) => {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase()
    const password = String(req.body?.password || '')
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' })
      return
    }
    const row = db
      .prepare('SELECT id, email, role, password_hash, created_at FROM users WHERE email = ?')
      .get(email)
    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }
    const user = {
      id: row.id,
      email: row.email,
      role: row.role,
      created_at: row.created_at
    }
    setSessionCookie(res, user)
    res.json({ user: publicUser(user) })
  })

  router.post('/logout', (_req, res) => {
    res.cookie(COOKIE, '', clearCookieOptions())
    res.json({ ok: true })
  })

  router.get('/me', requireAuth(db), (req, res) => {
    // Sliding session — keep users signed in while the cookie is still valid.
    setSessionCookie(res, req.user)
    res.json({ user: publicUser(req.user) })
  })

  return router
}
