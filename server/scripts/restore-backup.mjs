#!/usr/bin/env node
/**
 * Restore /data from a dated backup folder. Stop the API container before running.
 *
 *   node /app/server/scripts/restore-backup.mjs 2026-08-25
 *   node /app/server/scripts/restore-backup.mjs 2026-08-25 --workspace-only RTwdlsv9tiktmfm1PcEGK
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDataPaths } from '../src/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../../data')
const stamp = process.argv[2]
const workspaceOnlyIdx = process.argv.indexOf('--workspace-only')
const singleUserId = workspaceOnlyIdx >= 0 ? process.argv[workspaceOnlyIdx + 1] : null

if (!stamp || !/^\d{4}-\d{2}-\d{2}$/.test(stamp)) {
  console.error('Usage: node restore-backup.mjs YYYY-MM-DD [--workspace-only USER_ID]')
  process.exit(1)
}

const { root, dbPath, templatesDir, workspaceDir } = getDataPaths(dataDir)
const srcDir = path.join(root, 'backups', stamp)

if (!fs.existsSync(path.join(srcDir, '.complete'))) {
  console.error('[restore] backup not found or incomplete:', srcDir)
  process.exit(1)
}

if (singleUserId) {
  const srcFile = path.join(srcDir, 'workspace', `${singleUserId}.json`)
  if (!fs.existsSync(srcFile)) {
    console.error('[restore] workspace file missing in backup:', srcFile)
    process.exit(1)
  }
  fs.mkdirSync(workspaceDir, { recursive: true })
  const destFile = path.join(workspaceDir, `${singleUserId}.json`)
  fs.copyFileSync(destFile, `${destFile}.pre-restore-${Date.now()}`)
  fs.copyFileSync(srcFile, destFile)
  console.log('[restore] restored workspace for', singleUserId, 'from', stamp)
  process.exit(0)
}

for (const [srcName, destPath] of [
  ['app.sqlite', dbPath],
  ['workspace', workspaceDir],
  ['templates', templatesDir]
]) {
  const srcPath = path.join(srcDir, srcName)
  if (!fs.existsSync(srcPath)) continue
  if (fs.existsSync(destPath)) {
    const backupLive = `${destPath}.pre-restore-${Date.now()}`
    fs.cpSync(destPath, backupLive, { recursive: true, force: true })
    console.log('[restore] saved current', destPath, '→', backupLive)
  }
  fs.cpSync(srcPath, destPath, { recursive: true, force: true })
  console.log('[restore] restored', srcPath, '→', destPath)
}

console.log('[restore] done from', stamp)
