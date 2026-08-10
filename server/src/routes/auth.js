import { Router } from 'express'
import {
  COOKIE,
  cookieOptions,
  clearCookieOptions,
  publicUser,
  requireAuth,
  signUser,
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
    res.cookie(COOKIE, signUser(user), cookieOptions())
    res.json({ user: publicUser(user) })
  })

  router.post('/logout', (_req, res) => {
    res.cookie(COOKIE, '', clearCookieOptions())
    res.json({ ok: true })
  })

  router.get('/me', requireAuth(db), (req, res) => {
    res.json({ user: publicUser(req.user) })
  })

  return router
}
