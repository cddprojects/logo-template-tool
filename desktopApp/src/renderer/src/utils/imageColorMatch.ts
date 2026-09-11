/**
 * Paint Match tool helpers for Inner uploaded images (contentBound stamps).
 *
 * Regions are fixed connected components from the source bitmap. Auto-seed
 * assigns Color 1–5 only to the five largest regions (by area); smaller
 * regions stay unmarked until the user marks them. Marks never merge
 * neighbouring regions that share a slot.
 */

import {
  decodeColorMarkPng,
  encodeColorMarkPng,
  imageRecolorFieldsFromPalette,
  resolveImageDataUrl,
  scanImagePalette,
  type ColorMarkMap
} from './imageRecolor'
import { loadCachedImage } from './iconUtils'
import type { OutsideContentSettings } from '../types'
import type { LineObj } from '../components/iconPaint/paintHelpers'

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
    if (data[seed * 4 + 3] < 40) continue
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
        if (data[i + 3] < 40) continue
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
 * Only the five largest regions (by opaque area) are auto-marked:
 * largest → Color 1 … 5th → Color 5. Smaller regions stay unmarked (original)
 * until the user assigns them in Match.
 */
export async function marksFromRegions(
  dataUrl: string,
  regionMap: ImageRegionMap,
  _palette?: string[]
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
    if (data[i + 3] < 40) continue
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

  const regionSlot = new Uint8Array(regionMap.count + 1)
  const slotColors: string[] = ['', '', '', '', '']
  const top = ranked.slice(0, 5)
  for (let i = 0; i < top.length; i++) {
    const { id } = top[i]!
    const slot = i + 1
    regionSlot[id] = slot
    const n = Math.max(1, area[id] ?? 1)
    slotColors[i] = toHex(sumR[id]! / n, sumG[id]! / n, sumB[id]! / n)
  }

  const marks = new Uint8Array(regionMap.w * regionMap.h)
  for (let p = 0; p < marks.length; p++) {
    const id = regionMap.regions[p]
    marks[p] = id ? regionSlot[id] ?? 0 : 0
  }
  return { marks, w: regionMap.w, h: regionMap.h, slotColors }
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
    imageColorMarkPng: item.colorMarkPng
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
  const display = await resolveImageDataUrl({
    imageDataUrl: source,
    imageUseOriginalColors: useOriginal,
    imagePalette: palette.length ? palette : undefined,
    imageColor1: colors.imageColor1,
    imageColor2: colors.imageColor2,
    imageColor3: colors.imageColor3,
    imageColor4: colors.imageColor4,
    imageColor5: colors.imageColor5,
    imageColorMarkPng: markPng
  })
  return {
    ...item,
    imageSourceDataUrl: source,
    imageDataUrl: display || item.imageDataUrl,
    imagePalette: palette.length ? palette : item.imagePalette,
    ...colors,
    colorMarkPng: markPng,
    colorRegionPng: regionPng,
    imageUseOriginalColors: useOriginal,
    stampSource: item.stampSource ?? 'image'
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
    // Top-5 regions by area → Color 1–5; smaller regions stay unmarked.
    const built = await marksFromRegions(source, regionMap, palette)
    if (built) {
      map = built
      markPng = encodeColorMarkPng(built.marks, built.w, built.h)
      seededSlotColors = built.slotColors
    }
  } else if (regionMap && map && regionsRebuilt) {
    // Region map was rebuilt — re-seed top-5 by area (do not keep tiny outline marks).
    const built = await marksFromRegions(source, regionMap, palette)
    if (built) {
      map = built
      markPng = encodeColorMarkPng(built.marks, built.w, built.h)
      seededSlotColors = built.slotColors
    }
  }

  const colors = {
    imageColor1:
      (settings?.imageColor1 || item.imageColor1 || '').trim() ||
      seededSlotColors?.[0] ||
      defaults.imageColor1,
    imageColor2:
      (settings?.imageColor2 || item.imageColor2 || '').trim() ||
      seededSlotColors?.[1] ||
      defaults.imageColor2,
    imageColor3:
      (settings?.imageColor3 || item.imageColor3 || '').trim() ||
      seededSlotColors?.[2] ||
      defaults.imageColor3,
    imageColor4:
      (settings?.imageColor4 || item.imageColor4 || '').trim() ||
      seededSlotColors?.[3] ||
      defaults.imageColor4,
    imageColor5:
      (settings?.imageColor5 || item.imageColor5 || '').trim() ||
      seededSlotColors?.[4] ||
      defaults.imageColor5
  }

  const next: LineObj = {
    ...item,
    imageSourceDataUrl: source,
    imagePalette: palette,
    ...colors,
    colorMarkPng: markPng,
    colorRegionPng: regionPng,
    imageUseOriginalColors: useOriginal,
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

  return {
    ...item,
    colorRegionPng: item.colorRegionPng || encodeRegionPng(regionMap.regions, regionMap.w, regionMap.h),
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
    if (!id) continue
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
  return refreshStampFromMarks({
    ...item,
    [key]: hex,
    imageUseOriginalColors: false
  })
}
