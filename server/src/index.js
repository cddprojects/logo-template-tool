import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { openDb } from './db.js'
import { authRoutes } from './routes/auth.js'
import { usersRoutes } from './routes/users.js'
import { templatesRoutes } from './routes/templates.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../../data')
const port = Number(process.env.PORT || 8787)

const db = openDb(dataDir)
const app = express()

app.set('trust proxy', 1)
app.use(
  cors({
    origin: true,
    credentials: true
  })
)
app.use(express.json({ limit: '25mb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRoutes(db))
app.use('/api/users', usersRoutes(db))
app.use('/api/templates', templatesRoutes(db, dataDir))

app.use((err, _req, res, _next) => {
  console.error('[server]', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`[server] listening on :${port}`)
  console.log(`[server] data dir: ${dataDir}`)
})
