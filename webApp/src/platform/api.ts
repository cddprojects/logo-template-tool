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
import { iconifyFetch, iconifySearch } from './iconify'

const VERSIONS_KEY = 'imggen:versions'

type Listener<T> = (payload: T) => void

const templateImportedListeners: Listener<unknown>[] = []
const versionsReloadedListeners: Listener<unknown[]>[] = []

function readVersions(): unknown[] {
  try {
    const raw = localStorage.getItem(VERSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeVersions(data: unknown[]): { success: boolean; error?: string } {
  try {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(data))
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
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
  _folderName?: string
): Promise<{ success: boolean; folderPath?: string; error?: string }> {
  // Always use normal browser downloads. Chromium's showDirectoryPicker often
  // rejects even Downloads with "Can't modify … system files" / similar.
  try {
    for (let i = 0; i < files.length; i++) {
      downloadDataUrl(files[i].dataUrl, files[i].filename)
      if (i < files.length - 1) await new Promise((r) => setTimeout(r, 150))
    }
    return { success: true, folderPath: 'downloads' }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

function pickTemplateFiles(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.igtemplate,application/json'
  input.multiple = true
  input.onchange = async () => {
    const files = [...(input.files ?? [])]
    for (const file of files) {
      try {
        const text = await file.text()
        const tmpl = JSON.parse(text) as Record<string, unknown>
        const now = new Date().toISOString()
        const version = {
          id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: (tmpl.name as string) || file.name.replace(/\.igtemplate$/i, ''),
          description: (tmpl.description as string) || '',
          createdAt: now,
          updatedAt: now,
          logos: (tmpl.logos as unknown[]) ?? [],
          favicons: (tmpl.favicons as unknown[]) ?? []
        }
        templateImportedListeners.forEach((cb) => cb(version))
      } catch (err) {
        console.error('Failed to import template', file.name, err)
      }
    }
  }
  input.click()
}

export function installWebApi(): void {
  ;(window as Window & { __WEB__?: boolean }).__WEB__ = true

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

    loadVersions: async (): Promise<unknown[]> => readVersions(),

    saveVersions: async (data: unknown[]): Promise<{ success: boolean; error?: string }> =>
      writeVersions(data),

    fetchGoogleFont,

    exportTemplate: async (
      version: unknown
    ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        const v = version as { name?: string; description?: string; logos?: unknown; favicons?: unknown }
        const payload = {
          name: v.name ?? 'Untitled',
          description: v.description ?? '',
          logos: v.logos ?? [],
          favicons: v.favicons ?? []
        }
        const safe = String(payload.name)
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'template'
        const filename = `${safe}.igtemplate`
        downloadBlob(
          new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
          filename
        )
        return { success: true, filePath: filename }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    },

    openTemplatesFolder: async (): Promise<{ success: boolean; path?: string }> => {
      // Web: open a file picker to import .igtemplate files.
      pickTemplateFiles()
      return { success: true, path: 'import' }
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

    removeBackground: async () => ({
      success: false,
      error: 'Not available in the web build'
    }),

    iconifySearch,
    iconifyFetch,

    windowMinimize: () => {},
    windowMaximize: () => {},
    windowClose: () => {},
    onWindowMaximized: (_cb: (maximized: boolean) => void) => {}
  }

  ;(window as unknown as { api: typeof api }).api = api
}
