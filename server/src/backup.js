import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { getDataPaths } from './db.js'

const BACKUPS_DIR = 'backups'
const COMPLETE_MARKER = '.complete'

export function getBackupConfig() {
  return {
    enabled: process.env.BACKUP_ENABLED !== 'false',
    /** 0 = Sunday … 1 = Monday (default) */
    weekday: Number(process.env.BACKUP_WEEKDAY ?? 1),
    hourUtc: Number(process.env.BACKUP_HOUR_UTC ?? 3),
    retainWeeks: Number(process.env.BACKUP_RETAIN_WEEKS ?? 12)
  }
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function countFiles(dir, suffix = '') {
  if (!fs.existsSync(dir)) return 0
  let n = 0
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (!suffix || entry.name.endsWith(suffix)) n++
    }
  }
  walk(dir)
  return n
}

function copyDirIfExists(src, dest) {
  if (!fs.existsSync(src)) {
    fs.mkdirSync(dest, { recursive: true })
    return
  }
  fs.cpSync(src, dest, { recursive: true, force: true })
}

function sqliteBackup(sourceDb, destPath) {
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
  const backup = sourceDb.backup(destPath)
  backup.step(-1)
}

function pruneOldBackups(dataRoot, retainWeeks) {
  const backupsRoot = path.join(dataRoot, BACKUPS_DIR)
  if (!fs.existsSync(backupsRoot)) return
  const dirs = fs
    .readdirSync(backupsRoot)
    .filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n))
    .sort()
  while (dirs.length > retainWeeks) {
    const old = dirs.shift()
    fs.rmSync(path.join(backupsRoot, old), { recursive: true, force: true })
    console.log('[backup] pruned old backup', old)
  }
}

/**
 * @param {string} dataDir
 * @param {import('better-sqlite3').Database | null} liveDb open app db (preferred when API is running)
 */
export function runDataBackup(dataDir, liveDb = null) {
  const { root, dbPath, templatesDir, workspaceDir } = getDataPaths(dataDir)
  const stamp = todayStamp()
  const destDir = path.join(root, BACKUPS_DIR, stamp)
  const completeFile = path.join(destDir, COMPLETE_MARKER)

  if (fs.existsSync(completeFile)) {
    console.log('[backup] skip — already completed for', stamp)
    return { ok: true, skipped: true, destDir, stamp }
  }

  fs.mkdirSync(destDir, { recursive: true })
  const backupDbPath = path.join(destDir, 'app.sqlite')

  if (liveDb) {
    sqliteBackup(liveDb, backupDbPath)
  } else if (fs.existsSync(dbPath)) {
    const readonly = new Database(dbPath, { readonly: true, fileMustExist: true })
    try {
      sqliteBackup(readonly, backupDbPath)
    } finally {
      readonly.close()
    }
  }

  copyDirIfExists(workspaceDir, path.join(destDir, 'workspace'))
  copyDirIfExists(templatesDir, path.join(destDir, 'templates'))

  const manifest = {
    stamp,
    createdAt: new Date().toISOString(),
    dbBytes: fs.existsSync(backupDbPath) ? fs.statSync(backupDbPath).size : 0,
    workspaceFiles: countFiles(path.join(destDir, 'workspace'), '.json'),
    templateFiles: countFiles(path.join(destDir, 'templates'), '.igtemplate')
  }
  fs.writeFileSync(path.join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(completeFile, stamp)

  pruneOldBackups(root, getBackupConfig().retainWeeks)

  console.log('[backup] saved', destDir, `(workspace ${manifest.workspaceFiles}, templates ${manifest.templateFiles})`)
  return { ok: true, skipped: false, destDir, stamp, manifest }
}

export function listBackups(dataDir) {
  const backupsRoot = path.join(getDataPaths(dataDir).root, BACKUPS_DIR)
  if (!fs.existsSync(backupsRoot)) return []
  return fs
    .readdirSync(backupsRoot)
    .filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n))
    .sort()
    .reverse()
    .map((stamp) => {
      const dir = path.join(backupsRoot, stamp)
      return {
        stamp,
        dir,
        manifest: readJson(path.join(dir, 'manifest.json')),
        complete: fs.existsSync(path.join(dir, COMPLETE_MARKER))
      }
    })
}

export function startWeeklyBackupScheduler(dataDir, liveDb) {
  const cfg = getBackupConfig()
  if (!cfg.enabled) {
    console.log('[backup] weekly scheduler disabled (BACKUP_ENABLED=false)')
    return
  }

  console.log(
    `[backup] weekly scheduler: weekday=${cfg.weekday} hour_utc=${cfg.hourUtc} retain=${cfg.retainWeeks} week(s)`
  )

  const tick = () => {
    const now = new Date()
    if (now.getUTCDay() !== cfg.weekday) return
    if (now.getUTCHours() !== cfg.hourUtc) return
    try {
      runDataBackup(dataDir, liveDb)
    } catch (e) {
      console.error('[backup] scheduled run failed', e)
    }
  }

  setInterval(tick, 60 * 60 * 1000)
  setTimeout(tick, 30_000)
}
