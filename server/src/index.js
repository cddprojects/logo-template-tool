import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { openDb, describeDataStore } from './db.js'
import { authRoutes } from './routes/auth.js'
import { usersRoutes } from './routes/users.js'
import { templatesRoutes } from './routes/templates.js'
import { workspaceRoutes } from './routes/workspace.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../../data')
// Coolify sets PORT=80 for the public container port; API stays on an internal port behind nginx.
const port = Number(process.env.API_PORT || 8787)

const db = openDb(dataDir)
const app = express()

app.set('trust proxy', 1)
app.use(
  cors({
    origin: true,
    credentials: true
  })
)
app.use(express.json({ limit: '50mb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => {
  const store = describeDataStore(dataDir)
  res.json({
    ok: true,
    dataDir: store.dataDir,
    persistent: {
      database: store.dbExists,
      users: store.userCount,
      templates: store.templateCount,
      templateFiles: store.templateFiles,
      bootMarker: store.bootMarker,
      adminPasswordResetApplied: store.adminPasswordResetApplied
    },
    warnings: store.warnings
  })
})

app.use('/api/auth', authRoutes(db))
app.use('/api/users', usersRoutes(db, dataDir))
app.use('/api/templates', templatesRoutes(db, dataDir))
app.use('/api/workspace', workspaceRoutes(db, dataDir))

app.use((err, _req, res, _next) => {
  console.error('[server]', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`[server] listening on :${port}`)
  console.log(`[server] data dir: ${dataDir}`)
})
