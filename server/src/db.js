import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'

export function getDataPaths(dataDir) {
  const root = path.resolve(dataDir)
  return {
    root,
    dbPath: path.join(root, 'app.sqlite'),
    templatesDir: path.join(root, 'templates')
  }
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
  return {
    dataDir: root,
    dbPath,
    templatesDir,
    dbExists,
    userCount,
    templateCount,
    templateFiles
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

  seedAdmin(db)

  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
  const templates = db.prepare('SELECT COUNT(*) AS n FROM templates').get().n
  console.log(
    `[server] database ${existed ? 'opened' : 'created'}: ${dbPath} (${users} users, ${templates} templates)`
  )

  return db
}

function seedAdmin(db) {
  const email = (process.env.ADMIN_EMAIL || 'admin@kitteasy.com').trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || 'changeme'
  const forceReset = process.env.ADMIN_PASSWORD_RESET === 'true'

  const existing = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email)
  if (existing) {
    if (forceReset) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        bcrypt.hashSync(password, 12),
        existing.id
      )
      console.log(`[server] Reset admin password for ${email} (ADMIN_PASSWORD_RESET=true)`)
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
