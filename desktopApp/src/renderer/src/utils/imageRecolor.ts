/**
 * Scan a raster image for up to 5 dominant opaque colours, and remapping those
 * slots at draw time (same idea as SVG Color 1–5).
 */

import { loadCachedImage } from './iconUtils'

const MAX_PALETTE = 5
const SCAN_MAX_DIM = 96
const MERGE_DIST = 48
const MAP_DIST = 96

function rgbDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
}

function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')
  )
}

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.trim().replace('#', '')
  if (h.length < 6) return null
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return [r, g, b]
}

/** Quantize to reduce anti-alias / JPEG noise before clustering. */
function quantize(v: number): number {
  return Math.round(v / 24) * 24
}

export interface ImageRecolorFields {
  imagePalette: string[]
  imageUseOriginalColors: boolean
  imageColor1: string
  imageColor2: string
  imageColor3: string
  imageColor4: string
  imageColor5: string
}

export function emptyImageRecolorFields(): ImageRecolorFields {
  return {
    imagePalette: [],
    imageUseOriginalColors: true,
    imageColor1: '',
    imageColor2: '',
    imageColor3: '',
    imageColor4: '',
    imageColor5: ''
  }
}

const IMAGE_RECOLOR_KEYS = new Set([
  'imageUseOriginalColors',
  'imagePalette',
  'imageColor1',
  'imageColor2',
  'imageColor3',
  'imageColor4',
  'imageColor5'
])

/** True when a patch only tweaks image colour remapping (paint session can stay). */
export function isImageRecolorPatch(patch: object): boolean {
  const keys = Object.keys(patch)
  return keys.length > 0 && keys.every((k) => IMAGE_RECOLOR_KEYS.has(k))
}

export function imageRecolorFieldsFromPalette(palette: string[]): ImageRecolorFields {
  const p = palette.slice(0, MAX_PALETTE)
  return {
    imagePalette: p,
    imageUseOriginalColors: true,
    imageColor1: p[0] ?? '',
    imageColor2: p[1] ?? '',
    imageColor3: p[2] ?? '',
    imageColor4: p[3] ?? '',
    imageColor5: p[4] ?? ''
  }
}

/**
 * After a paint/upload: scan the new bitmap.
 * - Original colours ON → store palette for later, show image as-is.
 * - Original colours OFF → store new palette and keep the user's Color 1–5
 *   replacements so remapping applies immediately to the new pixels.
 */
export async function recolorFieldsAfterImageChange(
  dataUrl: string,
  previous: {
    imageUseOriginalColors?: boolean
    imageColor1?: string
    imageColor2?: string
    imageColor3?: string
    imageColor4?: string
    imageColor5?: string
  } | null | undefined
): Promise<ImageRecolorFields> {
  const palette = await scanImagePalette(dataUrl)
  const useOriginal = previous?.imageUseOriginalColors !== false
  if (useOriginal || !palette.length) {
    return imageRecolorFieldsFromPalette(palette)
  }
  return {
    imagePalette: palette,
    imageUseOriginalColors: false,
    imageColor1: (previous?.imageColor1 || '').trim() || palette[0] || '',
    imageColor2: (previous?.imageColor2 || '').trim() || palette[1] || '',
    imageColor3: (previous?.imageColor3 || '').trim() || palette[2] || '',
    imageColor4: (previous?.imageColor4 || '').trim() || palette[3] || '',
    imageColor5: (previous?.imageColor5 || '').trim() || palette[4] || ''
  }
}

export function imageReplacementColors(fields: {
  imagePalette?: string[]
  imageColor1?: string
  imageColor2?: string
  imageColor3?: string
  imageColor4?: string
  imageColor5?: string
}): string[] {
  const palette = fields.imagePalette ?? []
  const slots = [
    fields.imageColor1,
    fields.imageColor2,
    fields.imageColor3,
    fields.imageColor4,
    fields.imageColor5
  ]
  return palette.map((orig, i) => {
    const c = (slots[i] ?? '').trim()
    return c || orig
  })
}

/**
 * Extract up to 5 dominant opaque colours from an image data URL.
 */
export async function scanImagePalette(dataUrl: string, maxColors = MAX_PALETTE): Promise<string[]> {
  if (!dataUrl) return []
  const img = await loadCachedImage(dataUrl)
  if (!img || !img.width || !img.height) return []

  const scale = Math.min(1, SCAN_MAX_DIM / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  type Bucket = { r: number; g: number; b: number; count: number }
  const buckets = new Map<string, Bucket>()

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 40) continue
    const r = quantize(data[i])
    const g = quantize(data[i + 1])
    const b = quantize(data[i + 2])
    const key = `${r},${g},${b}`
    const existing = buckets.get(key)
    if (existing) existing.count++
    else buckets.set(key, { r, g, b, count: 1 })
  }

  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count)
  const merged: Bucket[] = []
  for (const bucket of sorted) {
    const near = merged.find(
      (m) => rgbDist([m.r, m.g, m.b], [bucket.r, bucket.g, bucket.b]) <= MERGE_DIST
    )
    if (near) {
      const total = near.count + bucket.count
      near.r = Math.round((near.r * near.count + bucket.r * bucket.count) / total)
      near.g = Math.round((near.g * near.count + bucket.g * bucket.count) / total)
      near.b = Math.round((near.b * near.count + bucket.b * bucket.count) / total)
      near.count = total
    } else {
      merged.push({ ...bucket })
    }
  }

  return merged
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map((c) => toHex(c.r, c.g, c.b))
}

const recolorCache = new Map<string, string>()
const MAX_RECOLOR_CACHE = 40

function recolorCacheKey(src: string, palette: string[], replacements: string[]): string {
  return `${src.length}:${src.slice(22, 54)}:${src.slice(-32)}|${palette.join(',')}|${replacements.join(',')}`
}

/**
 * Remap palette colours in an image to replacement colours (preserves alpha).
 * Returns a PNG data URL, or the original src when remapping is a no-op.
 */
export async function applyImagePaletteRecolor(
  dataUrl: string,
  palette: string[],
  replacements: string[]
): Promise<string> {
  if (!dataUrl || !palette.length) return dataUrl

  const fromRgb: [number, number, number][] = []
  const toRgb: [number, number, number][] = []
  let changed = false
  for (let i = 0; i < palette.length; i++) {
    const from = parseHex(palette[i])
    const to = parseHex(replacements[i] || palette[i])
    if (!from || !to) continue
    fromRgb.push(from)
    toRgb.push(to)
    if (from[0] !== to[0] || from[1] !== to[1] || from[2] !== to[2]) changed = true
  }
  if (!fromRgb.length || !changed) return dataUrl

  const key = recolorCacheKey(dataUrl, palette, replacements)
  const cached = recolorCache.get(key)
  if (cached) return cached

  const img = await loadCachedImage(dataUrl)
  if (!img) return dataUrl

  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const pixel: [number, number, number] = [data[i], data[i + 1], data[i + 2]]
    let best = 0
    let bestDist = rgbDist(pixel, fromRgb[0])
    for (let s = 1; s < fromRgb.length; s++) {
      const d = rgbDist(pixel, fromRgb[s])
      if (d < bestDist) {
        bestDist = d
        best = s
      }
    }
    if (bestDist > MAP_DIST) continue
    const [nr, ng, nb] = toRgb[best]
    data[i] = nr
    data[i + 1] = ng
    data[i + 2] = nb
  }

  ctx.putImageData(imageData, 0, 0)
  const out = canvas.toDataURL('image/png')
  if (recolorCache.size >= MAX_RECOLOR_CACHE) {
    recolorCache.delete(recolorCache.keys().next().value as string)
  }
  recolorCache.set(key, out)
  return out
}

/** Resolve the data URL that should be drawn for an image icon/content. */
export async function resolveImageDataUrl(fields: {
  imageDataUrl?: string
  imageUseOriginalColors?: boolean
  imagePalette?: string[]
  imageColor1?: string
  imageColor2?: string
  imageColor3?: string
  imageColor4?: string
  imageColor5?: string
}): Promise<string> {
  const src = fields.imageDataUrl ?? ''
  if (!src) return ''
  if (fields.imageUseOriginalColors !== false) return src
  const palette = fields.imagePalette ?? []
  if (!palette.length) return src
  return applyImagePaletteRecolor(src, palette, imageReplacementColors(fields))
}
