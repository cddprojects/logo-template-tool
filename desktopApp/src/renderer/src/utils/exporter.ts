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
      saveVersions: (data: unknown[]) => Promise<{ success: boolean; error?: string }>
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
  const canvas = document.createElement('canvas')
  await renderFavicon(canvas, { ...config, size })
  const filename = buildFaviconFileName(
    opts?.nameStyle ?? 'full',
    versionName,
    'png',
    variantLabel,
    opts?.variantIndex ?? 0,
    size
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
  const sizes = [16, 32, 48, 256]
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
