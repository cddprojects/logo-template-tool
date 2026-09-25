/**
 * Paint Match tool helpers for Inner uploaded images (contentBound stamps).
 *
 * Regions are fixed connected components from the source bitmap. Auto-seed
 * groups those regions into Color 1–5 by the colours actually in the image.
 * Color 1–5 are filled from those image colours. The bitmap is not repainted
 * to a previous Color 1–5 palette. Regions of a sixth distinct colour stay
 * unmarked.
 */

import {
  buildDefaultColorMarks,
  decodeColorMarkPng,
  encodeColorMarkPng,
  imageRecolorFieldsFromPalette,
  opaqueInkCounts,
  paletteFromPixels,
  resolveImageDataUrl,
  scanImagePalette,
  type ColorMarkMap
} from './imageRecolor'
import { loadCachedImage } from './iconUtils'
import { fitRasterDataUrl } from './imageFit'
import type { OutsideContentSettings, PaintSession, PaintVector } from '../types'
import { drawPaintStrokesInBox, type BrushTip, type LineObj } from '../components/iconPaint/paintHelpers'

const COLOR_TOL = 40

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.trim().replace('#', '')
  if (h.length < 6) return null
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return [r, g, b]
}

function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  )
}

/** Black or white label colour for contrast on a section fill. */
export function contrastLabelColor(hex: string): '#000000' | '#ffffff' {
  const rgb = parseHex(hex)
  if (!rgb) return '#ffffff'
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255
  return lum > 0.55 ? '#000000' : '#ffffff'
}

function loadImageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.width, h: img.height })
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

export function isInnerUploadedImageProxy(item: LineObj | null | undefined): boolean {
  return !!(
    item &&
    item.contentBound &&
    item.type === 'stamp' &&
    (item.stampSource === 'image' || item.stampSource == null) &&
    (item.imageSourceDataUrl || item.imageDataUrl)
  )
}

export type ImageRegionMap = {
  /** Region id per pixel (0 = transparent / empty). */
  regions: Uint16Array
  w: number
  h: number
  count: number
}

/** Encode region ids as R + G*256 PNG. */
export function encodeRegionPng(regions: Uint16Array, w: number, h: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, w)
  canvas.height = Math.max(1, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(canvas.width, canvas.height)
  const n = Math.min(regions.length, canvas.width * canvas.height)
  for (let p = 0; p < n; p++) {
    const id = regions[p] ?? 0
    const i = p * 4
    img.data[i] = id & 0xff
    img.data[i + 1] = (id >> 8) & 0xff
    img.data[i + 2] = 0
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

export async function decodeRegionPng(
  dataUrl: string | null | undefined
): Promise<ImageRegionMap | null> {
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
  const regions = new Uint16Array(canvas.width * canvas.height)
  let maxId = 0
  for (let p = 0; p < regions.length; p++) {
    const i = p * 4
    const id = data[i] | (data[i + 1] << 8)
    regions[p] = id
    if (id > maxId) maxId = id
  }
  return { regions, w: canvas.width, h: canvas.height, count: maxId }
}

/**
 * Partition opaque pixels into connected same-colour components (4-connected).
 * Adjacent components stay separate forever even if later given the same Color slot.
 */
export async function buildImageRegions(
  dataUrl: string,
  colorTol = COLOR_TOL
): Promise<ImageRegionMap | null> {
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
  const regions = new Uint16Array(w * h)
  let nextId = 0
  const stack: number[] = []

  for (let seed = 0; seed < w * h; seed++) {
    if (regions[seed]) continue
    if (data[seed * 4 + 3] < 16) continue
    nextId++
    if (nextId > 65535) break
    const tr = data[seed * 4]
    const tg = data[seed * 4 + 1]
    const tb = data[seed * 4 + 2]
    regions[seed] = nextId
    stack.length = 0
    stack.push(seed)
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w
      const y = (p / w) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const np = ny * w + nx
        if (regions[np]) continue
        const i = np * 4
        if (data[i + 3] < 16) continue
        if (
          Math.abs(data[i] - tr) + Math.abs(data[i + 1] - tg) + Math.abs(data[i + 2] - tb) >
          colorTol
        ) {
          continue
        }
        regions[np] = nextId
        stack.push(np)
      }
    }
  }
  return { regions, w, h, count: nextId }
}

/**
 * Build Color 1–5 marks from the region partition.
 * Slots are the image's own colours (largest regions first). Every region whose
 * average colour is near a slot shares that mark, so split / AA pieces of the
 * same colour share Color 1–5. A sixth distinct colour stays unmarked.
 * Slot hex values are those image colours — callers must copy them into
 * Color 1–5, not recolour the bitmap to a previous palette.
 */
export async function marksFromRegions(
  dataUrl: string,
  regionMap: ImageRegionMap
): Promise<(ColorMarkMap & { slotColors: string[] }) | null> {
  const img = await loadCachedImage(dataUrl)
  if (!img) return null
  const canvas = document.createElement('canvas')
  canvas.width = regionMap.w
  canvas.height = regionMap.h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, regionMap.w, regionMap.h)
  const { data } = ctx.getImageData(0, 0, regionMap.w, regionMap.h)

  const area = new Uint32Array(regionMap.count + 1)
  const sumR = new Float64Array(regionMap.count + 1)
  const sumG = new Float64Array(regionMap.count + 1)
  const sumB = new Float64Array(regionMap.count + 1)
  for (let p = 0; p < regionMap.regions.length; p++) {
    const id = regionMap.regions[p]
    if (!id) continue
    const i = p * 4
    if (data[i + 3] < 16) continue
    area[id]++
    sumR[id] += data[i]
    sumG[id] += data[i + 1]
    sumB[id] += data[i + 2]
  }

  const ranked: { id: number; area: number }[] = []
  for (let id = 1; id <= regionMap.count; id++) {
    if ((area[id] ?? 0) > 0) ranked.push({ id, area: area[id]! })
  }
  ranked.sort((a, b) => b.area - a.area)

  type Centroid = { r: number; g: number; b: number; w: number }
  const centroids: Centroid[] = []
  const regionSlot = new Uint8Array(regionMap.count + 1)
  /** Manhattan distance — same scale as region flood tolerance, a bit looser for AA. */
  const SLOT_DIST = 48
  const distTo = (rgb: [number, number, number], c: Centroid): number =>
    Math.abs(rgb[0] - c.r) + Math.abs(rgb[1] - c.g) + Math.abs(rgb[2] - c.b)

  for (const { id } of ranked) {
    const n = Math.max(1, area[id] ?? 1)
    const rgb: [number, number, number] = [sumR[id]! / n, sumG[id]! / n, sumB[id]! / n]
    let best = -1
    let bestDist = Infinity
    for (let s = 0; s < centroids.length; s++) {
      const d = distTo(rgb, centroids[s]!)
      if (d < bestDist) {
        bestDist = d
        best = s
      }
    }
    if (best >= 0 && bestDist <= SLOT_DIST) {
      regionSlot[id] = best + 1
      const c = centroids[best]!
      const tw = c.w + n
      c.r = (c.r * c.w + rgb[0] * n) / tw
      c.g = (c.g * c.w + rgb[1] * n) / tw
      c.b = (c.b * c.w + rgb[2] * n) / tw
      c.w = tw
    } else if (centroids.length < 5) {
      centroids.push({ r: rgb[0], g: rgb[1], b: rgb[2], w: n })
      regionSlot[id] = centroids.length
    }
  }
  if (!centroids.length) return null

  const slotColors: string[] = centroids.map((c) => toHex(c.r, c.g, c.b))
  while (slotColors.length < 5) slotColors.push('')

  const marks = new Uint8Array(regionMap.w * regionMap.h)
  for (let p = 0; p < marks.length; p++) {
    const id = regionMap.regions[p]
    marks[p] = id ? regionSlot[id] ?? 0 : 0
  }
  return { marks, w: regionMap.w, h: regionMap.h, slotColors: slotColors.slice(0, 5) }
}

function marksFromRegionSlots(
  regionMap: ImageRegionMap,
  regionSlot: Uint8Array
): ColorMarkMap {
  const marks = new Uint8Array(regionMap.w * regionMap.h)
  for (let p = 0; p < marks.length; p++) {
    const id = regionMap.regions[p]
    marks[p] = id ? regionSlot[id] ?? 0 : 0
  }
  return { marks, w: regionMap.w, h: regionMap.h }
}

function encodeRegionsWithRest(
  regions: Uint16Array,
  w: number,
  h: number,
  restById: Uint8Array
): string {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, w)
  canvas.height = Math.max(1, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(canvas.width, canvas.height)
  const n = Math.min(regions.length, canvas.width * canvas.height)
  for (let p = 0; p < n; p++) {
    const id = regions[p] ?? 0
    const i = p * 4
    img.data[i] = id & 0xff
    img.data[i + 1] = (id >> 8) & 0xff
    // Blue marks sections that came from Unmarked, so a later Color 1–5 pick
    // can recolour only those sections.
    img.data[i + 2] = id && restById[id] ? 1 : 0
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

async function restFlagsByRegion(
  regionPng: string | null | undefined,
  regionMap: ImageRegionMap
): Promise<Uint8Array> {
  const flags = new Uint8Array(regionMap.count + 1)
  if (!regionPng) return flags
  const img = await loadCachedImage(regionPng)
  if (!img || img.width !== regionMap.w || img.height !== regionMap.h) return flags
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return flags
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let p = 0; p < regionMap.regions.length; p++) {
    const id = regionMap.regions[p]
    if (!id) continue
    if (data[p * 4 + 2] > 0) flags[id] = 1
  }
  return flags
}

export type UnmarkedInkStatus = {
  /** Regions that are not Color 1–5 yet. */
  unmarkedCount: number
  /** Color slot last applied to Unmarked sections, if any. */
  restSlot: number | null
}

async function regionSlotsForUnmarked(opts: {
  imageDataUrl: string
  imageColorMarkPng?: string
  imageColorRegionPng?: string
}): Promise<{
  regionMap: ImageRegionMap
  regionSlot: Uint8Array
  rest: Uint8Array
  hadRegionPng: boolean
} | null> {
  const source = (opts.imageDataUrl || '').trim()
  if (!source) return null
  let regionMap = await decodeRegionPng(opts.imageColorRegionPng)
  const hadRegionPng = !!regionMap
  if (!regionMap) {
    regionMap = await buildImageRegions(source)
    if (!regionMap) return null
  }
  const markMap = await decodeColorMarkPng(opts.imageColorMarkPng)
  const hasMarks =
    !!markMap &&
    markMap.w === regionMap.w &&
    markMap.h === regionMap.h &&
    markMap.marks.some((m) => m >= 1 && m <= 5)
  let regionSlot: Uint8Array
  if (hasMarks && markMap) {
    regionSlot = regionSlotsFromMarks(regionMap, markMap.marks)
  } else {
    const seeded = await marksFromRegions(source, regionMap)
    regionSlot = seeded
      ? regionSlotsFromMarks(regionMap, seeded.marks)
      : new Uint8Array(regionMap.count + 1)
  }
  const rest = await restFlagsByRegion(opts.imageColorRegionPng, regionMap)
  return { regionMap, regionSlot, rest, hadRegionPng }
}

/** How many leftover sections still need Unmarked, and which Color slot leftovers use. */
export async function inspectUnmarkedInk(opts: {
  imageDataUrl: string
  imageColorMarkPng?: string
  imageColorRegionPng?: string
  imageUnmarkedColorSlot?: number
}): Promise<UnmarkedInkStatus | null> {
  const loaded = await regionSlotsForUnmarked(opts)
  if (!loaded) return null
  let unmarkedCount = 0
  for (let id = 1; id <= loaded.regionMap.count; id++) {
    // Already Match-marked or already claimed by Unmarked leftovers → not pending.
    if (loaded.regionSlot[id] || loaded.rest[id]) continue
    unmarkedCount++
  }
  const hasRest = loaded.rest.some((v) => v)
  let restSlot: number | null = null
  if (hasRest) {
    if (
      opts.imageUnmarkedColorSlot != null &&
      opts.imageUnmarkedColorSlot >= 1 &&
      opts.imageUnmarkedColorSlot <= 5
    ) {
      restSlot = opts.imageUnmarkedColorSlot
    } else {
      for (let id = 1; id <= loaded.regionMap.count; id++) {
        if (loaded.rest[id] && loaded.regionSlot[id]) {
          restSlot = loaded.regionSlot[id]!
          break
        }
      }
    }
  }
  return { unmarkedCount, restSlot }
}

/**
 * Paint leftover (Match-unmarked) regions with Color `slot` without Match-marking them.
 * Remembers that leftover set so the number button can recolour only those pixels.
 */
export async function assignUnmarkedInkToSlot(opts: {
  imageDataUrl: string
  imageColorMarkPng?: string
  imageColorRegionPng?: string
  slot: number
}): Promise<{
  imageColorMarkPng: string
  imageColorRegionPng: string
  imageUnmarkedColorSlot: number
} | null> {
  if (opts.slot < 1 || opts.slot > 5) return null
  const loaded = await regionSlotsForUnmarked(opts)
  if (!loaded) return null
  let any = false
  for (let id = 1; id <= loaded.regionMap.count; id++) {
    if (loaded.regionSlot[id] || loaded.rest[id]) continue
    // Stay Match-unmarked (slot 0); only flag as Unmarked leftover.
    loaded.rest[id] = 1
    any = true
  }
  if (!any) return null
  // Ensure leftovers never carry Match numbers (also clears older mistaken marks).
  for (let id = 1; id <= loaded.regionMap.count; id++) {
    if (loaded.rest[id]) loaded.regionSlot[id] = 0
  }
  const next = marksFromRegionSlots(loaded.regionMap, loaded.regionSlot)
  return {
    imageColorMarkPng: encodeColorMarkPng(next.marks, next.w, next.h),
    imageColorRegionPng: encodeRegionsWithRest(
      loaded.regionMap.regions,
      loaded.regionMap.w,
      loaded.regionMap.h,
      loaded.rest
    ),
    imageUnmarkedColorSlot: opts.slot
  }
}

/**
 * Recolour only the leftover set from Unmarked. Match-marked sections stay put.
 * Leftovers remain Match-unmarked (mark 0).
 */
export async function recolorUnmarkedGroup(opts: {
  imageDataUrl: string
  imageColorMarkPng?: string
  imageColorRegionPng?: string
  slot: number
}): Promise<{
  imageColorMarkPng: string
  imageColorRegionPng: string
  imageUnmarkedColorSlot: number
} | null> {
  if (opts.slot < 1 || opts.slot > 5) return null
  const loaded = await regionSlotsForUnmarked(opts)
  if (!loaded) return null
  let any = false
  for (let id = 1; id <= loaded.regionMap.count; id++) {
    if (!loaded.rest[id]) continue
    // Keep mark 0 — Unmarked leftovers are never Match section numbers.
    loaded.regionSlot[id] = 0
    any = true
  }
  if (!any) return null
  const next = marksFromRegionSlots(loaded.regionMap, loaded.regionSlot)
  return {
    imageColorMarkPng: encodeColorMarkPng(next.marks, next.w, next.h),
    imageColorRegionPng: encodeRegionsWithRest(
      loaded.regionMap.regions,
      loaded.regionMap.w,
      loaded.regionMap.h,
      loaded.rest
    ),
    imageUnmarkedColorSlot: opts.slot
  }
}

function regionSlotsFromMarks(
  regionMap: ImageRegionMap,
  marks: Uint8Array
): Uint8Array {
  const regionSlot = new Uint8Array(regionMap.count + 1)
  const votes = new Map<number, number[]>()
  for (let p = 0; p < regionMap.regions.length; p++) {
    const id = regionMap.regions[p]
    if (!id) continue
    const slot = marks[p] ?? 0
    if (slot < 1 || slot > 5) continue
    let v = votes.get(id)
    if (!v) {
      v = [0, 0, 0, 0, 0, 0]
      votes.set(id, v)
    }
    v[slot]++
  }
  for (const [id, v] of votes) {
    let best = 1
    for (let s = 2; s <= 5; s++) {
      if ((v[s] ?? 0) > (v[best] ?? 0)) best = s
    }
    regionSlot[id] = best
  }
  return regionSlot
}

export async function refreshStampFromMarks(item: LineObj): Promise<LineObj> {
  const source = item.imageSourceDataUrl || item.imageDataUrl
  if (!source) return item
  const display = await resolveImageDataUrl({
    imageDataUrl: source,
    imageUseOriginalColors: item.imageUseOriginalColors,
    imagePalette: item.imagePalette,
    imageColor1: item.imageColor1,
    imageColor2: item.imageColor2,
    imageColor3: item.imageColor3,
    imageColor4: item.imageColor4,
    imageColor5: item.imageColor5,
    imageColorMarkPng: item.colorMarkPng,
    imageColorRegionPng: item.colorRegionPng,
    imageUnmarkedColorSlot: item.unmarkedColorSlot
  })
  return { ...item, imageDataUrl: display || source }
}

/**
 * Attach Color 1–5 / source fields and set the stamp bitmap via the same
 * resolve path as the outside logo/favicon preview (no Match rebuild).
 */
export async function hydrateImageProxyColors(
  item: LineObj,
  settings: OutsideContentSettings | null | undefined
): Promise<LineObj> {
  if (!item.imageDataUrl && !settings?.imageSourceDataUrl && !item.imageSourceDataUrl) {
    return item
  }
  const source =
    (settings?.imageSourceDataUrl || item.imageSourceDataUrl || '').trim() ||
    item.imageDataUrl!
  let palette =
    settings?.imagePalette && settings.imagePalette.length > 0
      ? [...settings.imagePalette]
      : item.imagePalette && item.imagePalette.length > 0
        ? [...item.imagePalette]
        : await scanImagePalette(source)
  if (!palette.length) palette = await scanImagePalette(source)
  const defaults = palette.length ? imageRecolorFieldsFromPalette(palette) : null
  const colors = {
    imageColor1:
      (settings?.imageColor1 || item.imageColor1 || '').trim() || defaults?.imageColor1 || '',
    imageColor2:
      (settings?.imageColor2 || item.imageColor2 || '').trim() || defaults?.imageColor2 || '',
    imageColor3:
      (settings?.imageColor3 || item.imageColor3 || '').trim() || defaults?.imageColor3 || '',
    imageColor4:
      (settings?.imageColor4 || item.imageColor4 || '').trim() || defaults?.imageColor4 || '',
    imageColor5:
      (settings?.imageColor5 || item.imageColor5 || '').trim() || defaults?.imageColor5 || ''
  }
  const useOriginal = settings?.imageUseOriginalColors ?? item.imageUseOriginalColors ?? true
  const markPng = settings?.imageColorMarkPng || item.colorMarkPng
  const regionPng = settings?.imageColorRegionPng || item.colorRegionPng
  const unmarkedSlot =
    settings?.imageUnmarkedColorSlot ?? item.unmarkedColorSlot
  const display = await resolveImageDataUrl({
    imageDataUrl: source,
    imageUseOriginalColors: useOriginal,
    imagePalette: palette.length ? palette : undefined,
    imageColor1: colors.imageColor1,
    imageColor2: colors.imageColor2,
    imageColor3: colors.imageColor3,
    imageColor4: colors.imageColor4,
    imageColor5: colors.imageColor5,
    imageColorMarkPng: markPng,
    imageColorRegionPng: regionPng,
    imageUnmarkedColorSlot: unmarkedSlot
  })
  return {
    ...item,
    imageSourceDataUrl: source,
    imageDataUrl: display || item.imageDataUrl,
    imagePalette: palette.length ? palette : item.imagePalette,
    ...colors,
    colorMarkPng: markPng,
    colorRegionPng: regionPng,
    unmarkedColorSlot: unmarkedSlot,
    imageUseOriginalColors: useOriginal,
    stampSource: item.stampSource ?? 'image'
  }
}

export type UploadedImageColorSeed = {
  imageDataUrl: string
  imagePalette: string[]
  imageUseOriginalColors: true
  imageColor1: string
  imageColor2: string
  imageColor3: string
  imageColor4: string
  imageColor5: string
  imageColorMarkPng: string
  imageColorRegionPng: string
  imageUnmarkedColorSlot?: undefined
}

/**
 * On upload / rescan: mark pixels 1–5 from the image's own colours and copy
 * those colours into Color 1–5. Original colours stay on so the bitmap is not
 * repainted with a previous Color 1–5 palette.
 */
export async function seedUploadedImageColors(dataUrl: string): Promise<UploadedImageColorSeed> {
  const fitted = dataUrl ? await fitRasterDataUrl(dataUrl, 1024, { png: true }) : ''
  // Largest colours in the bitmap, up to 5. This is what Color 1–5 show outside
  // Paint — the big areas are tagged here, without a manual Match pass.
  const histogram = fitted ? await scanImagePalette(fitted) : []
  const regionMap = fitted ? await buildImageRegions(fitted) : null
  const fromRegions = regionMap ? await marksFromRegions(fitted, regionMap) : null
  const regionSlots = (fromRegions?.slotColors ?? []).map((c) => c.trim()).filter(Boolean)
  const slotColors = histogram.length >= regionSlots.length ? histogram : regionSlots
  const marked =
    slotColors.length > 0
      ? await buildDefaultColorMarks(fitted, slotColors, 140)
      : null
  const palette = slotColors.length ? slotColors : histogram
  const fields = imageRecolorFieldsFromPalette(palette)
  return {
    imageDataUrl: fitted,
    imagePalette: fields.imagePalette,
    imageUseOriginalColors: true,
    imageColor1: fields.imageColor1,
    imageColor2: fields.imageColor2,
    imageColor3: fields.imageColor3,
    imageColor4: fields.imageColor4,
    imageColor5: fields.imageColor5,
    imageColorMarkPng: marked ? encodeColorMarkPng(marked.marks, marked.w, marked.h) : '',
    imageColorRegionPng: regionMap
      ? encodeRegionPng(regionMap.regions, regionMap.w, regionMap.h)
      : '',
    imageUnmarkedColorSlot: undefined
  }
}

/** Previous Color 1–5 held across an upload when Keep color is on. */
export type PreviousImageColors = {
  imageUseOriginalColors?: boolean
  imageKeepColors?: boolean
  imageColor1?: string
  imageColor2?: string
  imageColor3?: string
  imageColor4?: string
  imageColor5?: string
}

/**
 * Apply a fresh scan to an upload.
 * Color 1–5 become the new image’s colours unless Keep color is on.
 * Original colors stays as the user left it, so turning it off still shows the scan.
 */
export function finishUploadedImageSeed(
  seeded: UploadedImageColorSeed,
  previous: PreviousImageColors
): UploadedImageColorSeed & { imageKeepColors: boolean } {
  const useOriginal = previous.imageUseOriginalColors !== false
  if (previous.imageKeepColors) {
    return {
      ...seeded,
      imageUseOriginalColors: useOriginal,
      imageKeepColors: true,
      imageColor1: previous.imageColor1 ?? '',
      imageColor2: previous.imageColor2 ?? '',
      imageColor3: previous.imageColor3 ?? '',
      imageColor4: previous.imageColor4 ?? '',
      imageColor5: previous.imageColor5 ?? ''
    }
  }
  return {
    ...seeded,
    imageUseOriginalColors: useOriginal,
    imageKeepColors: false
  }
}

/** Seed regions + Color 1–5 marks on a contentBound image stamp. */
export async function enrichImageProxyWithMatch(
  item: LineObj,
  settings: OutsideContentSettings | null | undefined
): Promise<LineObj> {
  if (!item.imageDataUrl && !settings?.imageSourceDataUrl && !item.imageSourceDataUrl) {
    return item
  }
  const source =
    (settings?.imageSourceDataUrl || item.imageSourceDataUrl || '').trim() ||
    item.imageDataUrl!
  let palette =
    settings?.imagePalette && settings.imagePalette.length > 0
      ? [...settings.imagePalette]
      : item.imagePalette && item.imagePalette.length > 0
        ? [...item.imagePalette]
        : await scanImagePalette(source)
  if (!palette.length) palette = await scanImagePalette(source)
  if (!palette.length) return item

  const defaults = imageRecolorFieldsFromPalette(palette)
  const stampSize = await loadImageSize(source)
  if (!stampSize) return item
  const useOriginal = settings?.imageUseOriginalColors ?? item.imageUseOriginalColors ?? true

  let regionPng = settings?.imageColorRegionPng || item.colorRegionPng
  let regionMap = await decodeRegionPng(regionPng)
  let regionsRebuilt = false
  if (!regionMap || regionMap.w !== stampSize.w || regionMap.h !== stampSize.h) {
    regionMap = await buildImageRegions(source)
    if (regionMap) {
      regionPng = encodeRegionPng(regionMap.regions, regionMap.w, regionMap.h)
      regionsRebuilt = true
    }
  }

  let markPng = settings?.imageColorMarkPng || item.colorMarkPng
  let map = await decodeColorMarkPng(markPng)
  let seededSlotColors: string[] | null = null
  if (
    regionMap &&
    (!map || map.w !== stampSize.w || map.h !== stampSize.h)
  ) {
    // Group regions by the colours in the image. Color 1–5 follow those colours.
    const built = await marksFromRegions(source, regionMap)
    if (built) {
      map = built
      markPng = encodeColorMarkPng(built.marks, built.w, built.h)
      seededSlotColors = built.slotColors
    }
  } else if (regionMap && map && regionsRebuilt) {
    // Region map was rebuilt — re-seed from the image colours.
    const built = await marksFromRegions(source, regionMap)
    if (built) {
      map = built
      markPng = encodeColorMarkPng(built.marks, built.w, built.h)
      seededSlotColors = built.slotColors
    }
  }

  // Fresh marks: Color 1–5 become the image colours, and the bitmap stays as-is.
  // Existing marks keep the user's Color 1–5 so a later remap still applies.
  const fromImage = seededSlotColors?.map((c) => c.trim()).filter(Boolean) ?? []
  if (fromImage.length) palette = fromImage
  const colors = seededSlotColors
    ? {
        imageColor1: (seededSlotColors[0] || '').trim(),
        imageColor2: (seededSlotColors[1] || '').trim(),
        imageColor3: (seededSlotColors[2] || '').trim(),
        imageColor4: (seededSlotColors[3] || '').trim(),
        imageColor5: (seededSlotColors[4] || '').trim()
      }
    : {
        imageColor1:
          (settings?.imageColor1 || item.imageColor1 || '').trim() || defaults.imageColor1,
        imageColor2:
          (settings?.imageColor2 || item.imageColor2 || '').trim() || defaults.imageColor2,
        imageColor3:
          (settings?.imageColor3 || item.imageColor3 || '').trim() || defaults.imageColor3,
        imageColor4:
          (settings?.imageColor4 || item.imageColor4 || '').trim() || defaults.imageColor4,
        imageColor5:
          (settings?.imageColor5 || item.imageColor5 || '').trim() || defaults.imageColor5
      }
  const showOriginal = seededSlotColors ? true : useOriginal
  const unmarkedSlot = seededSlotColors
    ? undefined
    : settings?.imageUnmarkedColorSlot ?? item.unmarkedColorSlot
  const next: LineObj = {
    ...item,
    imageSourceDataUrl: source,
    imagePalette: palette,
    ...colors,
    colorMarkPng: markPng,
    colorRegionPng: regionPng,
    unmarkedColorSlot: unmarkedSlot,
    imageUseOriginalColors: showOriginal,
    stampSource: item.stampSource ?? 'image'
  }
  return refreshStampFromMarks(next)
}

function stampLocalPixel(
  item: LineObj,
  canvasPoint: { x: number; y: number },
  imgW: number,
  imgH: number
): { x: number; y: number } | null {
  if (item.pts.length < 2) return null
  const a = item.pts[0], b = item.pts[1]
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  const displayW = Math.max(1, Math.abs(b.x - a.x))
  const displayH = Math.max(1, Math.abs(b.y - a.y))
  if (
    canvasPoint.x < x ||
    canvasPoint.y < y ||
    canvasPoint.x > x + displayW ||
    canvasPoint.y > y + displayH
  ) {
    return null
  }
  return {
    x: Math.max(0, Math.min(imgW - 1, Math.floor(((canvasPoint.x - x) / displayW) * imgW))),
    y: Math.max(0, Math.min(imgH - 1, Math.floor(((canvasPoint.y - y) / displayH) * imgH)))
  }
}

/**
 * Assign / clear the Color slot for a single region (never floods into neighbours).
 */
export async function matchClickOnImageProxy(
  item: LineObj,
  localCanvasPt: { x: number; y: number },
  activeSlot: number
): Promise<LineObj | null> {
  if (!isInnerUploadedImageProxy(item)) return null
  if (activeSlot < 1 || activeSlot > 5) return null
  const source = item.imageSourceDataUrl || item.imageDataUrl
  if (!source) return null

  let regionMap = await decodeRegionPng(item.colorRegionPng)
  if (!regionMap) {
    regionMap = await buildImageRegions(source)
    if (!regionMap) return null
  }
  const px = stampLocalPixel(item, localCanvasPt, regionMap.w, regionMap.h)
  if (!px) return null
  const regionId = regionMap.regions[px.y * regionMap.w + px.x] ?? 0
  if (!regionId) return null

  let markMap = await decodeColorMarkPng(item.colorMarkPng)
  if (!markMap || markMap.w !== regionMap.w || markMap.h !== regionMap.h) {
    markMap = {
      marks: new Uint8Array(regionMap.w * regionMap.h),
      w: regionMap.w,
      h: regionMap.h
    }
  }
  const regionSlot = regionSlotsFromMarks(regionMap, markMap.marks)
  const cur = regionSlot[regionId] ?? 0
  regionSlot[regionId] = cur === activeSlot ? 0 : activeSlot
  const nextMarks = marksFromRegionSlots(regionMap, regionSlot)
  // Keep Unmarked leftover flags; Match claim clears leftover for that region.
  const rest = await restFlagsByRegion(item.colorRegionPng, regionMap)
  if (regionSlot[regionId] >= 1) rest[regionId] = 0

  return {
    ...item,
    colorRegionPng: encodeRegionsWithRest(
      regionMap.regions,
      regionMap.w,
      regionMap.h,
      rest
    ),
    colorMarkPng: encodeColorMarkPng(nextMarks.marks, nextMarks.w, nextMarks.h),
    imageUseOriginalColors: false,
    imageSourceDataUrl: source
    // Display refresh deferred until Match exits (caller may still refresh for labels).
  }
}

export type MatchSectionLabel = {
  regionId: number
  slot: number
  /** Anchor on solid region ink (image pixels) — not a geometric centroid. */
  ix: number
  iy: number
  imgW: number
  imgH: number
  sectionHex: string
  labelColor: '#000000' | '#ffffff'
}

/** Chamfer distance to nearest exterior / other-region pixel (approx Euclidean). */
function regionDistanceTransform(
  regionId: number,
  regions: Uint16Array,
  w: number,
  h: number
): Float32Array {
  const dist = new Float32Array(w * h)
  const INF = 1e8
  for (let p = 0; p < regions.length; p++) {
    dist[p] = regions[p] === regionId ? INF : 0
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (regions[p] !== regionId) continue
      let d = dist[p]!
      if (x > 0) d = Math.min(d, dist[p - 1]! + 1)
      if (y > 0) d = Math.min(d, dist[p - w]! + 1)
      if (x > 0 && y > 0) d = Math.min(d, dist[p - w - 1]! + 1.414)
      if (x + 1 < w && y > 0) d = Math.min(d, dist[p - w + 1]! + 1.414)
      dist[p] = d
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x
      if (regions[p] !== regionId) continue
      let d = dist[p]!
      if (x + 1 < w) d = Math.min(d, dist[p + 1]! + 1)
      if (y + 1 < h) d = Math.min(d, dist[p + w]! + 1)
      if (x + 1 < w && y + 1 < h) d = Math.min(d, dist[p + w + 1]! + 1.414)
      if (x > 0 && y + 1 < h) d = Math.min(d, dist[p + w - 1]! + 1.414)
      dist[p] = d
    }
  }
  return dist
}

type LabelCandidate = { x: number; y: number; score: number }

/** Best in-fill anchors for a region (highest distance-to-edge first). */
function regionLabelCandidates(
  regionId: number,
  regions: Uint16Array,
  w: number,
  h: number,
  limit = 48
): LabelCandidate[] {
  const dist = regionDistanceTransform(regionId, regions, w, h)
  const cands: LabelCandidate[] = []
  for (let p = 0; p < regions.length; p++) {
    if (regions[p] !== regionId) continue
    const score = dist[p]!
    if (score < 1) continue
    const x = p % w
    const y = (p / w) | 0
    if (cands.length < limit) {
      cands.push({ x, y, score })
      if (cands.length === limit) cands.sort((a, b) => a.score - b.score)
    } else if (score > cands[0]!.score) {
      cands[0] = { x, y, score }
      cands.sort((a, b) => a.score - b.score)
    }
  }
  cands.sort((a, b) => b.score - a.score)
  if (cands.length) return cands
  // Fallback: any pixel of the region
  for (let p = 0; p < regions.length; p++) {
    if (regions[p] !== regionId) continue
    return [{ x: p % w, y: (p / w) | 0, score: 0 }]
  }
  return []
}

/** Labels for Match overlay (one per marked region), on solid ink, non-overlapping. */
export async function buildMatchSectionLabels(
  item: LineObj
): Promise<MatchSectionLabel[]> {
  const source = item.imageSourceDataUrl || item.imageDataUrl
  if (!source || !item.colorMarkPng) return []
  const regionMap = await decodeRegionPng(item.colorRegionPng)
  const markMap = await decodeColorMarkPng(item.colorMarkPng)
  if (!regionMap || !markMap) return []
  // Unmarked leftovers may share a fill colour but must never show Match numbers.
  const rest = await restFlagsByRegion(item.colorRegionPng, regionMap)

  const img = await loadCachedImage(source)
  if (!img) return []
  const displaySrc = item.imageDataUrl || source
  const displayImg = displaySrc === source ? img : await loadCachedImage(displaySrc)
  const sample = displayImg || img
  const canvas = document.createElement('canvas')
  canvas.width = regionMap.w
  canvas.height = regionMap.h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(sample, 0, 0, regionMap.w, regionMap.h)
  const { data } = ctx.getImageData(0, 0, regionMap.w, regionMap.h)

  type Acc = {
    n: number
    r: number
    g: number
    b: number
    slot: number
  }
  const sums = new Map<number, Acc>()
  for (let p = 0; p < regionMap.regions.length; p++) {
    const id = regionMap.regions[p]
    if (!id || rest[id]) continue
    const slot = markMap.marks[p] ?? 0
    if (slot < 1 || slot > 5) continue
    const i = p * 4
    let s = sums.get(id)
    if (!s) {
      s = { n: 0, r: 0, g: 0, b: 0, slot }
      sums.set(id, s)
    }
    s.n++
    s.r += data[i]!
    s.g += data[i + 1]!
    s.b += data[i + 2]!
    s.slot = slot
  }

  const ranked = [...sums.entries()].sort((a, b) => b[1].n - a[1].n)
  const minSep = Math.max(16, Math.round(Math.min(regionMap.w, regionMap.h) * 0.045))
  const minSep2 = minSep * minSep
  const placed: { x: number; y: number }[] = []
  const out: MatchSectionLabel[] = []

  for (const [regionId, s] of ranked) {
    if (s.n < 1) continue
    const cands = regionLabelCandidates(regionId, regionMap.regions, regionMap.w, regionMap.h)
    if (!cands.length) continue
    let chosen = cands[0]!
    for (const c of cands) {
      let ok = true
      for (const p of placed) {
        const dx = c.x - p.x
        const dy = c.y - p.y
        if (dx * dx + dy * dy < minSep2) {
          ok = false
          break
        }
      }
      if (ok) {
        chosen = c
        break
      }
    }
    // If every candidate overlaps, nudge along candidates until clear or give up.
    if (placed.some((p) => {
      const dx = chosen.x - p.x
      const dy = chosen.y - p.y
      return dx * dx + dy * dy < minSep2
    })) {
      let found = false
      for (const c of cands) {
        for (const [dx, dy] of [
          [0, 0],
          [minSep, 0],
          [-minSep, 0],
          [0, minSep],
          [0, -minSep],
          [minSep, minSep],
          [-minSep, minSep],
          [minSep, -minSep],
          [-minSep, -minSep]
        ] as const) {
          const nx = Math.max(0, Math.min(regionMap.w - 1, c.x + dx))
          const ny = Math.max(0, Math.min(regionMap.h - 1, c.y + dy))
          const np = ny * regionMap.w + nx
          if (regionMap.regions[np] !== regionId) continue
          if (
            placed.some((p) => {
              const ddx = nx - p.x
              const ddy = ny - p.y
              return ddx * ddx + ddy * ddy < minSep2
            })
          ) {
            continue
          }
          chosen = { x: nx, y: ny, score: c.score }
          found = true
          break
        }
        if (found) break
      }
    }

    placed.push({ x: chosen.x, y: chosen.y })
    const sectionHex = toHex(s.r / s.n, s.g / s.n, s.b / s.n)
    out.push({
      regionId,
      slot: s.slot,
      ix: chosen.x + 0.5,
      iy: chosen.y + 0.5,
      imgW: regionMap.w,
      imgH: regionMap.h,
      sectionHex,
      labelColor: contrastLabelColor(sectionHex)
    })
  }
  return out
}

export async function fillMarkedSectionsOnImageProxy(
  item: LineObj,
  localCanvasPt: { x: number; y: number },
  fillCss: string
): Promise<{ item: LineObj; mark: number } | null> {
  if (!isInnerUploadedImageProxy(item)) return null
  const source = item.imageSourceDataUrl || item.imageDataUrl
  if (!source || !item.colorMarkPng) return null
  const map = await decodeColorMarkPng(item.colorMarkPng)
  if (!map) return null
  const px = stampLocalPixel(item, localCanvasPt, map.w, map.h)
  if (!px) return null
  const mark = map.marks[px.y * map.w + px.x] ?? 0
  if (mark < 1 || mark > 5) return null
  const hex = fillCss.startsWith('#') ? fillCss.slice(0, 7) : fillCss
  const key = `imageColor${mark}` as
    | 'imageColor1'
    | 'imageColor2'
    | 'imageColor3'
    | 'imageColor4'
    | 'imageColor5'
  return {
    item: await refreshStampFromMarks({
      ...item,
      [key]: hex,
      imageUseOriginalColors: false,
      imageSourceDataUrl: source
    }),
    mark
  }
}

export function solidColorKey(hex: string): string {
  const h = hex.trim().toLowerCase()
  if (!h.startsWith('#')) return h
  return h.slice(0, 7)
}

export function sameSolidColor(a: string, b: string): boolean {
  const aa = solidColorKey(a)
  const bb = solidColorKey(b)
  return /^#[0-9a-f]{6}$/.test(aa) && aa === bb
}

type StrokeLike = {
  tool: 'brush' | 'eraser'
  pts: { x: number; y: number }[]
  size: number
  color: string
  tip: string
}

/** Brush ink that already uses one of `fromColors` takes the paired colour. */
export function retintMatchingStrokes<T extends StrokeLike>(
  strokes: T[] | undefined,
  fromColors: string[],
  toColors: string[]
): T[] | undefined {
  if (!strokes?.length) return strokes
  const pairs = fromColors
    .map((from, i) => ({ from: solidColorKey(from), to: solidColorKey(toColors[i] || '') }))
    .filter((p) => /^#[0-9a-f]{6}$/.test(p.from) && /^#[0-9a-f]{6}$/.test(p.to) && p.from !== p.to)
  if (!pairs.length) return strokes
  let changed = false
  const next = strokes.map((stroke) => {
    if (stroke.tool === 'eraser') return stroke
    const pair = pairs.find((p) => p.from === solidColorKey(stroke.color))
    if (!pair) return stroke
    changed = true
    const alpha = stroke.color.trim().length >= 9 ? stroke.color.trim().slice(7, 9) : ''
    return { ...stroke, color: pair.to + alpha }
  })
  return changed ? next : strokes
}

function isBaseImageVector(v: PaintVector): boolean {
  return !!(
    v.contentBound ||
    v.contentProxySlot ||
    v.imageSourceDataUrl ||
    (v.type === 'stamp' && v.name === 'Inner content')
  )
}

/** Base image plus groups that own it. Brush on a selected image lands on the group. */
function baseBrushVectors(session: PaintSession | null | undefined): PaintVector[] {
  const all = session?.vectors ?? []
  const byId = new Map(all.map((v) => [v.id, v]))
  const ids = new Set<string>()
  for (const layer of all) {
    if (layer.brushLayer) ids.add(layer.id)
  }
  for (const base of all.filter(isBaseImageVector)) {
    ids.add(base.id)
    let parentId = base.parentId
    const seen = new Set<string>()
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      const parent = byId.get(parentId)
      if (!parent) break
      ids.add(parent.id)
      parentId = parent.parentId
    }
  }
  return all.filter((v) => ids.has(v.id))
}

async function pngBoxHasOpaque(
  dataUrl: string,
  box: { x: number; y: number; w: number; h: number }
): Promise<boolean> {
  const img = await loadCachedImage(dataUrl)
  if (!img?.width || !img.height) return false
  const w = Math.max(1, Math.ceil(box.w))
  const h = Math.max(1, Math.ceil(box.h))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 16) return true
  }
  return false
}

async function pngHasAnyOpaque(dataUrl: string | undefined): Promise<boolean> {
  if (!dataUrl) return false
  const img = await loadCachedImage(dataUrl)
  if (!img?.width || !img.height) return false
  return pngBoxHasOpaque(dataUrl, { x: 0, y: 0, w: img.width, h: img.height })
}

function baseLayerPlanes(session: PaintSession | null | undefined): {
  below?: string
  above?: string
  /** Unselected brush on the base layer lives here, not only in decorations. */
  content?: string
  /** Brush with no layer selected. Drawn above every object. */
  front?: string
} {
  if (!session) return {}
  return {
    below: session.contentBelowDecorationsPng,
    above: session.contentAboveDecorationsPng || session.contentDecorationsPng,
    content: session.contentPng,
    front: session.contentFrontPng
  }
}

const BRUSH_TIPS = new Set(['round', 'square', 'slash', 'backslash', 'spray'])

function brushTipOf(tip: string | undefined): BrushTip {
  return BRUSH_TIPS.has(tip ?? '') ? (tip as BrushTip) : 'round'
}

/** Opaque pixels of a paint-canvas plane, sampled in the image's scan grid. */
async function planeInkCounts(
  dataUrl: string | undefined,
  box: { x: number; y: number; w: number; h: number } | null,
  scanW: number,
  scanH: number
): Promise<{ color: string; count: number }[]> {
  if (!dataUrl || !box || scanW < 1 || scanH < 1) return []
  const ov = await loadCachedImage(dataUrl)
  if (!ov) return []
  const canvas = document.createElement('canvas')
  canvas.width = scanW
  canvas.height = scanH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(ov, box.x, box.y, box.w, box.h, 0, 0, scanW, scanH)
  return opaqueInkCounts(ctx.getImageData(0, 0, scanW, scanH).data)
}

/** Every opaque colour on a paint plane, fitted to the scan grid. */
async function planeInkAll(
  dataUrl: string | undefined,
  scanW: number,
  scanH: number
): Promise<{ color: string; count: number }[]> {
  if (!dataUrl || scanW < 1 || scanH < 1) return []
  const ov = await loadCachedImage(dataUrl)
  if (!ov?.width || !ov.height) return []
  const canvas = document.createElement('canvas')
  canvas.width = scanW
  canvas.height = scanH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(ov, 0, 0, scanW, scanH)
  return opaqueInkCounts(ctx.getImageData(0, 0, scanW, scanH).data)
}

function strokeInkCounts(
  strokes: { tool: string; pts: { x: number; y: number }[]; size: number; color: string; tip?: string }[],
  scanW: number,
  scanH: number
): { color: string; count: number }[] {
  const brushes = strokes.filter((s) => s.tool !== 'eraser' && s.pts.length > 0)
  if (!brushes.length || scanW < 1 || scanH < 1) return []
  const canvas = document.createElement('canvas')
  canvas.width = scanW
  canvas.height = scanH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  drawPaintStrokesInBox(
    ctx,
    { x: 0, y: 0, w: scanW, h: scanH },
    brushes.map((s) => ({
      tool: 'brush' as const,
      pts: s.pts,
      size: s.size,
      color: s.color,
      tip: brushTipOf(s.tip)
    }))
  )
  return opaqueInkCounts(ctx.getImageData(0, 0, scanW, scanH).data)
}

/** Strokes on the Inner content image, in that image's box, then fitted to the scan grid. */
function innerContentStrokeInk(
  session: PaintSession | null | undefined,
  box: { x: number; y: number; w: number; h: number } | null,
  scanW: number,
  scanH: number
): { color: string; count: number }[] {
  if (!box || scanW < 1 || scanH < 1) return []
  const vectors = (session?.vectors ?? []).filter(
    (v) =>
      !v.brushLayer &&
      (isBaseImageVector(v) || v.name === 'Inner content') &&
      v.paintStrokes?.some((s) => s.tool !== 'eraser' && s.pts.length > 0)
  )
  if (!vectors.length) return []
  const res = Math.max(1, session?.resolution || 512)
  const canvas = document.createElement('canvas')
  canvas.width = res
  canvas.height = res
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  for (const v of vectors) {
    const stamp = stampBoxOf(v) ?? box
    const strokes = (v.paintStrokes ?? []).filter((s) => s.tool !== 'eraser' && s.pts.length > 0)
    if (!strokes.length) continue
    drawPaintStrokesInBox(
      ctx,
      stamp,
      strokes.map((s) => ({
        tool: 'brush' as const,
        pts: s.pts,
        size: s.size,
        color: s.color,
        tip: brushTipOf(s.tip)
      }))
    )
  }
  const out = document.createElement('canvas')
  out.width = scanW
  out.height = scanH
  const outCtx = out.getContext('2d', { willReadFrequently: true })
  if (!outCtx) return []
  outCtx.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, scanW, scanH)
  return opaqueInkCounts(outCtx.getImageData(0, 0, scanW, scanH).data)
}

/** Brush layers cover the paint canvas. Count only the part over the base image. */
function brushLayerInkCounts(
  session: PaintSession | null | undefined,
  box: { x: number; y: number; w: number; h: number } | null,
  scanW: number,
  scanH: number
): { color: string; count: number }[] {
  const layers = (session?.vectors ?? []).filter((v) => v.brushLayer && v.paintStrokes?.length && v.pts && v.pts.length >= 2)
  if (!layers.length || scanW < 1 || scanH < 1) return []
  const res = Math.max(1, session?.resolution || 512)
  const canvas = document.createElement('canvas')
  canvas.width = res
  canvas.height = res
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  for (const v of layers) {
    const a = v.pts![0]
    const b = v.pts![1]
    const strokes = (v.paintStrokes ?? []).filter((s) => s.tool !== 'eraser' && s.pts.length > 0)
    if (!strokes.length) continue
    drawPaintStrokesInBox(
      ctx,
      {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.max(1, Math.abs(b.x - a.x)),
        h: Math.max(1, Math.abs(b.y - a.y))
      },
      strokes.map((s) => ({
        tool: 'brush' as const,
        pts: s.pts,
        size: s.size,
        color: s.color,
        tip: brushTipOf(s.tip)
      }))
    )
  }
  const crop = box ?? { x: 0, y: 0, w: res, h: res }
  const out = document.createElement('canvas')
  out.width = scanW
  out.height = scanH
  const outCtx = out.getContext('2d', { willReadFrequently: true })
  if (!outCtx) return []
  outCtx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, scanW, scanH)
  return opaqueInkCounts(outCtx.getImageData(0, 0, scanW, scanH).data)
}

function stampBoxOf(v: PaintVector): { x: number; y: number; w: number; h: number } | null {
  if (!v.pts || v.pts.length < 2) return null
  const a = v.pts[0]
  const b = v.pts[1]
  const w = Math.abs(b.x - a.x)
  const h = Math.abs(b.y - a.y)
  if (w < 1 || h < 1) return null
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w, h }
}

/** Color 1–5 edits move matching brush ink on the base image. Other strokes stay. */
export function retintBaseImageStrokes(
  session: PaintSession | null | undefined,
  fromColors: string[],
  toColors: string[]
): PaintSession | null | undefined {
  if (!session?.vectors?.length) return session
  let changed = false
  const brushIds = new Set(baseBrushVectors(session).map((v) => v.id))
  const vectors = session.vectors.map((v) => {
    if (!brushIds.has(v.id) || !v.paintStrokes?.length) return v
    const paintStrokes = retintMatchingStrokes(v.paintStrokes, fromColors, toColors)
    if (paintStrokes === v.paintStrokes) return v
    changed = true
    return { ...v, paintStrokes }
  })
  return changed ? { ...session, vectors } : session
}

function colorDist(a: string, b: string): number {
  const pa = parseHex(a)
  const pb = parseHex(b)
  if (!pa || !pb) return Infinity
  return Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2])
}

function snapBaseStrokesToSlots(
  session: PaintSession,
  slots: string[],
  maxDist = 48
): PaintSession {
  const brushIds = new Set(baseBrushVectors(session).map((v) => v.id))
  const vectors = session.vectors.map((v) => {
    if (!brushIds.has(v.id) || !v.paintStrokes?.length) return v
    let changed = false
    const paintStrokes = v.paintStrokes.map((stroke) => {
      if (stroke.tool === 'eraser') return stroke
      let best = -1
      let bestDist = Infinity
      slots.forEach((slot, i) => {
        const d = colorDist(stroke.color, slot)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
      if (best < 0 || bestDist > maxDist) return stroke
      const next = solidColorKey(slots[best] || '')
      if (!next || sameSolidColor(stroke.color, next)) return stroke
      changed = true
      const alpha = stroke.color.trim().length >= 9 ? stroke.color.trim().slice(7, 9) : ''
      return { ...stroke, color: next + alpha }
    })
    return changed ? { ...v, paintStrokes } : v
  })
  return { ...session, vectors }
}

async function replaceRgbInPngBox(
  dataUrl: string | undefined,
  box: { x: number; y: number; w: number; h: number },
  fromHex: string,
  toHex: string
): Promise<string | undefined> {
  if (!dataUrl || sameSolidColor(fromHex, toHex)) return dataUrl
  const from = parseHex(fromHex)
  const to = parseHex(toHex)
  if (!from || !to) return dataUrl
  const img = await loadCachedImage(dataUrl)
  if (!img?.width || !img.height) return dataUrl
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(canvas.width, Math.ceil(box.x + box.w))
  const y1 = Math.min(canvas.height, Math.ceil(box.y + box.h))
  if (x1 <= x0 || y1 <= y0) return dataUrl
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  let hit = false
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * canvas.width + x) * 4
      if (data[i + 3] < 16) continue
      const d =
        Math.abs(data[i] - from[0]) + Math.abs(data[i + 1] - from[1]) + Math.abs(data[i + 2] - from[2])
      if (d > 18) continue
      data[i] = to[0]
      data[i + 1] = to[1]
      data[i + 2] = to[2]
      hit = true
    }
  }
  if (!hit) return dataUrl
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

async function rewireBaseRaster(
  session: PaintSession,
  box: { x: number; y: number; w: number; h: number },
  fromColors: string[],
  toColors: string[]
): Promise<PaintSession> {
  const pairs = fromColors
    .map((from, i) => ({ from, to: toColors[i] || '' }))
    .filter((p) => p.from && p.to && !sameSolidColor(p.from, p.to))
  if (!pairs.length) return session
  let next = session
  const keys = [
    'contentPng',
    'contentDecorationsPng',
    'contentAboveDecorationsPng',
    'contentBelowDecorationsPng'
  ] as const
  for (const key of keys) {
    let url = next[key]
    for (const pair of pairs) {
      url = await replaceRgbInPngBox(url, box, pair.from, pair.to)
    }
    if (url !== next[key]) next = { ...next, [key]: url }
  }
  return next
}

export type BaseLayerRescanInput = {
  imageDataUrl: string
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
  imageKeepColors?: boolean
  session?: PaintSession | null
}

export type BaseLayerRescanResult = {
  patch: {
    imagePalette: string[]
    imageUseOriginalColors: boolean
    imageKeepColors: boolean
    imageColor1: string
    imageColor2: string
    imageColor3: string
    imageColor4: string
    imageColor5: string
    imageColorMarkPng: string
    imageColorRegionPng: string
    imageUnmarkedColorSlot?: undefined
  }
  session?: PaintSession | null
}

function uploadPalette(input: BaseLayerRescanInput): string[] {
  return (input.imagePalette ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 5)
}

function currentSlotColors(input: BaseLayerRescanInput, fallback: string[]): string[] {
  const current = [
    input.imageColor1,
    input.imageColor2,
    input.imageColor3,
    input.imageColor4,
    input.imageColor5
  ]
  return [0, 1, 2, 3, 4].map((i) => (current[i] || '').trim() || fallback[i] || '')
}

/** First-upload colours. Rescan must not replace this list. */
function withFirstPalette(
  seeded: UploadedImageColorSeed,
  input: BaseLayerRescanInput
): UploadedImageColorSeed {
  const palette = uploadPalette(input)
  if (!palette.length) return seeded
  return { ...seeded, imagePalette: palette }
}

function slotsFromPalette(palette: string[]): Pick<
  UploadedImageColorSeed,
  'imageColor1' | 'imageColor2' | 'imageColor3' | 'imageColor4' | 'imageColor5'
> {
  return {
    imageColor1: palette[0] ?? '',
    imageColor2: palette[1] ?? '',
    imageColor3: palette[2] ?? '',
    imageColor4: palette[3] ?? '',
    imageColor5: palette[4] ?? ''
  }
}
/**
 * Rank brush strokes and other base-layer paint by pixel count and rewire Color 1–5.
 * The first-upload palette stays, and is what Original colors uses.
 */
export async function rescanBaseLayerColors(
  input: BaseLayerRescanInput
): Promise<BaseLayerRescanResult | null> {
  const source = input.imageDataUrl
  if (!source) return null
  const brushVectors = baseBrushVectors(input.session)
  const bases = brushVectors.filter(isBaseImageVector)
  const base = bases.find((v) => v.paintStrokes?.some((s) => s.pts.length > 0)) ?? bases[0]
  const strokes = brushVectors
    .filter((v) => !v.brushLayer && !isBaseImageVector(v))
    .flatMap((v) => v.paintStrokes ?? [])
  const box = base ? stampBoxOf(base) : null
  const planes = baseLayerPlanes(input.session)
  const hasStrokes = !!strokes?.some((s) => s.pts.length > 0)
  const hasInnerStrokes = (input.session?.vectors ?? []).some(
    (v) =>
      !v.brushLayer &&
      (isBaseImageVector(v) || v.name === 'Inner content') &&
      v.paintStrokes?.some((s) => s.tool !== 'eraser' && s.pts.length > 0)
  )
  const hasBrushLayers = (input.session?.vectors ?? []).some(
    (v) => v.brushLayer && v.paintStrokes?.some((s) => s.tool !== 'eraser' && s.pts.length > 0)
  )
  const contentHasPaint = await pngHasAnyOpaque(planes.content)
  const frontHasPaint = await pngHasAnyOpaque(planes.front)
  const hasOverlay = !!(
    contentHasPaint ||
    frontHasPaint ||
    (box &&
      ((planes.below && (await pngBoxHasOpaque(planes.below, box))) ||
        (planes.above && (await pngBoxHasOpaque(planes.above, box)))))
  )
  if (!hasStrokes && !hasOverlay && !hasBrushLayers && !hasInnerStrokes) {
    const seeded = await seedUploadedImageColors(source)
    const palette = uploadPalette(input)
    const kept = withFirstPalette(
      palette.length && input.imageUseOriginalColors !== false
        ? {
            ...seeded,
            ...slotsFromPalette(palette),
            imageColorMarkPng: input.imageColorMarkPng || seeded.imageColorMarkPng,
            imageColorRegionPng: input.imageColorRegionPng || seeded.imageColorRegionPng
          }
        : seeded,
      input
    )
    return { patch: finishUploadedImageSeed(kept, input), session: input.session }
  }
  const visible = await resolveImageDataUrl({
    imageDataUrl: source,
    imageUseOriginalColors: input.imageUseOriginalColors,
    imagePalette: input.imagePalette,
    imageColor1: input.imageColor1,
    imageColor2: input.imageColor2,
    imageColor3: input.imageColor3,
    imageColor4: input.imageColor4,
    imageColor5: input.imageColor5,
    imageColorMarkPng: input.imageColorMarkPng,
    imageColorRegionPng: input.imageColorRegionPng,
    imageUnmarkedColorSlot: input.imageUnmarkedColorSlot
  })
  // Count the photo and the brush on one 512px grid. Painting the brush onto
  // the full-size photo first, then shrinking, drops a thin stroke.
  const photo = await loadCachedImage(visible || source)
  const scanScale = photo?.width && photo?.height
    ? Math.min(1, 512 / Math.max(photo.width, photo.height))
    : 1
  const scanW = Math.max(1, Math.round((photo?.width || 512) * scanScale))
  const scanH = Math.max(1, Math.round((photo?.height || 512) * scanScale))
  const photoCanvas = document.createElement('canvas')
  photoCanvas.width = scanW
  photoCanvas.height = scanH
  const photoCtx = photoCanvas.getContext('2d', { willReadFrequently: true })
  if (photo && photoCtx) photoCtx.drawImage(photo, 0, 0, scanW, scanH)
  const [contentInk, frontInk, belowInk, strokeInk, brushLayerInk, innerStrokeInk] = await Promise.all([
    // Inner paint overlay, cropped to the Inner content image so a brush on
    // that layer lines up with the photo instead of the whole canvas.
    box
      ? planeInkCounts(planes.content, box, scanW, scanH)
      : planeInkAll(planes.content, scanW, scanH),
    planeInkAll(planes.front, scanW, scanH),
    planeInkCounts(planes.below, box, scanW, scanH),
    Promise.resolve(strokeInkCounts(strokes ?? [], scanW, scanH)),
    Promise.resolve(brushLayerInkCounts(input.session, box, scanW, scanH)),
    Promise.resolve(innerContentStrokeInk(input.session, box, scanW, scanH))
  ])
  const histogram = photo && photoCtx
    ? paletteFromPixels(
        photoCtx.getImageData(0, 0, scanW, scanH).data,
        5,
        [
          ...belowInk,
          // Overlay and front brush are smaller than the photo, so they keep a slot.
          ...contentInk.map((ink) => ({ ...ink, protect: true })),
          ...frontInk.map((ink) => ({ ...ink, protect: true })),
          ...strokeInk.map((ink) => ({ ...ink, protect: true })),
          ...brushLayerInk.map((ink) => ({ ...ink, protect: true })),
          ...innerStrokeInk.map((ink) => ({ ...ink, protect: true }))
        ]
      )
    : await scanImagePalette(visible || source, 5, 512)
  if (!histogram.length) {
    const seeded = await seedUploadedImageColors(source)
    const finished = finishUploadedImageSeed(withFirstPalette(seeded, input), input)
    return { patch: finished, session: input.session }
  }
  const first = uploadPalette(input)
  const slotColors = input.imageKeepColors
    ? currentSlotColors(input, first.length ? first : histogram)
    : histogram
  const marked = await buildDefaultColorMarks(visible || source, slotColors, 140)
  const regionMap = await buildImageRegions(visible || source)
  const seeded = withFirstPalette(
    {
      imageDataUrl: source,
      imagePalette: first.length ? first : histogram,
      imageUseOriginalColors: true as const,
      imageColor1: slotColors[0] ?? '',
      imageColor2: slotColors[1] ?? '',
      imageColor3: slotColors[2] ?? '',
      imageColor4: slotColors[3] ?? '',
      imageColor5: slotColors[4] ?? '',
      imageColorMarkPng: marked ? encodeColorMarkPng(marked.marks, marked.w, marked.h) : '',
      imageColorRegionPng: regionMap
        ? encodeRegionPng(regionMap.regions, regionMap.w, regionMap.h)
        : input.imageColorRegionPng || '',
      imageUnmarkedColorSlot: undefined
    },
    input
  )
  let finished = finishUploadedImageSeed(seeded, input)
  if (!input.imageKeepColors) {
    finished = { ...finished, imageUseOriginalColors: false }
  }
  const slots = [
    finished.imageColor1,
    finished.imageColor2,
    finished.imageColor3,
    finished.imageColor4,
    finished.imageColor5
  ]
  let session = input.session
  if (session) {
    const before = (session.vectors ?? [])
      .filter(isBaseImageVector)
      .flatMap((v) => v.paintStrokes ?? [])
      .filter((s) => s.tool !== 'eraser')
      .map((s) => s.color)
    const rewireSlots = !input.imageKeepColors
    session = snapBaseStrokesToSlots(
      session,
      slots,
      rewireSlots ? Number.POSITIVE_INFINITY : 48
    )
    const after = (session.vectors ?? [])
      .filter(isBaseImageVector)
      .flatMap((v) => v.paintStrokes ?? [])
      .filter((s) => s.tool !== 'eraser')
      .map((s) => s.color)
    if (box && before.length === after.length) {
      session = await rewireBaseRaster(session, box, before, after)
    }
    if (box && rewireSlots) {
      const extras = histogram.filter(
        (color) => color && !slots.some((slot) => sameSolidColor(color, slot))
      )
      for (const color of extras) {
        let best = ''
        let bestDist = Infinity
        for (const slot of slots) {
          const d = colorDist(color, slot)
          if (d < bestDist) {
            bestDist = d
            best = slot
          }
        }
        if (best) session = await rewireBaseRaster(session, box, [color], [best])
      }
    }
  }
  return { patch: finished, session }
}

export async function setImageProxySlotColor(
  item: LineObj,
  slot: number,
  hex: string
): Promise<LineObj | null> {
  if (!isInnerUploadedImageProxy(item) || slot < 1 || slot > 5) return null
  const key = `imageColor${slot}` as
    | 'imageColor1'
    | 'imageColor2'
    | 'imageColor3'
    | 'imageColor4'
    | 'imageColor5'
  const previous = (item[key] || item.imagePalette?.[slot - 1] || '').trim()
  return refreshStampFromMarks({
    ...item,
    [key]: hex,
    imageUseOriginalColors: false,
    paintStrokes: retintMatchingStrokes(item.paintStrokes, [previous], [hex])
  })
}
