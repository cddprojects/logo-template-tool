import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { requireAuth } from '../auth.js'
import { workspaceFilePath } from '../db.js'
import {
  extractAssetsFromValue,
  rehydrateAssetsInValue,
  putAssetFromDataUrl,
  putAssetFromBuffer,
  assetExists,
  removeUserAssets
} from '../workspaceAssets.js'

function backupPath(file) {
  return `${file}.bak`
}

function readWorkspaceFile(file) {
  if (!fs.existsSync(file)) {
    return { versions: [], history: null, updatedAt: null, cleared: false }
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
    const versions = Array.isArray(raw?.versions) ? raw.versions : []
    const history = raw?.history ?? null
    const updatedAt = typeof raw?.updatedAt === 'string' ? raw.updatedAt : null
    const cleared = raw?.cleared === true
    return { versions, history, updatedAt, cleared }
  } catch (e) {
    console.error('[workspace] failed to read', file, e)
    return { versions: [], history: null, updatedAt: null, cleared: false }
  }
}

/**
 * If versions were wiped accidentally, try undo-history snaps then the on-disk .bak.
 * Skip when the client intentionally cleared the workspace (`cleared: true`).
 */
function recoverVersionsIfEmpty(data, file) {
  if (data.versions.length > 0) return data
  if (data.cleared === true) return data

  const history = data.history
  if (history && typeof history === 'object') {
    const past = Array.isArray(history.past) ? history.past : []
    for (let i = past.length - 1; i >= 0; i--) {
      const state = past[i]?.state
      if (Array.isArray(state) && state.length > 0) {
        console.warn('[workspace] recovered versions from undo history for', path.basename(file))
        return { ...data, versions: state, cleared: false }
      }
    }
    const future = Array.isArray(history.future) ? history.future : []
    for (let i = 0; i < future.length; i++) {
      const state = future[i]?.state
      if (Array.isArray(state) && state.length > 0) {
        console.warn('[workspace] recovered versions from undo future for', path.basename(file))
        return { ...data, versions: state, cleared: false }
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
        updatedAt: fromBak.updatedAt,
        cleared: false
      }
    }
  }

  return data
}

function readWorkspace(file) {
  return recoverVersionsIfEmpty(readWorkspaceFile(file), file)
}

/**
 * Undo snaps embed full version trees (paint PNGs). Persisting them multiplies
 * payload size and routinely OOMs Node during JSON.stringify / writeFile.
 * Keep labels only — in-tab undo still lives in the browser.
 */
function slimHistory(history) {
  if (history == null) return null
  if (typeof history !== 'object') return null
  return {
    v: 1,
    past: [],
    future: [],
    currentLabel:
      typeof history.currentLabel === 'string' ? history.currentLabel : 'Opened project',
    currentTime: Number(history.currentTime) || Date.now()
  }
}

/** Compact atomic write — pretty-print was blowing memory on paint-heavy workspaces. */
function writeWorkspace(file, payload) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })

  if (fs.existsSync(file)) {
    try {
      const stat = fs.statSync(file)
      // Skip .bak for very large files (copy alone can OOM / fill disk).
      if (stat.size < 40 * 1024 * 1024) {
        fs.copyFileSync(file, backupPath(file))
      } else {
        console.warn(
          '[workspace] skipping .bak copy — file too large:',
          path.basename(file),
          `(${Math.round(stat.size / (1024 * 1024))}MB)`
        )
      }
    } catch (e) {
      console.error('[workspace] failed to write backup', backupPath(file), e)
    }
  }

  let json
  try {
    json = JSON.stringify(payload)
  } catch (e) {
    const err = new Error(`JSON.stringify failed: ${e}`)
    err.cause = e
    throw err
  }

  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(tmp, json, 'utf-8')
    fs.renameSync(tmp, file)
  } catch (e) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch {
      // ignore
    }
    throw e
  }
}

const HASH_RE = /^[a-f0-9]{64}$/i

export function workspaceRoutes(_db, dataDir) {
  const router = Router()
  router.use(requireAuth(_db))

  router.put('/assets/:hash', (req, res) => {
      const hash = String(req.params.hash || '').toLowerCase()
      if (!HASH_RE.test(hash)) {
        res.status(400).json({ error: 'hash must be sha256 hex' })
        return
      }
      try {
        const userId = req.user.id
        if (assetExists(dataDir, userId, hash)) {
          res.json({ ok: true, hash, existed: true })
          return
        }
        let result
        if (typeof req.body?.dataUrl === 'string') {
          result = putAssetFromDataUrl(dataDir, userId, req.body.dataUrl)
        } else if (typeof req.body?.base64 === 'string') {
          const buf = Buffer.from(req.body.base64, 'base64')
          result = putAssetFromBuffer(dataDir, userId, req.body.mime, buf, 'b64')
        } else if (typeof req.body?.text === 'string') {
          result = putAssetFromBuffer(
            dataDir,
            userId,
            req.body.mime || 'image/svg+xml',
            Buffer.from(req.body.text, 'utf8'),
            'utf8'
          )
        } else {
          res.status(400).json({ error: 'Provide dataUrl, base64, or text' })
          return
        }
        if (result.hash !== hash) {
          res.status(400).json({
            error: 'Hash mismatch',
            expected: hash,
            actual: result.hash
          })
          return
        }
        res.json({ ok: true, hash, ref: result.ref, bytes: result.bytes, existed: false })
      } catch (e) {
        console.error('[workspace-assets] upload failed', e)
        res.status(500).json({ error: 'Failed to store asset', detail: String(e?.message || e) })
      }
    })


  router.get('/', (req, res) => {
    const file = workspaceFilePath(dataDir, req.user.id)
    let { versions, history, updatedAt, cleared } = readWorkspace(file)
    // Persist an automatic recovery so the next save does not re-wipe data.
    if (versions.length > 0) {
      const raw = readWorkspaceFile(file)
      if (raw.versions.length === 0 && raw.cleared !== true) {
        try {
          // Extract any legacy inline blobs before writing recovery.
          const extracted = extractAssetsFromValue(
            dataDir,
            req.user.id,
            structuredClone(versions)
          )
          writeWorkspace(file, {
            versions: extracted.value,
            history: slimHistory(history ?? raw.history),
            updatedAt: new Date().toISOString(),
            cleared: false
          })
          versions = extracted.value
          updatedAt = new Date().toISOString()
          cleared = false
        } catch (e) {
          console.error('[workspace] failed to persist recovery', file, e)
        }
      }
    }
    // Expand asset refs so the renderer receives the same data: URLs as before.
    const hydrated = rehydrateAssetsInValue(dataDir, req.user.id, structuredClone(versions))
    res.json({
      versions: hydrated,
      history: slimHistory(history),
      updatedAt,
      cleared: cleared === true
    })
  })

  router.put('/', (req, res) => {
    const versions = req.body?.versions
    if (!Array.isArray(versions)) {
      res.status(400).json({ error: 'versions must be an array' })
      return
    }
    const file = workspaceFilePath(dataDir, req.user.id)
    const existing = readWorkspaceFile(file)
    const allowEmpty = req.body?.allowEmpty === true
    // Block accidental empty overwrites, but allow deliberate clears (delete all).
    if (versions.length === 0 && existing.versions.length > 0 && !allowEmpty) {
      res.status(409).json({
        error: 'Refusing to overwrite a non-empty workspace with zero versions'
      })
      return
    }
    const updatedAt = new Date().toISOString()
    // Client may still send huge undo snaps — always slim before write.
    const history = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'history')
      ? slimHistory(req.body.history)
      : slimHistory(existing.history)

    try {
      // Defense in depth: extract any remaining inline data: blobs (old clients /
      // missed fields). Prefer client-side upload first so the PUT stays small.
      const extracted = extractAssetsFromValue(dataDir, req.user.id, structuredClone(versions))
      const payload = {
        versions: extracted.value,
        history,
        updatedAt,
        cleared: versions.length === 0
      }
      writeWorkspace(file, payload)
      if (versions.length === 0) {
        try {
          removeUserAssets(dataDir, req.user.id)
        } catch (e) {
          console.warn('[workspace] failed to clear assets on empty save', e)
        }
      }
      res.json({ ok: true, updatedAt, assets: extracted.refs.size })
    } catch (e) {
      console.error('[workspace] failed to save', path.basename(file), e)
      res.status(500).json({
        error: 'Failed to save workspace',
        detail: String(e?.message || e)
      })
    }
  })

  return router
}
