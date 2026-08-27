#!/usr/bin/env node
/**
 * Scan /data/workspace/*.json and restore versions from undo history or *.json.bak.
 * Run inside the production container, e.g.:
 *   node /app/server/scripts/recover-workspaces.mjs
 *   DATA_DIR=/data node server/scripts/recover-workspaces.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../../data')
const workspaceDir = path.join(dataDir, 'workspace')

function readFile(file) {
  if (!fs.existsSync(file)) return { versions: [], history: null }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return {
      versions: Array.isArray(raw?.versions) ? raw.versions : [],
      history: raw?.history ?? null,
      updatedAt: raw?.updatedAt ?? null
    }
  } catch (e) {
    console.error('[recover] parse failed', file, e.message)
    return { versions: [], history: null }
  }
}

function pickFromHistory(history) {
  if (!history || typeof history !== 'object') return null
  const past = Array.isArray(history.past) ? history.past : []
  for (let i = past.length - 1; i >= 0; i--) {
    const state = past[i]?.state
    if (Array.isArray(state) && state.length > 0) return state
  }
  const future = Array.isArray(history.future) ? history.future : []
  for (const snap of future) {
    const state = snap?.state
    if (Array.isArray(state) && state.length > 0) return state
  }
  return null
}

if (!fs.existsSync(workspaceDir)) {
  console.log('[recover] no workspace dir:', workspaceDir)
  process.exit(0)
}

let restored = 0
for (const name of fs.readdirSync(workspaceDir)) {
  if (!name.endsWith('.json') || name.endsWith('.bak')) continue
  const file = path.join(workspaceDir, name)
  const current = readFile(file)
  if (current.versions.length > 0) {
    console.log('[recover] ok', name, `(${current.versions.length} versions)`)
    continue
  }

  let versions = pickFromHistory(current.history)
  let source = 'history'
  if (!versions) {
    const bak = readFile(`${file}.bak`)
    if (bak.versions.length > 0) {
      versions = bak.versions
      source = 'backup'
    }
  }

  if (!versions) {
    console.warn('[recover] no data to restore for', name)
    continue
  }

  const payload = {
    versions,
    history: current.history ?? null,
    updatedAt: new Date().toISOString()
  }
  fs.copyFileSync(file, `${file}.pre-recover-${Date.now()}`)
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8')
  console.log('[recover] restored', name, `from ${source} (${versions.length} versions)`)
  restored++
}

console.log(`[recover] done — ${restored} file(s) restored`)
