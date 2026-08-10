import { Router } from 'express'
import { nanoid } from 'nanoid'
import { hashPassword, publicUser, requireAdmin, requireAuth } from '../auth.js'

export function usersRoutes(db) {
  const router = Router()
  router.use(requireAuth(db), requireAdmin)

  router.get('/', (_req, res) => {
    const rows = db
      .prepare('SELECT id, email, role, created_at FROM users ORDER BY created_at ASC')
      .all()
    res.json({ users: rows.map(publicUser) })
  })

  router.post('/', (req, res) => {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase()
    const password = String(req.body?.password || '')
    const role = req.body?.role === 'admin' ? 'admin' : 'member'
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' })
      return
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' })
      return
    }
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (exists) {
      res.status(409).json({ error: 'Email already in use' })
      return
    }
    const id = nanoid()
    const createdAt = new Date().toISOString()
    db.prepare(
      'INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, email, hashPassword(password), role, createdAt)
    res.status(201).json({
      user: publicUser({ id, email, role, created_at: createdAt })
    })
  })

  router.patch('/:id', (req, res) => {
    const id = req.params.id
    const role = req.body?.role
    if (role !== 'admin' && role !== 'member') {
      res.status(400).json({ error: 'role must be admin or member' })
      return
    }
    const user = db
      .prepare('SELECT id, email, role, created_at FROM users WHERE id = ?')
      .get(id)
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    if (user.role === 'admin' && role === 'member') {
      const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get()
      if (admins.n <= 1) {
        res.status(400).json({ error: 'Cannot demote the last admin' })
        return
      }
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
    const updated = db
      .prepare('SELECT id, email, role, created_at FROM users WHERE id = ?')
      .get(id)
    res.json({ user: publicUser(updated) })
  })

  return router
}
