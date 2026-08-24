import type { LogoConfig, FaviconConfig } from '../types'
import { renderLogo, renderFavicon, generateLogoSvg, generateFaviconSvg } from './renderer'

declare global {
  interface Window {
    api: {
      exportFile: (
        data: string,
        filename: string,
        format: 'png' | 'svg'
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>
      exportIco: (
        pngDataUrls: string[],
        filename: string
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>
      loadVersions: () => Promise<unknown[]>
      loadUndoHistory: () => Promise<unknown>
      saveVersions: (data: unknown[], history?: unknown) => Promise<{ success: boolean; error?: string }>
      fetchGoogleFont: (familyName: string, customCssUrl?: string) => Promise<{
        ok: boolean
        entries?: { url: string; weight: string; style: string }[]
        error?: string
      }>
      exportTemplate: (version: unknown) => Promise<{ success: boolean; filePath?: string; error?: string }>
      openTemplatesFolder: () => Promise<{ success: boolean; path?: string }>
      onTemplateImported: (cb: (version: unknown) => void) => void
      onVersionsReloaded: (cb: (versions: unknown[]) => void) => void
      onApiRenderRequest: (cb: (payload: unknown) => void) => void
      sendApiRenderResponse: (response: unknown) => void
      exportGroup: (
        files: { filename: string; dataUrl: string }[],
        folderName?: string
      ) => Promise<{ success: boolean; folderPath?: string; error?: string }>
      writeClipboardTextAndImage: (
        text: string,
        pngBase64: string
      ) => Promise<{ success: boolean; text?: boolean; image?: boolean; error?: string }>
      writeClipboardImage: (pngBase64: string) => Promise<{ success: boolean; error?: string }>
      openCanvaAi: (
        payload?: { prompt?: string; pngBase64?: string }
      ) => Promise<{ success: boolean; filled?: boolean; login?: boolean; error?: string }>
      windowMinimize: () => void
      windowMaximize: () => void
      windowClose: () => void
      onWindowMaximized: (cb: (maximized: boolean) => void) => void
    }
  }
}

/** Full = version-logo/favicon-… · Group = logo.png / favicon-dark.png (same as group export). */
export type ExportNameStyle = 'full' | 'group'

const EXPORT_NAME_STYLE_KEY = 'imggen:exportNameStyle'

export function getStoredExportNameStyle(): ExportNameStyle {
  try {
    const v = localStorage.getItem(EXPORT_NAME_STYLE_KEY)
    return v === 'group' ? 'group' : 'full'
  } catch {
    return 'full'
  }
}

export function setStoredExportNameStyle(style: ExportNameStyle): void {
  try {
    localStorage.setItem(EXPORT_NAME_STYLE_KEY, style)
  } catch { /* ignore */ }
}

function sanitize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]/g, '-')
}

/** Favicon export sizes when the variant label is `16x16`, `32x32`, … */
const VARIANT_LABEL_EXPORT_SIZES = [16, 32, 64, 128, 256, 512] as const

/**
 * Parse variant labels like `16x16` / `32 x 32` into a square export pixel size.
 * Only the listed favicon sizes are accepted (width must equal height).
 */
export function exportPixelSizeFromVariantLabel(label?: string): number | undefined {
  const trimmed = (label ?? '').trim()
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec(trimmed)
  if (!m) return undefined
  const w = parseInt(m[1], 10)
  const h = parseInt(m[2], 10)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w !== h || w < 1) return undefined
  return VARIANT_LABEL_EXPORT_SIZES.includes(w as typeof VARIANT_LABEL_EXPORT_SIZES[number])
    ? w
    : undefined
}

/** Variant label → full-name fragment (`-dark`), or '' when blank. */
function fullSuffix(label?: string): string {
  const trimmed = (label ?? '').trim()
  if (!trimmed) return ''
  const slug = sanitize(trimmed).replace(/^-+|-+$/g, '')
  return slug ? `-${slug}` : ''
}

/**
 * Group-export style slug for a variant.
 * Empty label → '' (file becomes logo.png / favicon.png).
 */
export function groupVariantSlug(index: number, label?: string): string {
  const trimmed = (label ?? '').trim()
  if (!trimmed) return ''
  if (trimmed === 'Dark') return 'dark'
  if (trimmed === 'Light') return 'light'
  if (/^Variant \d+$/.test(trimmed)) return trimmed.split(' ')[1]
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || String(index + 1)
}

/** Group-export filename: `logo.png` / `logo-dark.png` / `favicon.ico` … */
export function groupExportFileName(
  kind: 'logo' | 'favicon',
  index: number,
  label: string,
  ext: 'png' | 'svg' | 'ico' = 'png'
): string {
  const suf = groupVariantSlug(index, label)
  return suf ? `${kind}-${suf}.${ext}` : `${kind}.${ext}`
}

export function buildLogoFileName(
  style: ExportNameStyle,
  versionName: string,
  ext: 'png' | 'svg',
  variantLabel?: string,
  variantIndex = 0
): string {
  if (style === 'group') {
    return groupExportFileName('logo', variantIndex, variantLabel ?? '', ext)
  }
  return `${sanitize(versionName)}-logo${fullSuffix(variantLabel)}.${ext}`
}

export function buildFaviconFileName(
  style: ExportNameStyle,
  versionName: string,
  ext: 'png' | 'svg' | 'ico',
  variantLabel?: string,
  variantIndex = 0,
  size?: number
): string {
  if (style === 'group') {
    return groupExportFileName('favicon', variantIndex, variantLabel ?? '', ext)
  }
  if (ext === 'png' && size != null) {
    return `${sanitize(versionName)}-favicon-${size}${fullSuffix(variantLabel)}.png`
  }
  return `${sanitize(versionName)}-favicon${fullSuffix(variantLabel)}.${ext}`
}

export interface ExportNameOpts {
  nameStyle?: ExportNameStyle
  variantIndex?: number
  highQuality?: boolean
  faviconIconSource?: FaviconConfig
}

// ── Logo export ───────────────────────────────────────────────────────────────

export async function exportLogoPng(
  config: LogoConfig,
  versionName: string,
  scale = 2,
  variantLabel?: string,
  opts?: ExportNameOpts
): Promise<void> {
  const canvas = document.createElement('canvas')
  await renderLogo(
    canvas,
    config,
    scale,
    opts?.highQuality ?? true,
    opts?.faviconIconSource
  )
  const filename = buildLogoFileName(
    opts?.nameStyle ?? 'full',
    versionName,
    'png',
    variantLabel,
    opts?.variantIndex ?? 0
  )
  await window.api.exportFile(canvas.toDataURL('image/png'), filename, 'png')
}

export async function exportLogoSvg(
  config: LogoConfig,
  versionName: string,
  variantLabel?: string,
  opts?: ExportNameOpts
): Promise<void> {
  const svg = await generateLogoSvg(config)
  const filename = buildLogoFileName(
    opts?.nameStyle ?? 'full',
    versionName,
    'svg',
    variantLabel,
    opts?.variantIndex ?? 0
  )
  await window.api.exportFile(svg, filename, 'svg')
}

// ── Favicon export ────────────────────────────────────────────────────────────

export async function exportFaviconPng(
  config: FaviconConfig,
  versionName: string,
  size = 512,
  variantLabel?: string,
  opts?: ExportNameOpts
): Promise<void> {
  const pixelSize = exportPixelSizeFromVariantLabel(variantLabel) ?? size
  const canvas = document.createElement('canvas')
  await renderFavicon(canvas, { ...config, size: pixelSize })
  const filename = buildFaviconFileName(
    opts?.nameStyle ?? 'full',
    versionName,
    'png',
    variantLabel,
    opts?.variantIndex ?? 0,
    pixelSize
  )
  await window.api.exportFile(canvas.toDataURL('image/png'), filename, 'png')
}

export async function exportFaviconSvg(
  config: FaviconConfig,
  versionName: string,
  variantLabel?: string,
  opts?: ExportNameOpts
): Promise<void> {
  const svg = await generateFaviconSvg(config)
  const filename = buildFaviconFileName(
    opts?.nameStyle ?? 'full',
    versionName,
    'svg',
    variantLabel,
    opts?.variantIndex ?? 0
  )
  await window.api.exportFile(svg, filename, 'svg')
}

export async function exportFaviconIco(
  config: FaviconConfig,
  versionName: string,
  variantLabel?: string,
  opts?: ExportNameOpts
): Promise<void> {
  const labelSize = exportPixelSizeFromVariantLabel(variantLabel)
  const sizes = labelSize ? [labelSize] : [16, 32, 48, 256]
  const pngDataUrls = await Promise.all(
    sizes.map(async (size) => {
      const canvas = document.createElement('canvas')
      await renderFavicon(canvas, { ...config, size })
      return canvas.toDataURL('image/png')
    })
  )
  const filename = buildFaviconFileName(
    opts?.nameStyle ?? 'full',
    versionName,
    'ico',
    variantLabel,
    opts?.variantIndex ?? 0
  )
  await window.api.exportIco(pngDataUrls, filename)
}

/** Encode raw bytes as a data URL for group-export zip/folder writes. */
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:${mime};base64,${btoa(binary)}`
}

export function svgStringToDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  return bytesToDataUrl(bytes, 'image/svg+xml')
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Pack PNG data URLs into a Vista+ ICO (PNG-compressed images) as a data URL.
 * Used for group export so the renderer does not need Node's png-to-ico.
 */
export function pngDataUrlsToIcoDataUrl(pngDataUrls: string[]): string {
  const pngs = pngDataUrls.map(dataUrlToUint8Array)
  const count = pngs.length
  const headerSize = 6
  const dirEntrySize = 16
  const dirSize = headerSize + dirEntrySize * count
  let offset = dirSize
  const offsets: number[] = []
  for (const png of pngs) {
    offsets.push(offset)
    offset += png.length
  }
  const out = new Uint8Array(offset)
  const view = new DataView(out.buffer)
  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true)
  view.setUint16(4, count, true)
  for (let i = 0; i < count; i++) {
    const png = pngs[i]
    const entry = headerSize + i * dirEntrySize
    let w = 0
    let h = 0
    if (
      png.length >= 24 &&
      png[12] === 0x49 &&
      png[13] === 0x48 &&
      png[14] === 0x44 &&
      png[15] === 0x52
    ) {
      const ihdr = new DataView(png.buffer, png.byteOffset + 16, 8)
      const pw = ihdr.getUint32(0)
      const ph = ihdr.getUint32(4)
      w = pw >= 256 ? 0 : pw
      h = ph >= 256 ? 0 : ph
    }
    out[entry] = w
    out[entry + 1] = h
    out[entry + 2] = 0
    out[entry + 3] = 0
    view.setUint16(entry + 4, 1, true)
    view.setUint16(entry + 6, 32, true)
    view.setUint32(entry + 8, png.length, true)
    view.setUint32(entry + 12, offsets[i], true)
    out.set(png, offsets[i])
  }
  return bytesToDataUrl(out, 'image/x-icon')
}

/** Build favicon ICO data URL (same sizes as single-file ICO export). */
export async function buildFaviconIcoDataUrl(
  config: FaviconConfig,
  variantLabel?: string
): Promise<string> {
  const labelSize = exportPixelSizeFromVariantLabel(variantLabel)
  const sizes = labelSize ? [labelSize] : [16, 32, 48, 256]
  const pngDataUrls = await Promise.all(
    sizes.map(async (size) => {
      const canvas = document.createElement('canvas')
      await renderFavicon(canvas, { ...config, size })
      return canvas.toDataURL('image/png')
    })
  )
  return pngDataUrlsToIcoDataUrl(pngDataUrls)
}
