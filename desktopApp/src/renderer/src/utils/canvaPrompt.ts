import type {
  CanvaBusinessType,
  CanvaDesignType,
  CanvaImageReference,
  FaviconConfig,
  FaviconContent,
  IconConfig
} from '../types'
import { drawIcon, renderFavicon } from './renderer'

export const CANVA_AI_URL = 'https://www.canva.com/ai'

export const CANVA_BUSINESS_TYPE_OPTIONS: { label: string; value: CanvaBusinessType }[] = [
  { label: 'Recruitment Services', value: 'recruitment-services' },
  { label: 'Dropshipping', value: 'dropshipping' },
  { label: 'Fraud Recovery Services', value: 'fraud-recovery-services' },
  { label: 'Investment/Stock', value: 'investment-stock' }
]

export const CANVA_DESIGN_TYPE_OPTIONS: { label: string; value: CanvaDesignType }[] = [
  { label: 'Vector', value: 'vector' },
  { label: 'Abstract', value: 'abstract' },
  { label: 'Vector art', value: 'vector-art' },
  { label: 'Icon', value: 'icon' }
]

export const CANVA_IMAGE_REFERENCE_OPTIONS: { label: string; value: CanvaImageReference }[] = [
  { label: 'None', value: 'none' },
  { label: 'Favicon', value: 'favicon' },
  { label: "Favicon's Inner content", value: 'favicon-inner' },
  { label: "Logo's icon", value: 'logo-icon' }
]

const BUSINESS_LABELS: Record<CanvaBusinessType, string> = {
  'recruitment-services': 'Recruitment Services',
  dropshipping: 'Dropshipping',
  'fraud-recovery-services': 'Fraud Recovery Services',
  'investment-stock': 'Investment/Stock'
}

const DESIGN_LABELS: Record<CanvaDesignType, string> = {
  vector: 'vector',
  abstract: 'abstract',
  'vector-art': 'vector art',
  icon: 'icon'
}

export function canvaBusinessLabel(type: CanvaBusinessType): string {
  return BUSINESS_LABELS[type] ?? BUSINESS_LABELS['recruitment-services']
}

export function canvaDesignLabel(type: CanvaDesignType): string {
  return DESIGN_LABELS[type] ?? DESIGN_LABELS.icon
}

export function canvaImageReference(content: FaviconContent): CanvaImageReference {
  return content.canvaImageReference ?? 'none'
}

/** Logo "Logo title" field — never the version name from the sidebar. */
export function resolveCanvaAppName(
  logoVariants: { label?: string; config?: { text?: string | null } | null }[],
  activeFaviconLabel?: string
): string {
  const matched = activeFaviconLabel
    ? logoVariants.find((v) => v.label === activeFaviconLabel)
    : undefined
  const fromMatch = matched?.config?.text?.trim()
  if (fromMatch) return fromMatch
  const fromAny = logoVariants.find((v) => v.config?.text?.trim())?.config?.text?.trim()
  return fromAny || 'App'
}

function describeCanvaColor(color: string, role: 'primary' | 'secondary'): string {
  const value = color.trim()
  const linear = value.match(
    /linear-gradient\((\d+(?:\.\d+)?)deg,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+(?:\.\d+)?)%,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+(?:\.\d+)?)%\)/
  )
  if (linear) {
    return `The ${role} color should be a linear gradient from ${linear[2]} at ${linear[3]}% to ${linear[4]} at ${linear[5]}%, at ${Math.round(parseFloat(linear[1]))} degrees`
  }
  const radial = value.match(
    /radial-gradient\(circle at (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+(?:\.\d+)?)%,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+(?:\.\d+)?)%\)/
  )
  if (radial) {
    return `The ${role} color should be a radial gradient from ${radial[3]} at ${radial[4]}% to ${radial[5]} at ${radial[6]}%, centered at ${Math.round(parseFloat(radial[1]))}% ${Math.round(parseFloat(radial[2]))}%`
  }
  if (value.startsWith('linear-gradient(')) {
    return `The ${role} color should be a linear gradient (${value})`
  }
  if (value.startsWith('radial-gradient(')) {
    return `The ${role} color should be a radial gradient (${value})`
  }
  return `The ${role} color used should be ${value || '#6366f1'}`
}

export function buildCanvaPrompt(content: FaviconContent, appName: string): string {
  const businessType = canvaBusinessLabel(content.canvaBusinessType ?? 'recruitment-services')
  const designType = canvaDesignLabel(content.canvaDesignType ?? 'icon')
  const primaryColor = content.canvaPrimaryColor?.trim() || '#6366f1'
  const secondaryColor = content.canvaSecondaryColor?.trim() ?? ''
  const name = appName.trim() || 'App'

  const colorClause = secondaryColor
    ? `${describeCanvaColor(primaryColor, 'primary')}, and ${describeCanvaColor(secondaryColor, 'secondary').replace(/^The secondary color/, 'the secondary color')}`
    : describeCanvaColor(primaryColor, 'primary')

  let prompt = `Generate a ${designType} favicon, 1:1 aspect ratio, 512px, transparent background. The subject must come from the business and brand — invent a mark that clearly belongs to a ${businessType} website named "${name}". Lean hard on that industry and name so the icon reads as their brand, not a generic shape. ${colorClause}. Do not include an outer shape, container frame, background plate, border, or shadow wrapper — only the inner icon or symbol on a transparent background.`

  if (canvaImageReference(content) !== 'none') {
    prompt += ' A reference image is attached for STYLE ONLY. Weakly keep its visual treatment (line weight, simplicity, finish) — do not copy its subject, letters, layout, or composition.'
  }

  return prompt
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to encode reference image'))
    }, 'image/png')
  })
}

const REF_SIZE = 512

/** PNG reference for pasting into Canva AI (512×512). Returns null when reference is None. */
export async function buildCanvaReferenceImageBlob(
  content: FaviconContent,
  faviconConfig: FaviconConfig,
  logoIcon?: IconConfig | null
): Promise<Blob | null> {
  const ref = canvaImageReference(content)
  if (ref === 'none') return null

  const canvas = document.createElement('canvas')
  canvas.width = REF_SIZE
  canvas.height = REF_SIZE

  switch (ref) {
    case 'favicon':
      await renderFavicon(canvas, { ...faviconConfig, size: REF_SIZE })
      break
    case 'favicon-inner':
      await renderFavicon(canvas, {
        ...faviconConfig,
        size: REF_SIZE,
        transparentBg: true,
        outerShape: 'none',
        outerShapeImageDataUrl: '',
        outerShapeSvgMarkup: '',
        borderWidth: 0,
        borderColor: 'transparent',
        shadowEnabled: false,
        shadowInset: false,
        shadowReserveOnly: true
      })
      break
    case 'logo-icon': {
      if (!logoIcon) throw new Error('No matching logo icon for reference')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas unavailable')
      ctx.clearRect(0, 0, REF_SIZE, REF_SIZE)
      await drawIcon(ctx, logoIcon, 0, 0, REF_SIZE)
      break
    }
  }

  return canvasToBlob(canvas)
}

export type CanvaClipboardResult = 'full' | 'text-only' | 'image-only' | 'failed'
export type CanvaOpenResult = 'filled' | 'login' | 'opened' | 'failed'

type ClipboardApi = {
  writeClipboardImage?: (pngBase64: string) => Promise<{ success: boolean }>
  writeClipboardTextAndImage?: (
    text: string,
    pngBase64: string
  ) => Promise<{ success: boolean; text?: boolean; image?: boolean }>
  openCanvaAi?: (
    payload?: { prompt?: string; pngBase64?: string }
  ) => Promise<{ success: boolean; filled?: boolean; login?: boolean; error?: string }>
}

function clipboardApi(): ClipboardApi {
  return ((window as Window & { api?: ClipboardApi }).api ?? {}) as ClipboardApi
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function pngBlobFromBase64(pngBase64: string): Blob {
  const bytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: 'image/png' })
}

/** Browser clipboard: text + PNG in one ClipboardItem so paste can pick either. */
export async function writeBrowserClipboardTextAndImage(
  text: string,
  imageBlob: Blob
): Promise<{ text: boolean; image: boolean }> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return { text: false, image: false }
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': Promise.resolve(new Blob([text], { type: 'text/plain' })),
        'image/png': Promise.resolve(imageBlob)
      })
    ])
    return { text: true, image: true }
  } catch {
    /* mixed payload rejected */
  }
  let image = false
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': Promise.resolve(imageBlob) })])
    image = true
  } catch {
    image = false
  }
  if (image) return { text: false, image: true }
  try {
    await navigator.clipboard.writeText(text)
    return { text: true, image: false }
  } catch {
    return { text: false, image: false }
  }
}

async function writeTextAndImage(text: string, imageBlob: Blob): Promise<{ text: boolean; image: boolean }> {
  const writeBoth = clipboardApi().writeClipboardTextAndImage
  if (typeof writeBoth === 'function') {
    const result = await writeBoth(text, await blobToBase64(imageBlob))
    if (result?.success || (result?.text && result?.image)) {
      return { text: true, image: true }
    }
    if (result?.image) return { text: false, image: true }
    if (result?.text) return { text: true, image: false }
  }
  return writeBrowserClipboardTextAndImage(text, imageBlob)
}

export async function copyCanvaPromptText(content: FaviconContent, appName: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildCanvaPrompt(content, appName))
    return true
  } catch {
    return false
  }
}

export async function copyCanvaReferenceImage(
  content: FaviconContent,
  faviconConfig: FaviconConfig,
  logoIcon?: IconConfig | null
): Promise<boolean> {
  const imageBlob = await buildCanvaReferenceImageBlob(content, faviconConfig, logoIcon)
  if (!imageBlob) return false
  const writeImage = clipboardApi().writeClipboardImage
  if (typeof writeImage === 'function') {
    const result = await writeImage(await blobToBase64(imageBlob))
    if (result?.success) return true
  }
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob })])
      return true
    } catch {
      return false
    }
  }
  return false
}

/** Open Canva AI, type the prompt, and leave the reference image on the clipboard. */
export async function openCanvaWithPromptAndReference(
  content: FaviconContent,
  appName: string,
  faviconConfig: FaviconConfig,
  logoIcon?: IconConfig | null
): Promise<CanvaOpenResult> {
  const prompt = buildCanvaPrompt(content, appName)
  const ref = canvaImageReference(content)
  let pngBase64 = ''
  if (ref !== 'none') {
    try {
      const imageBlob = await buildCanvaReferenceImageBlob(content, faviconConfig, logoIcon)
      if (imageBlob) pngBase64 = await blobToBase64(imageBlob)
    } catch {
      return 'failed'
    }
    if (!pngBase64) return 'failed'
  }

  const open = clipboardApi().openCanvaAi
  if (typeof open === 'function') {
    const result = await open({ prompt, pngBase64: pngBase64 || undefined })
    if (!result?.success) return 'failed'
    if (result.login && !result.filled) return 'login'
    if (result.filled) return 'filled'
    return 'opened'
  }

  try {
    if (pngBase64 && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const imageBlob = pngBlobFromBase64(pngBase64)
      const written = await writeBrowserClipboardTextAndImage(prompt, imageBlob)
      if (!written.text && !written.image) return 'failed'
    } else {
      await navigator.clipboard.writeText(prompt)
    }
  } catch {
    return 'failed'
  }
  window.open(CANVA_AI_URL, '_blank', 'noopener,noreferrer')
  return 'opened'
}

/**
 * Copy for Generate with Canva:
 * - With a reference image: prompt text + PNG on the clipboard together.
 * - No reference: copy the prompt text.
 */
export async function copyCanvaPromptAndReference(
  content: FaviconContent,
  appName: string,
  faviconConfig: FaviconConfig,
  logoIcon?: IconConfig | null
): Promise<CanvaClipboardResult> {
  const prompt = buildCanvaPrompt(content, appName)
  const ref = canvaImageReference(content)

  if (ref === 'none') {
    return (await copyCanvaPromptText(content, appName)) ? 'text-only' : 'failed'
  }

  try {
    const imageBlob = await buildCanvaReferenceImageBlob(content, faviconConfig, logoIcon)
    if (!imageBlob) return 'failed'
    const written = await writeTextAndImage(prompt, imageBlob)
    if (written.text && written.image) return 'full'
    if (written.image) return 'image-only'
    if (written.text) return 'text-only'
    return 'failed'
  } catch {
    return 'failed'
  }
}
