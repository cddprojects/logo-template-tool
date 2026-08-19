/**
 * Browser stand-in for Electron's preload `window.api`.
 * Installed before the shared renderer App mounts.
 */
import {
  dataUrlToUint8Array,
  downloadBlob,
  downloadDataUrl,
  pngBuffersToIco
} from './download'
import { buildStoreZip } from './zip'
import { iconifyFetch, iconifySearch } from './iconify'
import {
  createTemplate,
  getAuthUser,
  loadWorkspace,
  logout,
  saveWorkspace,
  subscribeAuth,
  WEB_OPEN_TEMPLATES
} from './auth'

const LEGACY_VERSIONS_KEY = 'imggen:versions'

type Listener<T> = (payload: T) => void

const templateImportedListeners: Listener<unknown>[] = []
const versionsReloadedListeners: Listener<unknown[]>[] = []
let lastWorkspaceHistory: unknown = null

function clearLegacyBrowserVersions(): void {
  try {
    localStorage.removeItem(LEGACY_VERSIONS_KEY)
  } catch {
    // ignore
  }
}

async function reloadWorkspaceForListeners(): Promise<void> {
  const result = await loadWorkspace()
  if (!result.ok) return
  lastWorkspaceHistory = result.history
  clearLegacyBrowserVersions()
  versionsReloadedListeners.forEach((cb) => cb(result.versions))
}

async function fetchGoogleFont(
  familyName: string,
  customCssUrl?: string
): Promise<{ ok: boolean; entries?: { url: string; weight: string; style: string }[]; error?: string }> {
  const encoded = familyName.trim().replace(/\s+/g, '+')
  const cssUrl =
    customCssUrl ?? `https://fonts.googleapis.com/css?family=${encoded}:400,700&display=swap`
  try {
    const cssRes = await fetch(cssUrl)
    if (!cssRes.ok) return { ok: false, error: `CSS HTTP ${cssRes.status}` }
    const css = await cssRes.text()
    const entries: { url: string; weight: string; style: string }[] = []
    const faceRx = /@font-face\s*\{([^}]+)\}/g
    let m: RegExpExecArray | null
    while ((m = faceRx.exec(css)) !== null) {
      const block = m[1]
      const weight = /font-weight:\s*([^;]+)/i.exec(block)?.[1]?.trim() ?? '400'
      const style = /font-style:\s*([^;]+)/i.exec(block)?.[1]?.trim() ?? 'normal'
      const url = /url\((['"]?)(https?:\/\/[^)'"]+)\1\)/i.exec(block)?.[2]
      if (!url) continue
      const binRes = await fetch(url)
      if (!binRes.ok) continue
      const buf = await binRes.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const b64 = btoa(binary)
      const mime = url.includes('.woff2')
        ? 'font/woff2'
        : url.includes('.woff')
          ? 'font/woff'
          : 'application/octet-stream'
      entries.push({ url: `data:${mime};base64,${b64}`, weight, style })
    }
    if (!entries.length) return { ok: false, error: 'No font faces found in CSS' }
    return { ok: true, entries }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

async function geminiGenerate(
  prompt: string,
  apiKey: string,
  detailed = false
): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    const body = detailed
      ? {
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: {
            parts: [
              {
                text:
                  'You are an expert SVG icon designer. Return only raw SVG code. No markdown, no code fences, no explanation. Start your response directly with <svg.'
              }
            ]
          },
          generationConfig: { temperature: 0.55, maxOutputTokens: 2048 }
        }
      : {
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: {
            parts: [
              {
                text:
                  'You are an expert SVG icon designer. Return only raw SVG code. No markdown, no code fences, no explanation. Start your response directly with <svg.'
              }
            ]
          },
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
        }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      error?: { message?: string }
    }
    if (!res.ok || json.error) {
      return { success: false, error: json.error?.message ?? `HTTP ${res.status}` }
    }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return { success: true, text }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

async function geminiGenerateImage(
  prompt: string
): Promise<{ success: boolean; mimeType?: string; data?: string; error?: string }> {
  try {
    const encodedPrompt = encodeURIComponent(
      `${prompt}, no text, no watermark, no background, transparent`
    )
    const url =
      `https://image.pollinations.ai/prompt/${encodedPrompt}` +
      `?width=1024&height=1024&model=flux&nologo=true&enhance=false&seed=${Math.floor(Math.random() * 999999)}`
    const res = await fetch(url)
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
    const ct = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0]
    if (!ct.startsWith('image/')) {
      const text = await res.text()
      return { success: false, error: text.slice(0, 300) }
    }
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return { success: true, mimeType: ct, data: btoa(binary) }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

async function exportGroup(
  files: { filename: string; dataUrl: string }[],
  folderName?: string
): Promise<{ success: boolean; folderPath?: string; error?: string }> {
  try {
    const zipName = `${(folderName ?? 'my-assets').replace(/[\\/:*?"<>|]/g, '-').trim() || 'my-assets'}.zip`
    const zip = buildStoreZip(
      files.map((f) => ({ name: f.filename, data: dataUrlToUint8Array(f.dataUrl) }))
    )
    downloadBlob(zip, zipName)
    return { success: true, folderPath: zipName }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export function installWebApi(): void {
  ;(window as Window & { __WEB__?: boolean }).__WEB__ = true

  subscribeAuth((user) => {
    if (user) {
      void reloadWorkspaceForListeners()
    } else {
      lastWorkspaceHistory = null
      versionsReloadedListeners.forEach((cb) => cb([]))
    }
  })

  ;(window as Window & {
    __webAuth?: {
      getUser: () => ReturnType<typeof getAuthUser>
      subscribe: typeof subscribeAuth
      logout: typeof logout
    }
  }).__webAuth = {
    getUser: getAuthUser,
    subscribe: subscribeAuth,
    logout
  }

  window.addEventListener('web:template-imported', ((e: CustomEvent) => {
    templateImportedListeners.forEach((cb) => cb(e.detail))
  }) as EventListener)

  const api = {
    exportFile: async (
      data: string,
      filename: string,
      format: 'png' | 'svg'
    ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        if (format === 'png') {
          downloadDataUrl(data, filename)
        } else {
          downloadBlob(new Blob([data], { type: 'image/svg+xml' }), filename)
        }
        return { success: true, filePath: filename }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    },

    exportIco: async (
      pngDataUrls: string[],
      filename: string
    ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        const pngs = pngDataUrls.map(dataUrlToUint8Array)
        const ico = pngBuffersToIco(pngs)
        downloadBlob(ico, filename.endsWith('.ico') ? filename : `${filename}.ico`)
        return { success: true, filePath: filename }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    },

    exportGroup,

    loadVersions: async (): Promise<unknown[]> => {
      const result = await loadWorkspace()
      if (!result.ok) {
        console.error('[web] failed to load workspace from server:', result.error)
        lastWorkspaceHistory = null
        return []
      }
      lastWorkspaceHistory = result.history
      clearLegacyBrowserVersions()
      return result.versions
    },

    loadUndoHistory: async (): Promise<unknown> => lastWorkspaceHistory,

    saveVersions: async (data: unknown[], history?: unknown): Promise<{ success: boolean; error?: string }> => {
      if (history !== undefined) lastWorkspaceHistory = history
      const result = await saveWorkspace(data, history)
      if (!result.ok) {
        console.error('[web] failed to save workspace to server:', result.error)
        return { success: false, error: result.error }
      }
      return { success: true }
    },

    fetchGoogleFont,

    exportTemplate: async (
      version: unknown
    ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        const v = version as {
          name?: string
          description?: string
          logos?: unknown
          favicons?: unknown
        }
        const result = await createTemplate({
          name: v.name ?? 'Untitled',
          description: v.description ?? '',
          logos: v.logos ?? [],
          favicons: v.favicons ?? []
        })
        if (!result.ok) return { success: false, error: result.error }
        return { success: true, filePath: result.template.id }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    },

    openTemplatesFolder: async (): Promise<{ success: boolean; path?: string }> => {
      // Web: open the server templates panel (browse / copy / upload).
      window.dispatchEvent(new CustomEvent(WEB_OPEN_TEMPLATES))
      return { success: true, path: 'library' }
    },

    onTemplateImported: (cb: (version: unknown) => void) => {
      templateImportedListeners.push(cb)
    },

    onVersionsReloaded: (cb: (versions: unknown[]) => void) => {
      versionsReloadedListeners.push(cb)
    },

    // Desktop REST render bridge — unused in the browser.
    onApiRenderRequest: (_cb: (payload: unknown) => void) => {},
    sendApiRenderResponse: (_response: unknown) => {},

    geminiGenerate,
    geminiGenerateImage: (prompt: string, _apiKey: string, _imageData?: string) =>
      geminiGenerateImage(prompt),

    iconifySearch,
    iconifyFetch,

    windowMinimize: () => {},
    windowMaximize: () => {},
    windowClose: () => {},
    onWindowMaximized: (_cb: (maximized: boolean) => void) => {},

    writeClipboardImage: async (pngBase64: string) => {
      try {
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
          return { success: false, error: 'Clipboard image write is not supported' }
        }
        const bytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0))
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': Promise.resolve(new Blob([bytes], { type: 'image/png' }))
          })
        ])
        return { success: true }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    },

    writeClipboardTextAndImage: async (text: string, pngBase64: string) => {
      try {
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
          await navigator.clipboard.writeText(text)
          return { success: false, text: true, image: false, error: 'Clipboard image write is not supported' }
        }
        const bytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0))
        const imageBlob = new Blob([bytes], { type: 'image/png' })
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/plain': Promise.resolve(new Blob([text], { type: 'text/plain' })),
              'image/png': Promise.resolve(imageBlob)
            })
          ])
          return { success: true, text: true, image: true }
        } catch {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': Promise.resolve(imageBlob)
            })
          ])
          return { success: false, text: false, image: true, error: 'Copied image only' }
        }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    },

    openCanvaAi: async (payload?: { prompt?: string; pngBase64?: string }) => {
      const prompt = payload?.prompt ?? ''
      try {
        if (payload?.pngBase64 && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          const bytes = Uint8Array.from(atob(payload.pngBase64), (c) => c.charCodeAt(0))
          const imageBlob = new Blob([bytes], { type: 'image/png' })
          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                'text/plain': Promise.resolve(new Blob([prompt], { type: 'text/plain' })),
                'image/png': Promise.resolve(imageBlob)
              })
            ])
          } catch {
            await navigator.clipboard.write([
              new ClipboardItem({
                'image/png': Promise.resolve(imageBlob)
              })
            ])
          }
        } else if (prompt) {
          await navigator.clipboard.writeText(prompt)
        }
      } catch {
        /* browser clipboard may be blocked */
      }
      window.open('https://www.canva.com/ai', '_blank', 'noopener,noreferrer')
      return { success: true, filled: false, login: false }
    }
  }

  ;(window as unknown as { api: typeof api }).api = api
}
