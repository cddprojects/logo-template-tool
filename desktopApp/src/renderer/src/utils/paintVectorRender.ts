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

function objCenter(v: PaintVector): Pt {
  if (v.type === 'text') {
    const b = textBBox(v)
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

function renderPaintText(ctx: CanvasRenderingContext2D, v: PaintVector): void {
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
  if (v.shadow) {
    const blur = v.shadowBlur ?? 0
    const ox = v.shadowOffsetX ?? 0
    const oy = v.shadowOffsetY ?? 0
    ctx.shadowColor = firstSolidColor(v.shadowColor ?? '#00000080')
    ctx.shadowBlur = blur
    ctx.shadowOffsetX = ox
    ctx.shadowOffsetY = oy
  }
  const b = textBBox(v)
  ctx.fillStyle = v.color.startsWith('linear-gradient') ? firstSolidColor(v.color) : v.color
  rows.forEach((r, i) => {
    if (r) fillSpacedText(ctx, r, p.x, p.y + i * lineH, spacing)
  })
  ctx.restore()
}

function renderPaintTextVector(ctx: CanvasRenderingContext2D, v: PaintVector): void {
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
    renderPaintText(ctx, v)
    ctx.restore()
    return
  }
  renderPaintText(ctx, v)
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
  vectors: PaintVector[] | undefined
): void {
  for (const v of contentVectorsForLiveRender(vectors)) {
    if (v.type === 'text') renderPaintTextVector(ctx, v)
  }
}
