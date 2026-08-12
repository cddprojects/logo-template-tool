import type { PaintVector } from '../types'

type Pt = { x: number; y: number }

const measCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null

function firstSolidColor(color: string): string {
  if (!color || color === 'transparent') return '#000000'
  if (color.startsWith('linear-gradient')) return '#ffffff'
  return color.length >= 7 ? color.slice(0, 7) : color
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
  ctx.save()
  ctx.font = font
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  // Linked outside text uses the renderer's border/shadow pipeline — not paint vector shadow.
  const usePaintShadow = !!v.shadow && !v.linkedOutsideText
  if (usePaintShadow) {
    const blur = v.shadowBlur ?? 0
    const ox = v.shadowOffsetX ?? 0
    const oy = v.shadowOffsetY ?? 0
    ctx.shadowColor = firstSolidColor(v.shadowColor ?? '#00000080')
    ctx.shadowBlur = blur
    ctx.shadowOffsetX = ox
    ctx.shadowOffsetY = oy
  } else {
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
  }
  ctx.fillStyle = v.color.startsWith('linear-gradient') ? firstSolidColor(v.color) : v.color
  rows.forEach((r, i) => {
    if (r) fillSpacedText(ctx, r, p.x, p.y + i * lineH, spacing)
  })

  if (v.linkedOutsideText && decor && sessionRes) {
    const cbw = (decor.contentBorderWidth ?? 0) * (sessionRes / 256)
    if (cbw > 0) {
      const cbc = (decor.contentBorderColor ?? 'transparent') === 'transparent'
        ? '#000000'
        : (decor.contentBorderColor ?? '#000000')
      ctx.lineWidth = cbw
      ctx.strokeStyle = cbc
      ctx.lineJoin = 'round'
      rows.forEach((r, i) => {
        if (r) strokeSpacedText(ctx, r, p.x, p.y + i * lineH, spacing)
      })
    }
  }

  ctx.restore()
}

function renderPaintTextVector(
  ctx: CanvasRenderingContext2D,
  v: PaintVector,
  decor?: InnerContentDecor,
  sessionRes?: number
): void {
  if (v.type !== 'text') return
  const c = objCenter(v)
  const rot = v.rot ?? 0
  const sx = v.scaleX ?? 1
  const sy = v.scaleY ?? 1
  if (needsDisplayTransform(v)) {
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(rot)
    ctx.scale(sx, sy)
    ctx.translate(-c.x, -c.y)
    renderPaintText(ctx, v, decor, sessionRes)
    ctx.restore()
    return
  }
  renderPaintText(ctx, v, decor, sessionRes)
}

/** True when linked letters were warped in Paint (not driven by live outside typography). */
export function linkedTextHasPaintTransform(v: PaintVector): boolean {
  if (v.type !== 'text' || !v.linkedOutsideText) return false
  if (v.reshapeQuad?.length === 4) return true
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
  const csc = firstSolidColor(decor.contentShadowColor ?? '#00000080')
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

    const frameCanvas = document.createElement('canvas')
    frameCanvas.width = cW + pad * 2
    frameCanvas.height = cH + pad * 2
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

    const shadowCanvas = document.createElement('canvas')
    shadowCanvas.width = cW
    shadowCanvas.height = cH
    const sCtx = shadowCanvas.getContext('2d')!
    sCtx.imageSmoothingEnabled = true
    sCtx.imageSmoothingQuality = 'high'
    sCtx.filter = `drop-shadow(${csx + HUGE}px ${csy + HUGE}px ${csb}px ${csc})`
    sCtx.drawImage(frameCanvas, -HUGE - pad, -HUGE - pad)
    sCtx.filter = 'none'
    sCtx.globalCompositeOperation = 'destination-in'
    sCtx.drawImage(offscreen, 0, 0, cW, cH)
    sCtx.globalCompositeOperation = 'source-over'

    const insetCanvas = document.createElement('canvas')
    insetCanvas.width = cW
    insetCanvas.height = cH
    const iCtx = insetCanvas.getContext('2d')!
    iCtx.drawImage(offscreen, 0, 0, cW, cH)
    iCtx.drawImage(shadowCanvas, 0, 0)

    ctx.drawImage(insetCanvas, x, y)
    return
  }

  if (cSpread > 0) {
    const HUGE = 10000
    const spreadSize = size + cSpread * 2
    const spreadCanvas = document.createElement('canvas')
    spreadCanvas.width = spreadSize
    spreadCanvas.height = spreadSize
    const sCtx = spreadCanvas.getContext('2d')!
    sCtx.imageSmoothingEnabled = true
    sCtx.imageSmoothingQuality = 'high'
    sCtx.drawImage(offscreen, 0, 0, spreadSize, spreadSize)

    ctx.filter = `drop-shadow(${csx + HUGE}px ${csy + HUGE}px ${csb}px ${csc})`
    ctx.drawImage(spreadCanvas, x - cSpread - HUGE, y - cSpread - HUGE)
    ctx.filter = 'none'
    ctx.drawImage(offscreen, x, y, size, size)
    return
  }

  ctx.filter = `drop-shadow(${csx}px ${csy}px ${csb}px ${csc})`
  ctx.drawImage(offscreen, x, y, size, size)
  ctx.filter = 'none'
}
