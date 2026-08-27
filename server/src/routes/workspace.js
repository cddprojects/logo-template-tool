import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { requireAuth } from '../auth.js'
import { workspaceFilePath } from '../db.js'

function backupPath(file) {
  return `${file}.bak`
}

function readWorkspaceFile(file) {
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

/** If versions were wiped, try undo-history snaps then the on-disk .bak file. */
function recoverVersionsIfEmpty(data, file) {
  if (data.versions.length > 0) return data

  const history = data.history
  if (history && typeof history === 'object') {
    const past = Array.isArray(history.past) ? history.past : []
    for (let i = past.length - 1; i >= 0; i--) {
      const state = past[i]?.state
      if (Array.isArray(state) && state.length > 0) {
        console.warn('[workspace] recovered versions from undo history for', path.basename(file))
        return { ...data, versions: state }
      }
    }
    const future = Array.isArray(history.future) ? history.future : []
    for (let i = 0; i < future.length; i++) {
      const state = future[i]?.state
      if (Array.isArray(state) && state.length > 0) {
        console.warn('[workspace] recovered versions from undo future for', path.basename(file))
        return { ...data, versions: state }
      }
    }
  }

  const bak = backupPath(file)
  if (fs.existsSync(bak)) {
    const fromBak = readWorkspaceFile(bak)
    if (fromBak.versions.length > 0) {
      console.warn('[workspace] recovered versions from backup for', path.basename(file))
      return {
        versions: fromBak.versions,
        history: data.history ?? fromBak.history,
        updatedAt: fromBak.updatedAt
      }
    }
  }

  return data
}

function readWorkspace(file) {
  return recoverVersionsIfEmpty(readWorkspaceFile(file), file)
}

function writeWorkspace(file, payload) {
  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, backupPath(file))
    } catch (e) {
      console.error('[workspace] failed to write backup', backupPath(file), e)
    }
  }
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8')
}

export function workspaceRoutes(_db, dataDir) {
  const router = Router()
  router.use(requireAuth(_db))

  router.get('/', (req, res) => {
    const file = workspaceFilePath(dataDir, req.user.id)
    let { versions, history, updatedAt } = readWorkspace(file)
    // Persist an automatic recovery so the next save does not re-wipe data.
    if (versions.length > 0) {
      const raw = readWorkspaceFile(file)
      if (raw.versions.length === 0) {
        try {
          writeWorkspace(file, {
            versions,
            history: history ?? raw.history,
            updatedAt: new Date().toISOString()
          })
          updatedAt = new Date().toISOString()
        } catch (e) {
          console.error('[workspace] failed to persist recovery', file, e)
        }
      }
    }
    res.json({ versions, history, updatedAt })
  })

  router.put('/', (req, res) => {
    const versions = req.body?.versions
    if (!Array.isArray(versions)) {
      res.status(400).json({ error: 'versions must be an array' })
      return
    }
    const file = workspaceFilePath(dataDir, req.user.id)
    const existing = readWorkspaceFile(file)
    if (versions.length === 0 && existing.versions.length > 0) {
      res.status(409).json({
        error: 'Refusing to overwrite a non-empty workspace with zero versions'
      })
      return
    }
    const updatedAt = new Date().toISOString()
    // Keep the previous undo stack when the client omits `history` (versions-only save).
    const history = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'history')
      ? req.body.history
      : existing.history
    const payload = {
      versions,
      history: history ?? null,
      updatedAt
    }
    try {
      writeWorkspace(file, payload)
      res.json({ ok: true, updatedAt })
    } catch (e) {
      res.status(500).json({ error: 'Failed to save workspace', detail: String(e) })
    }
  })

  return router
}
