/**
 * Preload script — the narrow bridge from Electron main → renderer.
 *
 * Runs in a privileged sandbox before the React page loads. It uses
 * contextBridge to put a plain object on window.api. The renderer can call
 * those methods; it cannot reach Node/fs directly (security).
 *
 * Each function is basically: ipcRenderer.invoke('channel-name', ...args)
 * and the matching handler lives in src/main/index.ts.
 *
 * Web does not use this file — webApp/src/platform/api.ts fakes the same API.
 */
import { contextBridge, ipcRenderer } from 'electron'

/** Methods the React UI is allowed to call. Keep in sync with web platform/api.ts. */
const api = {
  exportFile: (
    data: string,
    filename: string,
    format: 'png' | 'svg'
  ): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('export-file', data, filename, format),

  exportIco: (
    pngDataUrls: string[],
    filename: string
  ): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('export-ico', pngDataUrls, filename),

  loadVersions: (): Promise<unknown[]> =>
    ipcRenderer.invoke('load-versions'),

  loadUndoHistory: (): Promise<unknown> =>
    ipcRenderer.invoke('load-undo-history'),

  saveVersions: (data: unknown[], history?: unknown): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('save-versions', data, history),

  fetchGoogleFont: (
    familyName: string,
    customCssUrl?: string
  ): Promise<{ ok: boolean; entries?: { url: string; weight: string; style: string }[]; error?: string }> =>
    ipcRenderer.invoke('fetch-google-font', familyName, customCssUrl),

  exportTemplate: (
    version: unknown
  ): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('export-template', version),

  updateAllTemplates: (
    versions: unknown[]
  ): Promise<{ success: boolean; written?: number; migratedOrphans?: number; updated?: number; created?: number; error?: string }> =>
    ipcRenderer.invoke('update-all-templates', versions),

  openTemplatesFolder: (): Promise<{ success: boolean; path?: string }> =>
    ipcRenderer.invoke('open-templates-folder'),

  onTemplateImported: (cb: (version: unknown) => void) => {
    ipcRenderer.on('template-imported', (_event, version) => cb(version))
  },

  onVersionsReloaded: (cb: (versions: unknown[]) => void) => {
    ipcRenderer.on('versions-reloaded', (_event, versions) => cb(versions))
  },

  onApiRenderRequest: (cb: (payload: unknown) => void) => {
    ipcRenderer.on('api-render-request', (_event, payload) => cb(payload))
  },

  sendApiRenderResponse: (response: unknown) => {
    ipcRenderer.send('api-render-response', response)
  },

  geminiGenerate: (
    prompt: string,
    apiKey: string,
    detailed?: boolean
  ): Promise<{ success: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke('gemini-generate', prompt, apiKey, detailed),

  geminiGenerateImage: (
    prompt: string,
    apiKey: string,
    imageData?: string
  ): Promise<{ success: boolean; mimeType?: string; data?: string; error?: string }> =>
    ipcRenderer.invoke('gemini-generate-image', prompt, apiKey, imageData),

  iconifySearch: (
    query: string,
    start = 0,
    style?: string
  ): Promise<{ success: boolean; icons?: { id: string; name: string; prefix: string; svg: string }[]; nextStart?: number; error?: string }> =>
    ipcRenderer.invoke('iconify-search', query, start, style),

  iconifyFetch: (
    id: string
  ): Promise<{ success: boolean; svg?: string; error?: string }> =>
    ipcRenderer.invoke('iconify-fetch', id),

  exportGroup: (
    files: { filename: string; dataUrl: string }[],
    folderName?: string
  ): Promise<{ success: boolean; folderPath?: string; error?: string }> =>
    ipcRenderer.invoke('export-group', files, folderName),

  writeClipboardTextAndImage: (
    text: string,
    pngBase64: string
  ): Promise<{ success: boolean; text?: boolean; image?: boolean; error?: string }> =>
    ipcRenderer.invoke('clipboard-write-text-and-image', text, pngBase64),

  writeClipboardImage: (
    pngBase64: string
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('clipboard-write-image', pngBase64),

  openCanvaAi: (
    payload?: { prompt?: string; pngBase64?: string }
  ): Promise<{ success: boolean; filled?: boolean; login?: boolean; error?: string }> =>
    ipcRenderer.invoke('open-canva-ai', payload),

  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  onWindowMaximized: (cb: (maximized: boolean) => void) => {
    ipcRenderer.on('window-maximized', (_event, maximized: boolean) => cb(maximized))
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
