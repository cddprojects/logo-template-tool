import { Router } from 'express'
import fs from 'fs'
import { requireAuth } from '../auth.js'
import { workspaceFilePath } from '../db.js'

function readWorkspace(file) {
  if (!fs.existsSync(file)) {
    return { versions: [], history: null, updatedAt: null }
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
    const versions = Array.isArray(raw?.versions) ? raw.versions : []
    const history = raw?.history ?? null
    const updatedAt = typeof raw?.updatedAt === 'string' ? raw.updatedAt : null
    return { versions, history, updatedAt }
  } catch (e) {
    console.error('[workspace] failed to read', file, e)
    return { versions: [], history: null, updatedAt: null }
  }
}

export function workspaceRoutes(_db, dataDir) {
  const router = Router()
  router.use(requireAuth(_db))

  router.get('/', (req, res) => {
    const file = workspaceFilePath(dataDir, req.user.id)
    const { versions, history, updatedAt } = readWorkspace(file)
    res.json({ versions, history, updatedAt })
  })

  router.put('/', (req, res) => {
    const versions = req.body?.versions
    if (!Array.isArray(versions)) {
      res.status(400).json({ error: 'versions must be an array' })
      return
    }
    const file = workspaceFilePath(dataDir, req.user.id)
    const updatedAt = new Date().toISOString()
    const payload = {
      versions,
      history: req.body?.history ?? null,
      updatedAt
    }
    try {
      fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8')
      res.json({ ok: true, updatedAt })
    } catch (e) {
      res.status(500).json({ error: 'Failed to save workspace', detail: String(e) })
    }
  })

  return router
}
