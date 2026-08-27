#!/usr/bin/env node
/**
 * Full data backup: SQLite + workspace JSON + template files.
 *
 * Backups are stored on the persistent volume:
 *   /data/backups/YYYY-MM-DD/
 *
 * Run inside the production container:
 *   node /app/server/scripts/backup-data.mjs
 *   DATA_DIR=/data node server/scripts/backup-data.mjs
 *
 * Restore (stop the app first, then):
 *   node /app/server/scripts/restore-backup.mjs 2026-08-25
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { runDataBackup, listBackups } from '../src/backup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../../data')

const result = runDataBackup(dataDir, null)
if (result.skipped) {
  console.log('[backup-data] nothing to do')
} else {
  console.log('[backup-data] done', result.destDir)
}

const recent = listBackups(dataDir).slice(0, 5)
if (recent.length) {
  console.log('[backup-data] recent backups:')
  for (const b of recent) {
    console.log(' ', b.stamp, b.manifest?.createdAt ?? '(no manifest)', b.complete ? 'ok' : 'incomplete')
  }
}
