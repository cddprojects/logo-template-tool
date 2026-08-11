import type {
  ContentType,
  ContentTypeStashEntry,
  FaviconContent,
  FaviconConfig,
  IconConfig,
  IconSourceType,
  OutsideContentSettings,
  PaintContentSync,
  PaintSession,
  PaintVector
} from '../types'
import { measureSpacedText } from './renderer'

const DESIGN_SIZE = 256

/** Shared content fields kept across type switches / sync. */
const SHARED_CONTENT_KEYS = [
  'offsetX',
  'offsetY',
  'contentShadowEnabled',
  'contentShadowInset',
  'contentShadowColor',
  'contentShadowBlur',
  'contentShadowSpread',
  'contentShadowOffsetX',
  'contentShadowOffsetY',
  'contentBorderColor',
  'contentBorderWidth'
] as const

const FAVICON_TYPE_KEYS: Record<ContentType, readonly string[]> = {
  letters: [
    'text', 'textColor', 'fontFamily', 'fontWeight', 'fontItalic', 'fontUnderline',
    'fontSizeRatio', 'letterSpacing', ...SHARED_CONTENT_KEYS
  ],
  shape: ['shape', 'shapeColor', 'shapeSizeRatio', 'shapeBorderRadius', ...SHARED_CONTENT_KEYS],
  lucide: [
    'lucideIconName', 'lucideColor', 'lucideSizeRatio', 'lucideStrokeWidth',
    ...SHARED_CONTENT_KEYS
  ],
  'svg-markup': [
    'svgMarkup', 'svgMarkupSizeRatio', 'svgMarkupUseOriginalColors',
    'svgMarkupSecondaryColor', 'svgMarkupTertiaryColor', 'svgMarkupColor4',
    'svgMarkupColor5', 'lucideColor', ...SHARED_CONTENT_KEYS
  ],
  image: [
    'imageDataUrl', 'imageSizeRatio', 'imageUseOriginalColors', 'imagePalette',
    'imageColor1', 'imageColor2', 'imageColor3', 'imageColor4', 'imageColor5',
    ...SHARED_CONTENT_KEYS
  ],
  svg: ['svgPath', 'svgColor', ...SHARED_CONTENT_KEYS],
  canva: [
    'canvaBusinessType', 'canvaDesignType', 'canvaPrimaryColor', 'canvaSecondaryColor',
    'canvaImageReference',
    ...SHARED_CONTENT_KEYS
  ]
}

const ICON_TYPE_KEYS: Record<IconSourceType, readonly string[]> = {
  letters: [
    'text', 'textColor', 'fontFamily', 'fontWeight', 'fontItalic', 'fontUnderline',
    'fontSizeRatio', 'letterSpacing', ...SHARED_CONTENT_KEYS
  ],
  shape: ['shape', 'primaryColor', 'secondaryColor', 'shapeSizeRatio', 'shapeBorderRadius', ...SHARED_CONTENT_KEYS],
  lucide: [
    'lucideIconName', 'primaryColor', 'lucideSizeRatio', 'lucideStrokeWidth',
    ...SHARED_CONTENT_KEYS
  ],
  svg: [
    'svgMarkup', 'svgMarkupSizeRatio', 'svgMarkupUseOriginalColors',
    'svgMarkupSecondaryColor', 'svgMarkupTertiaryColor', 'svgMarkupColor4',
    'svgMarkupColor5', 'primaryColor', ...SHARED_CONTENT_KEYS
  ],
  image: [
    'imageDataUrl', 'imageSizeRatio', 'imageUseOriginalColors', 'imagePalette',
    'imageColor1', 'imageColor2', 'imageColor3', 'imageColor4', 'imageColor5',
    ...SHARED_CONTENT_KEYS
  ]
}

function pickKeys(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    if (k in source) out[k] = source[k]
  }
  return out
}

export function extractFaviconTypeFields(
  content: FaviconContent,
  type: ContentType = content.type
): Record<string, unknown> {
  return pickKeys(content as unknown as Record<string, unknown>, FAVICON_TYPE_KEYS[type] ?? SHARED_CONTENT_KEYS)
}

export function extractIconTypeFields(
  icon: IconConfig,
  type: IconSourceType = icon.sourceType
): Record<string, unknown> {
  return pickKeys(icon as unknown as Record<string, unknown>, ICON_TYPE_KEYS[type] ?? SHARED_CONTENT_KEYS)
}

export function isContentBoundVector(v: PaintVector): boolean {
  return !!(v.linkedOutsideText || v.contentBound)
}

/** Raster/shape proxy for live Inner settings — must not persist outside Paint. */
export function isContentProxyVector(v: PaintVector): boolean {
  return !!v.contentBound
}

export function splitContentBoundVectors(vectors: PaintVector[]): {
  contentBound: PaintVector[]
  rest: PaintVector[]
} {
  const contentBound: PaintVector[] = []
  const rest: PaintVector[] = []
  for (const v of vectors) {
    if (isContentBoundVector(v)) contentBound.push(v)
    else rest.push(v)
  }
  return { contentBound, rest }
}

/**
 * Drop ephemeral Inner content proxies (contentBound stamps).
 * Keep linkedOutsideText — letters stay editable as vectors across sessions.
 */
export function stripContentProxyVectors(vectors: PaintVector[] | null | undefined): PaintVector[] {
  return (vectors ?? []).filter((v) => !isContentProxyVector(v))
}

/**
 * Inner letters allow only one linkedOutsideText vector. Extra linked flags are
 * stripped; unlinked duplicate text layers are kept.
 */
export function normalizeLinkedTextVectors(
  vectors: PaintVector[] | null | undefined,
  preferredId?: string | null
): PaintVector[] {
  const list = vectors ?? []
  const linked = list.filter((v) => v.type === 'text' && v.linkedOutsideText)
  if (linked.length <= 1) return list
  const keepId =
    preferredId && linked.some((v) => v.id === preferredId)
      ? preferredId
      : linked[linked.length - 1]!.id
  return list.map((v) => {
    if (v.type === 'text' && v.linkedOutsideText && v.id !== keepId) {
      const { linkedOutsideText: _l, ...rest } = v
      return rest as PaintVector
    }
    return v
  })
}

export function paintPxToDesign(px: number, resolution: number): number {
  const res = Math.max(1, resolution || 512)
  return Math.round(px * (DESIGN_SIZE / res))
}

export function clampSizeRatio(n: number): number {
  return Math.max(0.05, Math.min(1.5, n))
}

/**
 * Logo icon inner drawable size at paint resolution (outer shadow inset).
 * Matches LogoEditor paint bakes where the content layer disables the container.
 */
export function logoPaintInnerDrawSize(icon: IconConfig, canvasSize = 512): number {
  let outerSize = canvasSize
  const hasOuterShadow =
    !!icon.shadowEnabled &&
    !!icon.containerEnabled &&
    icon.containerShape !== 'none'
  if (hasOuterShadow) {
    const scaledBlur = icon.shadowBlur ?? 8
    const iconSpread = icon.shadowSpread ?? 0
    const iconOx = icon.shadowOffsetX ?? 0
    const iconOy = icon.shadowOffsetY ?? 4
    const blurExtent = scaledBlur * 2
    const shadowPad =
      Math.ceil(
        Math.max(
          blurExtent + iconSpread + Math.abs(iconOx),
          blurExtent + iconSpread + Math.abs(iconOy),
          0
        )
      ) + 4
    outerSize = Math.max(16, canvasSize - shadowPad * 2)
  }
  return Math.max(16, outerSize)
}

/**
 * Paint contentBound stamp box from live outside sizeRatio.
 * Uses crop only for aspect ratio — never crop pixel size (alpha bbox is
 * slightly smaller than the bake every time and would shrink on each Save).
 */
export function proxyBoxFromSizeRatio(
  sizeRatio: number | undefined,
  resolution: number,
  aspectW = 1,
  aspectH = 1,
  innerDrawSize?: number
): { w: number; h: number } {
  const drawArea = Math.max(1, innerDrawSize ?? resolution)
  const target = clampSizeRatio(sizeRatio ?? 0.5) * drawArea
  const aw = Math.max(1e-6, aspectW)
  const ah = Math.max(1e-6, aspectH)
  if (aw >= ah) {
    return { w: target, h: Math.max(1, target * (ah / aw)) }
  }
  return { w: Math.max(1, target * (aw / ah)), h: target }
}

function toHex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

/** True if the canvas has any meaningfully opaque paint. */
export function canvasHasOpaquePaint(canvas: HTMLCanvasElement, minAlpha = 24): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  const { width: W, height: H } = canvas
  if (W < 1 || H < 1) return false
  const data = ctx.getImageData(0, 0, W, H).data
  const step = Math.max(1, Math.floor((W * H) / 20000))
  for (let i = 3; i < data.length; i += 4 * step) {
    if (data[i] >= minAlpha) return true
  }
  return false
}

/**
 * Dominant opaque RGB from a canvas (quantized vote). Returns #rrggbb or null.
 */
export function sampleDominantOpaqueColor(
  canvas: HTMLCanvasElement,
  minAlpha = 32
): string | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const { width: W, height: H } = canvas
  if (W < 1 || H < 1) return null
  const data = ctx.getImageData(0, 0, W, H).data
  const counts = new Map<string, { n: number; r: number; g: number; b: number }>()
  const step = Math.max(1, Math.floor(Math.min(W, H) / 96))
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4
      const a = data[i + 3]
      if (a < minAlpha) continue
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const key = `${r >> 4},${g >> 4},${b >> 4}`
      const cur = counts.get(key)
      if (cur) {
        cur.n += 1
        cur.r += r
        cur.g += g
        cur.b += b
      } else {
        counts.set(key, { n: 1, r, g, b })
      }
    }
  }
  let best: { n: number; r: number; g: number; b: number } | null = null
  for (const v of counts.values()) {
    if (!best || v.n > best.n) best = v
  }
  if (!best || best.n < 6) return null
  return `#${toHex2(best.r / best.n)}${toHex2(best.g / best.n)}${toHex2(best.b / best.n)}`
}

/**
 * How much of the base silhouette is covered by opaque overlay pixels (0–1).
 * Used to decide if Outer Fill was a full recolor (clear overlay after sync).
 */
export function overlayCoverRatio(
  base: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
  minAlpha = 24
): number {
  const bCtx = base.getContext('2d')
  const oCtx = overlay.getContext('2d')
  if (!bCtx || !oCtx) return 0
  const W = Math.min(base.width, overlay.width)
  const H = Math.min(base.height, overlay.height)
  if (W < 1 || H < 1) return 0
  const bd = bCtx.getImageData(0, 0, W, H).data
  const od = oCtx.getImageData(0, 0, W, H).data
  let baseN = 0, coverN = 0
  const step = Math.max(1, Math.floor(Math.min(W, H) / 96))
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4 + 3
      if (bd[i] < minAlpha) continue
      baseN += 1
      if (od[i] >= minAlpha) coverN += 1
    }
  }
  return baseN > 0 ? coverN / baseN : 0
}

/** Alpha-weighted center + axis-aligned ink bbox of non-transparent pixels. */
export function measureAlphaBounds(
  canvas: HTMLCanvasElement
): { cx: number; cy: number; w: number; h: number; minX: number; minY: number } | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const { width: W, height: H } = canvas
  if (W < 1 || H < 1) return null
  const data = ctx.getImageData(0, 0, W, H).data
  let minX = W, minY = H, maxX = -1, maxY = -1
  let sumX = 0, sumY = 0, sumA = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = data[(y * W + x) * 4 + 3]
      if (a < 8) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      sumX += x * a
      sumY += y * a
      sumA += a
    }
  }
  if (sumA <= 0 || maxX < minX) return null
  return {
    cx: sumX / sumA,
    cy: sumY / sumA,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
    minX,
    minY
  }
}

/** Crop opaque ink to a PNG data URL (for contentBound stamp proxy). */
export function cropOpaqueToDataUrl(
  canvas: HTMLCanvasElement
): { dataUrl: string; w: number; h: number; minX: number; minY: number } | null {
  const bounds = measureAlphaBounds(canvas)
  if (!bounds) return null
  const { minX, minY, w, h } = bounds
  const out = document.createElement('canvas')
  out.width = Math.max(1, w)
  out.height = Math.max(1, h)
  const ox = out.getContext('2d')
  if (!ox) return null
  ox.drawImage(canvas, minX, minY, w, h, 0, 0, w, h)
  return { dataUrl: out.toDataURL('image/png'), w, h, minX, minY }
}

function faviconSizeRatio(content: FaviconContent): number {
  switch (content.type) {
    case 'letters': return content.fontSizeRatio ?? 0.52
    case 'shape': return content.shapeSizeRatio ?? 0.5
    case 'lucide': return content.lucideSizeRatio ?? 0.6
    case 'svg-markup': return content.svgMarkupSizeRatio ?? 0.7
    case 'image': return content.imageSizeRatio ?? 0.8
    case 'canva': return 0.6
    default: return 0.6
  }
}

function faviconFillColor(content: FaviconContent): string {
  switch (content.type) {
    case 'letters': return content.textColor ?? '#ffffff'
    case 'shape': return content.shapeColor ?? '#ffffff'
    case 'lucide':
    case 'svg-markup': return content.lucideColor ?? '#ffffff'
    case 'svg': return content.svgColor ?? '#ffffff'
    case 'canva': return content.canvaPrimaryColor ?? '#6366f1'
    default: return '#ffffff'
  }
}

function iconSizeRatio(icon: IconConfig): number {
  switch (icon.sourceType) {
    case 'letters': return icon.fontSizeRatio ?? 0.52
    case 'shape': return icon.shapeSizeRatio ?? 0.5
    case 'lucide': return icon.lucideSizeRatio ?? 0.6
    case 'svg': return icon.svgMarkupSizeRatio ?? 0.7
    case 'image': return icon.imageSizeRatio ?? 0.8
    default: return 0.6
  }
}

/** Build Paint outside-content payload from favicon Inner settings. */
export function outsideContentFromFavicon(content: FaviconContent): OutsideContentSettings {
  const isLetters = content.type === 'letters'
  return {
    kind: isLetters ? 'letters' : 'proxy',
    text: content.text ?? '',
    textColor: content.textColor ?? '#ffffff',
    fontFamily: content.fontFamily ?? 'Inter',
    fontWeight: content.fontWeight ?? '700',
    fontItalic: !!content.fontItalic,
    fontUnderline: !!content.fontUnderline,
    fontSizeRatio: content.fontSizeRatio ?? 0.52,
    letterSpacing: content.letterSpacing ?? 0,
    offsetX: content.offsetX ?? 0,
    offsetY: content.offsetY ?? 0,
    sizeRatio: faviconSizeRatio(content),
    fillColor: faviconFillColor(content),
    contentShadowEnabled: !!content.contentShadowEnabled,
    contentShadowColor: content.contentShadowColor ?? '#00000080',
    contentShadowBlur: content.contentShadowBlur ?? 8,
    contentShadowSpread: content.contentShadowSpread ?? 0,
    contentShadowOffsetX: content.contentShadowOffsetX ?? 0,
    contentShadowOffsetY: content.contentShadowOffsetY ?? 3
  }
}

/** Build Paint outside-content payload from logo icon settings (offsets → 256 design). */
export function outsideContentFromIcon(icon: IconConfig): OutsideContentSettings {
  const isLetters = icon.sourceType === 'letters'
  const iconSize = Math.max(1, icon.size || 112)
  const toDesign = (n: number) => Math.round(n * (DESIGN_SIZE / iconSize))
  return {
    kind: isLetters ? 'letters' : 'proxy',
    text: icon.text ?? '',
    textColor: icon.textColor ?? icon.primaryColor ?? '#ffffff',
    fontFamily: icon.fontFamily ?? 'Inter',
    fontWeight: icon.fontWeight ?? '700',
    fontItalic: !!icon.fontItalic,
    fontUnderline: !!icon.fontUnderline,
    fontSizeRatio: icon.fontSizeRatio ?? 0.52,
    letterSpacing: icon.letterSpacing ?? 0,
    offsetX: toDesign(icon.offsetX ?? 0),
    offsetY: toDesign(icon.offsetY ?? 0),
    sizeRatio: iconSizeRatio(icon),
    fillColor: icon.primaryColor ?? icon.textColor ?? '#ffffff',
    contentShadowEnabled: !!icon.contentShadowEnabled,
    contentShadowColor: icon.contentShadowColor ?? '#00000080',
    contentShadowBlur: toDesign(icon.contentShadowBlur ?? 8),
    contentShadowSpread: toDesign(icon.contentShadowSpread ?? 0),
    contentShadowOffsetX: toDesign(icon.contentShadowOffsetX ?? 0),
    contentShadowOffsetY: toDesign(icon.contentShadowOffsetY ?? 3)
  }
}

function shadowSyncFromVector(
  v: PaintVector,
  resolution: number
): Pick<
  PaintContentSync,
  | 'contentShadowEnabled'
  | 'contentShadowColor'
  | 'contentShadowBlur'
  | 'contentShadowSpread'
  | 'contentShadowOffsetX'
  | 'contentShadowOffsetY'
> {
  return {
    contentShadowEnabled: !!v.shadow,
    contentShadowColor: v.shadowColor ?? '#00000080',
    contentShadowBlur: paintPxToDesign(v.shadowBlur ?? 0, resolution),
    contentShadowSpread: paintPxToDesign(v.shadowSpread ?? 0, resolution),
    contentShadowOffsetX: paintPxToDesign(v.shadowOffsetX ?? 0, resolution),
    contentShadowOffsetY: paintPxToDesign(v.shadowOffsetY ?? 0, resolution)
  }
}

function applyContentShadowSync<T extends {
  contentShadowEnabled?: boolean
  contentShadowColor?: string
  contentShadowBlur?: number
  contentShadowSpread?: number
  contentShadowOffsetX?: number
  contentShadowOffsetY?: number
}>(target: T, sync: PaintContentSync): T {
  if (sync.contentShadowEnabled === undefined) return target
  return {
    ...target,
    contentShadowEnabled: !!sync.contentShadowEnabled,
    contentShadowColor: sync.contentShadowColor ?? target.contentShadowColor ?? '#00000080',
    contentShadowBlur: sync.contentShadowBlur ?? target.contentShadowBlur ?? 8,
    contentShadowSpread: sync.contentShadowSpread ?? target.contentShadowSpread ?? 0,
    contentShadowOffsetX: sync.contentShadowOffsetX ?? target.contentShadowOffsetX ?? 0,
    contentShadowOffsetY: sync.contentShadowOffsetY ?? target.contentShadowOffsetY ?? 3
  }
}

/** Ink-center of a paint text vector (same metrics family as optical placement). */
function textInkCenter(v: PaintVector): { cx: number; cy: number } | null {
  const p0 = v.pts[0]
  if (!p0) return null
  const rows = (v.text ?? '').split('\n')
  const displayRows = rows.length ? rows : ['']
  const fs = v.fontSize ?? 48
  const lineH = fs * (v.lineHeight ?? 1.28)
  const spacing = v.letterSpacing ?? 0
  const weight = v.bold ? Math.max(v.weight ?? 400, 700) : (v.weight ?? 400)
  const font = `${v.italic ? 'italic ' : 'normal '}${weight} ${fs}px "${v.fontFamily ?? 'Inter'}", sans-serif`
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return { cx: p0.x + fs * 0.35, cy: p0.y + fs * 0.4 }
  ctx.font = font
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  let inkLeft = Infinity, inkRight = -Infinity, inkTop = Infinity, inkBottom = -Infinity
  let boxW = fs
  let boxH = lineH * displayRows.length
  for (let i = 0; i < displayRows.length; i++) {
    const sample = displayRows[i] || ' '
    const tm = spacing === 0 ? ctx.measureText(sample) : measureSpacedText(ctx, sample, spacing)
    const width = tm.width
    boxW = Math.max(boxW, width)
    const left = tm.actualBoundingBoxLeft ?? 0
    const right = Math.max(width, tm.actualBoundingBoxRight ?? width)
    const asc = tm.actualBoundingBoxAscent ?? 0
    const desc = tm.actualBoundingBoxDescent ?? fs * 0.8
    const y0 = i * lineH
    inkLeft = Math.min(inkLeft, left)
    inkRight = Math.max(inkRight, right)
    inkTop = Math.min(inkTop, y0 - asc)
    inkBottom = Math.max(inkBottom, y0 + desc)
  }
  if (!Number.isFinite(inkLeft)) {
    return { cx: p0.x + fs * 0.35, cy: p0.y + fs * 0.4 }
  }
  const localInk = {
    cx: p0.x + (inkLeft + inkRight) / 2,
    cy: p0.y + (inkTop + inkBottom) / 2
  }
  const rot = v.rot ?? 0
  if (!rot) return localInk
  const objCenter = { x: p0.x + boxW / 2, y: p0.y + boxH / 2 }
  const s = Math.sin(rot), co = Math.cos(rot)
  const dx = localInk.cx - objCenter.x
  const dy = localInk.cy - objCenter.y
  return {
    cx: objCenter.x + dx * co - dy * s,
    cy: objCenter.y + dx * s + dy * co
  }
}

/**
 * Build sync hints from Paint vectors + optional Inner composite (base+overlay).
 * Centers are relative to canvas center; converted to design px (256-scale).
 */
export function buildPaintContentSync(opts: {
  vectors: PaintVector[]
  resolution: number
  /** Content base + overlay composite for fallback optical center / size. */
  contentComposite?: HTMLCanvasElement | null
  /** Outer live base (read-only bake). */
  containerBase?: HTMLCanvasElement | null
  /** Outer paint overlay. */
  containerOverlay?: HTMLCanvasElement | null
  /** Inner live base + overlay composite already built — also used for fillColor. */
  contentBase?: HTMLCanvasElement | null
  contentOverlay?: HTMLCanvasElement | null
  /**
   * When false, Outer Fill stays on the paint overlay only (image / SVG-markup
   * outers). Do not push a sampled colour into backgroundColor / containerColor.
   */
  syncOuterFillColor?: boolean
  /**
   * Inner drawable area at paint resolution (smaller than canvas when outer
   * shadow insets the shape). sizeRatio is stored relative to this, not the
   * full canvas, so saved content matches what Paint shows vs the outer shape.
   */
  innerDrawSize?: number
}): PaintContentSync {
  const res = Math.max(1, opts.resolution || 512)
  const drawArea = Math.max(1, opts.innerDrawSize ?? res)
  const sync: PaintContentSync = {}

  // Outer Fill → live backgroundColor / containerColor (and clear overlay if full recolor).
  // Skip for image/SVG-markup outers — those have no live fill colour to sync.
  if (
    opts.syncOuterFillColor !== false &&
    opts.containerOverlay &&
    canvasHasOpaquePaint(opts.containerOverlay)
  ) {
    const outerComposite = document.createElement('canvas')
    outerComposite.width = res
    outerComposite.height = res
    const ox = outerComposite.getContext('2d')
    if (ox) {
      if (opts.containerBase) ox.drawImage(opts.containerBase, 0, 0)
      ox.drawImage(opts.containerOverlay, 0, 0)
      const color = sampleDominantOpaqueColor(outerComposite)
      if (color) {
        sync.outerFillColor = color
        if (opts.containerBase) {
          const cover = overlayCoverRatio(opts.containerBase, opts.containerOverlay)
          if (cover >= 0.35) sync.clearOuterOverlay = true
        } else {
          sync.clearOuterOverlay = true
        }
      }
    }
  }

  // Inner Fill on base overlay (when not driven by linked text / content proxy).
  if (
    !opts.vectors.some((v) => v.type === 'text' && v.linkedOutsideText) &&
    opts.contentOverlay &&
    canvasHasOpaquePaint(opts.contentOverlay)
  ) {
    const innerComposite = document.createElement('canvas')
    innerComposite.width = res
    innerComposite.height = res
    const ix = innerComposite.getContext('2d')
    if (ix) {
      if (opts.contentBase) ix.drawImage(opts.contentBase, 0, 0)
      ix.drawImage(opts.contentOverlay, 0, 0)
      const color = sampleDominantOpaqueColor(innerComposite)
      if (color) sync.fillColor = color
    }
    // Heavy Inner Fill often paints over a baked content border; clear the live
    // border so it does not reappear as an outline outside Paint.
    if (opts.contentBase) {
      const cover = overlayCoverRatio(opts.contentBase, opts.contentOverlay)
      if (cover >= 0.35) sync.clearContentBorder = true
    }
  }

  const linkedTexts = opts.vectors.filter((v) => v.type === 'text' && v.linkedOutsideText)
  const linked = linkedTexts.length ? linkedTexts[linkedTexts.length - 1] : undefined
  const proxy = opts.vectors.find(
    (v) => v.contentBound && (v.type === 'stamp' || v.type === 'shape') && v.pts.length >= 2
  )

  if (linked) {
    const fs = linked.fontSize ?? Math.round(res * 0.52)
    const ink = textInkCenter(linked)
    if (ink) {
      sync.offsetX = paintPxToDesign(ink.cx - res / 2, res)
      sync.offsetY = paintPxToDesign(ink.cy - res / 2, res)
    }
    sync.letters = {
      text: linked.text ?? '',
      textColor: linked.color || '#ffffff',
      fontFamily: linked.fontFamily ?? 'Inter',
      fontWeight: String(linked.weight ?? (linked.bold ? 700 : 400)),
      fontItalic: !!linked.italic,
      fontSizeRatio: clampSizeRatio(fs / drawArea),
      letterSpacing: paintPxToDesign(linked.letterSpacing ?? 0, res)
    }
    sync.fillColor = sync.letters.textColor
    sync.sizeRatio = sync.letters.fontSizeRatio
    Object.assign(sync, shadowSyncFromVector(linked, res))
    return sync
  }

  if (proxy && proxy.pts.length >= 2) {
    const a = proxy.pts[0], b = proxy.pts[1]
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2
    const w = Math.abs(b.x - a.x)
    const h = Math.abs(b.y - a.y)
    sync.offsetX = paintPxToDesign(cx - res / 2, res)
    sync.offsetY = paintPxToDesign(cy - res / 2, res)
    sync.sizeRatio = clampSizeRatio(Math.max(w, h) / drawArea)
    if (proxy.color) sync.fillColor = proxy.color
    Object.assign(sync, shadowSyncFromVector(proxy, res))
    return sync
  }

  if (opts.contentComposite) {
    const bounds = measureAlphaBounds(opts.contentComposite)
    if (bounds) {
      // Position only — size from alpha bbox is too noisy without a content proxy.
      sync.offsetX = paintPxToDesign(bounds.cx - res / 2, res)
      sync.offsetY = paintPxToDesign(bounds.cy - res / 2, res)
    }
  }
  return sync
}

/** Apply Outer fill sync onto favicon shell fields (background / SVG outer color). */
export function applyPaintOuterSyncToFavicon(
  config: FaviconConfig,
  sync: PaintContentSync | undefined
): FaviconConfig {
  if (!sync?.outerFillColor) return config
  // Image outers have no live fill — keep paint on the overlay only.
  if (config.outerShape === 'image') return config
  const color = sync.outerFillColor
  return {
    ...config,
    backgroundColor: color,
    transparentBg: false,
    ...(config.outerShape === 'svg-markup' ? { outerShapeSvgColor: color } : {})
  }
}

export function applyPaintContentSyncToFaviconContent(
  content: FaviconContent,
  sync: PaintContentSync | undefined
): FaviconContent {
  if (!sync) return content
  let next: FaviconContent = { ...content }
  if (sync.offsetX !== undefined) next.offsetX = Math.max(-80, Math.min(80, sync.offsetX))
  if (sync.offsetY !== undefined) next.offsetY = Math.max(-80, Math.min(80, sync.offsetY))

  if (sync.letters) {
    next.type = 'letters'
    next.text = sync.letters.text
    next.textColor = sync.letters.textColor
    next.fontFamily = sync.letters.fontFamily
    next.fontWeight = sync.letters.fontWeight
    next.fontItalic = sync.letters.fontItalic
    next.fontSizeRatio = sync.letters.fontSizeRatio
    next.letterSpacing = sync.letters.letterSpacing
  }

  if (sync.fillColor && !sync.letters) {
    switch (next.type) {
      case 'letters':
        next.textColor = sync.fillColor
        break
      case 'shape':
        next.shapeColor = sync.fillColor
        break
      case 'lucide':
        next.lucideColor = sync.fillColor
        break
      case 'svg-markup':
        next.lucideColor = sync.fillColor
        break
      case 'svg':
        next.svgColor = sync.fillColor
        break
      default:
        break
    }
  }

  if (sync.sizeRatio !== undefined && !sync.letters) {
    const r = clampSizeRatio(sync.sizeRatio)
    switch (next.type) {
      case 'shape':
        next.shapeSizeRatio = r
        break
      case 'lucide':
        next.lucideSizeRatio = r
        break
      case 'svg-markup':
        next.svgMarkupSizeRatio = r
        break
      case 'image':
        next.imageSizeRatio = r
        break
      default:
        break
    }
  }
  if (sync.clearContentBorder) {
    next.contentBorderWidth = 0
    next.contentBorderColor = 'transparent'
  }
  next = applyContentShadowSync(next, sync)
  return next
}

export function applyPaintContentSyncToIcon(
  icon: IconConfig,
  sync: PaintContentSync | undefined
): IconConfig {
  if (!sync) return icon
  let next: IconConfig = { ...icon }
  // Paint sync uses favicon 256 design units; icon offsets/shadows are icon.size units.
  const iconSize = Math.max(1, icon.size || 112)
  const fromDesign = (n: number) => Math.round(n * (iconSize / DESIGN_SIZE))
  if (sync.offsetX !== undefined) {
    next.offsetX = Math.max(-80, Math.min(80, fromDesign(sync.offsetX)))
  }
  if (sync.offsetY !== undefined) {
    next.offsetY = Math.max(-80, Math.min(80, fromDesign(sync.offsetY)))
  }

  if (sync.letters) {
    next.sourceType = 'letters'
    next.text = sync.letters.text
    next.textColor = sync.letters.textColor
    next.fontFamily = sync.letters.fontFamily
    next.fontWeight = sync.letters.fontWeight
    next.fontItalic = sync.letters.fontItalic
    next.fontSizeRatio = sync.letters.fontSizeRatio
    next.letterSpacing = sync.letters.letterSpacing
  }

  if (sync.fillColor && !sync.letters) {
    switch (next.sourceType) {
      case 'letters':
        next.textColor = sync.fillColor
        break
      case 'shape':
      case 'lucide':
      case 'svg':
        next.primaryColor = sync.fillColor
        break
      default:
        break
    }
  }

  if (sync.outerFillColor && (next.containerType ?? 'color') === 'color') {
    next.containerColor = sync.outerFillColor
    next.containerEnabled = true
  }

  if (sync.sizeRatio !== undefined && !sync.letters) {
    const r = clampSizeRatio(sync.sizeRatio)
    switch (next.sourceType) {
      case 'shape':
        next.shapeSizeRatio = r
        break
      case 'lucide':
        next.lucideSizeRatio = r
        break
      case 'svg':
        next.svgMarkupSizeRatio = r
        break
      case 'image':
        next.imageSizeRatio = r
        break
      default:
        break
    }
  }
  if (sync.contentShadowEnabled !== undefined) {
    next = {
      ...next,
      contentShadowEnabled: !!sync.contentShadowEnabled,
      contentShadowColor: sync.contentShadowColor ?? next.contentShadowColor ?? '#00000080',
      contentShadowBlur: fromDesign(sync.contentShadowBlur ?? 8),
      contentShadowSpread: fromDesign(sync.contentShadowSpread ?? 0),
      contentShadowOffsetX: fromDesign(sync.contentShadowOffsetX ?? 0),
      contentShadowOffsetY: fromDesign(sync.contentShadowOffsetY ?? 3)
    }
  }
  if (sync.clearContentBorder) {
    next.contentBorderWidth = 0
    next.contentBorderColor = 'transparent'
  }
  return next
}

export function buildFaviconTypeStash(
  content: FaviconContent,
  session: PaintSession | null | undefined
): ContentTypeStashEntry {
  const vectors = session?.vectors ?? []
  // Persist linked letters only — never stash contentBound raster proxies.
  const contentBound = (vectors ?? []).filter((v) => !!v.linkedOutsideText)
  return {
    fields: extractFaviconTypeFields(content),
    contentOverlayPng: session?.contentPng,
    contentVectors: contentBound.length ? contentBound : undefined
  }
}

export function buildIconTypeStash(
  icon: IconConfig,
  session: PaintSession | null | undefined
): ContentTypeStashEntry {
  const vectors = session?.vectors ?? []
  const contentBound = (vectors ?? []).filter((v) => !!v.linkedOutsideText)
  return {
    fields: extractIconTypeFields(icon),
    contentOverlayPng: session?.contentPng,
    contentVectors: contentBound.length ? contentBound : undefined
  }
}

/** Transparent empty overlay placeholder. */
export function emptyOverlayPng(resolution = 512): string {
  const c = document.createElement('canvas')
  c.width = resolution
  c.height = resolution
  return c.toDataURL('image/png')
}

/**
 * On content-type switch: stash old type, strip Inner overlay + content-bound
 * vectors from the live session, restore the new type’s stash (or blank Inner).
 */
export function switchFaviconContentType(
  config: FaviconConfig,
  nextType: ContentType
): FaviconConfig {
  const prevType = config.content.type
  if (prevType === nextType) return config

  const session = config.paintSession
  const stash = { ...(config.contentTypeStash ?? {}) }
  stash[prevType] = buildFaviconTypeStash(config.content, session)

  const incoming = stash[nextType]
  let nextSession: PaintSession | null | undefined = session
  if (session && session.version === 1) {
    const { rest } = splitContentBoundVectors(session.vectors ?? [])
    const restoredVectors = [
      ...rest,
      ...(incoming?.contentVectors ?? [])
    ]
    const empty = emptyOverlayPng(session.resolution)
    const nextContentPng = incoming?.contentOverlayPng ?? empty
    nextSession = {
      ...session,
      contentPng: nextContentPng,
      vectors: restoredVectors,
      // Combined flatten is stale after an Inner type swap.
      decorationsPng: undefined,
      // Keep Outer paint under Inner — never drop the Outer plane here.
      containerDecorationsPng:
        session.containerDecorationsPng ?? session.containerPng ?? undefined,
      contentDecorationsPng: nextContentPng
    }
  }

  const restoredFields = (incoming?.fields ?? {}) as Partial<FaviconContent>
  return {
    ...config,
    contentTypeStash: stash,
    paintSession: nextSession ?? null,
    content: {
      ...config.content,
      ...restoredFields,
      type: nextType
    }
  }
}

export function switchIconSourceType(
  icon: IconConfig,
  nextType: IconSourceType
): IconConfig {
  const prevType = icon.sourceType
  if (prevType === nextType) return icon

  const session = icon.paintSession
  const stash = { ...(icon.contentTypeStash ?? {}) }
  stash[prevType] = buildIconTypeStash(icon, session)

  const incoming = stash[nextType]
  let nextSession: PaintSession | null | undefined = session
  if (session && session.version === 1) {
    const { rest } = splitContentBoundVectors(session.vectors ?? [])
    const restoredVectors = [
      ...rest,
      ...(incoming?.contentVectors ?? [])
    ]
    const empty = emptyOverlayPng(session.resolution)
    const nextContentPng = incoming?.contentOverlayPng ?? empty
    nextSession = {
      ...session,
      contentPng: nextContentPng,
      vectors: restoredVectors,
      decorationsPng: undefined,
      containerDecorationsPng:
        session.containerDecorationsPng ?? session.containerPng ?? undefined,
      contentDecorationsPng: nextContentPng
    }
  }

  const restoredFields = (incoming?.fields ?? {}) as Partial<IconConfig>
  return {
    ...icon,
    contentTypeStash: stash,
    paintSession: nextSession ?? null,
    ...restoredFields,
    sourceType: nextType
  }
}

/** After Paint Save: refresh stash for the active type with latest overlay/vectors/fields. */
export function updateFaviconStashAfterSave(
  config: FaviconConfig,
  session: PaintSession
): FaviconConfig {
  const type = config.content.type
  const stash = { ...(config.contentTypeStash ?? {}) }
  stash[type] = buildFaviconTypeStash(config.content, session)
  return { ...config, contentTypeStash: stash }
}

export function updateIconStashAfterSave(
  icon: IconConfig,
  session: PaintSession
): IconConfig {
  const type = icon.sourceType
  const stash = { ...(icon.contentTypeStash ?? {}) }
  stash[type] = buildIconTypeStash(icon, session)
  return { ...icon, contentTypeStash: stash }
}
