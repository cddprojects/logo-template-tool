import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'

export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(path.join(dataDir, 'templates'), { recursive: true })

  const dbPath = path.join(dataDir, 'app.sqlite')
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
  return db
}

function seedAdmin(db) {
  const email = (process.env.ADMIN_EMAIL || 'admin@kitteasy.com').trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || 'changeme'
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) return

  const anyAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()
  if (anyAdmin) return

  const id = nanoid()
  const hash = bcrypt.hashSync(password, 12)
  db.prepare(
    'INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, email, hash, 'admin', new Date().toISOString())
  console.log(`[server] Seeded admin user: ${email}`)
}

export function templatesDir(dataDir, userId) {
  const dir = path.join(dataDir, 'templates', userId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function templateFilePath(dataDir, userId, templateId) {
  return path.join(templatesDir(dataDir, userId), `${templateId}.igtemplate`)
}
