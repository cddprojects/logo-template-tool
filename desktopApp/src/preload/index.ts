import { contextBridge, ipcRenderer } from 'electron'

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

  saveVersions: (data: unknown[]): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('save-versions', data),

  fetchGoogleFont: (
    familyName: string,
    customCssUrl?: string
  ): Promise<{ ok: boolean; entries?: { url: string; weight: string; style: string }[]; error?: string }> =>
    ipcRenderer.invoke('fetch-google-font', familyName, customCssUrl),

  exportTemplate: (
    version: unknown
  ): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('export-template', version),

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

  removeBackground: (
    imageDataUrl: string,
    hfToken: string
  ): Promise<{ success: boolean; mimeType?: string; data?: string; error?: string }> =>
    ipcRenderer.invoke('remove-background', imageDataUrl, hfToken),

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
