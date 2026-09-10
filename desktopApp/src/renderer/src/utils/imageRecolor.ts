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

/**
 * True when the user turned Original colours off and changed at least one Color
 * slot away from the scanned palette (or set a slot with no palette yet).
 * Untouched “Original off but colours still = palette” counts as default.
 */
export function hasCustomImageRecolor(fields: {
  imageUseOriginalColors?: boolean
  imagePalette?: string[]
  imageColor1?: string
  imageColor2?: string
  imageColor3?: string
  imageColor4?: string
  imageColor5?: string
} | null | undefined): boolean {
  if (!fields || fields.imageUseOriginalColors !== false) return false
  const palette = fields.imagePalette ?? []
  const slots = [
    fields.imageColor1,
    fields.imageColor2,
    fields.imageColor3,
    fields.imageColor4,
    fields.imageColor5
  ]
  for (let i = 0; i < MAX_PALETTE; i++) {
    const slot = (slots[i] ?? '').trim().toLowerCase()
    if (!slot) continue
    const orig = (palette[i] ?? '').trim().toLowerCase()
    if (slot !== orig) return true
  }
  return false
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
  imageColorMarkPng?: string
}): Promise<string> {
  const src = fields.imageDataUrl ?? ''
  if (!src) return ''
  if (fields.imageUseOriginalColors !== false) return src
  const mark = await decodeColorMarkPng(fields.imageColorMarkPng)
  if (mark && mark.marks.some((v) => v > 0)) {
    const colors = [
      fields.imageColor1 || fields.imagePalette?.[0] || '',
      fields.imageColor2 || fields.imagePalette?.[1] || '',
      fields.imageColor3 || fields.imagePalette?.[2] || '',
      fields.imageColor4 || fields.imagePalette?.[3] || '',
      fields.imageColor5 || fields.imagePalette?.[4] || ''
    ]
    return applyColorMarksRecolor(src, mark.marks, mark.w, mark.h, colors)
  }
  const palette = fields.imagePalette ?? []
  if (!palette.length) return src
  return applyImagePaletteRecolor(src, palette, imageReplacementColors(fields))
}

export type ColorMarkMap = { marks: Uint8Array; w: number; h: number }

/** Encode mark ids 0–5 into the red channel of an opaque PNG. */
export function encodeColorMarkPng(marks: Uint8Array, w: number, h: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, w)
  canvas.height = Math.max(1, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(canvas.width, canvas.height)
  const n = Math.min(marks.length, canvas.width * canvas.height)
  for (let p = 0; p < n; p++) {
    const i = p * 4
    const m = marks[p] & 0xff
    img.data[i] = m
    img.data[i + 1] = 0
    img.data[i + 2] = 0
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

export async function decodeColorMarkPng(
  dataUrl: string | null | undefined
): Promise<ColorMarkMap | null> {
  if (!dataUrl) return null
  const img = await loadCachedImage(dataUrl)
  if (!img || !img.width || !img.height) return null
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const marks = new Uint8Array(canvas.width * canvas.height)
  for (let p = 0; p < marks.length; p++) {
    const m = data[p * 4]
    marks[p] = m >= 1 && m <= MAX_PALETTE ? m : 0
  }
  return { marks, w: canvas.width, h: canvas.height }
}

/**
 * Assign each opaque pixel to the nearest palette slot (1–5). Transparent → 0.
 */
export async function buildDefaultColorMarks(
  dataUrl: string,
  palette: string[]
): Promise<ColorMarkMap | null> {
  if (!dataUrl || !palette.length) return null
  const img = await loadCachedImage(dataUrl)
  if (!img || !img.width || !img.height) return null
  const w = img.width
  const h = img.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, w, h)
  const fromRgb: [number, number, number][] = []
  for (const hex of palette.slice(0, MAX_PALETTE)) {
    const rgb = parseHex(hex)
    if (rgb) fromRgb.push(rgb)
  }
  if (!fromRgb.length) return null
  const marks = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    if (data[i + 3] < 40) {
      marks[p] = 0
      continue
    }
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
    marks[p] = (best + 1) as number
  }
  return { marks, w, h }
}

/** Recolor marked pixels to Color 1–5; unmarked pixels keep the source. */
export async function applyColorMarksRecolor(
  dataUrl: string,
  marks: Uint8Array,
  w: number,
  h: number,
  colors: string[]
): Promise<string> {
  if (!dataUrl || !marks.length) return dataUrl
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
  const toRgb: ([number, number, number] | null)[] = []
  for (let s = 0; s < MAX_PALETTE; s++) {
    toRgb.push(parseHex(colors[s] || '') )
  }
  const mw = w
  const mh = h
  const sameSize = mw === canvas.width && mh === canvas.height
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      if (data[i + 3] === 0) continue
      let mark = 0
      if (sameSize) {
        mark = marks[y * mw + x] ?? 0
      } else {
        const mx = Math.min(mw - 1, Math.floor((x / canvas.width) * mw))
        const my = Math.min(mh - 1, Math.floor((y / canvas.height) * mh))
        mark = marks[my * mw + mx] ?? 0
      }
      if (mark < 1 || mark > MAX_PALETTE) continue
      const rgb = toRgb[mark - 1]
      if (!rgb) continue
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Flood a connected same-colour region on the source bitmap (for Match / Fill). */
export async function floodImageRegionMask(
  dataUrl: string,
  localX: number,
  localY: number,
  colorTol = 40
): Promise<{ region: Uint8Array; w: number; h: number; seedRgb: [number, number, number] } | null> {
  const img = await loadCachedImage(dataUrl)
  if (!img || !img.width || !img.height) return null
  const w = img.width
  const h = img.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, w, h)
  const px = Math.max(0, Math.min(w - 1, Math.floor(localX)))
  const py = Math.max(0, Math.min(h - 1, Math.floor(localY)))
  const idx = (py * w + px) * 4
  if (data[idx + 3] <= 8) return null
  const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2]
  const region = new Uint8Array(w * h)
  const stack: number[] = [px, py]
  region[py * w + px] = 1
  while (stack.length) {
    const y = stack.pop()!
    const x = stack.pop()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const p = ny * w + nx
      if (region[p]) continue
      const i = p * 4
      if (data[i + 3] <= 8) continue
      if (
        Math.abs(data[i] - tr) + Math.abs(data[i + 1] - tg) + Math.abs(data[i + 2] - tb) >
        colorTol
      ) {
        continue
      }
      region[p] = 1
      stack.push(nx, ny)
    }
  }
  return { region, w, h, seedRgb: [tr, tg, tb] }
}
