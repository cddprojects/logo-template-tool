import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dataDir = path.resolve(root, '../data-test-smoke')
fs.rmSync(dataDir, { recursive: true, force: true })

const env = {
  ...process.env,
  DATA_DIR: dataDir,
  API_PORT: '8799',
  JWT_SECRET: 'smoke-test-secret-key',
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'secret12',
  COOKIE_SECURE: 'false',
  NODE_ENV: 'development'
}

const child = spawn(process.execPath, ['src/index.js'], {
  cwd: root,
  env,
  stdio: ['ignore', 'pipe', 'pipe']
})

let ready = false
child.stdout.on('data', (b) => {
  const s = String(b)
  process.stdout.write(s)
  if (s.includes('listening')) ready = true
})
child.stderr.on('data', (b) => process.stderr.write(String(b)))

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    if (ready) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Server did not start')
}

function parseSetCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? []
  return raw.map((c) => c.split(';')[0]).join('; ')
}

try {
  await waitReady()
  const health = await fetch('http://127.0.0.1:8799/api/health')
  if (!health.ok) throw new Error('health failed')

  const login = await fetch('http://127.0.0.1:8799/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD })
  })
  if (!login.ok) throw new Error('login failed: ' + (await login.text()))
  const cookie = parseSetCookie(login)
  if (!cookie) throw new Error('no session cookie')

  const me = await fetch('http://127.0.0.1:8799/api/auth/me', {
    headers: { Cookie: cookie }
  })
  if (!me.ok) throw new Error('me failed')

  const created = await fetch('http://127.0.0.1:8799/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: 'Smoke',
      data: { name: 'Smoke', description: '', logos: [], favicons: [] }
    })
  })
  if (!created.ok) throw new Error('create template failed: ' + (await created.text()))
  const { template } = await created.json()

  const list = await fetch('http://127.0.0.1:8799/api/templates', {
    headers: { Cookie: cookie }
  })
  const listed = await list.json()
  if (!listed.templates?.some((t) => t.id === template.id)) {
    throw new Error('template missing from list')
  }

  const user = await fetch('http://127.0.0.1:8799/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      email: 'member@example.com',
      password: 'secret12',
      role: 'member'
    })
  })
  if (!user.ok) throw new Error('create user failed: ' + (await user.text()))

  console.log('SMOKE OK')
  process.exitCode = 0
} catch (e) {
  console.error('SMOKE FAIL', e)
  process.exitCode = 1
} finally {
  child.kill('SIGTERM')
  setTimeout(() => process.exit(process.exitCode ?? 1), 200)
}
