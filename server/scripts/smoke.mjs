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

  const wsGet = await fetch('http://127.0.0.1:8799/api/workspace', {
    headers: { Cookie: cookie }
  })
  if (!wsGet.ok) throw new Error('workspace get failed: ' + (await wsGet.text()))
  const emptyWs = await wsGet.json()
  if (emptyWs.versions?.length) throw new Error('workspace should start empty')

  const sampleVersions = [
    {
      id: 'v_smoke_1',
      name: 'Smoke',
      description: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logos: [],
      favicons: []
    }
  ]
  const wsPut = await fetch('http://127.0.0.1:8799/api/workspace', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ versions: sampleVersions })
  })
  if (!wsPut.ok) throw new Error('workspace put failed: ' + (await wsPut.text()))

  const wsGet2 = await fetch('http://127.0.0.1:8799/api/workspace', {
    headers: { Cookie: cookie }
  })
  const savedWs = await wsGet2.json()
  if (savedWs.versions?.length !== 1 || savedWs.versions[0].id !== 'v_smoke_1') {
    throw new Error('workspace round-trip failed')
  }

  const wsClearDenied = await fetch('http://127.0.0.1:8799/api/workspace', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ versions: [] })
  })
  if (wsClearDenied.status !== 409) {
    throw new Error('empty workspace without allowEmpty should be 409')
  }

  const wsClear = await fetch('http://127.0.0.1:8799/api/workspace', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ versions: [], allowEmpty: true, history: null })
  })
  if (!wsClear.ok) throw new Error('empty workspace with allowEmpty failed: ' + (await wsClear.text()))

  const wsGetCleared = await fetch('http://127.0.0.1:8799/api/workspace', {
    headers: { Cookie: cookie }
  })
  const clearedWs = await wsGetCleared.json()
  if (clearedWs.versions?.length) {
    throw new Error('cleared workspace resurrected versions on GET')
  }

  // Asset externalization: upload a data-URL blob, then save a slim workspace ref.
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const crypto = await import('crypto')
  const pngBytes = Buffer.from(tinyPng.split(',')[1], 'base64')
  const assetHash = crypto.createHash('sha256').update(pngBytes).digest('hex')
  const assetPut = await fetch(`http://127.0.0.1:8799/api/workspace/assets/${assetHash}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ dataUrl: tinyPng })
  })
  if (!assetPut.ok) throw new Error('asset upload failed: ' + (await assetPut.text()))

  const withAsset = [
    {
      id: 'v_smoke_asset',
      name: 'AssetSmoke',
      description: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logos: [
        {
          id: 'logo1',
          label: 'Logo',
          config: {
            icon: {
              imageDataUrl: tinyPng
            }
          }
        }
      ],
      favicons: []
    }
  ]
  const wsPutAsset = await fetch('http://127.0.0.1:8799/api/workspace', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ versions: withAsset })
  })
  if (!wsPutAsset.ok) throw new Error('workspace asset put failed: ' + (await wsPutAsset.text()))

  const wsGetAsset = await fetch('http://127.0.0.1:8799/api/workspace', {
    headers: { Cookie: cookie }
  })
  const assetWs = await wsGetAsset.json()
  const restoredUrl = assetWs.versions?.[0]?.logos?.[0]?.config?.icon?.imageDataUrl
  if (restoredUrl !== tinyPng) {
    throw new Error('workspace asset rehydrate failed: ' + String(restoredUrl).slice(0, 80))
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
  const { user: member } = await user.json()

  const pw = await fetch(`http://127.0.0.1:8799/api/users/${member.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ password: 'newpass12' })
  })
  if (!pw.ok) throw new Error('password patch failed: ' + (await pw.text()))

  const del = await fetch(`http://127.0.0.1:8799/api/users/${member.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie }
  })
  if (!del.ok) throw new Error('delete user failed: ' + (await del.text()))

  const me2 = await fetch('http://127.0.0.1:8799/api/auth/me', { headers: { Cookie: cookie } })
  if (!me2.ok) throw new Error('session refresh failed')
  const refreshed = parseSetCookie(me2)
  if (!refreshed) throw new Error('session cookie not refreshed on /me')

  console.log('SMOKE OK')
  process.exitCode = 0
} catch (e) {
  console.error('SMOKE FAIL', e)
  process.exitCode = 1
} finally {
  child.kill('SIGTERM')
  setTimeout(() => process.exit(process.exitCode ?? 1), 200)
}
