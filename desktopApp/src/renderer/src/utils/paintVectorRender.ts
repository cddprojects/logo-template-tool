import type { PaintVector } from '../types'
import { reuseCanvas, takeCanvas, releaseCanvas } from './canvasPool'
import { alphaBoundsFromCanvas, drawReshapedCanvas, reshapeIsApplied } from './paintReshape'

type Pt = { x: number; y: number }

const measCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
const bakeOutSlot: { current: HTMLCanvasElement | null } = { current: null }
const bakeSpreadSlot: { current: HTMLCanvasElement | null } = { current: null }
const textOffSlot: { current: HTMLCanvasElement | null } = { current: null }

function firstSolidColor(color: string): string {
  if (!color || color === 'transparent') return '#000000'
  if (color.startsWith('linear-gradient')) return '#ffffff'
  return color.length >= 7 ? color.slice(0, 7) : color
}

function isTransparentPaintColor(color: string): boolean {
  if (!color || color === 'transparent' || color === 'none') return true
  if (color.startsWith('linear-gradient') || color.startsWith('radial-gradient')) return false
  if (/^#[0-9a-fA-F]{8}$/.test(color) && color.slice(7, 9).toLowerCase() === '00') return true
  return false
}

/** Same as live renderer: keep #RRGGBBAA so Paint and preview match. */
function cssShadowColor(color: string): string {
  if (!color || color === 'transparent' || color === 'none') return ''
  if (color.startsWith('linear-gradient') || color.startsWith('radial-gradient')) return '#888888'
  const hex = color.trim()
  if (/^#[0-9a-fA-F]{8}$/.test(hex) && hex.slice(7, 9).toLowerCase() === '00') return ''
  return color
}

export type BakedDropShadow = { canvas: HTMLCanvasElement; inset: number }

/**
 * Same composite as live Inner: CSS drop-shadow on a glyph bitmap (alpha),
 * then the clean source once. Do not fillText twice (that fringes a "border").
 * Bake on identity so rotate/flip can run after without Chromium dropping the shadow.
 */
export function bakeCanvasDropShadow(
  src: HTMLCanvasElement,
  opts: { blur?: number; ox?: number; oy?: number; spread?: number; color: string; shadowOnly?: boolean }
): BakedDropShadow {
  const W = Math.max(1, src.width)
  const H = Math.max(1, src.height)
  const blur = opts.blur ?? 0
  const ox = opts.ox ?? 0
  const oy = opts.oy ?? 0
  const spread = Math.max(0, opts.spread ?? 0)
  const color = cssShadowColor(opts.color)
  const shadowOnly = !!opts.shadowOnly
  const inset = Math.max(8, Math.ceil(blur * 3 + spread + Math.abs(ox) + Math.abs(oy) + 16))
  const out = reuseCanvas(bakeOutSlot, W + inset * 2, H + inset * 2)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (!color) {
    if (!shadowOnly) ctx.drawImage(src, inset, inset)
    return { canvas: out, inset }
  }

  if (spread > 0) {
    // Live: uniform scale of a square, HUGE so only the coloured shadow lands.
    const side = Math.max(W, H)
    const spreadSize = side + spread * 2
    const square = takeCanvas(side, side)
    const sc = reuseCanvas(bakeSpreadSlot, spreadSize, spreadSize)
    try {
      const sq = square.getContext('2d')!
      sq.drawImage(src, (side - W) / 2, (side - H) / 2)
      const s = sc.getContext('2d')!
      s.imageSmoothingEnabled = true
      s.imageSmoothingQuality = 'high'
      s.drawImage(square, 0, 0, spreadSize, spreadSize)
      const HUGE = 10000
      const dx = inset - (spreadSize - W) / 2
      const dy = inset - (spreadSize - H) / 2
      ctx.filter = `drop-shadow(${ox + HUGE}px ${oy + HUGE}px ${blur}px ${color})`
      ctx.drawImage(sc, dx - HUGE, dy - HUGE)
      ctx.filter = 'none'
      if (!shadowOnly) ctx.drawImage(src, inset, inset)
    } finally {
      releaseCanvas(square)
    }
  } else if (shadowOnly) {
    const HUGE = 10000
    ctx.filter = `drop-shadow(${ox + HUGE}px ${oy + HUGE}px ${blur}px ${color})`
    ctx.drawImage(src, inset - HUGE, inset - HUGE)
    ctx.filter = 'none'
  } else {
    // Live no-spread: one filtered drawImage — source + shadow, no second fill.
    ctx.filter = `drop-shadow(${ox}px ${oy}px ${blur}px ${color})`
    ctx.drawImage(src, inset, inset)
    ctx.filter = 'none'
  }
  return { canvas: out, inset }
}

type CtxLetterSpacing = CanvasRenderingContext2D & { letterSpacing?: string }

function withLetterSpacing(ctx: CanvasRenderingContext2D, spacingPx: number, fn: () => void): void {
  const c = ctx as CtxLetterSpacing
  const prev = c.letterSpacing
  if (spacingPx) c.letterSpacing = `${spacingPx}px`
  fn()
  c.letterSpacing = prev || '0px'
}

function measureSpacedText(ctx: CanvasRenderingContext2D, text: string, spacingPx = 0): TextMetrics {
  let metrics!: TextMetrics
  withLetterSpacing(ctx, spacingPx, () => {
    metrics = ctx.measureText(text)
  })
  return metrics
}

function fillSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacingPx = 0
): void {
  withLetterSpacing(ctx, spacingPx, () => {
    ctx.fillText(text, x, y)
  })
}

function strokeSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacingPx = 0
): void {
  withLetterSpacing(ctx, spacingPx, () => {
    ctx.strokeText(text, x, y)
  })
}

function textFontStr(v: PaintVector): string {
  const weight = v.bold ? Math.max(700, v.weight ?? 400) : v.weight ?? 400
  return `${v.italic ? 'italic ' : 'normal '}${weight} ${v.fontSize ?? 48}px "${v.fontFamily ?? 'Inter'}", sans-serif`
}

function textRows(v: PaintVector): string[] {
  return (v.text ?? '').split('\n')
}

function textMetrics(v: PaintVector): { w: number; h: number; lineH: number } {
  const fs = v.fontSize ?? 48
  const lineH = fs * (v.lineHeight ?? 1.28)
  const spacing = v.letterSpacing ?? 0
  const rows = textRows(v)
  const ctx = measCanvas?.getContext('2d')
  let w = fs
  if (ctx) {
    ctx.font = textFontStr(v)
    for (const r of rows) w = Math.max(w, measureSpacedText(ctx, r || ' ', spacing).width)
  } else {
    for (const r of rows) w = Math.max(w, (r.length || 1) * fs * 0.55 + Math.max(0, r.length - 1) * spacing)
  }
  return { w, h: lineH * Math.max(1, rows.length), lineH }
}

function textBBox(v: PaintVector): { x: number; y: number; w: number; h: number } {
  const p = v.pts[0] ?? { x: 0, y: 0 }
  const { w, h } = textMetrics(v)
  return { x: p.x, y: p.y, w, h }
}

function textInkBBox(v: PaintVector): { x: number; y: number; w: number; h: number } {
  const p = v.pts[0] ?? { x: 0, y: 0 }
  const rows = textRows(v)
  const fs = v.fontSize ?? 48
  const lineH = fs * (v.lineHeight ?? 1.28)
  const spacing = v.letterSpacing ?? 0
  const ctx = measCanvas?.getContext('2d')
  if (!ctx || !rows.length) return textBBox(v)
  ctx.font = textFontStr(v)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  let inkLeft = Infinity
  let inkRight = -Infinity
  let inkTop = Infinity
  let inkBottom = -Infinity
  rows.forEach((r, i) => {
    const tm = measureSpacedText(ctx, r || ' ', spacing)
    const left = tm.actualBoundingBoxLeft ?? 0
    const right = Math.max(tm.width, tm.actualBoundingBoxRight ?? tm.width)
    const asc = tm.actualBoundingBoxAscent ?? 0
    const desc = tm.actualBoundingBoxDescent ?? fs * 0.8
    const y0 = i * lineH
    inkLeft = Math.min(inkLeft, p.x - left)
    inkRight = Math.max(inkRight, p.x + right)
    inkTop = Math.min(inkTop, p.y + y0 - asc)
    inkBottom = Math.max(inkBottom, p.y + y0 + desc)
  })
  if (!Number.isFinite(inkLeft)) return textBBox(v)
  return {
    x: inkLeft,
    y: inkTop,
    w: Math.max(1, inkRight - inkLeft),
    h: Math.max(1, inkBottom - inkTop)
  }
}

function unionTextBounds(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(1, Math.max(a.x + a.w, b.x + b.w) - x),
    h: Math.max(1, Math.max(a.y + a.h, b.y + b.h) - y)
  }
}

function objCenter(v: PaintVector): Pt {
  if (v.type === 'text') {
    const b = textInkBBox(v)
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  }
  const pts = v.pts.length ? v.pts : [{ x: 0, y: 0 }]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

function needsDisplayTransform(v: PaintVector): boolean {
  return (
    Math.abs(v.rot ?? 0) > 0.001 ||
    Math.abs((v.scaleX ?? 1) - 1) > 0.001 ||
    Math.abs((v.scaleY ?? 1) - 1) > 0.001
  )
}

/** Outside Inner content border/shadow applied when rendering linked paint text. */
export interface InnerContentDecor {
  contentBorderWidth?: number
  contentBorderColor?: string
  contentShadowEnabled?: boolean
  contentShadowInset?: boolean
  contentShadowColor?: string
  contentShadowBlur?: number
  contentShadowSpread?: number
  contentShadowOffsetX?: number
  contentShadowOffsetY?: number
  /** Live Inner sizeRatio (0–1.5) so content decorations can follow Size %. */
  contentSizeRatio?: number
}

function paintTextBorderWidth(v: PaintVector, decor?: InnerContentDecor, sessionRes?: number): number {
  if (!v.linkedOutsideText || !decor || !sessionRes) return 0
  return (decor.contentBorderWidth ?? 0) * (sessionRes / 256)
}

function drawPaintGlyphs(
  ctx: CanvasRenderingContext2D,
  v: PaintVector,
  rows: string[],
  p: Pt,
  lineH: number,
  spacing: number,
  font: string,
  ox: number,
  oy: number,
  borderW: number,
  borderColor: string
): void {
  ctx.font = font
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = v.color.startsWith('linear-gradient') ? firstSolidColor(v.color) : v.color
  rows.forEach((r, i) => {
    if (r) fillSpacedText(ctx, r, p.x + ox, p.y + i * lineH + oy, spacing)
  })
  if (borderW > 0) {
    ctx.lineWidth = borderW
    ctx.strokeStyle = borderColor
    ctx.lineJoin = 'round'
    rows.forEach((r, i) => {
      if (r) strokeSpacedText(ctx, r, p.x + ox, p.y + i * lineH + oy, spacing)
    })
  }
}

function renderPaintText(
  ctx: CanvasRenderingContext2D,
  v: PaintVector,
  decor?: InnerContentDecor,
  sessionRes?: number
): void {
  const rows = textRows(v)
  if (!v.text) return
  const p = v.pts[0] ?? { x: 0, y: 0 }
  const { lineH } = textMetrics(v)
  const spacing = v.letterSpacing ?? 0
  const font = textFontStr(v)
  const b = unionTextBounds(textBBox(v), textInkBBox(v))
  const borderW = paintTextBorderWidth(v, decor, sessionRes)
  const borderColor = (decor?.contentBorderColor ?? 'transparent') === 'transparent'
    ? '#000000'
    : (decor?.contentBorderColor ?? '#000000')

  const hideFill = isTransparentPaintColor(v.color)
  const transformed = needsDisplayTransform(v) || reshapeIsApplied(v.reshapeQuad, v.reshapeSrc)
  const bakeLinked =
    !!v.linkedOutsideText &&
    transformed &&
    !!(v.shadow || decor?.contentShadowEnabled) &&
    !decor?.contentShadowInset
  const bakeOwn = !v.linkedOutsideText && !!v.shadow && !isTransparentPaintColor(v.shadowColor ?? '')

  if (!bakeLinked && !bakeOwn) {
    if (!hideFill) {
      drawPaintGlyphs(ctx, v, rows, p, lineH, spacing, font, 0, 0, borderW, borderColor)
    }
    return
  }

  const scale = (sessionRes ?? 256) / 256
  const blur = v.shadowBlur ?? Math.round((decor?.contentShadowBlur ?? 8) * scale)
  const sox = v.shadowOffsetX ?? Math.round((decor?.contentShadowOffsetX ?? 0) * scale)
  const soy = v.shadowOffsetY ?? Math.round((decor?.contentShadowOffsetY ?? 3) * scale)
  const spread = v.shadowSpread ?? Math.round((decor?.contentShadowSpread ?? 0) * scale)
  const pad = 8
  const tw = Math.max(1, Math.ceil(b.w) + pad * 2)
  const th = Math.max(1, Math.ceil(b.h) + pad * 2)
  const off = reuseCanvas(textOffSlot, tw, th)
  const o = off.getContext('2d')!
  drawPaintGlyphs(
    o,
    hideFill ? { ...v, color: '#000000' } : v,
    rows, p, lineH, spacing, font,
    -b.x + pad, -b.y + pad,
    hideFill ? 0 : borderW,
    borderColor
  )
  const baked = bakeCanvasDropShadow(off, {
    blur,
    ox: sox,
    oy: soy,
    spread,
    color: v.shadowColor ?? decor?.contentShadowColor ?? '#00000080',
    shadowOnly: hideFill
  })
  ctx.drawImage(baked.canvas, b.x - pad - baked.inset, b.y - pad - baked.inset)
}

function renderPaintTextUnwarped(
  ctx: CanvasRenderingContext2D,
  v: PaintVector,
  decor?: InnerContentDecor,
  sessionRes?: number
): void {
  if (needsDisplayTransform(v)) {
    const c = objCenter(v)
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(v.rot ?? 0)
    ctx.scale(v.scaleX ?? 1, v.scaleY ?? 1)
    ctx.translate(-c.x, -c.y)
    renderPaintText(ctx, v, decor, sessionRes)
    ctx.restore()
    return
  }
  renderPaintText(ctx, v, decor, sessionRes)
}

function renderPaintTextVector(
  ctx: CanvasRenderingContext2D,
  v: PaintVector,
  decor?: InnerContentDecor,
  sessionRes?: number
): void {
  if (v.type !== 'text') return
  const quad = v.reshapeQuad
  if (quad?.length === 4) {
    const W = Math.max(1, ctx.canvas.width)
    const H = Math.max(1, ctx.canvas.height)
    const temp = takeCanvas(W, H)
    try {
      const tctx = temp.getContext('2d')!
      renderPaintTextUnwarped(tctx, v, decor, sessionRes)
      const src = v.reshapeSrc ?? alphaBoundsFromCanvas(temp)
      if (!src || !drawReshapedCanvas(ctx, temp, src, quad)) {
        renderPaintTextUnwarped(ctx, v, decor, sessionRes)
      }
    } finally {
      releaseCanvas(temp)
    }
    return
  }
  renderPaintTextUnwarped(ctx, v, decor, sessionRes)
}

/** True when linked letters were warped in Paint (not driven by live outside typography). */
export function linkedTextHasPaintTransform(v: PaintVector): boolean {
  if (v.type !== 'text' || !v.linkedOutsideText) return false
  if (reshapeIsApplied(v.reshapeQuad, v.reshapeSrc)) return true
  if (Math.abs(v.rot ?? 0) > 0.001) return true
  if (Math.abs((v.scaleX ?? 1) - 1) > 0.001) return true
  if (Math.abs((v.scaleY ?? 1) - 1) > 0.001) return true
  return false
}

function isVectorVisible(v: PaintVector): boolean {
  return (v.visible ?? v.editable ?? true) !== false
}

/** Paint vectors that must draw live on the content layer (outside preview). */
export function contentVectorsForLiveRender(vectors: PaintVector[] | undefined): PaintVector[] {
  return (vectors ?? []).filter((v) => {
    if (v.parentId || v.contentBound || !isVectorVisible(v)) return false
    if ((v.layer ?? 'content') !== 'content') return false
    // Unrotated linked letters stay as live Inner text (keeps content shadow).
    if (v.linkedOutsideText) return linkedTextHasPaintTransform(v)
    return v.type === 'text'
  })
}

/** Draw content-layer paint vectors at session resolution (caller handles scaling). */
export function renderPaintContentVectors(
  ctx: CanvasRenderingContext2D,
  vectors: PaintVector[] | undefined,
  decor?: InnerContentDecor,
  sessionRes?: number
): void {
  const res = sessionRes ?? ctx.canvas.width
  for (const v of contentVectorsForLiveRender(vectors)) {
    if (v.type === 'text') renderPaintTextVector(ctx, v, decor, res)
  }
}

/**
 * Composite a session-resolution offscreen canvas onto the main ctx with the
 * same drop-shadow / inset pipeline used for live Inner content.
 */
export function compositeInnerContentDecor(
  ctx: CanvasRenderingContext2D,
  offscreen: HTMLCanvasElement,
  x: number,
  y: number,
  size: number,
  decor: InnerContentDecor
): void {
  const cScale = size / 256
  const cSpread = (decor.contentShadowSpread ?? 0) * cScale
  const csx = (decor.contentShadowOffsetX ?? 0) * cScale
  const csy = (decor.contentShadowOffsetY ?? 3) * cScale
  const csb = (decor.contentShadowBlur ?? 8) * cScale
  const csc = cssShadowColor(decor.contentShadowColor ?? '#00000080')
  const isInset = decor.contentShadowInset ?? false

  if (!decor.contentShadowEnabled) {
    ctx.drawImage(offscreen, x, y, size, size)
    return
  }

  if (isInset) {
    const cW = size
    const cH = size
    const HUGE = 10000
    const pad = Math.ceil(csb * 2 + Math.max(cW, cH) + Math.abs(csx) + Math.abs(csy) + 4)

    const frameCanvas = takeCanvas(cW + pad * 2, cH + pad * 2)
    const shadowCanvas = takeCanvas(cW, cH)
    const insetCanvas = takeCanvas(cW, cH)
    try {
      const fCtx = frameCanvas.getContext('2d')!
      fCtx.fillStyle = '#000000'
      fCtx.fillRect(0, 0, frameCanvas.width, frameCanvas.height)
      fCtx.globalCompositeOperation = 'destination-out'
      if (cSpread > 0) {
        const hs = Math.max(1, cW - cSpread * 2)
        const ho = pad + (cW - hs) / 2
        fCtx.drawImage(offscreen, ho, ho, hs, hs)
      } else {
        fCtx.drawImage(offscreen, pad, pad, cW, cH)
      }
      fCtx.globalCompositeOperation = 'source-over'

      const sCtx = shadowCanvas.getContext('2d')!
      sCtx.imageSmoothingEnabled = true
      sCtx.imageSmoothingQuality = 'high'
      sCtx.filter = `drop-shadow(${csx + HUGE}px ${csy + HUGE}px ${csb}px ${csc})`
      sCtx.drawImage(frameCanvas, -HUGE - pad, -HUGE - pad)
      sCtx.filter = 'none'
      sCtx.globalCompositeOperation = 'destination-in'
      sCtx.drawImage(offscreen, 0, 0, cW, cH)
      sCtx.globalCompositeOperation = 'source-over'

      const iCtx = insetCanvas.getContext('2d')!
      iCtx.drawImage(offscreen, 0, 0, cW, cH)
      iCtx.drawImage(shadowCanvas, 0, 0)

      ctx.drawImage(insetCanvas, x, y)
    } finally {
      releaseCanvas(frameCanvas)
      releaseCanvas(shadowCanvas)
      releaseCanvas(insetCanvas)
    }
    return
  }

  if (cSpread > 0) {
    const HUGE = 10000
    const spreadSize = size + cSpread * 2
    const spreadCanvas = takeCanvas(spreadSize, spreadSize)
    try {
      const sCtx = spreadCanvas.getContext('2d')!
      sCtx.imageSmoothingEnabled = true
      sCtx.imageSmoothingQuality = 'high'
      sCtx.drawImage(offscreen, 0, 0, spreadSize, spreadSize)

      ctx.filter = `drop-shadow(${csx + HUGE}px ${csy + HUGE}px ${csb}px ${csc})`
      ctx.drawImage(spreadCanvas, x - cSpread - HUGE, y - cSpread - HUGE)
      ctx.filter = 'none'
      ctx.drawImage(offscreen, x, y, size, size)
    } finally {
      releaseCanvas(spreadCanvas)
    }
    return
  }

  ctx.filter = `drop-shadow(${csx}px ${csy}px ${csb}px ${csc})`
  ctx.drawImage(offscreen, x, y, size, size)
  ctx.filter = 'none'
}
