import { Router } from 'express'
import { nanoid } from 'nanoid'
import { hashPassword, publicUser, requireAdmin, requireAuth } from '../auth.js'

function getUser(db, id) {
  return db.prepare('SELECT id, email, role, created_at FROM users WHERE id = ?').get(id)
}

function lastAdminGuard(db, user) {
  if (user.role !== 'admin') return null
  const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get()
  if (admins.n <= 1) return 'Cannot modify the last admin'
  return null
}

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
    const password =
      req.body?.password !== undefined && req.body?.password !== null
        ? String(req.body.password)
        : null

    if (role === undefined && !password) {
      res.status(400).json({ error: 'Provide role and/or password' })
      return
    }

    const user = getUser(db, id)
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    if (role !== undefined) {
      if (role !== 'admin' && role !== 'member') {
        res.status(400).json({ error: 'role must be admin or member' })
        return
      }
      if (user.role === 'admin' && role === 'member') {
        const blocked = lastAdminGuard(db, user)
        if (blocked) {
          res.status(400).json({ error: blocked })
          return
        }
      }
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
    }

    if (password !== null) {
      if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' })
        return
      }
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        hashPassword(password),
        id
      )
    }

    const updated = getUser(db, id)
    res.json({ user: publicUser(updated) })
  })

  router.delete('/:id', (req, res) => {
    const id = req.params.id
    const user = getUser(db, id)
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    const blocked = lastAdminGuard(db, user)
    if (blocked) {
      res.status(400).json({ error: blocked })
      return
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
    res.json({ ok: true })
  })

  return router
}
