import { app, shell, BrowserWindow, ipcMain, dialog, session, clipboard, nativeImage } from 'electron'
import { join, dirname, basename } from 'path'
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, watch, copyFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { get as httpsGet, request as httpsRequest, type IncomingMessage } from 'https'
import { createServer, type IncomingMessage as HttpMsg, type ServerResponse } from 'http'

// ── Data directory ────────────────────────────────────────────────────────────
// Dev  : <project>/data/
// Prod : %APPDATA%\Image Generator\data\  (userData — lives in Windows AppData,
//         completely outside dist-app so it survives every rebuild / reinstall)
const dataDir = app.isPackaged
  ? join(app.getPath('userData'), 'data')
  : join(app.getAppPath(), 'data')

// ── One-time migration from the OLD packaged data location ────────────────────
// Previous builds stored data next to the exe (dist-app\win-unpacked\data\).
// On first run with the new path we copy any files found there to the new home.
function migrateOldPackagedData(): void {
  if (!app.isPackaged) return
  const oldDir = join(dirname(app.getPath('exe')), 'data')
  if (oldDir === dataDir) return  // same location — nothing to do
  if (!existsSync(oldDir)) return
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
    const oldVersions = join(oldDir, 'versions.json')
    const newVersions = join(dataDir, 'versions.json')
    if (existsSync(oldVersions) && !existsSync(newVersions)) {
      copyFileSync(oldVersions, newVersions)
    }
    const oldTemplatesDir = join(oldDir, 'templates')
    const newTemplatesDir = join(dataDir, 'templates')
    if (existsSync(oldTemplatesDir)) {
      if (!existsSync(newTemplatesDir)) mkdirSync(newTemplatesDir, { recursive: true })
      readdirSync(oldTemplatesDir).forEach((f) => {
        const src = join(oldTemplatesDir, f)
        const dst = join(newTemplatesDir, f)
        if (!existsSync(dst)) try { copyFileSync(src, dst) } catch {}
      })
    }
  } catch { /* migration is best-effort */ }
}

const versionsFile = join(dataDir, 'versions.json')
const undoHistoryFile = join(dataDir, 'undo-history.json')
const templatesDir = join(dataDir, 'templates')
const registryFile = join(dataDir, '.template-registry.json')

function ensureDataDir(): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(templatesDir)) mkdirSync(templatesDir, { recursive: true })
}

// ── Template registry ─────────────────────────────────────────────────────────
// Tracks which .igtemplate filenames have already been imported so we don't
// create duplicate versions if the app restarts.
function getRegistry(): Set<string> {
  try {
    const raw = readFileSync(registryFile, 'utf-8')
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

function saveRegistry(reg: Set<string>): void {
  try { writeFileSync(registryFile, JSON.stringify([...reg], null, 2), 'utf-8') } catch {}
}

// ── Template import logic ─────────────────────────────────────────────────────
function tryImportTemplate(filePath: string): void {
  const filename = basename(filePath)
  if (!filename.endsWith('.igtemplate')) return

  const reg = getRegistry()
  if (reg.has(filename)) return // already imported

  let tmpl: Record<string, unknown>
  try {
    const raw = readFileSync(filePath, 'utf-8')
    tmpl = JSON.parse(raw)
  } catch { return }

  // Build a fresh Version from the template data
  const now = new Date().toISOString()
  const version = {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: (tmpl.name as string) || filename.replace('.igtemplate', ''),
    description: (tmpl.description as string) || '',
    createdAt: now,
    updatedAt: now,
    logos: (tmpl.logos as unknown[]) ?? [],
    favicons: (tmpl.favicons as unknown[]) ?? []
  }

  // Mark as imported before notifying so a restart won't re-import
  reg.add(filename)
  saveRegistry(reg)

  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    // Renderer is open — notify it. The renderer will call saveVersions() immediately
    // (cancelling any stale pending save) so the template is never lost.
    windows.forEach((win) => win.webContents.send('template-imported', version))
  } else {
    // No renderer window — write directly to disk as fallback
    try {
      let existing: unknown[] = []
      try { existing = JSON.parse(readFileSync(versionsFile, 'utf-8')) } catch {}
      existing.push(version)
      writeFileSync(versionsFile, JSON.stringify(existing, null, 2), 'utf-8')
    } catch {}
  }
}

// ── Scan templates folder on startup + watch for new files ────────────────────
function initTemplates(): void {
  ensureDataDir()

  // Import any existing un-imported templates
  try {
    readdirSync(templatesDir)
      .filter((f) => f.endsWith('.igtemplate'))
      .forEach((f) => tryImportTemplate(join(templatesDir, f)))
  } catch {}

  // Watch for new files dropped into the folder
  watch(templatesDir, (eventType, filename) => {
    if (eventType === 'rename' && filename && filename.endsWith('.igtemplate')) {
      const filePath = join(templatesDir, filename)
      // Small delay to let the file finish writing before reading
      setTimeout(() => { if (existsSync(filePath)) tryImportTemplate(filePath) }, 300)
    }
  })
}

// ── REST API server ────────────────────────────────────────────────────────────
// Runs locally at http://127.0.0.1:3847 so external tools (scripts, CI, etc.)
// can read and update version text without opening the GUI.
const API_PORT = 3847

type VersionRecord = Record<string, unknown>

function readVersionsFromFile(): VersionRecord[] {
  try {
    if (!existsSync(versionsFile)) return []
    return JSON.parse(readFileSync(versionsFile, 'utf-8')) as VersionRecord[]
  } catch { return [] }
}

function writeVersionsToFile(data: VersionRecord[]): void {
  ensureDataDir()
  writeFileSync(versionsFile, JSON.stringify(data, null, 2), 'utf-8')
  // Push live update to the renderer so the UI reflects the change immediately
  BrowserWindow.getAllWindows().forEach((win) =>
    win.webContents.send('versions-reloaded', data)
  )
}

/** Find a version by exact id or case-insensitive name. Returns [index, version]. */
function findVersionEntry(
  versions: VersionRecord[],
  idOrName: string
): [number, VersionRecord] | null {
  const lower = idOrName.toLowerCase()
  const idx = versions.findIndex(
    (v) => v.id === idOrName || String(v.name ?? '').toLowerCase() === lower
  )
  return idx === -1 ? null : [idx, versions[idx]]
}

/**
 * Apply text-only patches to a version in-place.
 * Body fields:
 *   faviconText    – sets content.text on favicon variants
 *   logoTitle      – sets text on logo variants
 *   logoSubtitle   – sets secondaryText on logo variants
 *   variantLabel   – (optional) restrict to this variant label, e.g. "Dark"
 */
function applyTextPatch(version: VersionRecord, body: Record<string, unknown>): void {
  const { faviconText, logoTitle, logoSubtitle, variantLabel } = body
  const matchLabel = (label: unknown) =>
    !variantLabel || String(label ?? '').toLowerCase() === String(variantLabel).toLowerCase()

  if (faviconText !== undefined) {
    const favicons = (version.favicons as VersionRecord[]) ?? []
    for (const fav of favicons) {
      if (!matchLabel(fav.label)) continue
      const content = (fav.config as VersionRecord)?.content as VersionRecord
      if (content) content.text = faviconText
    }
  }

  if (logoTitle !== undefined || logoSubtitle !== undefined) {
    const logos = (version.logos as VersionRecord[]) ?? []
    for (const logo of logos) {
      if (!matchLabel(logo.label)) continue
      const cfg = logo.config as VersionRecord
      if (!cfg) continue
      if (logoTitle !== undefined) cfg.text = logoTitle
      if (logoSubtitle !== undefined) cfg.secondaryText = logoSubtitle
    }
  }

  version.updatedAt = new Date().toISOString()
}

function parseJsonBody(req: HttpMsg): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(raw)) } catch { resolve({}) }
    })
  })
}

function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data, null, 2)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(body)
}

// ── Render-request bridge ─────────────────────────────────────────────────────
// The API server (main process) asks the renderer to draw to a Canvas, then the
// renderer sends back the base64 result. Keyed by a random requestId.
type RenderResult = { success: boolean; data?: string; mimeType?: string; error?: string }

const pendingRenders = new Map<string, {
  resolve: (r: RenderResult) => void
  timer: ReturnType<typeof setTimeout>
}>()

ipcMain.on('api-render-response', (_, payload: RenderResult & { requestId: string }) => {
  const pending = pendingRenders.get(payload.requestId)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingRenders.delete(payload.requestId)
  pending.resolve(payload)
})

function requestRender(
  type: 'favicon' | 'logo',
  config: unknown,
  options: { format?: string; resolution?: number; scale?: number }
): Promise<RenderResult> {
  return new Promise((resolve) => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) {
      resolve({ success: false, error: 'The app window must be open to export images' })
      return
    }
    const requestId = `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const timer = setTimeout(() => {
      pendingRenders.delete(requestId)
      resolve({ success: false, error: 'Render timed out (30s)' })
    }, 30_000)
    pendingRenders.set(requestId, { resolve, timer })
    windows[0].webContents.send('api-render-request', { requestId, type, config, options })
  })
}

/** Pick a variant from an array by label (case-insensitive). Falls back to index 0. */
function pickVariant(variants: VersionRecord[], variantLabel?: string): VersionRecord | undefined {
  if (!variants.length) return undefined
  if (!variantLabel) return variants[0]
  const lower = variantLabel.toLowerCase()
  return variants.find((v) => String(v.label ?? '').toLowerCase() === lower) ?? variants[0]
}

function startApiServer(): void {
  const server = createServer(async (req: HttpMsg, res: ServerResponse) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PATCH, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      })
      res.end()
      return
    }

    const url = (req.url ?? '/').split('?')[0]
    const parts = url.split('/').filter(Boolean) // e.g. ['versions', 'my-app', 'favicon', 'export']

    // ── GET / — API info ────────────────────────────────────────────────────────
    if (req.method === 'GET' && parts.length === 0) {
      return json(res, 200, {
        name: 'Image Generator Tool API',
        version: '1.0.0',
        port: API_PORT,
        endpoints: [
          { method: 'GET',   path: '/versions',                           description: 'List all versions' },
          { method: 'GET',   path: '/versions/:idOrName',                 description: 'Get a version by id or name' },
          { method: 'PATCH', path: '/versions/:idOrName',                 description: 'Update text fields of a version' },
          { method: 'POST',  path: '/versions/:idOrName/favicon/export',  description: 'Export a favicon as PNG / SVG / ICO (app must be open)' },
          { method: 'POST',  path: '/versions/:idOrName/logo/export',     description: 'Export a logo as PNG / SVG (app must be open)' }
        ],
        patchFields: {
          faviconText:   'string  — sets favicon inner content text',
          logoTitle:     'string  — sets logo primary title',
          logoSubtitle:  'string  — sets logo subtitle',
          variantLabel:  'string? — restrict to this variant (e.g. "Dark", "Light"); omit = update all'
        },
        faviconExportFields: {
          variantLabel: 'string? — which variant to export; omit = first variant',
          format:       '"png" | "svg" | "ico" — default: "png"',
          resolution:   'number  — PNG pixel size (16 | 32 | 48 | 64 | 128 | 256 | 512); default: 256'
        },
        logoExportFields: {
          variantLabel: 'string? — which variant to export; omit = first variant',
          format:       '"png" | "svg" — default: "png"',
          scale:        'number  — render scale multiplier (1 | 2 | 3 | 4); default: 2'
        }
      })
    }

    // ── GET /versions ───────────────────────────────────────────────────────────
    if (req.method === 'GET' && parts[0] === 'versions' && parts.length === 1) {
      const versions = readVersionsFromFile()
      return json(res, 200, versions.map((v) => ({
        id: v.id,
        name: v.name,
        description: v.description,
        updatedAt: v.updatedAt,
        logoVariants:    (v.logos    as VersionRecord[] ?? []).map((l) => l.label),
        faviconVariants: (v.favicons as VersionRecord[] ?? []).map((f) => f.label)
      })))
    }

    // ── GET /versions/:idOrName ─────────────────────────────────────────────────
    if (req.method === 'GET' && parts[0] === 'versions' && parts.length === 2) {
      const versions = readVersionsFromFile()
      const found = findVersionEntry(versions, decodeURIComponent(parts[1]))
      if (!found) return json(res, 404, { error: 'Version not found' })
      return json(res, 200, found[1])
    }

    // ── PATCH /versions/:idOrName ───────────────────────────────────────────────
    if (req.method === 'PATCH' && parts[0] === 'versions' && parts.length === 2) {
      const body = await parseJsonBody(req)
      const versions = readVersionsFromFile()
      const found = findVersionEntry(versions, decodeURIComponent(parts[1]))
      if (!found) return json(res, 404, { error: 'Version not found' })
      const [idx, version] = found
      applyTextPatch(version, body)
      versions[idx] = version
      writeVersionsToFile(versions)
      return json(res, 200, {
        success: true,
        updatedAt: version.updatedAt,
        version: {
          id: version.id,
          name: version.name,
          logoVariants: (version.logos as VersionRecord[] ?? []).map((l) => ({
            label: l.label,
            title: (l.config as VersionRecord)?.text,
            subtitle: (l.config as VersionRecord)?.secondaryText
          })),
          faviconVariants: (version.favicons as VersionRecord[] ?? []).map((f) => ({
            label: f.label,
            text: ((f.config as VersionRecord)?.content as VersionRecord)?.text
          }))
        }
      })
    }

    // ── POST /versions/:idOrName/favicon/export ─────────────────────────────────
    if (req.method === 'POST' && parts[0] === 'versions' && parts.length === 4
        && parts[2] === 'favicon' && parts[3] === 'export') {
      const body = await parseJsonBody(req)
      const { variantLabel, format = 'png', resolution = 256 } = body as {
        variantLabel?: string; format?: string; resolution?: number
      }

      const versions = readVersionsFromFile()
      const found = findVersionEntry(versions, decodeURIComponent(parts[1]))
      if (!found) return json(res, 404, { error: 'Version not found' })

      const variant = pickVariant(found[1].favicons as VersionRecord[] ?? [], variantLabel)
      if (!variant) return json(res, 400, { error: 'No favicon variants in this version' })

      const result = await requestRender('favicon', variant.config, {
        format: String(format).toLowerCase(),
        resolution: Math.min(Math.max(Number(resolution) || 256, 8), 1024)
      })
      if (!result.success) return json(res, 500, { error: result.error })

      const base = String(found[1].name ?? 'export').toLowerCase().replace(/[^a-z0-9._-]/g, '-')
      const vSuffix = variantLabel ? `-${String(variantLabel).toLowerCase()}` : ''
      const fmt = String(format).toLowerCase()
      const filename = fmt === 'svg'
        ? `${base}-favicon${vSuffix}.svg`
        : fmt === 'ico'
          ? `${base}-favicon${vSuffix}.ico`
          : `${base}-favicon-${resolution}${vSuffix}.png`

      // For ICO the renderer sends PNG data URLs; convert them here with png-to-ico
      if (fmt === 'ico' && result.mimeType === 'image/x-icon-raw') {
        try {
          const pngToIco = (await import('png-to-ico')).default
          const dataUrls: string[] = JSON.parse(result.data ?? '[]')
          const buffers = dataUrls.map((u) => Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'))
          const icoBuffer = await pngToIco(buffers)
          return json(res, 200, {
            success: true, filename, mimeType: 'image/x-icon',
            data: icoBuffer.toString('base64')
          })
        } catch (err) {
          return json(res, 500, { error: `ICO conversion failed: ${err}` })
        }
      }

      return json(res, 200, { success: true, filename, mimeType: result.mimeType, data: result.data })
    }

    // ── POST /versions/:idOrName/logo/export ────────────────────────────────────
    if (req.method === 'POST' && parts[0] === 'versions' && parts.length === 4
        && parts[2] === 'logo' && parts[3] === 'export') {
      const body = await parseJsonBody(req)
      const { variantLabel, format = 'png', scale = 2 } = body as {
        variantLabel?: string; format?: string; scale?: number
      }

      const versions = readVersionsFromFile()
      const found = findVersionEntry(versions, decodeURIComponent(parts[1]))
      if (!found) return json(res, 404, { error: 'Version not found' })

      const variant = pickVariant(found[1].logos as VersionRecord[] ?? [], variantLabel)
      if (!variant) return json(res, 400, { error: 'No logo variants in this version' })

      const result = await requestRender('logo', variant.config, {
        format: String(format).toLowerCase(),
        scale: Math.min(Math.max(Number(scale) || 2, 1), 4)
      })
      if (!result.success) return json(res, 500, { error: result.error })

      const base = String(found[1].name ?? 'export').toLowerCase().replace(/[^a-z0-9._-]/g, '-')
      const vSuffix = variantLabel ? `-${String(variantLabel).toLowerCase()}` : ''
      const fmt = String(format).toLowerCase()
      const filename = fmt === 'svg'
        ? `${base}-logo${vSuffix}.svg`
        : `${base}-logo${vSuffix}.png`

      return json(res, 200, { success: true, filename, mimeType: result.mimeType, data: result.data })
    }

    return json(res, 404, { error: 'Not found' })
  })

  server.listen(API_PORT, '127.0.0.1', () => {
    console.log(`[API] REST server → http://127.0.0.1:${API_PORT}`)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[API] Port ${API_PORT} already in use — API server not started`)
    } else {
      console.error('[API] Server error:', err)
    }
  })
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: true,
    backgroundColor: '#0d0d10',
    // frame: false + titleBarStyle: 'hidden' → custom title bar with native
    // CSS drag regions (-webkit-app-region: drag).  Both are required on Windows:
    // titleBarStyle: 'hidden' tells Electron to intercept WM_NCHITTEST for drag.
    // NOTE: This requires Electron ≥ 36.5.0 — earlier versions have a bug where
    // -webkit-app-region is silently ignored (github.com/electron/electron/issues/43371).
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      devTools: true
    }
  })

  // Notify the renderer so the maximize/restore button icon stays in sync.
  mainWindow.on('maximize',   () => mainWindow.webContents.send('window-maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false))

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  // Allow renderer to make cross-origin requests (needed for @imgly/background-removal
  // model fetches from CDN) and enable SharedArrayBuffer for WASM threading.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['credentialless'],
        'Access-Control-Allow-Origin': ['*'],
      }
    })
  })

  // Show the window immediately — user sees the dark shell at once.
  migrateOldPackagedData()
  createWindow()

  // Defer non-critical startup work until after the window is visible.
  setImmediate(() => {
    initTemplates()
    startApiServer()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// IPC: Export PNG or SVG
ipcMain.handle(
  'export-file',
  async (_, dataOrText: string, filename: string, format: 'png' | 'svg') => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: `Save ${format.toUpperCase()} File`,
      defaultPath: filename,
      filters: [
        {
          name: format === 'png' ? 'PNG Image' : 'SVG Vector',
          extensions: [format]
        }
      ]
    })

    if (canceled || !filePath) return { success: false }

    try {
      if (format === 'png') {
        const base64 = dataOrText.replace(/^data:image\/png;base64,/, '')
        writeFileSync(filePath, Buffer.from(base64, 'base64'))
      } else {
        writeFileSync(filePath, dataOrText, 'utf-8')
      }
      return { success: true, filePath }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }
)

// IPC: Export ICO (favicon multi-size)
ipcMain.handle('export-ico', async (_, pngDataUrls: string[], filename: string) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save ICO File',
    defaultPath: filename,
    filters: [{ name: 'Icon File', extensions: ['ico'] }]
  })

  if (canceled || !filePath) return { success: false }

  try {
    const pngToIco = (await import('png-to-ico')).default
    const buffers = pngDataUrls.map((url) => {
      const base64 = url.replace(/^data:image\/png;base64,/, '')
      return Buffer.from(base64, 'base64')
    })
    const icoBuffer = await pngToIco(buffers)
    writeFileSync(filePath, icoBuffer)
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// IPC: Group Export — render all variant PNGs and save into one folder
ipcMain.handle(
  'export-group',
  async (_, files: { filename: string; dataUrl: string }[], folderName?: string) => {
    const safeName = (folderName ?? 'my-assets').replace(/[\\/:*?"<>|]/g, '-').trim() || 'my-assets'
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export Group — Choose folder name',
      defaultPath: safeName,
      buttonLabel: 'Export to Folder',
    })
    if (canceled || !filePath) return { success: false }

    try {
      mkdirSync(filePath, { recursive: true })
      for (const { filename, dataUrl } of files) {
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
        writeFileSync(join(filePath, filename), Buffer.from(base64, 'base64'))
      }
      return { success: true, folderPath: filePath }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }
)

// IPC: Fetch font CSS + download font files via main process.
// Returns entries with base64 data: URLs so the renderer never has to hit gstatic.
type FontEntry = { url: string; weight: string; style: string }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

/** Node https.get with redirect following and timeout. Returns {status, body}. */
function nodeGet(url: string, timeoutMs = 15_000): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const attempt = (target: string, hops: number) => {
      const req = httpsGet(target, { headers: { 'User-Agent': UA } }, (res: IncomingMessage) => {
        const loc = res.headers.location
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && loc && hops > 0) {
          res.resume(); attempt(loc, hops - 1); return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }))
        res.on('error', reject)
      })
      req.on('error', reject)
      req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Request timed out')) })
    }
    attempt(url, 3)
  })
}

ipcMain.handle('fetch-google-font', async (_, familyName: string, customCssUrl?: string) => {
  const encoded = familyName.trim().replace(/\s+/g, '+')
  // v1 CSS API — weight format "400,700" works for every Google Font
  const cssUrl = customCssUrl ?? `https://fonts.googleapis.com/css?family=${encoded}:400,700&display=swap`
  console.log('[font] CSS URL:', cssUrl)
  try {
    // 1. Fetch the CSS
    const { status: cs, body: cb } = await nodeGet(cssUrl)
    if (cs !== 200) return { ok: false, error: `CSS HTTP ${cs}` }
    const css = cb.toString('utf-8')
    console.log('[font] CSS:', css.length, 'chars')

    // 2. Parse @font-face blocks
    const srcEntries: FontEntry[] = []
    const rx = /@font-face\s*\{([^}]+)\}/g
    let m: RegExpExecArray | null
    while ((m = rx.exec(css)) !== null) {
      const block = m[1]
      const urlM = block.match(/url\(([^)]+)\)/)
      const wgtM = block.match(/font-weight:\s*([^;]+?)\s*;/)
      const styM = block.match(/font-style:\s*([^;]+?)\s*;/)
      if (urlM) srcEntries.push({
        url:    urlM[1].replace(/['"]/g, ''),
        weight: (wgtM?.[1] ?? '400').trim(),
        style:  (styM?.[1] ?? 'normal').trim()
      })
    }
    console.log('[font]', srcEntries.length, 'faces:', srcEntries.map(e => e.weight).join(', '))
    if (srcEntries.length === 0) return { ok: false, error: `No @font-face found. CSS (${css.length}ch): ${css.slice(0, 300)}` }

    // 3. Download font files → base64 data: URLs
    const results = await Promise.allSettled(
      srcEntries.map(async ({ url, weight, style }) => {
        const { status: fs, body: fb } = await nodeGet(url)
        if (fs !== 200) throw new Error(`Font HTTP ${fs}`)
        const ext = (url.split('?')[0].split('.').pop() ?? 'woff2').toLowerCase()
        const mime = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : 'font/ttf'
        const b64 = fb.toString('base64')
        console.log(`[font] ${weight}/${style}: ${Math.round(b64.length / 1024)}KB`)
        return { url: `data:${mime};base64,${b64}`, weight, style }
      })
    )

    const entries = results
      .filter((r): r is PromiseFulfilledResult<FontEntry> => r.status === 'fulfilled')
      .map(r => r.value)
    const errs = results.filter(r => r.status === 'rejected').map(r => (r as PromiseRejectedResult).reason?.message ?? String(r))
    if (errs.length) console.log('[font] failed:', errs)

    return entries.length > 0
      ? { ok: true, entries }
      : { ok: false, error: `All downloads failed: ${errs.join('; ')}` }
  } catch (err) {
    console.log('[font] error:', err)
    return { ok: false, error: String(err) }
  }
})

// IPC: Window controls
ipcMain.on('window-minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
ipcMain.on('window-maximize', () => {
  const win = BrowserWindow.getFocusedWindow()
  win?.isMaximized() ? win.unmaximize() : win?.maximize()
})
ipcMain.on('window-close', () => BrowserWindow.getFocusedWindow()?.close())


// IPC: Export a version as a .igtemplate file into data/templates/
ipcMain.handle('export-template', (_, version: Record<string, unknown>) => {
  try {
    ensureDataDir()
    const name = String(version.name ?? 'template').replace(/[^a-z0-9_\-. ]/gi, '-')
    const filename = `${name}.igtemplate`
    const filePath = join(templatesDir, filename)
    const tmpl = {
      schemaVersion: 1,
      name: version.name,
      description: version.description,
      logos: version.logos,
      favicons: version.favicons
    }
    writeFileSync(filePath, JSON.stringify(tmpl, null, 2), 'utf-8')
    // Register it immediately so re-importing the same file is a no-op
    const reg = getRegistry()
    reg.add(filename)
    saveRegistry(reg)
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// IPC: Open the templates folder in the system file explorer
ipcMain.handle('open-templates-folder', () => {
  ensureDataDir()
  shell.openPath(templatesDir)
  return { success: true, path: templatesDir }
})

// IPC: Load versions from file
ipcMain.handle('load-versions', () => {
  try {
    ensureDataDir()
    if (!existsSync(versionsFile)) return []
    const raw = readFileSync(versionsFile, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
})

ipcMain.handle('load-undo-history', () => {
  try {
    ensureDataDir()
    if (!existsSync(undoHistoryFile)) return null
    return JSON.parse(readFileSync(undoHistoryFile, 'utf-8'))
  } catch {
    return null
  }
})

// IPC: Image generation via Pollinations.ai — completely free, no API key needed.
// Uses FLUX model. GET request returns JPEG binary directly.
ipcMain.handle('gemini-generate-image', async (_, prompt: string, _token: string, _imageData?: string) => {
  type ImgResult = { success: boolean; mimeType?: string; data?: string; error?: string }

  const encodedPrompt = encodeURIComponent(
    `${prompt}, no text, no watermark, no background, transparent`
  )
  const path = `/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&nologo=true&enhance=false&seed=${Math.floor(Math.random() * 999999)}`

  return new Promise<ImgResult>((resolve) => {
    const req = httpsGet(
      { hostname: 'image.pollinations.ai', path, headers: { 'User-Agent': 'ImageGeneratorTool/1.0' } },
      (res: IncomingMessage) => {
        // Pollinations may redirect — follow Location header manually
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          const loc = res.headers.location
          const url = new URL(loc)
          httpsGet(
            { hostname: url.hostname, path: url.pathname + url.search, headers: { 'User-Agent': 'ImageGeneratorTool/1.0' } },
            (res2: IncomingMessage) => {
              const chunks2: Buffer[] = []
              res2.on('data', (c: Buffer) => chunks2.push(c))
              res2.on('end', () => {
                const ct = res2.headers['content-type'] ?? 'image/jpeg'
                if (!ct.startsWith('image/')) { resolve({ success: false, error: `Unexpected response: ${ct}` }); return }
                resolve({ success: true, mimeType: ct.split(';')[0], data: Buffer.concat(chunks2).toString('base64') })
              })
              res2.on('error', (e) => resolve({ success: false, error: String(e) }))
            }
          ).on('error', (e) => resolve({ success: false, error: String(e) }))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const ct = res.headers['content-type'] ?? 'image/jpeg'
          if (!ct.startsWith('image/')) {
            const text = Buffer.concat(chunks).toString('utf-8')
            resolve({ success: false, error: text.slice(0, 300) }); return
          }
          resolve({ success: true, mimeType: ct.split(';')[0], data: Buffer.concat(chunks).toString('base64') })
        })
        res.on('error', (e) => resolve({ success: false, error: String(e) }))
      }
    )
    req.on('error', (e) => resolve({ success: false, error: String(e) }))
    req.setTimeout(90_000, () => { req.destroy(); resolve({ success: false, error: 'Request timed out' }) })
  })
})

// IPC: Gemini AI icon generation (routed through main to avoid renderer CORS/CSP restrictions)
ipcMain.handle('gemini-generate', async (_, prompt: string, apiKey: string, detailed = false) => {
  type GeminiResult = { success: boolean; text?: string; error?: string }

  // Shared helper: call Gemini with a given body, returns the first text part
  const callGemini = (bodyObj: object, timeoutMs = 30_000): Promise<GeminiResult> => {
    const bodyStr = JSON.stringify(bodyObj)
    return new Promise<GeminiResult>((resolve) => {
      const req = httpsRequest(
        {
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
        },
        (res: IncomingMessage) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf-8')
              const json = JSON.parse(raw) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } }
              if (json.error) { resolve({ success: false, error: json.error.message ?? 'Gemini error' }); return }
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
              resolve({ success: true, text })
            } catch (e) { resolve({ success: false, error: String(e) }) }
          })
          res.on('error', (e) => resolve({ success: false, error: String(e) }))
        }
      )
      req.on('error', (e) => resolve({ success: false, error: String(e) }))
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ success: false, error: 'Request timed out' }) })
      req.write(bodyStr)
      req.end()
    })
  }

  if (!detailed) {
    // ── Simple mode: single-step, minimal icon ───────────────────────────────
    return callGemini({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: 'You are an expert SVG icon designer. Return only raw SVG code. No markdown, no code fences, no explanation. Start your response directly with <svg.' }] },
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } }
    }, 20_000)
  }

  // ── Detailed mode ────────────────────────────────────────────────────────────
  // Priority icon sets on Iconify that have Flaticon-style multi-color icons:
  // flat-color-icons  → Google's flat-color icon set (colorful, professional)
  // fluent-emoji-high-contrast → Microsoft Fluent colorful emoji-style icons
  // noto              → Google Noto (very colorful emoji-style)
  // logos             → Brand/tech logos (multi-color)
  // emojione          → EmojiOne (rich colorful icons)
  // twemoji           → Twitter Emoji (multi-color)
  const COLORFUL_SETS = 'flat-color-icons,noto,fluent-emoji,emojione,twemoji,logos'

  // Helper: search Iconify and return the raw SVG string (or null if not found)
  const searchIconify = (keywords: string): Promise<string | null> =>
    new Promise((resolve) => {
      const searchPath = `/search?query=${encodeURIComponent(keywords)}&limit=8&prefixes=${COLORFUL_SETS}`
      const searchReq = httpsGet(
        { hostname: 'api.iconify.design', path: searchPath, headers: { 'User-Agent': 'ImageGeneratorTool/1.0' } },
        (res: IncomingMessage) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as { icons?: string[] }
              const icons = data.icons ?? []
              if (icons.length === 0) { resolve(null); return }
              // Fetch the best-match icon's SVG (512×512)
              const [prefix, name] = icons[0].split(':')
              const svgPath = `/${prefix}/${name}.svg?width=512&height=512`
              const svgReq = httpsGet(
                { hostname: 'api.iconify.design', path: svgPath, headers: { 'User-Agent': 'ImageGeneratorTool/1.0' } },
                (svgRes: IncomingMessage) => {
                  const svgChunks: Buffer[] = []
                  svgRes.on('data', (c: Buffer) => svgChunks.push(c))
                  svgRes.on('end', () => {
                    const svg = Buffer.concat(svgChunks).toString('utf-8')
                    resolve(svg.trimStart().startsWith('<svg') ? svg : null)
                  })
                  svgRes.on('error', () => resolve(null))
                }
              )
              svgReq.on('error', () => resolve(null))
              svgReq.setTimeout(8_000, () => { svgReq.destroy(); resolve(null) })
            } catch { resolve(null) }
          })
          res.on('error', () => resolve(null))
        }
      )
      searchReq.on('error', () => resolve(null))
      searchReq.setTimeout(8_000, () => { searchReq.destroy(); resolve(null) })
    })

  // Step 1 — Ask Gemini for 1–3 search keywords that best match the description
  const keywordResult = await callGemini({
    contents: [{ parts: [{ text: `What are the best 1–3 English search keywords to find an icon for: "${prompt}"\nRespond with ONLY the keywords, comma-separated, no explanation. Examples: "laptop, work" or "coffee cup" or "shield, security"` }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 32, thinkingConfig: { thinkingBudget: 0 } }
  }, 10_000)

  if (keywordResult.success && keywordResult.text) {
    const keywords = keywordResult.text.trim().replace(/['"]/g, '')
    // Step 2 — Try Iconify with those keywords (and also a fallback with fewer words)
    let svg = await searchIconify(keywords)
    if (!svg) {
      // Retry with just the first keyword
      const firstWord = keywords.split(/[,\s]+/)[0]
      svg = await searchIconify(firstWord)
    }
    if (svg) {
      // Found a real Flaticon-quality icon — return it directly
      return { success: true, text: svg }
    }
  }

  // Step 3 — Nothing found on Iconify; fall back to two-step AI generation ─────
  const planPrompt = [
    `You are planning the visual design of a professional SVG icon (512×512 viewBox).`,
    `Icon subject: ${prompt}`,
    ``,
    `Write a detailed design plan covering:`,
    `1. Main subject — exactly what object/shape/scene represents this icon, described literally (not generically).`,
    `2. Color palette — list 3–6 specific hex color codes with their roles (background, primary shape, shadow, highlight…).`,
    `3. Gradient details — for each gradient: type (linear/radial), start/end colors (hex), direction or focal point.`,
    `4. Layer list — describe each SVG layer from back to front: shape type, approximate position/size within 0–512, color/gradient used.`,
    `5. Fine details — shadows, highlights, texture elements, strokes.`,
    ``,
    `Be specific and literal about the described subject. Do NOT substitute a generic icon.`
  ].join('\n')

  const planResult = await callGemini({
    contents: [{ parts: [{ text: planPrompt }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } }
  }, 30_000)

  if (!planResult.success) return planResult

  const designPlan = planResult.text ?? ''

  const svgPrompt = [
    `You are a professional SVG coder. Implement this icon design plan as valid SVG code:`,
    ``,
    designPlan,
    ``,
    `Requirements:`,
    `- viewBox="0 0 512 512", width/height="512"`,
    `- Implement EVERY layer and gradient from the plan above`,
    `- Use <defs> for gradients; reference them with url(#id)`,
    `- Explicit hex fill colors on every element — no currentColor, no CSS classes`,
    `- You may use: <defs>, <linearGradient>, <radialGradient>, <g>, <path>, <circle>, <rect>, <ellipse>, <polygon>, <clipPath>`,
    `- Return ONLY the SVG XML. Start with <svg. No markdown, no explanation.`
  ].join('\n')

  return callGemini({
    contents: [{ parts: [{ text: svgPrompt }] }],
    systemInstruction: { parts: [{ text: 'You are a professional SVG coder. Return ONLY raw SVG code, starting with <svg. No markdown, no code fences, no explanation.' }] },
    generationConfig: { temperature: 0.4, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } }
  }, 40_000)
})

// ── Iconify icon browser ────────────────────────────────────────────────────

// Shared helper: fetch a URL via HTTPS and return body as string
const httpsGetText = (hostname: string, path: string, timeoutMs = 8_000): Promise<string | null> =>
  new Promise((resolve) => {
    const req = httpsGet(
      { hostname, path, headers: { 'User-Agent': 'ImageGeneratorTool/1.0' } },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
        res.on('error', () => resolve(null))
      }
    )
    req.on('error', () => resolve(null))
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null) })
  })

// IPC: Search Iconify for icons matching a query.
// Blends coloured (Flaticon-like) sets with the full catalogue, then diversifies
// by icon-set prefix so a page isn't dominated by near-identical siblings.
ipcMain.handle('iconify-search', async (_, query: string, start = 0, style = 'any') => {
  type IconResult = { id: string; name: string; prefix: string; svg: string }
  const PAGE = 20
  const FETCH = 40

  /**
   * Pattern groups = different drawing languages.
   * Every page queries all groups for the same keyword; deeper pages raise
   * Iconify's start offset so you see more matches across packs.
   */
  const COLOUR_GROUPS: string[][] = [
    ['icon-park', 'marketeq'],
    ['streamline-color', 'streamline-sharp-color', 'streamline-flex-color'],
    ['streamline-plump-color', 'streamline-freehand-color'],
    ['streamline-ultimate-color', 'streamline-cyber-color'],
    ['fluent-emoji-flat', 'twemoji']
  ]

  const OUTLINE_GROUPS: string[][] = [
    ['lucide', 'tabler', 'iconoir', 'feather'],
    ['ph', 'system-uicons'],
    ['heroicons', 'flowbite'],
    ['mdi-light', 'material-symbols', 'ic', 'mdi'],
    ['solar', 'mingcute', 'hugeicons', 'guidance'],
    ['ri', 'carbon'],
    ['icon-park-outline', 'lets-icons', 'mage', 'majesticons'],
    ['cil', 'clarity'],
    ['streamline-plump'],
    ['pepicons-print', 'pepicons-pop', 'pepicons-pencil', 'lineicons', 'simple-line-icons', 'la']
  ]

  const VECTOR_GROUPS: string[][] = [
    ['streamline-plump-color', 'streamline-freehand-color'],
    ['streamline-ultimate-color', 'streamline-cyber-color'],
    ['streamline-flex-color', 'streamline-sharp-color', 'streamline-color'],
    ['glyphs-poly'],
    ['icon-park', 'marketeq'],
    ['fluent-emoji-flat', 'twemoji'],
    ['game-icons']
  ]

  const ANY_COLOUR_FLAT = COLOUR_GROUPS.flat()

  const styleMode = String(style || 'any')
  const groups: string[][] | null =
    styleMode === 'colored-shape' ? COLOUR_GROUPS
      : styleMode === 'outline' ? OUTLINE_GROUPS
        : styleMode === 'vector-art' ? VECTOR_GROUPS
          : null

  const searchIds = async (q: string, limit = 20, prefixes?: string, off = 0): Promise<string[]> => {
    let qs = prefixes
      ? `/search?query=${encodeURIComponent(q)}&limit=${limit}&prefixes=${prefixes}`
      : `/search?query=${encodeURIComponent(q)}&limit=${limit}`
    if (off > 0) qs += `&start=${off}`
    const body = await httpsGetText('api.iconify.design', qs)
    if (!body) return []
    try { return (JSON.parse(body) as { icons?: string[] }).icons ?? [] }
    catch { return [] }
  }

  const dedup = (lists: string[][]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const list of lists) for (const id of list) if (!seen.has(id)) { seen.add(id); out.push(id) }
    return out
  }

  const nameStem = (id: string) => {
    const name = (id.split(':')[1] || id).toLowerCase()
    return name
      .replace(/-(outline|solid|fill|filled|bold|line|linear|duotone|twotone|two-tone|alt|sharp|round|rounded)\d*$/g, '')
      .replace(/-\d+$/g, '')
  }

  // Round-robin across packs, then prefer different name stems so one page isn't 8 "home" variants.
  const diversify = (ids: string[], limit: number): string[] => {
    const buckets = new Map<string, string[]>()
    for (const id of ids) {
      const prefix = id.split(':')[0] || 'other'
      if (!buckets.has(prefix)) buckets.set(prefix, [])
      buckets.get(prefix)!.push(id)
    }
    const queues = [...buckets.values()]
    const out: string[] = []
    const usedStems = new Set<string>()
    let i = 0
    // Pass 1: unique stems across packs
    while (out.length < limit && queues.some((q) => q.length > 0)) {
      const q = queues[i % queues.length]
      if (q.length > 0) {
        const idx = q.findIndex((id) => !usedStems.has(nameStem(id)))
        if (idx >= 0) {
          const id = q.splice(idx, 1)[0]
          usedStems.add(nameStem(id))
          out.push(id)
        } else {
          q.shift() // only duplicates left in this pack for now
        }
      }
      i++
      if (i > ids.length * 4) break
    }
    // Pass 2: fill remaining slots
    const rest = dedup([ids.filter((id) => !out.includes(id))])
    for (const id of rest) {
      if (out.length >= limit) break
      out.push(id)
    }
    return out
  }

  /**
   * Same keyword across every pack group. Page advances Iconify's `start`
   * offset so later pages dig deeper into each pack instead of changing the
   * query. Diversify() still mixes prefixes on the returned page.
   */
  const searchGrouped = async (q: string, gList: string[][], pageStart: number): Promise<string[]> => {
    const page = Math.max(0, Math.floor(pageStart / FETCH))
    // Non-overlapping Iconify windows per pack so next page keeps the same keyword
    // and surfaces more matches instead of reshuffling the first hits.
    const perPack = 20
    const deep = page * perPack
    const hits = await Promise.all(
      gList.map((g) => searchIds(q, perPack, g.join(','), deep))
    )
    return diversify(dedup(hits), PAGE)
  }

  let ids: string[] = []

  if (groups) {
    ids = await searchGrouped(query, groups, start)
  } else {
    const [colourIds, allIds] = await Promise.all([
      searchIds(query, FETCH, ANY_COLOUR_FLAT.join(','), start),
      searchIds(query, FETCH, undefined, start)
    ])
    ids = diversify(dedup([colourIds, allIds]), PAGE)
  }

  if (ids.length === 0) {
    const words = query.split(/[\s,]+/).map((w) => w.trim().toLowerCase()).filter((w) => w.length > 2)
    if (groups) {
      const wordHits = await Promise.all(words.slice(0, 3).map((w) => searchGrouped(w, groups, start)))
      ids = diversify(dedup(wordHits), PAGE)
    } else {
      const [colourWord, allWord] = await Promise.all([
        Promise.all(words.map((w) => searchIds(w, 16, ANY_COLOUR_FLAT.join(','), start))),
        Promise.all(words.map((w) => searchIds(w, 16, undefined, start)))
      ])
      ids = diversify(dedup([...colourWord, ...allWord]), PAGE)
    }
  }

  if (ids.length === 0) {
    const firstWord = query.split(/[\s,]+/).find((w) => w.length > 2) ?? query
    if (groups) {
      ids = await searchGrouped(firstWord, groups, start)
    } else {
      ids = diversify(await searchIds(firstWord, FETCH, undefined, start), PAGE)
    }
  }

  if (ids.length === 0) return { success: true, icons: [], keywords: query, nextStart: start }

  const results = await Promise.all(
    ids.slice(0, PAGE).map(async (id): Promise<IconResult | null> => {
      const [prefix, name] = id.split(':')
      const svg = await httpsGetText('api.iconify.design', `/${prefix}/${name}.svg?width=48&height=48`)
      if (!svg || !svg.trimStart().startsWith('<svg')) return null
      return { id, name, prefix, svg }
    })
  )

  return {
    success: true,
    icons: results.filter(Boolean) as IconResult[],
    keywords: query,
    nextStart: start + FETCH
  }
})

// IPC: Fetch a single Iconify icon at full resolution (512px)
ipcMain.handle('iconify-fetch', async (_, id: string) => {
  const [prefix, name] = id.split(':')
  const svg = await httpsGetText('api.iconify.design', `/${prefix}/${name}.svg?width=512&height=512`, 10_000)
  if (!svg || !svg.trimStart().startsWith('<svg')) {
    return { success: false, error: 'Failed to fetch icon SVG' }
  }
  return { success: true, svg }
})

const execFileAsync = promisify(execFile)

function psQuote(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'"
}

function escapeHtmlForClip(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function decodeClipboardPng(pngBase64: string): Buffer | null {
  const raw = pngBase64.startsWith('data:')
    ? pngBase64.replace(/^data:image\/png;base64,/, '')
    : pngBase64
  if (!raw) return null
  const buf = Buffer.from(raw, 'base64')
  return buf.length ? buf : null
}

function buildClipboardHtml(text: string, pngBase64: string | null): string {
  const body = pngBase64
    ? `<p>${escapeHtmlForClip(text)}</p><img src="data:image/png;base64,${pngBase64}" width="512" height="512" alt="reference">`
    : `<p>${escapeHtmlForClip(text)}</p>`
  return `<html><body><!--StartFragment-->${body}<!--EndFragment--></body></html>`
}

function writeClipboardElectron(text: string, pngBuffer: Buffer | null): { text: boolean; html: boolean } {
  const pngBase64 = pngBuffer ? pngBuffer.toString('base64') : null
  const html = buildClipboardHtml(text, pngBase64)
  // Text + HTML only. A standalone PNG makes Canva paste the image and drop the prompt.
  clipboard.write({ text, html })
  const got = clipboard.readText().replace(/\r\n/g, '\n')
  const want = text.replace(/\r\n/g, '\n')
  const readHtml = clipboard.readHTML() || ''
  return {
    text: got === want,
    html: pngBase64 ? readHtml.includes('data:image/png') : readHtml.length > 0
  }
}

/** Windows: put Unicode text + PNG (Chrome/Canva) + bitmap + file drop on one clipboard. */
async function writeClipboardWindows(text: string, pngBuffer: Buffer): Promise<boolean> {
  const dir = mkdtempSync(join(tmpdir(), 'imggen-clip-'))
  const pngPath = join(dir, 'reference.png')
  const textPath = join(dir, 'prompt.txt')
  const scriptPath = join(dir, 'set-clipboard.ps1')
  const stablePng = join(app.getPath('temp'), 'image-generator-canva-ref.png')
  try {
    writeFileSync(pngPath, pngBuffer)
    writeFileSync(stablePng, pngBuffer)
    writeFileSync(textPath, text, { encoding: 'utf8' })
    writeFileSync(
      scriptPath,
      [
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type -AssemblyName System.Drawing',
        '$ErrorActionPreference = "Stop"',
        `$pngPath = ${psQuote(stablePng)}`,
        `$textPath = ${psQuote(textPath)}`,
        '$text = [System.IO.File]::ReadAllText($textPath, [System.Text.UTF8Encoding]::new($false))',
        '$img = [System.Drawing.Image]::FromFile($pngPath)',
        'try {',
        '  $data = New-Object System.Windows.Forms.DataObject',
        '  $data.SetData([System.Windows.Forms.DataFormats]::UnicodeText, $true, $text)',
        '  $data.SetImage($img)',
        '  $ms = New-Object System.IO.MemoryStream',
        '  $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)',
        '  [void]$ms.Seek(0, "Begin")',
        '  $data.SetData("PNG", $false, $ms)',
        '  $files = New-Object System.Collections.Specialized.StringCollection',
        '  [void]$files.Add($pngPath)',
        '  $data.SetFileDropList($files)',
        '  [System.Windows.Forms.Clipboard]::SetDataObject($data, $true)',
        '} finally {',
        '  $img.Dispose()',
        '}'
      ].join('\r\n'),
      'utf8'
    )
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { windowsHide: true, timeout: 15000 }
    )
    const hasImage = !clipboard.readImage().isEmpty()
    if (!text) return hasImage
    const got = clipboard.readText().replace(/\r\n/g, '\n')
    const want = text.replace(/\r\n/g, '\n')
    return got === want && hasImage
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* temp cleanup is best-effort */
    }
  }
}

ipcMain.handle('clipboard-write-text-and-image', async (_, text: string, pngBase64: string) => {
  try {
    if (typeof text !== 'string' || typeof pngBase64 !== 'string') {
      return { success: false, error: 'Invalid clipboard payload' }
    }
    const pngBuffer = decodeClipboardPng(pngBase64)
    if (!pngBuffer) {
      clipboard.writeText(text)
      return { success: false, error: 'Empty image', text: true, image: false }
    }
    const written = writeClipboardElectron(text, pngBuffer)
    return {
      success: written.text && written.html,
      text: written.text,
      image: written.html,
      error: written.html ? undefined : 'Clipboard HTML write failed'
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// IPC: Save versions to file
ipcMain.handle('clipboard-write-image', async (_, pngBase64: string) => {
  try {
    if (typeof pngBase64 !== 'string') {
      return { success: false, error: 'Invalid clipboard payload' }
    }
    const pngBuffer = decodeClipboardPng(pngBase64)
    if (!pngBuffer) return { success: false, error: 'Empty image' }
    if (process.platform === 'win32') {
      try {
        if (await writeClipboardWindows('', pngBuffer)) {
          return { success: true }
        }
      } catch {
        // Fall through.
      }
    }
    const image = nativeImage.createFromBuffer(pngBuffer)
    if (image.isEmpty()) return { success: false, error: 'Empty image' }
    clipboard.writeImage(image)
    return { success: !clipboard.readImage().isEmpty() }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

const CANVA_AI_URL = 'https://www.canva.com/ai'
let canvaWindow: BrowserWindow | null = null
let pendingCanvaFill: { prompt: string } | null = null

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function canvaComposerScript(prompt: string): string {
  return `(() => {
    const prompt = ${JSON.stringify(prompt)};
    const snippet = prompt.slice(0, 32);
    if (/login|signup|oauth/i.test(location.href)) return { ok: false, reason: 'login' };

    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 80 && r.height > 16 && st.visibility !== 'hidden' && st.display !== 'none'
        && r.bottom > 0 && r.top < innerHeight;
    }
    function collect(selector) {
      const out = [];
      const walk = (node) => {
        if (!node || !node.querySelectorAll) return;
        out.push(...node.querySelectorAll(selector));
        node.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) walk(el.shadowRoot); });
      };
      walk(document);
      return out;
    }
    function readValue(el) {
      return String(el.value || el.innerText || el.textContent || '');
    }
    function findComposer() {
      const cands = [
        ...collect('[contenteditable="true"]'),
        ...collect('[role="textbox"]'),
        ...collect('textarea'),
        ...collect('[data-placeholder]'),
        ...collect('[aria-label*="prompt" i]'),
        ...collect('[aria-label*="message" i]'),
        ...collect('[placeholder]')
      ].filter(visible);
      const scored = cands.map((el) => {
        const ph = (el.getAttribute('placeholder') || el.getAttribute('aria-label')
          || el.getAttribute('data-placeholder') || el.textContent || '').toLowerCase();
        let score = el.getBoundingClientRect().width;
        if (/prompt|message|ask|describe|generate|idea|type|chat|canva ai/i.test(ph)) score += 500;
        if (el.closest('footer, form, [class*="composer" i], [class*="prompt" i], [class*="chat" i]')) score += 200;
        return { el, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored[0] ? scored[0].el : null;
    }
    function setText(el, text) {
      el.focus();
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
        if (setter) setter.call(el, text); else el.value = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return readValue(el).includes(snippet);
      }
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand('insertText', false, text);
      if (ok && readValue(el).includes(snippet)) return true;
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      return readValue(el).includes(snippet);
    }
    const el = findComposer();
    if (!el) return { ok: false, reason: 'no-composer' };
    return { ok: readValue(el).includes(snippet) || setText(el, prompt) };
  })()`
}

async function putPngOnClipboard(pngBase64: string): Promise<boolean> {
  const pngBuffer = decodeClipboardPng(pngBase64)
  if (!pngBuffer) return false
  if (process.platform === 'win32') {
    try {
      if (await writeClipboardWindows('', pngBuffer)) return true
    } catch {
      /* fall through */
    }
  }
  const image = nativeImage.createFromBuffer(pngBuffer)
  if (image.isEmpty()) return false
  clipboard.writeImage(image)
  return !clipboard.readImage().isEmpty()
}

async function fillCanvaComposer(win: BrowserWindow, prompt: string): Promise<{
  filled: boolean
  login: boolean
}> {
  const deadline = Date.now() + 22000
  let login = false
  while (Date.now() < deadline && !win.isDestroyed()) {
    try {
      const result = await win.webContents.executeJavaScript(canvaComposerScript(prompt), true) as {
        ok?: boolean
        reason?: string
      }
      if (result?.reason === 'login') {
        login = true
        await delay(500)
        continue
      }
      if (result?.ok) return { filled: true, login: false }
    } catch {
      /* page may still be loading */
    }
    await delay(400)
  }
  return { filled: false, login }
}

function attachCanvaFillRetry(win: BrowserWindow): void {
  const retry = () => {
    const pending = pendingCanvaFill
    if (!pending || win.isDestroyed()) return
    void fillCanvaComposer(win, pending.prompt).then((result) => {
      if (result.filled) pendingCanvaFill = null
    })
  }
  win.webContents.on('did-finish-load', retry)
  win.webContents.on('did-navigate-in-page', retry)
}

function ensureCanvaWindow(): BrowserWindow {
  if (canvaWindow && !canvaWindow.isDestroyed()) return canvaWindow
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'Canva AI',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      partition: 'persist:canva',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/([^/]+\.)?canva\.com\//i.test(url)) return { action: 'allow' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  attachCanvaFillRetry(win)
  win.on('closed', () => {
    if (canvaWindow === win) canvaWindow = null
  })
  canvaWindow = win
  return win
}

ipcMain.handle(
  'open-canva-ai',
  async (_, payload?: { prompt?: string; pngBase64?: string }) => {
    try {
      const prompt = typeof payload?.prompt === 'string' ? payload.prompt : ''
      const pngBase64 = typeof payload?.pngBase64 === 'string' ? payload.pngBase64 : ''
      if (pngBase64) {
        const imageOk = await putPngOnClipboard(pngBase64)
        if (!imageOk) return { success: false, error: 'Could not copy the reference image' }
      }

      const win = ensureCanvaWindow()
      pendingCanvaFill = prompt ? { prompt } : null
      win.show()
      win.focus()
      const current = win.webContents.getURL()
      if (!/canva\.com\/ai/i.test(current)) {
        await win.loadURL(CANVA_AI_URL)
      }
      if (!prompt) return { success: true, filled: false, login: false }

      const result = await fillCanvaComposer(win, prompt)
      if (result.filled) pendingCanvaFill = null
      return { success: true, filled: result.filled, login: result.login }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }
)

ipcMain.handle('save-versions', (_, data: unknown, history?: unknown) => {
  try {
    ensureDataDir()
    writeFileSync(versionsFile, JSON.stringify(data, null, 2), 'utf-8')
    if (history !== undefined) {
      writeFileSync(undoHistoryFile, JSON.stringify(history), 'utf-8')
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})
