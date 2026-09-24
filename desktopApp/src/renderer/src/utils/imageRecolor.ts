/**
 * Scan a raster image for up to 5 dominant opaque colours, and remapping those
 * slots at draw time (same idea as SVG Color 1–5).
 */

import { loadCachedImage } from './iconUtils'
import { fitRasterDataUrl } from './imageFit'

const MAX_PALETTE = 5
const SCAN_MAX_DIM = 96
const MERGE_DIST = 48
const MAP_DIST = 96

type Rgba = [number, number, number, number]

function rgbDist(a: ArrayLike<number>, b: ArrayLike<number>): number {
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

function parseHex(hex: string): Rgba | null {
  const h = hex.trim().replace('#', '')
  if (h.length < 6) return null
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  let a = 255
  if (h.length >= 8) {
    const parsed = parseInt(h.slice(6, 8), 16)
    if (!Number.isNaN(parsed)) a = parsed
  }
  return [r, g, b, a]
}

/** Scale the source pixel alpha by the slot opacity so soft edges stay soft. */
function paintSlot(data: Uint8ClampedArray, i: number, rgba: Rgba): void {
  data[i] = rgba[0]
  data[i + 1] = rgba[1]
  data[i + 2] = rgba[2]
  if (rgba[3] < 255) data[i + 3] = Math.round((data[i + 3] * rgba[3]) / 255)
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
 * After a paint/upload when Match maps are not rebuilt here.
 * Stores the new image's own colours and leaves Original colours on so a
 * previous Color 1–5 palette is not painted onto the bitmap.
 * Prefer seedUploadedImageColors when marks should be written too.
 */
export async function recolorFieldsAfterImageChange(
  dataUrl: string
): Promise<ImageRecolorFields> {
  const palette = await scanImagePalette(dataUrl)
  return imageRecolorFieldsFromPalette(palette)
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
export async function scanImagePalette(
  dataUrl: string,
  maxColors = MAX_PALETTE,
  maxDim = SCAN_MAX_DIM
): Promise<string[]> {
  if (!dataUrl) return []
  const img = await loadCachedImage(dataUrl)
  if (!img || !img.width || !img.height) return []

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
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

/** Soft / AA fringe — below this is treated as outline matte, not solid ink. */
const FRINGE_ALPHA_MAX = 239
/** Solid ink used to harden inward soft pixels. */
const SOLID_ALPHA_MIN = 240
/** How far (px) to look when classifying outer vs inner fringe. */
const AA_CLEAN_RADIUS = 3

/**
 * Remove soft AA outline instead of recolouring it (recolouring kept low alpha
 * and made the rim bigger / more obvious).
 *
 * • Soft pixels near empty space → cleared (outer halo gone; silhouette trims).
 * • Soft pixels boxed in by solid ink → hardened to that solid RGB at full alpha.
 */
function cleanAaOutlineMatte(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius = AA_CLEAN_RADIUS
): void {
  const n = w * h
  const solid = new Uint8Array(n)
  const empty = new Uint8Array(n)
  for (let p = 0; p < n; p++) {
    const a = data[p * 4 + 3]
    if (a >= SOLID_ALPHA_MIN) solid[p] = 1
    else if (a === 0) empty[p] = 1
  }

  const nearWithin = (x: number, y: number, mask: Uint8Array): boolean => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue
        if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
          // Past the bitmap edge counts as empty for outer-fringe tests.
          if (mask === empty) return true
          continue
        }
        if (mask[ny * w + nx]) return true
      }
    }
    return false
  }

  const nearestSolidRgb = (x: number, y: number): [number, number, number] | null => {
    let bestDist = radius + 1
    let bestA = -1
    let br = 0
    let bg = 0
    let bb = 0
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cheb = Math.max(Math.abs(dx), Math.abs(dy))
        if (cheb === 0 || cheb > radius) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const np = ny * w + nx
        if (!solid[np]) continue
        const ni = np * 4
        const na = data[ni + 3]
        if (cheb < bestDist || (cheb === bestDist && na > bestA)) {
          bestDist = cheb
          bestA = na
          br = data[ni]
          bg = data[ni + 1]
          bb = data[ni + 2]
        }
      }
    }
    return bestDist <= radius ? [br, bg, bb] : null
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const i = p * 4
      const a = data[i + 3]
      if (a === 0 || a > FRINGE_ALPHA_MAX) continue

      const touchesEmpty = nearWithin(x, y, empty)
      const touchesSolid = nearWithin(x, y, solid)

      if (touchesEmpty) {
        // Outer AA ring / halo — drop it so the outline does not read thicker.
        data[i] = 0
        data[i + 1] = 0
        data[i + 2] = 0
        data[i + 3] = 0
        continue
      }

      if (touchesSolid) {
        const rgb = nearestSolidRgb(x, y)
        if (!rgb) continue
        data[i] = rgb[0]
        data[i + 1] = rgb[1]
        data[i + 2] = rgb[2]
        data[i + 3] = 255
      }
    }
  }
}

/**
 * Clean soft AA outline on a bitmap (strip outer fringe, harden inward soft).
 * Used by the on-demand Clean AA action.
 */
export async function bleedSoftAaEdgesOnBitmap(dataUrl: string): Promise<string> {
  if (!dataUrl) return dataUrl
  const img = await loadCachedImage(dataUrl)
  if (!img || !img.width || !img.height) return dataUrl
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  cleanAaOutlineMatte(imageData.data, canvas.width, canvas.height, AA_CLEAN_RADIUS)
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Alpha at/above this counts as solid ink when rebuilding Smooth AA. */
const SMOOTH_AA_SOLID_MIN = 128

/**
 * Rebuild a soft coverage fringe for hard / jagged silhouettes.
 * Binary mask → 2× nearest → overlapping box filter (mixes neighbouring
 * source pixels) with premultiplied alpha so edges soften visibly.
 */
export async function smoothAaEdgesOnBitmap(dataUrl: string): Promise<string> {
  if (!dataUrl) return dataUrl
  const img = await loadCachedImage(dataUrl)
  if (!img || !img.width || !img.height) return dataUrl
  const w = img.width
  const h = img.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)
  const src = ctx.getImageData(0, 0, w, h).data

  // 2× hard silhouette (each solid pixel → opaque 2×2). Premultiplied floats.
  const W2 = w * 2
  const H2 = h * 2
  const bigR = new Float32Array(W2 * H2)
  const bigG = new Float32Array(W2 * H2)
  const bigB = new Float32Array(W2 * H2)
  const bigA = new Float32Array(W2 * H2)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (src[i + 3]! < SMOOTH_AA_SOLID_MIN) continue
      const pr = src[i]!
      const pg = src[i + 1]!
      const pb = src[i + 2]!
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const bp = (y * 2 + dy) * W2 + (x * 2 + dx)
          // Premultiplied (a = 1).
          bigR[bp] = pr
          bigG[bp] = pg
          bigB[bp] = pb
          bigA[bp] = 1
        }
      }
    }
  }

  // Overlapping 4×4 box on the 2× grid so each output mixes neighbouring
  // source pixels (a self-only 2×2 box is a no-op and looks unchanged).
  const out = ctx.createImageData(w, h)
  const dst = out.data
  const filter = 4
  const half = filter / 2 // 2 → window starts at 2x-1
  const samples = filter * filter
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0
      let sg = 0
      let sb = 0
      let sa = 0
      const x0 = x * 2 - (half - 1)
      const y0 = y * 2 - (half - 1)
      for (let fy = 0; fy < filter; fy++) {
        for (let fx = 0; fx < filter; fx++) {
          const bx = Math.min(W2 - 1, Math.max(0, x0 + fx))
          const by = Math.min(H2 - 1, Math.max(0, y0 + fy))
          const bp = by * W2 + bx
          sr += bigR[bp]!
          sg += bigG[bp]!
          sb += bigB[bp]!
          sa += bigA[bp]!
        }
      }
      const oi = (y * w + x) * 4
      if (sa <= 1e-6) {
        dst[oi] = 0
        dst[oi + 1] = 0
        dst[oi + 2] = 0
        dst[oi + 3] = 0
        continue
      }
      const inv = 1 / sa
      dst[oi] = Math.min(255, Math.round(sr * inv))
      dst[oi + 1] = Math.min(255, Math.round(sg * inv))
      dst[oi + 2] = Math.min(255, Math.round(sb * inv))
      dst[oi + 3] = Math.min(255, Math.round((sa / samples) * 255))
    }
  }
  ctx.putImageData(out, 0, 0)
  return canvas.toDataURL('image/png')
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

  const fromRgb: Rgba[] = []
  const toRgb: Rgba[] = []
  let changed = false
  for (let i = 0; i < palette.length; i++) {
    const from = parseHex(palette[i])
    const to = parseHex(replacements[i] || palette[i])
    if (!from || !to) continue
    fromRgb.push(from)
    toRgb.push(to)
    if (from[0] !== to[0] || from[1] !== to[1] || from[2] !== to[2] || from[3] !== to[3]) changed = true
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
    paintSlot(data, i, toRgb[best])
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
  imageColorRegionPng?: string
  imageUnmarkedColorSlot?: number
}): Promise<string> {
  const raw = fields.imageDataUrl ?? ''
  if (!raw) return ''
  if (fields.imageUseOriginalColors !== false) return raw
  // Draw from a capped bitmap. Full-size photos made recolour (and save) fail,
  // so the canvas and the upload preview stayed on the original pixels.
  const src = await fitRasterDataUrl(raw)
  const colors = [
    fields.imageColor1 || fields.imagePalette?.[0] || '',
    fields.imageColor2 || fields.imagePalette?.[1] || '',
    fields.imageColor3 || fields.imagePalette?.[2] || '',
    fields.imageColor4 || fields.imagePalette?.[3] || '',
    fields.imageColor5 || fields.imagePalette?.[4] || ''
  ]
  const palette = fields.imagePalette ?? []
  const recolorByPalette = async (base: string): Promise<string> => {
    if (!palette.length) return base
    return applyImagePaletteRecolor(base, palette, imageReplacementColors(fields))
  }
  let out = src
  if (fields.imageColorMarkPng) {
    const markPng = await fitRasterDataUrl(fields.imageColorMarkPng, 1024, { indexMap: true })
    const mark = await decodeColorMarkPng(markPng)
    const hasMarks = !!mark && mark.marks.some((v) => v > 0)
    if (mark && hasMarks) {
      out = await applyColorMarksRecolor(src, mark.marks, mark.w, mark.h, colors)
    } else {
      out = await recolorByPalette(src)
    }
  } else {
    out = await recolorByPalette(src)
  }
  const unmarkedSlot = fields.imageUnmarkedColorSlot
  if (
    fields.imageColorRegionPng &&
    unmarkedSlot != null &&
    unmarkedSlot >= 1 &&
    unmarkedSlot <= MAX_PALETTE
  ) {
    const regionPng = await fitRasterDataUrl(fields.imageColorRegionPng, 1024, { indexMap: true })
    out = await applyUnmarkedRestRecolor(out, regionPng, unmarkedSlot, colors)
  }
  return out
}

type ImageSlotFields = Parameters<typeof resolveImageDataUrl>[0]

function imageSlotColors(fields: ImageSlotFields): string[] {
  return [
    fields.imageColor1 || fields.imagePalette?.[0] || '',
    fields.imageColor2 || fields.imagePalette?.[1] || '',
    fields.imageColor3 || fields.imagePalette?.[2] || '',
    fields.imageColor4 || fields.imagePalette?.[3] || '',
    fields.imageColor5 || fields.imagePalette?.[4] || ''
  ]
}

/**
 * Opaque mask of Color 1–5 pixels whose slot is 0% opacity.
 * Used to punch those regions through layers already drawn under the image.
 * Empty when Original colours is on, or no slot is fully transparent.
 */
export async function imageZeroAlphaPunchMask(fields: ImageSlotFields): Promise<string> {
  if (fields.imageUseOriginalColors !== false || !fields.imageDataUrl) return ''
  const colors = imageSlotColors(fields)
  const zero = colors.map((hex) => {
    const rgba = parseHex(hex)
    return !!rgba && rgba[3] === 0
  })
  if (!zero.some(Boolean)) return ''

  const src = await fitRasterDataUrl(fields.imageDataUrl)
  const img = await loadCachedImage(src)
  if (!img || !img.width || !img.height) return ''

  let marks: Uint8Array | null = null
  let mw = 0
  let mh = 0
  if (fields.imageColorMarkPng) {
    const markPng = await fitRasterDataUrl(fields.imageColorMarkPng, 1024, { indexMap: true })
    const decoded = await decodeColorMarkPng(markPng)
    if (decoded && decoded.marks.some((v) => v > 0)) {
      marks = decoded.marks
      mw = decoded.w
      mh = decoded.h
    }
  }

  const paletteRgb: Rgba[] = []
  if (!marks) {
    for (const hex of fields.imagePalette ?? []) {
      const rgba = parseHex(hex)
      if (rgba) paletteRgb.push(rgba)
    }
    if (!paletteRgb.length) return ''
  }

  const unmarkedSlot = fields.imageUnmarkedColorSlot
  const useUnmarked =
    !!fields.imageColorRegionPng &&
    unmarkedSlot != null &&
    unmarkedSlot >= 1 &&
    unmarkedSlot <= MAX_PALETTE
  let region: Uint8ClampedArray | null = null
  let rw = 0
  let rh = 0
  if (useUnmarked && fields.imageColorRegionPng) {
    const regionPng = await fitRasterDataUrl(fields.imageColorRegionPng, 1024, { indexMap: true })
    const regionImg = await loadCachedImage(regionPng)
    if (regionImg) {
      const rc = document.createElement('canvas')
      rc.width = regionImg.width
      rc.height = regionImg.height
      const rctx = rc.getContext('2d', { willReadFrequently: true })
      if (rctx) {
        rctx.drawImage(regionImg, 0, 0)
        region = rctx.getImageData(0, 0, rc.width, rc.height).data
        rw = rc.width
        rh = rc.height
      }
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return ''
  ctx.drawImage(img, 0, 0)
  const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const out = ctx.createImageData(canvas.width, canvas.height)
  let any = false

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      if (srcData[i + 3] === 0) continue
      let slot = 0
      if (region && unmarkedSlot) {
        let ri = i
        if (rw !== canvas.width || rh !== canvas.height) {
          const mx = Math.min(rw - 1, Math.floor((x / canvas.width) * rw))
          const my = Math.min(rh - 1, Math.floor((y / canvas.height) * rh))
          ri = (my * rw + mx) * 4
        }
        if (region[ri + 2]! > 0) slot = unmarkedSlot
      }
      if (!slot && marks) {
        let mark = 0
        if (mw === canvas.width && mh === canvas.height) {
          mark = marks[y * mw + x] ?? 0
        } else {
          const mx = Math.min(mw - 1, Math.floor((x / canvas.width) * mw))
          const my = Math.min(mh - 1, Math.floor((y / canvas.height) * mh))
          mark = marks[my * mw + mx] ?? 0
        }
        if (mark >= 1 && mark <= MAX_PALETTE) slot = mark
      } else if (!slot && paletteRgb.length) {
        let best = 0
        let bestDist = rgbDist(srcData.subarray(i, i + 3), paletteRgb[0])
        for (let s = 1; s < paletteRgb.length; s++) {
          const d = rgbDist(srcData.subarray(i, i + 3), paletteRgb[s])
          if (d < bestDist) {
            bestDist = d
            best = s
          }
        }
        if (bestDist <= MAP_DIST) slot = best + 1
      }
      if (slot < 1 || !zero[slot - 1]) continue
      out.data[i + 3] = 255
      any = true
    }
  }
  if (!any) return ''
  ctx.putImageData(out, 0, 0)
  return canvas.toDataURL('image/png')
}

/**
 * Recolour Unmarked leftover regions (region PNG blue flag) with Color slot.
 * Does not use the Match mark map — leftovers stay Match-unmarked.
 */
export async function applyUnmarkedRestRecolor(
  dataUrl: string,
  regionPng: string,
  unmarkedSlot: number,
  colors: string[]
): Promise<string> {
  if (!dataUrl || !regionPng || unmarkedSlot < 1 || unmarkedSlot > MAX_PALETTE) return dataUrl
  const rgb = parseHex(colors[unmarkedSlot - 1] || '')
  if (!rgb) return dataUrl
  const img = await loadCachedImage(dataUrl)
  const regionImg = await loadCachedImage(regionPng)
  if (!img || !regionImg) return dataUrl
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  const rc = document.createElement('canvas')
  rc.width = regionImg.width
  rc.height = regionImg.height
  const rctx = rc.getContext('2d', { willReadFrequently: true })
  if (!rctx) return dataUrl
  rctx.drawImage(regionImg, 0, 0)
  const rd = rctx.getImageData(0, 0, rc.width, rc.height).data
  const sameSize = rc.width === canvas.width && rc.height === canvas.height

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      if (data[i + 3] === 0) continue
      let ri: number
      if (sameSize) {
        ri = i
      } else {
        const mx = Math.min(rc.width - 1, Math.floor((x / canvas.width) * rc.width))
        const my = Math.min(rc.height - 1, Math.floor((y / canvas.height) * rc.height))
        ri = (my * rc.width + mx) * 4
      }
      // Blue channel flags Unmarked leftovers.
      if (rd[ri + 2]! <= 0) continue
      paintSlot(data, i, rgb)
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

export type ImageAaBleedBakeResult = ImageRecolorFields & {
  imageDataUrl: string
  imageColorMarkPng?: string
  imageColorRegionPng?: string
  imageUnmarkedColorSlot?: number
}

type ImageEdgeBakeFields = {
  imageDataUrl?: string
  imageUseOriginalColors?: boolean
  imagePalette?: string[]
  imageColor1?: string
  imageColor2?: string
  imageColor3?: string
  imageColor4?: string
  imageColor5?: string
  imageColorMarkPng?: string
  imageColorRegionPng?: string
  imageUnmarkedColorSlot?: number
}

async function bakeImageWithEdgePass(
  fields: ImageEdgeBakeFields,
  edgePass: (dataUrl: string) => Promise<string>
): Promise<ImageAaBleedBakeResult | null> {
  const src = (fields.imageDataUrl ?? '').trim()
  if (!src) return null
  const keepOriginal = fields.imageUseOriginalColors !== false
  const display = await resolveImageDataUrl(fields)
  const processed = await edgePass(display || src)
  const hasMaps = !!(fields.imageColorMarkPng || fields.imageColorRegionPng)
  if (hasMaps) {
    return {
      imageDataUrl: processed,
      imagePalette: fields.imagePalette ?? [],
      imageUseOriginalColors: keepOriginal,
      imageColor1: fields.imageColor1 ?? '',
      imageColor2: fields.imageColor2 ?? '',
      imageColor3: fields.imageColor3 ?? '',
      imageColor4: fields.imageColor4 ?? '',
      imageColor5: fields.imageColor5 ?? '',
      imageColorMarkPng: fields.imageColorMarkPng,
      imageColorRegionPng: fields.imageColorRegionPng,
      imageUnmarkedColorSlot: fields.imageUnmarkedColorSlot
    }
  }
  const palette = await scanImagePalette(processed)
  const seeded = imageRecolorFieldsFromPalette(palette)
  return {
    imageDataUrl: processed,
    ...seeded,
    imageUseOriginalColors: keepOriginal,
    ...(keepOriginal
      ? {}
      : {
          imageColor1: (fields.imageColor1 || '').trim() || seeded.imageColor1,
          imageColor2: (fields.imageColor2 || '').trim() || seeded.imageColor2,
          imageColor3: (fields.imageColor3 || '').trim() || seeded.imageColor3,
          imageColor4: (fields.imageColor4 || '').trim() || seeded.imageColor4,
          imageColor5: (fields.imageColor5 || '').trim() || seeded.imageColor5
        }),
    imageColorMarkPng: '',
    imageColorRegionPng: '',
    imageUnmarkedColorSlot: undefined
  }
}

/**
 * Resolve the current Color 1–5 / Match / Unmarked look, strip outer soft AA
 * outline, and bake the cleaned bitmap. Preserves Match marks + Unmarked set.
 */
export async function bakeImageSoftAaBleed(
  fields: ImageEdgeBakeFields
): Promise<ImageAaBleedBakeResult | null> {
  return bakeImageWithEdgePass(fields, bleedSoftAaEdgesOnBitmap)
}

/**
 * Resolve colours, then rebuild a smooth coverage AA fringe for export.
 * Preserves Match marks + Unmarked set when maps exist.
 */
export async function bakeImageSmoothAa(
  fields: ImageEdgeBakeFields
): Promise<ImageAaBleedBakeResult | null> {
  return bakeImageWithEdgePass(fields, smoothAaEdgesOnBitmap)
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
  palette: string[],
  maxDist = Infinity
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
  const fromRgb: Rgba[] = []
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
    if (bestDist > maxDist) {
      marks[p] = 0
      continue
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
  const toRgb: (Rgba | null)[] = []
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
      paintSlot(data, i, rgb)
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
