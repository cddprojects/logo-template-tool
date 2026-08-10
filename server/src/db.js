import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'

const BOOT_MARKER = '.boot-marker'
const RESET_MARKER = '.admin-password-reset-applied'

export function getDataPaths(dataDir) {
  const root = path.resolve(dataDir)
  return {
    root,
    dbPath: path.join(root, 'app.sqlite'),
    templatesDir: path.join(root, 'templates')
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function resolveAdminPassword(context) {
  const password = String(process.env.ADMIN_PASSWORD || '').trim()
  if (password.length >= 6) return password

  if (process.env.NODE_ENV === 'production') {
    console.error(
      `[server] ${context}: ADMIN_PASSWORD env is missing or too short (min 6). ` +
        'Refusing to use a default password in production.'
    )
    return null
  }

  return password || 'changeme'
}

function recordBoot(dataDir, dbExisted) {
  const markerPath = path.join(dataDir, BOOT_MARKER)
  const previous = readJsonFile(markerPath)
  const boot = {
    hostname: process.env.HOSTNAME || 'unknown',
    at: new Date().toISOString(),
    dbExistedAtBoot: dbExisted
  }

  if (!dbExisted) {
    console.warn(
      '[server] *** NEW DATABASE on this boot — all accounts start empty. ' +
        'If you see this after every redeploy, mount Coolify Persistent Storage at /data ' +
        '(and remove any anonymous /data volume from the Dockerfile). ***'
    )
  } else if (previous) {
    console.log('[server] Database persisted across container restart')
  }

  fs.writeFileSync(markerPath, JSON.stringify(boot))
}

export function describeDataStore(dataDir) {
  const { root, dbPath, templatesDir } = getDataPaths(dataDir)
  const dbExists = fs.existsSync(dbPath)
  let userCount = 0
  let templateCount = 0
  if (dbExists) {
    try {
      const db = new Database(dbPath, { readonly: true, fileMustExist: true })
      userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
      templateCount = db.prepare('SELECT COUNT(*) AS n FROM templates').get().n
      db.close()
    } catch {
      // ignore — openDb will surface errors on startup
    }
  }
  let templateFiles = 0
  try {
    if (fs.existsSync(templatesDir)) {
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) walk(full)
          else if (entry.name.endsWith('.igtemplate')) templateFiles++
        }
      }
      walk(templatesDir)
    }
  } catch {
    // ignore
  }

  const bootMarker = readJsonFile(path.join(root, BOOT_MARKER))
  const warnings = []
  if (!dbExists) {
    warnings.push('No database file yet — first login will create an empty database.')
  }
  if (process.env.ADMIN_PASSWORD_RESET === 'true') {
    warnings.push(
      'ADMIN_PASSWORD_RESET is enabled — remove it after one successful deploy or password will keep resetting.'
    )
  }
  if (process.env.NODE_ENV === 'production' && !String(process.env.ADMIN_PASSWORD || '').trim()) {
    warnings.push('ADMIN_PASSWORD env is not set — admin seed/reset will be skipped in production.')
  }

  return {
    dataDir: root,
    dbPath,
    templatesDir,
    dbExists,
    userCount,
    templateCount,
    templateFiles,
    bootMarker,
    adminPasswordResetApplied: fs.existsSync(path.join(root, RESET_MARKER)),
    warnings
  }
}

export function openDb(dataDir) {
  const { root, dbPath, templatesDir } = getDataPaths(dataDir)
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(templatesDir, { recursive: true })

  const existed = fs.existsSync(dbPath)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('member', 'admin')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
  `)

  console.log(
    `[server] ADMIN_PASSWORD env: ${String(process.env.ADMIN_PASSWORD || '').trim() ? 'set' : 'MISSING'}`
  )
  seedAdmin(db, root)
  recordBoot(root, existed)

  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
  const templates = db.prepare('SELECT COUNT(*) AS n FROM templates').get().n
  console.log(
    `[server] database ${existed ? 'opened' : 'created'}: ${dbPath} (${users} users, ${templates} templates)`
  )

  return db
}

function seedAdmin(db, dataDir) {
  const email = (process.env.ADMIN_EMAIL || 'admin@kitteasy.com').trim().toLowerCase()
  const forceReset = process.env.ADMIN_PASSWORD_RESET === 'true'
  const resetMarkerPath = path.join(dataDir, RESET_MARKER)

  const existing = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email)
  if (existing) {
    if (forceReset) {
      if (fs.existsSync(resetMarkerPath)) {
        console.warn(
          '[server] ADMIN_PASSWORD_RESET skipped — already applied once. ' +
            'Remove ADMIN_PASSWORD_RESET from env. Delete /data/.admin-password-reset-applied only if you must force again.'
        )
        return
      }
      const password = resolveAdminPassword('ADMIN_PASSWORD_RESET')
      if (!password) return
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        bcrypt.hashSync(password, 12),
        existing.id
      )
      fs.writeFileSync(resetMarkerPath, new Date().toISOString())
      console.log(`[server] Reset admin password for ${email} (one-time ADMIN_PASSWORD_RESET)`)
    }
    return
  }

  const anyAdmin = db
    .prepare("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1")
    .get()
  if (anyAdmin) {
    console.warn(
      `[server] Admin account already exists (${anyAdmin.email}). ` +
        'ADMIN_EMAIL/ADMIN_PASSWORD env vars only apply on a fresh database. ' +
        'To apply ADMIN_PASSWORD to that email, set ADMIN_PASSWORD_RESET=true for one deploy, then remove it.'
    )
    return
  }

  const password = resolveAdminPassword('Admin seed')
  if (!password) return

  const id = nanoid()
  const hash = bcrypt.hashSync(password, 12)
  db.prepare(
    'INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, email, hash, 'admin', new Date().toISOString())
  console.log(`[server] Seeded admin user: ${email}`)
}

export function templatesDir(dataDir, userId) {
  const dir = path.join(getDataPaths(dataDir).templatesDir, userId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function templateFilePath(dataDir, userId, templateId) {
  return path.join(templatesDir(dataDir, userId), `${templateId}.igtemplate`)
}
