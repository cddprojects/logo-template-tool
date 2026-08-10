import { Router } from 'express'
import fs from 'fs'
import { nanoid } from 'nanoid'
import { requireAuth } from '../auth.js'
import { templateFilePath } from '../db.js'

function toDto(row, ownerEmail, currentUserId) {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.user_id,
    ownerEmail,
    isOwn: row.user_id === currentUserId,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function templatesRoutes(db, dataDir) {
  const router = Router()
  router.use(requireAuth(db))

  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT t.id, t.user_id, t.name, t.created_at, t.updated_at, u.email AS owner_email
         FROM templates t
         JOIN users u ON u.id = t.user_id
         ORDER BY t.updated_at DESC`
      )
      .all()
    res.json({
      templates: rows.map((r) =>
        toDto(r, r.owner_email, req.user.id)
      )
    })
  })

  router.get('/:id', (req, res) => {
    const row = db
      .prepare(
        `SELECT t.id, t.user_id, t.name, t.created_at, t.updated_at, u.email AS owner_email
         FROM templates t
         JOIN users u ON u.id = t.user_id
         WHERE t.id = ?`
      )
      .get(req.params.id)
    if (!row) {
      res.status(404).json({ error: 'Template not found' })
      return
    }
    const file = templateFilePath(dataDir, row.user_id, row.id)
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: 'Template file missing' })
      return
    }
    try {
      const payload = JSON.parse(fs.readFileSync(file, 'utf-8'))
      res.json({
        template: toDto(row, row.owner_email, req.user.id),
        data: payload
      })
    } catch (e) {
      res.status(500).json({ error: 'Failed to read template', detail: String(e) })
    }
  })

  router.post('/', (req, res) => {
    const body = req.body || {}
    const name = String(body.name || body.data?.name || 'Untitled').trim() || 'Untitled'
    const data = body.data ?? body
    if (!data || typeof data !== 'object') {
      res.status(400).json({ error: 'Template data required' })
      return
    }
    // Normalize to .igtemplate shape
    const payload = {
      name: data.name || name,
      description: data.description || '',
      logos: data.logos ?? [],
      favicons: data.favicons ?? []
    }
    const id = nanoid()
    const now = new Date().toISOString()
    const file = templateFilePath(dataDir, req.user.id, id)
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8')
    db.prepare(
      'INSERT INTO templates (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, req.user.id, payload.name || name, now, now)
    res.status(201).json({
      template: toDto(
        { id, user_id: req.user.id, name: payload.name || name, created_at: now, updated_at: now },
        req.user.email,
        req.user.id
      )
    })
  })

  router.delete('/:id', (req, res) => {
    const row = db
      .prepare('SELECT id, user_id, name FROM templates WHERE id = ?')
      .get(req.params.id)
    if (!row) {
      res.status(404).json({ error: 'Template not found' })
      return
    }
    const isOwner = row.user_id === req.user.id
    const isAdmin = req.user.role === 'admin'
    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: 'Not allowed to delete this template' })
      return
    }
    const file = templateFilePath(dataDir, row.user_id, row.id)
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    } catch { /* ignore */ }
    db.prepare('DELETE FROM templates WHERE id = ?').run(row.id)
    res.json({ ok: true })
  })

  router.post('/:id/copy', (req, res) => {
    const row = db
      .prepare('SELECT id, user_id, name FROM templates WHERE id = ?')
      .get(req.params.id)
    if (!row) {
      res.status(404).json({ error: 'Template not found' })
      return
    }
    const src = templateFilePath(dataDir, row.user_id, row.id)
    if (!fs.existsSync(src)) {
      res.status(404).json({ error: 'Template file missing' })
      return
    }
    let payload
    try {
      payload = JSON.parse(fs.readFileSync(src, 'utf-8'))
    } catch (e) {
      res.status(500).json({ error: 'Failed to read template', detail: String(e) })
      return
    }
    const baseName = String(req.body?.name || `${row.name} (copy)`).trim() || `${row.name} (copy)`
    let name = baseName
    // Avoid exact name clash in own library
    const existingNames = new Set(
      db
        .prepare('SELECT name FROM templates WHERE user_id = ?')
        .all(req.user.id)
        .map((r) => r.name)
    )
    if (existingNames.has(name)) {
      let n = 2
      while (existingNames.has(`${baseName} ${n}`)) n++
      name = `${baseName} ${n}`
    }
    payload = { ...payload, name }
    const id = nanoid()
    const now = new Date().toISOString()
    const dest = templateFilePath(dataDir, req.user.id, id)
    fs.writeFileSync(dest, JSON.stringify(payload, null, 2), 'utf-8')
    db.prepare(
      'INSERT INTO templates (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, req.user.id, name, now, now)
    res.status(201).json({
      template: toDto(
        { id, user_id: req.user.id, name, created_at: now, updated_at: now },
        req.user.email,
        req.user.id
      )
    })
  })

  return router
}
