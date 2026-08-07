import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from 'react'
import {
  Brush, Eraser, PaintBucket, Pipette, Minus, Square, Circle, PenTool,
  Undo2, Redo2, X, Check, Trash2, Layers, Image as ImageIcon, Upload,
  BoxSelect, Copy, ClipboardPaste, MousePointer2, Ban, Type as TypeIcon,
  Bold as BoldIcon, Italic as ItalicIcon,
  RotateCw, RotateCcw, FlipHorizontal2, FlipVertical2, Sparkles, GripVertical,
  Crop as CropIcon, Library, Pencil, ChevronDown, ChevronRight
} from 'lucide-react'
import { FONT_FAMILY_GROUPS, FONT_WEIGHTS } from '../types'
import type { PaintSaveResult, PaintVector, PaintLayerId, PaintSaveTargets, PaintVariantOption, OutsideTextSettings, OutsideContentSettings } from '../types'
import { loadFont } from '../utils/fontLoader'
import { ColorPickerPopup, isGradientColor, firstSolidColor } from './Controls'
import { resolveCanvasColor, roundedRect, measureSpacedText, fillSpacedText, strokeSpacedText } from '../utils/renderer'
import { removeImageBackground, applySvgColor, drawSvgOnCanvas, renderLucideToSvg } from '../utils/iconUtils'
import { PreviewStage } from './PreviewStage'
import { IconPicker, PAINT_SVG_MIME, PAINT_LUCIDE_MIME } from './IconPicker'
import { DEFAULT_ICON_CONFIG } from '../types'
import type { IconConfig } from '../types'
import {
  buildPaintContentSync,
  clampSizeRatio,
  cropOpaqueToDataUrl,
  emptyOverlayPng,
  proxyBoxFromSizeRatio,
  stripContentProxyVectors
} from '../utils/paintSettingsSync'

type Tool = 'pointer' | 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'shape' | 'freepoly' | 'polygon' | 'select' | 'text'

/** Paint-style brush / eraser tip shapes. */
type BrushTip = 'round' | 'square' | 'slash' | 'backslash' | 'spray'

const BRUSH_TIPS: { value: BrushTip; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'square', label: 'Square' },
  { value: 'slash', label: 'Calligraphy /' },
  { value: 'backslash', label: 'Calligraphy \\' },
  { value: 'spray', label: 'Spray' }
]

function stampBrushTip(
  ctx: CanvasRenderingContext2D,
  tip: BrushTip,
  x: number,
  y: number,
  brushSize: number,
  color: string,
  erase: boolean
): void {
  ctx.save()
  if (erase) ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = erase ? '#000' : color
  const r = Math.max(0.5, brushSize / 2)
  switch (tip) {
    case 'round':
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'square':
      ctx.fillRect(x - r, y - r, brushSize, brushSize)
      break
    case 'slash':
      ctx.translate(x, y)
      ctx.rotate(-Math.PI / 4)
      ctx.fillRect(-r * 0.22, -r, brushSize * 0.44, brushSize)
      break
    case 'backslash':
      ctx.translate(x, y)
      ctx.rotate(Math.PI / 4)
      ctx.fillRect(-r * 0.22, -r, brushSize * 0.44, brushSize)
      break
    case 'spray': {
      const n = Math.max(10, Math.floor(brushSize * 2.2))
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const d = Math.random() * r
        const px = x + Math.cos(a) * d
        const py = y + Math.sin(a) * d
        const s = Math.random() < 0.35 ? 1.4 : 0.85
        ctx.beginPath()
        ctx.arc(px, py, s * 0.55, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
  }
  ctx.restore()
}

function strokeBrushTip(
  ctx: CanvasRenderingContext2D,
  tip: BrushTip,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brushSize: number,
  color: string,
  erase: boolean
): void {
  if (tip === 'round' || tip === 'square') {
    ctx.save()
    if (erase) ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = erase ? '#000' : color
    ctx.lineWidth = brushSize
    ctx.lineCap = tip === 'square' ? 'square' : 'round'
    ctx.lineJoin = tip === 'square' ? 'miter' : 'round'
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    ctx.restore()
    if (tip === 'square') {
      stampBrushTip(ctx, tip, x0, y0, brushSize, color, erase)
      stampBrushTip(ctx, tip, x1, y1, brushSize, color, erase)
    }
    return
  }
  const dist = Math.hypot(x1 - x0, y1 - y0)
  const step = tip === 'spray' ? Math.max(1, brushSize * 0.28) : Math.max(1, brushSize * 0.18)
  const n = Math.max(1, Math.ceil(dist / step))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    stampBrushTip(ctx, tip, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, brushSize, color, erase)
  }
}

function strokeBrushTipOutline(p: CanvasRenderingContext2D, tip: BrushTip, x: number, y: number, brushSize: number): void {
  const r = Math.max(1, brushSize / 2)
  p.beginPath()
  if (tip === 'square') {
    p.rect(x - r, y - r, brushSize, brushSize)
  } else if (tip === 'slash' || tip === 'backslash') {
    const ang = tip === 'slash' ? -Math.PI / 4 : Math.PI / 4
    const hw = brushSize * 0.22
    const pts = [
      { x: -hw, y: -r }, { x: hw, y: -r }, { x: hw, y: r }, { x: -hw, y: r }
    ].map((q) => ({
      x: x + q.x * Math.cos(ang) - q.y * Math.sin(ang),
      y: y + q.x * Math.sin(ang) + q.y * Math.cos(ang)
    }))
    p.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y)
    p.closePath()
  } else {
    // round + spray: circular footprint
    p.arc(x, y, r, 0, Math.PI * 2)
  }
}

function BrushTipIcon({ tip }: { tip: BrushTip }): JSX.Element {
  const common = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'currentColor', 'aria-hidden': true as const }
  if (tip === 'round') {
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="4.5" />
      </svg>
    )
  }
  if (tip === 'square') {
    return (
      <svg {...common}>
        <rect x="2.5" y="2.5" width="9" height="9" rx="0.5" />
      </svg>
    )
  }
  if (tip === 'slash') {
    return (
      <svg {...common}>
        <rect x="5.5" y="1.5" width="3" height="11" rx="0.5" transform="rotate(-35 7 7)" />
      </svg>
    )
  }
  if (tip === 'backslash') {
    return (
      <svg {...common}>
        <rect x="5.5" y="1.5" width="3" height="11" rx="0.5" transform="rotate(35 7 7)" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="4" cy="4.5" r="1.1" />
      <circle cx="8.5" cy="3.5" r="0.9" />
      <circle cx="6.5" cy="7" r="1.2" />
      <circle cx="10" cy="7.5" r="0.85" />
      <circle cx="3.5" cy="9" r="1" />
      <circle cx="7.5" cy="10.5" r="0.9" />
      <circle cx="10.5" cy="10" r="0.75" />
    </svg>
  )
}

// Preset shapes drawn by dragging a bounding box.
type ShapeKind =
  // polygons (under the square button)
  | 'rect' | 'parallelogram' | 'triangle-iso' | 'triangle-right' | 'trapezoid' | 'diamond'
  | 'pentagon' | 'hexagon' | 'heptagon' | 'octagon'
  | 'star3' | 'star4' | 'star5' | 'star6' | 'star8'
  // irregular shapes (under the circle button)
  | 'ellipse' | 'semicircle' | 'quarter' | 'egg' | 'teardrop' | 'heart' | 'crescent'
  | 'cloud' | 'blob' | 'speech' | 'shield' | 'cross' | 'arrow' | 'lightning' | 'arch'

const POLY_SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'parallelogram', label: 'Parallelogram' },
  { value: 'triangle-iso', label: 'Triangle (iso)' },
  { value: 'triangle-right', label: 'Triangle (right)' },
  { value: 'trapezoid', label: 'Trapezoid' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'heptagon', label: 'Heptagon' },
  { value: 'octagon', label: 'Octagon' },
  { value: 'star3', label: 'Star (3)' },
  { value: 'star4', label: 'Star (4)' },
  { value: 'star5', label: 'Star (5)' },
  { value: 'star6', label: 'Star (6)' },
  { value: 'star8', label: 'Star (8)' }
]
const IRREG_SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'semicircle', label: 'Semicircle' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'egg', label: 'Egg' },
  { value: 'teardrop', label: 'Teardrop' },
  { value: 'heart', label: 'Heart' },
  { value: 'crescent', label: 'Crescent' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'blob', label: 'Blob' },
  { value: 'speech', label: 'Speech' },
  { value: 'shield', label: 'Shield' },
  { value: 'cross', label: 'Cross' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'lightning', label: 'Lightning' },
  { value: 'arch', label: 'Arch' }
]
const POLY_KIND_SET = new Set<ShapeKind>(POLY_SHAPES.map((s) => s.value))

interface IconPaintEditorProps {
  /** PNG of the live Outer shape base (read-only; rebaked from settings). */
  containerImage: string | null
  /** PNG of the live Inner content base (read-only; rebaked from settings). */
  contentImage: string | null
  /** Restored Outer paint overlay from paintSession (transparent). */
  containerOverlayImage?: string | null
  /** Restored Inner paint overlay from paintSession (transparent). */
  contentOverlayImage?: string | null
  /** Working resolution (square). */
  resolution?: number
  title?: string
  /** Whether the icon actually has an outer shape / container to edit. */
  hasContainer?: boolean
  /** Restore session vectors when reopening an editable paint session. */
  initialVectors?: PaintVector[]
  /** Restore paint-layer stacking order (topmost first). */
  initialLayerOrder?: PaintLayerId[]
  /**
   * Live Inner settings from outside Paint (letters → linked text; other types
   * → contentBound stamp for move/resize/shadow).
   */
  outsideContentSettings?: OutsideContentSettings | null
  /** @deprecated Prefer outsideContentSettings. Letters-only alias. */
  outsideTextSettings?: OutsideTextSettings | null
  /**
   * When false, Outer Fill does not sync into live fill colour (image / SVG-markup
   * outers). Paint stays on the Outer overlay only.
   */
  syncOuterFillColor?: boolean
  /** Optional: pick which logo / favicon variants receive Save. */
  logoVariantOptions?: PaintVariantOption[]
  faviconVariantOptions?: PaintVariantOption[]
  initialSaveTargets?: PaintSaveTargets
  onSave: (result: PaintSaveResult, targets: PaintSaveTargets) => void | Promise<void>
  onClose: () => void
  /** Opens API key / settings (AI icon search in the left palette). */
  onOpenSettings?: () => void
}

// ── Editable vector lines & polygons ──────────────────────────────────────────
type LineType = 'straight' | 'polyline' | 'curved' | 'free' | 'drawn' | 'poly' | 'shape' | 'text' | 'stamp' | 'group'
type CapType = 'none' | 'arrow' | 'triangle' | 'dot' | 'square' | 'bar'
type DashType = 'solid' | 'dotted' | 'dashed' | 'double' | 'double-dotted' | 'double-dashed'

interface Pt { x: number; y: number }
interface ObjectPaintStroke {
  tool: 'brush' | 'eraser'
  /** Points normalized to the shape's unrotated bounding box. */
  pts: Pt[]
  /** Brush size normalized to the shorter side of the shape. */
  size: number
  color: string
  tip: BrushTip
}
interface LineObj {
  id: string
  /** Renameable object-layer label. */
  name?: string
  /** Independent panel visibility. Legacy sessions used `editable` for this. */
  visible?: boolean
  /** Legacy visibility field retained when reopening old paint sessions. */
  editable?: boolean
  /** Parent nondestructive group. Group children remain real object layers. */
  parentId?: string
  type: LineType
  /** Control points. straight:2 · curved:3 · free:4 · drawn:N · poly:N (vertices) */
  pts: Pt[]
  startCap: CapType
  endCap: CapType
  dash: DashType
  thickness: number
  color: string
  /** poly & shape: closed + optionally filled */
  fill?: boolean
  /** Stroke / border colour (poly, shape, and optionally lines). Falls back to `color`. */
  borderColor?: string
  /** Stroke / border width in px. Falls back to `thickness`. 0 = no border (fill-only shapes). */
  borderWidth?: number
  /** Corner radius in px (rect / polygons / polyline corners). */
  borderRadius?: number
  /** shape only: which preset shape to trace within the bbox (pts = [topLeft, bottomRight]) */
  shape?: ShapeKind
  /** stamp: PNG data URL drawn into the pts bbox ([topLeft, bottomRight]). */
  imageDataUrl?: string
  /** Distinguishes library icons from uploaded/pasted raster stamps in Layers. */
  stampSource?: 'library' | 'image'
  /** Original SVG retained so stroke width can stay constant during resizing. */
  sourceSvgMarkup?: string
  /** Canvas size at initial SVG placement. */
  sourceStampSize?: number
  /** Keep vector/shape stroke width constant while resizing. */
  keepStrokeOnResize?: boolean
  /** Persistent marquee selection from one base raster layer; not a panel layer. */
  marqueeItem?: boolean
  /** Nondestructive pixel edits replayed over a vector shape. */
  paintStrokes?: ObjectPaintStroke[]
  // text only (pts = [topLeft anchor])
  text?: string
  fontFamily?: string
  fontSize?: number
  weight?: number
  bold?: boolean
  italic?: boolean
  /** Line height as a multiplier of font size (default 1.28). */
  lineHeight?: number
  /** Extra space between glyphs in px (default 0). */
  letterSpacing?: number
  shadow?: boolean
  shadowColor?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowSpread?: number
  /** Rotation about the object's centre, in radians. */
  rot?: number
  /** Drawn freehand: connect adjustable points with a smooth curve instead of straight segments. */
  drawnCurve?: boolean
  /**
   * Raster layer this vector lives on:
   *  • container — between Outer shape and Inner content
   *  • content  — above Inner content (default for legacy sessions)
   */
  layer?: 'container' | 'content'
  /** Seeded from outside letters — save keeps content type as letters. */
  linkedOutsideText?: boolean
  contentBound?: boolean
}

/** Cache decoded stamp images so undo/redo redraws stay sync after the first load. */
const stampImgCache = new Map<string, HTMLImageElement>()
function ensureStampImage(dataUrl: string, onReady?: () => void): HTMLImageElement | null {
  const cached = stampImgCache.get(dataUrl)
  if (cached) {
    if (cached.complete && cached.naturalWidth > 0) return cached
    if (onReady) cached.addEventListener('load', () => onReady(), { once: true })
    return null
  }
  const img = new Image()
  stampImgCache.set(dataUrl, img)
  if (onReady) img.onload = () => onReady()
  img.src = dataUrl
  return null
}

function stampRenderDataUrl(l: LineObj, _width: number, _height: number): string {
  if (!l.keepStrokeOnResize || !l.sourceSvgMarkup || !l.sourceStampSize) {
    return l.imageDataUrl ?? ''
  }
  // A numeric inverse scale only preserves strokes while width and height scale
  // equally. Free corner-resizing is anisotropic, so horizontal and vertical
  // strokes otherwise end up with different apparent widths. Convert the
  // original stroke to its initial display-pixel width and let SVG's
  // non-scaling-stroke keep that width under either axis scale.
  const viewBox = l.sourceSvgMarkup.match(
    /viewBox=(["'])\s*[-+]?\d*\.?\d+(?:[ ,]+)[-+]?\d*\.?\d+(?:[ ,]+)([-+]?\d*\.?\d+)(?:[ ,]+)([-+]?\d*\.?\d+)\s*\1/i
  )
  const viewBoxSize = viewBox
    ? Math.max(1, Math.min(Math.abs(Number(viewBox[2])), Math.abs(Number(viewBox[3]))))
    : 24
  const initialScale = l.sourceStampSize / viewBoxSize
  let svg = l.sourceSvgMarkup.replace(
    /stroke-width=(["'])([0-9]*\.?[0-9]+)\1/gi,
    (_match, quote: string, raw: string) =>
      `stroke-width=${quote}${Math.max(0.001, Number(raw) * initialScale)}${quote}`
  )
  svg = svg.replace(
    /<(path|line|polyline|polygon|circle|ellipse|rect)\b(?![^>]*\bvector-effect=)/gi,
    '<$1 vector-effect="non-scaling-stroke"'
  )
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const LINE_TYPES: { value: LineType; label: string }[] = [
  { value: 'straight', label: 'Straight' },
  { value: 'polyline', label: 'Polyline (points)' },
  { value: 'curved', label: 'Curved' },
  { value: 'free', label: 'Free (bendable points)' },
  { value: 'drawn', label: 'Drawn (freehand)' }
]
const CAP_TYPES: { value: CapType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'dot', label: 'Dot' },
  { value: 'square', label: 'Square' },
  { value: 'bar', label: 'Bar' }
]
const DASH_TYPES: { value: DashType; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'double', label: 'Double' },
  { value: 'double-dotted', label: 'Double dotted' },
  { value: 'double-dashed', label: 'Double dashed' }
]

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const mid = (a: Pt, b: Pt): Pt => lerp(a, b, 0.5)
const genId = (): string => Math.random().toString(36).slice(2, 10)

// N points evenly spaced along the segment a→b (all at a when a===b).
function linePts(a: Pt, b: Pt, n: number): Pt[] {
  const out: Pt[] = []
  const c = Math.max(2, n)
  for (let i = 0; i < c; i++) out.push(lerp(a, b, i / (c - 1)))
  return out
}

// Smooth curve passing through every anchor point (Catmull-Rom → polyline).
function catmullRom(pts: Pt[], seg = 16): Pt[] {
  if (pts.length < 3) return pts.slice()
  const out: Pt[] = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    for (let j = 1; j <= seg; j++) {
      const t = j / seg, t2 = t * t, t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      })
    }
  }
  return out
}

// Re-sample a flattened polyline into exactly n points by arc length (keeps shape).
function resampleAlong(poly: Pt[], n: number): Pt[] {
  if (poly.length === 0) return []
  const c = Math.max(2, n)
  if (poly.length === 1) return Array.from({ length: c }, () => ({ ...poly[0] }))
  const cum = [0]
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + dist(poly[i - 1], poly[i]))
  const total = cum[cum.length - 1] || 1
  const out: Pt[] = []
  let seg = 0
  for (let k = 0; k < c; k++) {
    const target = (total * k) / (c - 1)
    while (seg < poly.length - 2 && cum[seg + 1] < target) seg++
    const segLen = cum[seg + 1] - cum[seg] || 1
    out.push(lerp(poly[seg], poly[seg + 1], (target - cum[seg]) / segLen))
  }
  return out
}

// ── Text objects ──────────────────────────────────────────────────────────────
const _measCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null

function textFontStr(l: LineObj): string {
  const weight = l.bold ? Math.max(700, l.weight ?? 400) : l.weight ?? 400
  return `${l.italic ? 'italic ' : 'normal '}${weight} ${l.fontSize ?? 48}px "${l.fontFamily ?? 'Inter'}", sans-serif`
}
function textRows(l: LineObj): string[] {
  return (l.text ?? '').split('\n')
}
function textMetrics(l: LineObj): { w: number; h: number; lineH: number } {
  const fs = l.fontSize ?? 48
  const lineH = fs * (l.lineHeight ?? 1.28)
  const spacing = l.letterSpacing ?? 0
  const rows = textRows(l)
  const ctx = _measCanvas?.getContext('2d')
  let w = fs
  if (ctx) {
    ctx.font = textFontStr(l)
    for (const r of rows) w = Math.max(w, measureSpacedText(ctx, r || ' ', spacing).width)
  } else {
    for (const r of rows) w = Math.max(w, (r.length || 1) * fs * 0.55 + Math.max(0, (r.length - 1)) * spacing)
  }
  return { w, h: lineH * Math.max(1, rows.length), lineH }
}
function textBBox(l: LineObj): { x: number; y: number; w: number; h: number } {
  const p = l.pts[0]
  const { w, h } = textMetrics(l)
  return { x: p.x, y: p.y, w, h }
}

function parseFontWeightNum(weight: string | undefined): number {
  const n = parseInt(String(weight ?? '700'), 10)
  return Number.isFinite(n) ? Math.max(100, Math.min(900, n)) : 700
}

/**
 * Top-left anchor so glyph *ink* (not the em / line box) is centered at (cx, cy).
 * Uses the same actualBoundingBox metrics as the outside letters renderer.
 */
function opticalTopLeftForText(
  probe: Pick<LineObj, 'text' | 'fontFamily' | 'fontSize' | 'weight' | 'bold' | 'italic' | 'letterSpacing' | 'lineHeight'>,
  cx: number,
  cy: number
): Pt {
  const rows = (probe.text ?? '').split('\n')
  const displayRows = rows.length ? rows : ['']
  const fs = probe.fontSize ?? 48
  const lineH = fs * (probe.lineHeight ?? 1.28)
  const spacing = probe.letterSpacing ?? 0
  const weight = probe.bold ? Math.max(probe.weight ?? 400, 700) : (probe.weight ?? 400)
  const font = `${probe.italic ? 'italic ' : 'normal '}${weight} ${fs}px "${probe.fontFamily ?? 'Inter'}", sans-serif`
  const ctx = _measCanvas?.getContext('2d')
  let inkLeft = 0
  let inkRight = fs
  let inkTop = 0
  let inkBottom = fs * 0.8
  if (ctx) {
    ctx.font = font
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    inkLeft = Infinity
    inkRight = -Infinity
    inkTop = Infinity
    inkBottom = -Infinity
    displayRows.forEach((r, i) => {
      const sample = r || ' '
      const tm = measureSpacedText(ctx, sample, spacing)
      const left = tm.actualBoundingBoxLeft ?? 0
      const right = Math.max(tm.width, tm.actualBoundingBoxRight ?? tm.width)
      const asc = tm.actualBoundingBoxAscent ?? 0
      const desc = tm.actualBoundingBoxDescent ?? fs * 0.8
      const y0 = i * lineH
      inkLeft = Math.min(inkLeft, left)
      inkRight = Math.max(inkRight, right)
      inkTop = Math.min(inkTop, y0 - asc)
      inkBottom = Math.max(inkBottom, y0 + desc)
    })
    if (!Number.isFinite(inkLeft)) {
      inkLeft = 0
      inkRight = fs
      inkTop = 0
      inkBottom = lineH * displayRows.length
    }
  } else {
    inkBottom = lineH * displayRows.length
  }
  const inkCx = (inkLeft + inkRight) / 2
  const inkCy = (inkTop + inkBottom) / 2
  return { x: cx - inkCx, y: cy - inkCy }
}

/** Design-scale (256) offset → paint canvas pixels. */
function outsideOffsetToPaint(settings: OutsideTextSettings, resolution: number): Pt {
  const scale = resolution / 256
  return {
    x: (settings.offsetX ?? 0) * scale,
    y: (settings.offsetY ?? 0) * scale
  }
}

/** Map outside Inner content shadow → paint text shadow (design 256 → paint px). */
function outsideShadowToPaint(
  settings: OutsideTextSettings,
  resolution: number
): Pick<LineObj, 'shadow' | 'shadowColor' | 'shadowBlur' | 'shadowSpread' | 'shadowOffsetX' | 'shadowOffsetY'> {
  const scale = resolution / 256
  if (!settings.contentShadowEnabled) {
    return {
      shadow: false,
      shadowColor: settings.contentShadowColor ?? '#00000080',
      shadowBlur: Math.round((settings.contentShadowBlur ?? 8) * scale),
      shadowSpread: Math.round((settings.contentShadowSpread ?? 0) * scale),
      shadowOffsetX: Math.round((settings.contentShadowOffsetX ?? 0) * scale),
      shadowOffsetY: Math.round((settings.contentShadowOffsetY ?? 3) * scale)
    }
  }
  return {
    shadow: true,
    shadowColor: settings.contentShadowColor ?? '#00000080',
    shadowBlur: Math.round((settings.contentShadowBlur ?? 8) * scale),
    shadowSpread: Math.round((settings.contentShadowSpread ?? 0) * scale),
    shadowOffsetX: Math.round((settings.contentShadowOffsetX ?? 0) * scale),
    shadowOffsetY: Math.round((settings.contentShadowOffsetY ?? 3) * scale)
  }
}

function lineFromOutsideText(settings: OutsideTextSettings, resolution: number): LineObj {
  const fontSize = Math.max(4, Math.round(resolution * (settings.fontSizeRatio ?? 0.52)))
  // Favicon renderer scales letterSpacing by areaSize/256; paint uses full resolution.
  const letterSpacing = (settings.letterSpacing ?? 0) * (resolution / 256)
  const weight = parseFontWeightNum(settings.fontWeight)
  const off = outsideOffsetToPaint(settings, resolution)
  const shadow = outsideShadowToPaint(settings, resolution)
  const probe: LineObj = {
    id: genId(),
    type: 'text',
    pts: [{ x: 0, y: 0 }],
    startCap: 'none',
    endCap: 'none',
    dash: 'solid',
    thickness: 1,
    color: settings.textColor || '#ffffff',
    text: settings.text || '',
    fontFamily: settings.fontFamily || 'Inter',
    fontSize,
    weight,
    bold: weight >= 700,
    italic: !!settings.fontItalic,
    lineHeight: 1.28,
    letterSpacing,
    layer: 'content',
    linkedOutsideText: true,
    name: 'Text',
    ...shadow
  }
  probe.pts = [opticalTopLeftForText(probe, resolution / 2 + off.x, resolution / 2 + off.y)]
  return probe
}

function applyOutsideTextToLine(
  l: LineObj,
  settings: OutsideTextSettings,
  resolution: number
): LineObj {
  const fontSize = Math.max(4, Math.round(resolution * (settings.fontSizeRatio ?? 0.52)))
  const letterSpacing = (settings.letterSpacing ?? 0) * (resolution / 256)
  const weight = parseFontWeightNum(settings.fontWeight)
  const off = outsideOffsetToPaint(settings, resolution)
  const shadow = outsideShadowToPaint(settings, resolution)
  const next: LineObj = {
    ...l,
    color: settings.textColor || l.color,
    text: settings.text ?? l.text,
    fontFamily: settings.fontFamily || l.fontFamily,
    fontSize,
    weight,
    bold: weight >= 700,
    italic: !!settings.fontItalic,
    letterSpacing,
    linkedOutsideText: true,
    ...shadow
  }
  next.pts = [opticalTopLeftForText(next, resolution / 2 + off.x, resolution / 2 + off.y)]
  return next
}

/** Stamp proxy for non-letter Inner content (move / resize / shadow in Paint). */
function lineFromContentProxy(
  crop: { dataUrl: string; w: number; h: number },
  settings: OutsideContentSettings,
  resolution: number
): LineObj {
  const off = outsideOffsetToPaint(settings, resolution)
  const shadow = outsideShadowToPaint(settings, resolution)
  const cx = resolution / 2 + off.x
  const cy = resolution / 2 + off.y
  // Size from live sizeRatio; crop only supplies pixels + aspect (not bbox size).
  const { w, h } = proxyBoxFromSizeRatio(settings.sizeRatio, resolution, crop.w, crop.h)
  return {
    id: genId(),
    type: 'stamp',
    pts: [
      { x: cx - w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy + h / 2 }
    ],
    startCap: 'none',
    endCap: 'none',
    dash: 'solid',
    thickness: 0,
    color: settings.fillColor || '#ffffff',
    imageDataUrl: crop.dataUrl,
    stampSource: 'image',
    layer: 'content',
    contentBound: true,
    name: 'Inner content',
    visible: true,
    ...shadow
  }
}

function applyOutsideContentToProxy(
  l: LineObj,
  settings: OutsideContentSettings,
  resolution: number,
  freshCrop?: { dataUrl: string; w: number; h: number }
): LineObj {
  const off = outsideOffsetToPaint(settings, resolution)
  const shadow = outsideShadowToPaint(settings, resolution)
  const a = l.pts[0], b = l.pts[1]
  let w = Math.max(1, Math.abs((b?.x ?? 0) - (a?.x ?? 0)))
  let h = Math.max(1, Math.abs((b?.y ?? 0) - (a?.y ?? 0)))
  if (freshCrop || settings.sizeRatio != null) {
    const aspectW = freshCrop?.w ?? w
    const aspectH = freshCrop?.h ?? h
    ;({ w, h } = proxyBoxFromSizeRatio(settings.sizeRatio, resolution, aspectW, aspectH))
  }
  const cx = resolution / 2 + off.x
  const cy = resolution / 2 + off.y
  return {
    ...l,
    type: 'stamp',
    imageDataUrl: freshCrop?.dataUrl ?? l.imageDataUrl,
    color: settings.fillColor || l.color,
    pts: [
      { x: cx - w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy + h / 2 }
    ],
    contentBound: true,
    name: l.name || 'Inner content',
    layer: 'content',
    ...shadow
  }
}
function renderText(ctx: CanvasRenderingContext2D, l: LineObj): void {
  const rows = textRows(l)
  if (!l.text) return
  const p = l.pts[0]
  const { lineH } = textMetrics(l)
  const spacing = l.letterSpacing ?? 0
  const font = textFontStr(l)
  ctx.save()
  ctx.font = font
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  if (l.shadow) {
    const blur = l.shadowBlur ?? 0
    const ox = l.shadowOffsetX ?? 0
    const oy = l.shadowOffsetY ?? 0
    const spread = l.shadowSpread ?? 0
    const sColor = firstSolidColor(l.shadowColor ?? '#00000080')
    if (spread > 0) {
      const HUGE = 10000
      const sc = document.createElement('canvas')
      sc.width = ctx.canvas.width
      sc.height = ctx.canvas.height
      const s = sc.getContext('2d')!
      s.font = font
      s.textAlign = 'left'
      s.textBaseline = 'top'
      s.fillStyle = '#000'
      s.strokeStyle = '#000'
      s.lineJoin = 'round'
      s.lineWidth = spread * 2
      rows.forEach((r, i) => {
        const y = p.y + i * lineH
        if (r) {
          strokeSpacedText(s, r, p.x, y, spacing)
          fillSpacedText(s, r, p.x, y, spacing)
        }
      })
      ctx.save()
      ctx.filter = `drop-shadow(${ox + HUGE}px ${oy + HUGE}px ${blur}px ${sColor})`
      ctx.drawImage(sc, -HUGE, -HUGE)
      ctx.restore()
    } else {
      ctx.shadowColor = sColor
      ctx.shadowBlur = blur
      ctx.shadowOffsetX = ox
      ctx.shadowOffsetY = oy
    }
  }
  const b = textBBox(l)
  ctx.fillStyle = resolveCanvasColor(ctx, l.color, b.x, b.y, Math.max(1, b.w), Math.max(1, b.h))
  rows.forEach((r, i) => { if (r) fillSpacedText(ctx, r, p.x, p.y + i * lineH, spacing) })
  ctx.restore()
}

// Sample a line into a flat polyline for rendering / hit-testing.
function flattenLine(l: LineObj): Pt[] {
  const p = l.pts
  if (l.type === 'text') {
    const b = textBBox(l)
    return [
      { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }, { x: b.x, y: b.y }
    ]
  }
  if (p.length < 2) return p
  if (l.type === 'poly') return [...p, p[0]]
  if (l.type === 'shape' || l.type === 'stamp') {
    const a = p[0], b = p[1]
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]
  }
  if (l.type === 'straight') return [p[0], p[1]]
  if (l.type === 'drawn') return l.drawnCurve ? catmullRom(p, 16) : p
  if (l.type === 'polyline') return p
  if (l.type === 'curved') {
    const [a, c, b] = p
    const out: Pt[] = []
    const N = 40
    for (let i = 0; i <= N; i++) {
      const t = i / N, mt = 1 - t
      out.push({ x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x, y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y })
    }
    return out
  }
  // free → smooth spline through all anchor points
  return catmullRom(p, 16)
}

// Convert an existing line's points to a different type (preserving endpoints).
function convertPts(l: LineObj, type: LineType): Pt[] {
  const poly = flattenLine(l)
  const a = poly[0], b = poly[poly.length - 1]
  if (type === 'straight') return [a, b]
  if (type === 'curved') return [a, mid(a, b), b]
  // polyline & free share anchor points — keep them when switching between the
  // point-based types (polyline/free/drawn), otherwise start with 4 along a→b.
  if (type === 'polyline' || type === 'free') {
    if (l.type === 'polyline' || l.type === 'free' || l.type === 'drawn') return l.pts.map((p) => ({ ...p }))
    return linePts(a, b, 4)
  }
  return poly.length > 2 ? poly : [a, mid(a, b), b]
}

function offsetPolyline(poly: Pt[], d: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[Math.max(0, i - 1)]
    const next = poly[Math.min(poly.length - 1, i + 1)]
    let nx = -(next.y - prev.y), ny = next.x - prev.x
    const len = Math.hypot(nx, ny) || 1
    nx /= len; ny /= len
    out.push({ x: poly[i].x + nx * d, y: poly[i].y + ny * d })
  }
  return out
}

const isDoubleDash = (d: DashType): boolean => d === 'double' || d === 'double-dotted' || d === 'double-dashed'
const isDotted = (d: DashType): boolean => d === 'dotted' || d === 'double-dotted'
const isDashed = (d: DashType): boolean => d === 'dashed' || d === 'double-dashed'

function dashArrayFor(d: DashType, t: number): number[] {
  if (isDotted(d)) return [0.01, t * 2]
  if (isDashed(d)) return [t * 2.6, t * 1.9]
  return []
}

function strokePolyline(ctx: CanvasRenderingContext2D, poly: Pt[], color: string | CanvasGradient, t: number, dash: number[], cornerRadius = 0): void {
  if (poly.length < 2) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(0.5, t)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.setLineDash(dash)
  ctx.beginPath()
  pathRoundedPolyline(ctx, poly, cornerRadius)
  ctx.stroke()
  ctx.restore()
}

/** Closed polygon with optional rounded corners (arcTo). */
function pathRoundedPolygon(ctx: CanvasRenderingContext2D, pts: Pt[], radius: number): void {
  if (pts.length < 3) return
  const rMax = Math.max(0, radius)
  if (rMax <= 0) {
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.closePath()
    return
  }
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const cur = pts[i]
    const next = pts[(i + 1) % n]
    const d0 = dist(prev, cur) || 1
    const d1 = dist(cur, next) || 1
    const r = Math.min(rMax, d0 / 2, d1 / 2)
    const start = { x: cur.x + (prev.x - cur.x) / d0 * r, y: cur.y + (prev.y - cur.y) / d0 * r }
    if (i === 0) ctx.moveTo(start.x, start.y)
    else ctx.lineTo(start.x, start.y)
    ctx.arcTo(cur.x, cur.y, next.x, next.y, r)
  }
  ctx.closePath()
}

/** Open polyline with optional rounded corners at interior vertices. */
function pathRoundedPolyline(ctx: CanvasRenderingContext2D, pts: Pt[], radius: number): void {
  if (pts.length < 2) return
  if (radius <= 0 || pts.length === 2) {
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    return
  }
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1]
    const d0 = dist(prev, cur) || 1
    const d1 = dist(cur, next) || 1
    const r = Math.min(radius, d0 / 2, d1 / 2)
    ctx.arcTo(cur.x, cur.y, next.x, next.y, r)
  }
  const last = pts[pts.length - 1]
  ctx.lineTo(last.x, last.y)
}

function lineBorderWidth(l: LineObj): number {
  return Math.max(0, l.borderWidth ?? l.thickness)
}
function lineBorderColor(l: LineObj): string {
  return l.borderColor ?? l.color
}
function lineBorderRadius(l: LineObj): number {
  return Math.max(0, l.borderRadius ?? 0)
}

/** Shapes whose outline is a polygon / rect and can take a corner radius. */
function shapeSupportsRadius(kind: ShapeKind): boolean {
  return (
    POLY_KIND_SET.has(kind) ||
    kind === 'cross' || kind === 'arrow' || kind === 'lightning' ||
    kind === 'shield' || kind === 'speech'
  )
}

// Outward unit direction at an endpoint, using a reference point at least
// `minLen` away so freehand/dense polylines give a stable, visible cap.
function endDir(poly: Pt[], atStart: boolean, minLen: number): Pt {
  const n = poly.length
  const end = atStart ? poly[0] : poly[n - 1]
  let ref = atStart ? poly[1] : poly[n - 2]
  if (atStart) {
    for (let i = 1; i < n; i++) { ref = poly[i]; if (dist(end, poly[i]) >= minLen) break }
  } else {
    for (let i = n - 2; i >= 0; i--) { ref = poly[i]; if (dist(end, poly[i]) >= minLen) break }
  }
  const d = { x: end.x - ref.x, y: end.y - ref.y }
  const len = Math.hypot(d.x, d.y) || 1
  return { x: d.x / len, y: d.y / len }
}

function drawCap(ctx: CanvasRenderingContext2D, at: Pt, dir: Pt, cap: CapType, color: string | CanvasGradient, t: number): void {
  if (cap === 'none') return
  const s = Math.max(7, t * 3.2)
  const ang = Math.atan2(dir.y, dir.x)
  ctx.save()
  ctx.fillStyle = color
  ctx.strokeStyle = color
  if (cap === 'arrow' || cap === 'triangle') {
    const a1 = ang + Math.PI - 0.5
    const a2 = ang + Math.PI + 0.5
    ctx.beginPath()
    ctx.moveTo(at.x, at.y)
    ctx.lineTo(at.x + Math.cos(a1) * s, at.y + Math.sin(a1) * s)
    if (cap === 'triangle') {
      ctx.lineTo(at.x + Math.cos(a2) * s, at.y + Math.sin(a2) * s)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.moveTo(at.x, at.y)
      ctx.lineTo(at.x + Math.cos(a2) * s, at.y + Math.sin(a2) * s)
      ctx.lineWidth = Math.max(1, t)
      ctx.lineCap = 'round'
      ctx.stroke()
    }
  } else if (cap === 'dot') {
    ctx.beginPath(); ctx.arc(at.x, at.y, s * 0.55, 0, Math.PI * 2); ctx.fill()
  } else if (cap === 'square') {
    ctx.translate(at.x, at.y); ctx.rotate(ang)
    const q = s * 0.5
    ctx.fillRect(-q, -q, q * 2, q * 2)
  } else if (cap === 'bar') {
    ctx.translate(at.x, at.y); ctx.rotate(ang)
    ctx.fillRect(-Math.max(1, t) * 0.4, -s * 0.9, Math.max(1, t) * 0.8, s * 1.8)
  }
  ctx.restore()
}

// Axis-aligned bounding-box centre of an object's (unrotated) geometry.
function objCenter(l: LineObj): Pt {
  if (l.type === 'text') {
    const b = textBBox(l)
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  }
  const pts = l.pts.length ? l.pts : [{ x: 0, y: 0 }]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}
// Rotate point p by `ang` (radians) around centre c.
function rotatePt(p: Pt, c: Pt, ang: number): Pt {
  if (!ang) return p
  const s = Math.sin(ang), co = Math.cos(ang)
  const dx = p.x - c.x, dy = p.y - c.y
  return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co }
}
// Top-centre anchor (unrotated) used to attach the rotate pin.
function objTopCenter(l: LineObj): Pt {
  if (l.type === 'text') { const b = textBBox(l); return { x: b.x + b.w / 2, y: b.y } }
  const pts = l.pts.length ? l.pts : [{ x: 0, y: 0 }]
  let minX = Infinity, minY = Infinity, maxX = -Infinity
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x) }
  return { x: (minX + maxX) / 2, y: minY }
}

function renderLineBase(ctx: CanvasRenderingContext2D, l: LineObj): void {
  if (l.rot) {
    const c = objCenter(l)
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(l.rot)
    ctx.translate(-c.x, -c.y)
    renderLineBody(ctx, l)
    ctx.restore()
    return
  }
  renderLineBody(ctx, l)
}

function renderLine(ctx: CanvasRenderingContext2D, l: LineObj): void {
  const supportsObjectPaint = (l.type === 'shape' || l.type === 'stamp') && !!l.paintStrokes?.length && l.pts.length >= 2
  if (!supportsObjectPaint) {
    renderLineBase(ctx, l)
    return
  }
  // Composite this layer in isolation so destination-out eraser strokes never
  // punch through layers below it.
  const canvas = document.createElement('canvas')
  canvas.width = ctx.canvas.width
  canvas.height = ctx.canvas.height
  const layerCtx = canvas.getContext('2d')!
  renderLineBase(layerCtx, l)

  const a = l.pts[0], b = l.pts[1]
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  const w = Math.max(1, Math.abs(b.x - a.x)), h = Math.max(1, Math.abs(b.y - a.y))
  const c = objCenter(l)
  layerCtx.save()
  if (l.rot) {
    layerCtx.translate(c.x, c.y)
    layerCtx.rotate(l.rot)
    layerCtx.translate(-c.x, -c.y)
  }
  for (const stroke of l.paintStrokes!) {
    const points = stroke.pts.map((p) => ({ x: x + p.x * w, y: y + p.y * h }))
    if (!points.length) continue
    const brushSize = Math.max(0.5, stroke.size * Math.min(w, h))
    if (points.length === 1) {
      stampBrushTip(layerCtx, stroke.tip, points[0].x, points[0].y, brushSize, stroke.color, stroke.tool === 'eraser')
      continue
    }
    for (let i = 1; i < points.length; i++) {
      strokeBrushTip(
        layerCtx, stroke.tip,
        points[i - 1].x, points[i - 1].y,
        points[i].x, points[i].y,
        brushSize, stroke.color, stroke.tool === 'eraser'
      )
    }
  }
  layerCtx.restore()
  ctx.drawImage(canvas, 0, 0)
}

function renderGroup(
  ctx: CanvasRenderingContext2D,
  group: LineObj,
  all: LineObj[],
  visible?: (item: LineObj) => boolean,
  applyGroupPaint = true
): void {
  if (group.pts.length < 2) return
  // Render and erase in an isolated surface. destination-out therefore affects
  // only this group's composite and can never punch through unrelated layers.
  const canvas = document.createElement('canvas')
  canvas.width = ctx.canvas.width
  canvas.height = ctx.canvas.height
  const layerCtx = canvas.getContext('2d')!
  for (const child of all) {
    if (child.parentId !== group.id) continue
    const childVisible = visible
      ? visible(child)
      : (child.visible ?? child.editable ?? true) !== false
    if (child.type === 'group') {
      // An unchecked group does not suppress checked descendants; it only
      // disables that group's own paint/edit surface.
      renderGroup(layerCtx, child, all, visible, childVisible)
    } else if (childVisible) {
      renderLine(layerCtx, child)
    }
  }
  if (!applyGroupPaint) {
    ctx.drawImage(canvas, 0, 0)
    return
  }
  const a = group.pts[0], b = group.pts[1]
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  const w = Math.max(1, Math.abs(b.x - a.x)), h = Math.max(1, Math.abs(b.y - a.y))
  for (const stroke of group.paintStrokes ?? []) {
    const points = stroke.pts.map((p) => ({ x: x + p.x * w, y: y + p.y * h }))
    if (!points.length) continue
    const brushSize = Math.max(0.5, stroke.size * Math.min(w, h))
    if (points.length === 1) {
      stampBrushTip(layerCtx, stroke.tip, points[0].x, points[0].y, brushSize, stroke.color, stroke.tool === 'eraser')
    } else {
      for (let i = 1; i < points.length; i++) {
        strokeBrushTip(
          layerCtx, stroke.tip,
          points[i - 1].x, points[i - 1].y,
          points[i].x, points[i].y,
          brushSize, stroke.color, stroke.tool === 'eraser'
        )
      }
    }
  }
  ctx.drawImage(canvas, 0, 0)
}

function renderObjectTree(
  ctx: CanvasRenderingContext2D,
  root: LineObj,
  all: LineObj[],
  visible: (item: LineObj) => boolean
): void {
  if (root.type === 'group') {
    renderGroup(ctx, root, all, visible, visible(root))
  } else if (visible(root)) {
    renderLine(ctx, root)
  }
}

function renderLineBody(ctx: CanvasRenderingContext2D, l: LineObj): void {
  if (l.type === 'text') { renderText(ctx, l); return }
  // Library / SVG stamp: draw the raster into the bounding box.
  if (l.type === 'stamp' && l.imageDataUrl && l.pts.length >= 2) {
    const a = l.pts[0], b = l.pts[1]
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    const w = Math.max(1, Math.abs(b.x - a.x)), h = Math.max(1, Math.abs(b.y - a.y))
    const renderUrl = stampRenderDataUrl(l, w, h)
    // A stroke-locked SVG is decoded asynchronously at each new size. Keep the
    // previous raster visible during that short decode so resizing never flickers.
    const img = ensureStampImage(renderUrl) ?? ensureStampImage(l.imageDataUrl)
    if (img) {
      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      if (l.shadow) {
        const blur = l.shadowBlur ?? 0
        const ox = l.shadowOffsetX ?? 0
        const oy = l.shadowOffsetY ?? 0
        const sColor = firstSolidColor(l.shadowColor ?? '#00000080')
        ctx.filter = `drop-shadow(${ox}px ${oy}px ${blur}px ${sColor})`
      }
      ctx.drawImage(img, x, y, w, h)
      ctx.restore()
    }
    return
  }
  const poly = flattenLine(l)
  if (poly.length < 2) return
  const t = lineBorderWidth(l)
  const br = lineBorderRadius(l)
  const dash = dashArrayFor(l.dash, Math.max(0.5, t || 1))
  const paint = styleForColor(ctx, l.color, poly)
  const borderPaint = styleForColor(ctx, lineBorderColor(l), poly)
  // Preset shape: trace within its bounding box, optional fill + stroke, no caps.
  if (l.type === 'shape' && l.shape) {
    const a = l.pts[0], b = l.pts[1]
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y)
    const shapePaint = resolveCanvasColor(ctx, l.color, x, y, Math.max(1, w), Math.max(1, h))
    const shapeBorder = resolveCanvasColor(ctx, lineBorderColor(l), x, y, Math.max(1, w), Math.max(1, h))
    ctx.save()
    ctx.beginPath()
    traceShape(ctx, l.shape, x, y, w, h, shapeSupportsRadius(l.shape) ? br : 0)
    if (l.fill) { ctx.fillStyle = shapePaint; ctx.fill() }
    if (t > 0) {
      ctx.strokeStyle = shapeBorder
      ctx.lineWidth = Math.max(0.5, t)
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.setLineDash(dash)
      ctx.stroke()
    }
    ctx.restore()
    return
  }
  // Closed polygon: optional fill + stroke, no caps.
  if (l.type === 'poly') {
    // flattenLine appends the first point again — drop the duplicate for rounding.
    const verts = poly.length > 1 && dist(poly[0], poly[poly.length - 1]) < 1e-6
      ? poly.slice(0, -1)
      : poly
    ctx.save()
    ctx.beginPath()
    pathRoundedPolygon(ctx, verts, br)
    if (l.fill) { ctx.fillStyle = paint; ctx.fill() }
    if (t > 0) {
      ctx.strokeStyle = borderPaint
      ctx.lineWidth = Math.max(0.5, t)
      ctx.lineJoin = 'round'
      ctx.setLineDash(dash)
      ctx.stroke()
    }
    ctx.restore()
    return
  }
  if (t <= 0) return
  if (isDoubleDash(l.dash)) {
    const off = Math.max(1.5, t * 0.85)
    const w = Math.max(0.75, t * 0.5)
    strokePolyline(ctx, offsetPolyline(poly, off), borderPaint, w, dash, br)
    strokePolyline(ctx, offsetPolyline(poly, -off), borderPaint, w, dash, br)
  } else {
    strokePolyline(ctx, poly, borderPaint, t, dash, br)
  }
  const n = poly.length
  const minLen = Math.max(6, t * 2)
  drawCap(ctx, poly[0], endDir(poly, true, minLen), l.startCap, borderPaint, t)
  drawCap(ctx, poly[n - 1], endDir(poly, false, minLen), l.endCap, borderPaint, t)
}

function pointToSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, a)
  let tt = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  tt = Math.max(0, Math.min(1, tt))
  return dist(p, { x: a.x + tt * dx, y: a.y + tt * dy })
}
function lineHitDist(l: LineObj, p: Pt): number {
  const poly = flattenLine(l)
  let min = Infinity
  for (let i = 0; i < poly.length - 1; i++) min = Math.min(min, pointToSegDist(p, poly[i], poly[i + 1]))
  return min
}
function cloneLines(arr: LineObj[]): LineObj[] {
  return arr.map((l) => ({
    ...l,
    pts: l.pts.map((p) => ({ ...p })),
    paintStrokes: l.paintStrokes?.map((stroke) => ({
      ...stroke,
      pts: stroke.pts.map((p) => ({ ...p }))
    }))
  }))
}

// ── Canvas / vector transforms (square canvas) ───────────────────────────────
type CanvasXform = 'cw90' | 'ccw90' | '180' | 'flipH' | 'flipV'

function mapCanvasPt(p: Pt, mode: CanvasXform, S: number): Pt {
  switch (mode) {
    case 'cw90':  return { x: S - p.y, y: p.x }
    case 'ccw90': return { x: p.y, y: S - p.x }
    case '180':   return { x: S - p.x, y: S - p.y }
    case 'flipH': return { x: S - p.x, y: p.y }
    case 'flipV': return { x: p.x, y: S - p.y }
  }
}

function composeCanvasRot(rot: number, mode: CanvasXform): number {
  if (mode === 'cw90') return rot + Math.PI / 2
  if (mode === 'ccw90') return rot - Math.PI / 2
  if (mode === '180') return rot + Math.PI
  // Flips mirror orientation around the vertical/horizontal axis
  if (mode === 'flipH' || mode === 'flipV') return -rot
  return rot
}

function transformCanvasPixels(src: HTMLCanvasElement, mode: CanvasXform): void {
  const w = src.width
  const h = src.height
  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  const tCtx = tmp.getContext('2d')!
  tCtx.imageSmoothingEnabled = true
  tCtx.imageSmoothingQuality = 'high'
  tCtx.save()
  switch (mode) {
    case 'cw90':
      tCtx.translate(w, 0)
      tCtx.rotate(Math.PI / 2)
      break
    case 'ccw90':
      tCtx.translate(0, h)
      tCtx.rotate(-Math.PI / 2)
      break
    case '180':
      tCtx.translate(w, h)
      tCtx.rotate(Math.PI)
      break
    case 'flipH':
      tCtx.translate(w, 0)
      tCtx.scale(-1, 1)
      break
    case 'flipV':
      tCtx.translate(0, h)
      tCtx.scale(1, -1)
      break
  }
  tCtx.drawImage(src, 0, 0)
  tCtx.restore()
  const ctx = src.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(tmp, 0, 0)
}

function transformLineObj(l: LineObj, mode: CanvasXform, S: number): LineObj {
  const c = objCenter(l)
  const rot = l.rot ?? 0
  if ((l.type === 'shape' || l.type === 'stamp') && l.pts.length === 2) {
    const corners = [
      { x: Math.min(l.pts[0].x, l.pts[1].x), y: Math.min(l.pts[0].y, l.pts[1].y) },
      { x: Math.max(l.pts[0].x, l.pts[1].x), y: Math.min(l.pts[0].y, l.pts[1].y) },
      { x: Math.max(l.pts[0].x, l.pts[1].x), y: Math.max(l.pts[0].y, l.pts[1].y) },
      { x: Math.min(l.pts[0].x, l.pts[1].x), y: Math.max(l.pts[0].y, l.pts[1].y) }
    ].map((p) => mapCanvasPt(rotatePt(p, c, rot), mode, S))
    const xs = corners.map((p) => p.x)
    const ys = corners.map((p) => p.y)
    return {
      ...l,
      pts: [
        { x: Math.min(...xs), y: Math.min(...ys) },
        { x: Math.max(...xs), y: Math.max(...ys) }
      ],
      rot: 0
    }
  }
  if (l.type === 'text') {
    const anchor = mapCanvasPt(rotatePt(l.pts[0], c, rot), mode, S)
    return { ...l, pts: [anchor], rot: composeCanvasRot(rot, mode) }
  }
  // Lines / polygons: bake current rotation into points, then map
  const pts = l.pts.map((p) => mapCanvasPt(rotatePt(p, c, rot), mode, S))
  return { ...l, pts, rot: 0 }
}

// ── Preset shape geometry ─────────────────────────────────────────────────────
function regularPolyPts(a: Pt, b: Pt, n: number): Pt[] {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y)
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2 || 1, ry = h / 2 || 1
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n
    out.push({ x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) })
  }
  return out
}

/** Force end so the box from origin→end is a square (keeps aspect ratio 1:1). */
function lockAspectEnd(origin: Pt, end: Pt): Pt {
  const dx = end.x - origin.x
  const dy = end.y - origin.y
  const s = Math.max(Math.abs(dx), Math.abs(dy), 1)
  return {
    x: origin.x + (dx < 0 ? -s : s),
    y: origin.y + (dy < 0 ? -s : s)
  }
}

function lockAspectRatioEnd(origin: Pt, end: Pt, ratio: number): Pt {
  const dx = end.x - origin.x
  const dy = end.y - origin.y
  const safeRatio = Math.max(0.001, ratio)
  let w = Math.max(1, Math.abs(dx))
  let h = Math.max(1, Math.abs(dy))
  if (w / h > safeRatio) h = w / safeRatio
  else w = h * safeRatio
  return {
    x: origin.x + (dx < 0 ? -w : w),
    y: origin.y + (dy < 0 ? -h : h)
  }
}
function starPts(a: Pt, b: Pt, spikes: number, innerRatio = 0.45): Pt[] {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y)
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2 || 1, ry = h / 2 || 1
  const out: Pt[] = []
  for (let i = 0; i < spikes * 2; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / spikes
    const rr = i % 2 === 0 ? 1 : innerRatio
    out.push({ x: cx + rx * rr * Math.cos(ang), y: cy + ry * rr * Math.sin(ang) })
  }
  return out
}
function pointInRect(a: Pt, b: Pt, p: Pt): boolean {
  return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
}
function pointInPoly(poly: Pt[], p: Pt): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y
    if (((yi > p.y) !== (yj > p.y)) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// Trace a preset shape into the current path within bbox [x,y,w,h].
// `cornerRadius` rounds corners on polygon-like shapes (ignored for smooth curves).
function traceShape(ctx: CanvasRenderingContext2D, kind: ShapeKind, x: number, y: number, w: number, h: number, cornerRadius = 0): void {
  const a: Pt = { x, y }, b: Pt = { x: x + w, y: y + h }
  const poly = (pts: Pt[]): void => {
    pathRoundedPolygon(ctx, pts, cornerRadius)
  }
  const nP = (nx: number, ny: number): Pt => ({ x: x + nx * w, y: y + ny * h })
  const m = (nx: number, ny: number): void => ctx.moveTo(x + nx * w, y + ny * h)
  const c = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number): void =>
    ctx.bezierCurveTo(x + x1 * w, y + y1 * h, x + x2 * w, y + y2 * h, x + ex * w, y + ey * h)
  const q = (cx: number, cy: number, ex: number, ey: number): void =>
    ctx.quadraticCurveTo(x + cx * w, y + cy * h, x + ex * w, y + ey * h)

  switch (kind) {
    case 'rect': {
      const r = Math.min(cornerRadius, w / 2, h / 2)
      if (r > 0) roundedRect(ctx, x, y, w, h, r)
      else ctx.rect(x, y, w, h)
      break
    }
    case 'parallelogram': { const s = w * 0.25; poly([{ x: x + s, y }, { x: x + w, y }, { x: x + w - s, y: y + h }, { x, y: y + h }]); break }
    case 'triangle-iso': poly([{ x: x + w / 2, y }, { x: x + w, y: y + h }, { x, y: y + h }]); break
    case 'triangle-right': poly([{ x, y }, { x, y: y + h }, { x: x + w, y: y + h }]); break
    case 'trapezoid': { const s = w * 0.22; poly([{ x: x + s, y }, { x: x + w - s, y }, { x: x + w, y: y + h }, { x, y: y + h }]); break }
    case 'diamond': poly([{ x: x + w / 2, y }, { x: x + w, y: y + h / 2 }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 }]); break
    case 'pentagon': poly(regularPolyPts(a, b, 5)); break
    case 'hexagon': poly(regularPolyPts(a, b, 6)); break
    case 'heptagon': poly(regularPolyPts(a, b, 7)); break
    case 'octagon': poly(regularPolyPts(a, b, 8)); break
    case 'star3': poly(starPts(a, b, 3, 0.42)); break
    case 'star4': poly(starPts(a, b, 4, 0.42)); break
    case 'star5': poly(starPts(a, b, 5, 0.45)); break
    case 'star6': poly(starPts(a, b, 6, 0.55)); break
    case 'star8': poly(starPts(a, b, 8, 0.58)); break
    case 'ellipse': ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break
    case 'semicircle':
      ctx.moveTo(x, y + h)
      ctx.ellipse(x + w / 2, y + h, w / 2, h, 0, Math.PI, Math.PI * 2)
      ctx.closePath()
      break
    case 'quarter':
      ctx.moveTo(x, y + h)
      ctx.lineTo(x, y)
      ctx.ellipse(x, y + h, w, h, 0, -Math.PI / 2, 0)
      ctx.closePath()
      break
    case 'egg':
      m(0.5, 0); c(0.92, 0.06, 1.0, 0.58, 0.5, 1.0); c(0.0, 0.58, 0.08, 0.06, 0.5, 0)
      break
    case 'teardrop':
      m(0.5, 0); q(1.0, 0.52, 0.5, 1.0); q(0.0, 0.52, 0.5, 0)
      break
    case 'heart':
      m(0.5, 0.32)
      c(0.42, 0.06, 0.0, 0.12, 0.03, 0.42)
      c(0.06, 0.62, 0.35, 0.78, 0.5, 0.95)
      c(0.65, 0.78, 0.94, 0.62, 0.97, 0.42)
      c(1.0, 0.12, 0.58, 0.06, 0.5, 0.32)
      break
    case 'crescent': {
      // Outer circle minus an offset inner circle. Use the true intersection
      // angles so both arcs share endpoints (no stray connecting lines).
      const R = Math.min(w, h) / 2
      const cy = y + h / 2
      const cx1 = x + w / 2
      const d = R * 0.7 // inner-circle offset (opens to the right)
      const r = R * 0.8 // inner-circle radius
      const cx2 = cx1 + d
      const xi = (R * R - r * r + d * d) / (2 * d)
      const yi = Math.sqrt(Math.max(0, R * R - xi * xi))
      const t1 = Math.atan2(yi, xi)
      const t2 = Math.atan2(yi, xi - d)
      ctx.moveTo(cx1 + R * Math.cos(t1), cy + R * Math.sin(t1))
      ctx.arc(cx1, cy, R, t1, Math.PI * 2 - t1, false)
      ctx.arc(cx2, cy, r, -t2, t2, true)
      ctx.closePath()
      break
    }
    case 'cloud':
      m(0.22, 0.78)
      c(0.02, 0.78, 0.0, 0.5, 0.2, 0.48)
      c(0.16, 0.24, 0.52, 0.2, 0.56, 0.44)
      c(0.72, 0.28, 0.98, 0.36, 0.86, 0.56)
      c(1.02, 0.62, 0.96, 0.82, 0.8, 0.78)
      ctx.closePath()
      break
    case 'blob':
      m(0.5, 0.03)
      c(0.78, 0.0, 1.0, 0.22, 0.95, 0.5)
      c(0.9, 0.8, 0.7, 1.0, 0.45, 0.95)
      c(0.15, 0.9, 0.0, 0.7, 0.06, 0.42)
      c(0.1, 0.15, 0.28, 0.05, 0.5, 0.03)
      break
    case 'speech': {
      // Approximate speech bubble as a polygon so corner radius can apply.
      const rr = 0.12
      poly([
        nP(rr, 0), nP(1 - rr, 0), nP(1, rr), nP(1, 0.62 - rr), nP(1 - rr, 0.62),
        nP(0.4, 0.62), nP(0.14, 0.9), nP(0.22, 0.62), nP(rr, 0.62), nP(0, 0.62 - rr), nP(0, rr)
      ])
      break
    }
    case 'shield':
      poly([nP(0.5, 0), nP(0.95, 0.15), nP(0.95, 0.52), nP(0.5, 1), nP(0.05, 0.52), nP(0.05, 0.15)])
      break
    case 'cross': {
      const t = 0.34
      poly([
        nP(t, 0), nP(1 - t, 0), nP(1 - t, t), nP(1, t), nP(1, 1 - t), nP(1 - t, 1 - t),
        nP(1 - t, 1), nP(t, 1), nP(t, 1 - t), nP(0, 1 - t), nP(0, t), nP(t, t)
      ])
      break
    }
    case 'arrow':
      poly([nP(0, 0.3), nP(0.6, 0.3), nP(0.6, 0.08), nP(1, 0.5), nP(0.6, 0.92), nP(0.6, 0.7), nP(0, 0.7)])
      break
    case 'lightning':
      poly([nP(0.55, 0), nP(0.15, 0.55), nP(0.45, 0.55), nP(0.3, 1), nP(0.85, 0.4), nP(0.5, 0.4)])
      break
    case 'arch':
      ctx.moveTo(x, y + h)
      ctx.lineTo(x, y + h * 0.45)
      ctx.ellipse(x + w / 2, y + h * 0.45, w / 2, h * 0.45, 0, Math.PI, Math.PI * 2)
      ctx.lineTo(x + w, y + h)
      ctx.closePath()
      break
  }
}

interface Snap {
  container: ImageData
  content: ImageData
  lines: LineObj[]
  layerOrder: PaintLayerId[]
}

interface HistoryEntry {
  before: Snap
  after: Snap
  tags: string[]
  applied: boolean
}

const normalizeLayerOrder = (order?: PaintLayerId[]): PaintLayerId[] =>
  order?.length === 2 && order.includes('container') && order.includes('content')
    ? [...order]
    : ['content', 'container']

const CHECKER =
  'repeating-conic-gradient(#3a3a4a 0% 25%, #2a2a36 0% 50%) 0 0 / 20px 20px'

// The modal overlays the frameless window's title bar, whose -webkit-app-region:
// drag strip would otherwise swallow clicks on the header buttons. Marking the
// whole modal no-drag restores normal clicking.
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

// Distance (px) the rotate pin sits above an object's top edge.
const ROTATE_PIN_LEN = 30

// ── Colour helpers (#RRGGBBAA + CSS gradients) ───────────────────────────────
function normalizeHex(input: string): string | null {
  let h = input.trim()
  if (!h.startsWith('#')) h = '#' + h
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return (h + 'ff').toLowerCase()
  if (/^#[0-9a-fA-F]{8}$/.test(h)) return h.toLowerCase()
  return null
}
function hexAlpha(hex: string): number {
  if (isGradientColor(hex)) return 100
  const a = parseInt(hex.slice(7, 9) || 'ff', 16)
  return Math.round((a / 255) * 100)
}
function withAlpha(hex: string, pct: number): string {
  if (isGradientColor(hex)) return hex
  const solid = hex.startsWith('#') ? hex : firstSolidColor(hex)
  const a = Math.round((Math.max(0, Math.min(100, pct)) / 100) * 255)
  return solid.slice(0, 7) + a.toString(16).padStart(2, '0')
}
/** Solid colour for pixel tools (brush / fill) when a gradient is selected. */
function pixelColor(color: string): string {
  const s = firstSolidColor(color)
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s + 'ff'
  return s
}
function ptsBounds(pts: Pt[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 1, h: 1 }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
}
function styleForColor(ctx: CanvasRenderingContext2D, color: string, pts: Pt[]): string | CanvasGradient {
  const b = ptsBounds(pts)
  return resolveCanvasColor(ctx, color, b.x, b.y, b.w, b.h)
}

function LineSelect<T extends string>({
  label, value, options, onChange
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted select-none">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="px-2 py-1 rounded-md bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

function ShapePreview({ kind, px = 26 }: { kind: ShapeKind; px?: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, px, px)
    const pad = 4
    ctx.beginPath()
    traceShape(ctx, kind, pad, pad, px - 2 * pad, px - 2 * pad)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fill()
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.stroke()
  }, [kind, px])
  return <canvas ref={ref} width={px} height={px} className="pointer-events-none" />
}

function ShapeMenu({
  title, items, current, onPick, freePoly
}: {
  title: string
  items: { value: ShapeKind; label: string }[]
  current: ShapeKind
  onPick: (k: ShapeKind) => void
  freePoly?: { n: number; onN: (v: number) => void; onPick: () => void; active: boolean }
}): JSX.Element {
  return (
    <div className="absolute top-full left-0 mt-1 z-40 w-[264px] p-2 rounded-lg bg-surface border border-border shadow-2xl">
      <div className="text-[10px] uppercase tracking-wide text-muted/70 px-1 pb-1">{title}</div>
      <div className="grid grid-cols-5 gap-1">
        {items.map((it) => (
          <button
            key={it.value}
            onClick={() => onPick(it.value)}
            title={it.label}
            className={`flex items-center justify-center p-1 rounded-md transition-colors ${
              current === it.value ? 'bg-accent/25 ring-1 ring-accent' : 'hover:bg-surface3'
            }`}
          >
            <ShapePreview kind={it.value} />
          </button>
        ))}
      </div>
      {freePoly && (
        <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
          <span className="text-[11px] text-text font-medium">Free polygon</span>
          <input
            type="number" min={3} max={60} value={freePoly.n}
            onChange={(e) => freePoly.onN(Math.max(3, Math.min(60, Number(e.target.value) || 3)))}
            className="w-14 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
          />
          <span className="text-[10px] text-muted">edges</span>
          <button
            onClick={freePoly.onPick}
            className={`ml-auto px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
              freePoly.active ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
            }`}
          >
            Use
          </button>
        </div>
      )}
    </div>
  )
}

export function IconPaintEditor({
  containerImage,
  contentImage,
  containerOverlayImage = null,
  contentOverlayImage = null,
  resolution = 512,
  title = 'Edit icon',
  hasContainer = true,
  initialVectors,
  initialLayerOrder,
  outsideContentSettings = null,
  outsideTextSettings = null,
  syncOuterFillColor = true,
  logoVariantOptions = [],
  faviconVariantOptions = [],
  initialSaveTargets,
  onSave,
  onClose,
  onOpenSettings
}: IconPaintEditorProps): JSX.Element {
  // Prefer structured outsideContentSettings; fall back to letters-only prop.
  const outsideContent: OutsideContentSettings | null = outsideContentSettings
    ?? (outsideTextSettings
      ? { ...outsideTextSettings, kind: 'letters' as const, sizeRatio: outsideTextSettings.fontSizeRatio }
      : null)
  const lettersOutside: OutsideTextSettings | null =
    outsideContent?.kind === 'letters' ? outsideContent : null
  const showSaveTargets = logoVariantOptions.length > 0 || faviconVariantOptions.length > 0
  const [saveLogoIds, setSaveLogoIds] = useState<Set<string>>(
    () => new Set(initialSaveTargets?.logoIds ?? [])
  )
  const [saveFaviconIds, setSaveFaviconIds] = useState<Set<string>>(
    () => new Set(initialSaveTargets?.faviconIds ?? [])
  )
  const [paletteIcon, setPaletteIcon] = useState<IconConfig>(() => ({
    ...DEFAULT_ICON_CONFIG,
    sourceType: 'lucide',
    lucideIconName: 'Layers',
    primaryColor: '#000000'
  }))
  // Off-DOM working buffers ONLY — never mounted in the stage. The stage shows
  // displayComposite (visibility-aware) + preview (handles/cursor). Mounting
  // source canvases in the DOM (even with display:none) under PreviewStage's
  // CSS transform caused unchecked base/object pixels to keep painting.
  /** Live Outer/Inner bases — read-only; rebaked from settings outside Paint. */
  const baseContainerCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const baseContentCanvasRef = useRef<HTMLCanvasElement | null>(null)
  /** Paint overlays — brush / eraser / fill write here only. */
  const containerCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const contentCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const displayCompositeRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)

  const [tool, setTool] = useState<Tool>('brush')
  const [brushTip, setBrushTip] = useState<BrushTip>('round')
  /** Eraser footprint — circle or square only (independent of brush tip). */
  const [eraserTip, setEraserTip] = useState<'round' | 'square'>('round')
  const [color, setColor] = useState('#000000ff')
  const [size, setSize] = useState(12)
  const [shapeFill, setShapeFill] = useState(false)
  /** Stroke / border colour for lines, polygons, and shapes (separate from fill colour). */
  const [borderColor, setBorderColor] = useState('#000000ff')
  const [borderRadius, setBorderRadius] = useState(0)
  const [borderPopupOpen, setBorderPopupOpen] = useState(false)
  const [borderPopupRect, setBorderPopupRect] = useState<DOMRect | null>(null)
  const borderSwatchRef = useRef<HTMLButtonElement>(null)
  /** After flood fill, also paint thin AA / leftover outline fringes (not thick designed borders). */
  const [fillCleanEdges, setFillCleanEdges] = useState(true)
  /** Recolor every non-transparent pixel on target layers (ignores click colour / flood region). */
  const [fillAllOpaque, setFillAllOpaque] = useState(false)
  const [hexText, setHexText] = useState('#000000ff')
  const [colorPopupOpen, setColorPopupOpen] = useState(false)
  const [colorPopupRect, setColorPopupRect] = useState<DOMRect | null>(null)
  const colorSwatchRef = useRef<HTMLButtonElement>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [layerOrder, setLayerOrder] = useState<PaintLayerId[]>(
    () => normalizeLayerOrder(initialLayerOrder)
  )
  const layerOrderRef = useRef(layerOrder)
  layerOrderRef.current = layerOrder
  const draggedLayerRef = useRef<string | null>(null)
  type LayerDropPosition = 'before' | 'after' | 'inside'
  const [layerDropTarget, setLayerDropTarget] = useState<{
    key: string
    position: LayerDropPosition
  } | null>(null)
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set())
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null)
  const [layerNameDraft, setLayerNameDraft] = useState('')

  // Which layers are currently editable (brush / eraser / fill targets).
  // Vector tools (line, shape, text) live on a separate overlay and do not need these.
  const [editContainer, setEditContainer] = useState(!!hasContainer)
  const [editContent, setEditContent] = useState(true)
  /** True once the container canvas has any non-transparent pixels (or the icon has an outer shape). */
  const [containerUsable, setContainerUsable] = useState(!!hasContainer)
  const editContainerRef = useRef(editContainer)
  const editContentRef = useRef(editContent)
  const containerUsableRef = useRef(containerUsable)
  editContainerRef.current = editContainer
  editContentRef.current = editContent
  containerUsableRef.current = containerUsable

  // ── Editable vector lines ────────────────────────────────────────────────
  const [lines, setLines] = useState<LineObj[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Base layer selected in the panel for layer-scoped history. */
  const [selectedBaseLayer, setSelectedBaseLayer] = useState<PaintLayerId | null>(null)
  const selectedBaseLayerRef = useRef<PaintLayerId | null>(null)
  /** Layer-panel object selection; Ctrl/Cmd-click allows multiple for Group. */
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(() => new Set())
  const [lineType, setLineType] = useState<LineType>('straight')
  const [startCap, setStartCap] = useState<CapType>('none')
  const [endCap, setEndCap] = useState<CapType>('arrow')
  const [lineDash, setLineDash] = useState<DashType>('solid')
  const [linePointCount, setLinePointCount] = useState(4)
  /** Drawn (freehand): optional fixed adjustable-point count. Empty = auto. */
  const [drawnPointCount, setDrawnPointCount] = useState('')
  /** Drawn (freehand): when On and count is empty, sample by travel distance. */
  const [drawnDistanceMode, setDrawnDistanceMode] = useState(false)
  /** Drawn (freehand): connect adjustable points with a smooth curve. */
  const [drawnCurve, setDrawnCurve] = useState(false)

  // Text tool settings
  const [textValue, setTextValue] = useState('')
  const [fontFamily, setFontFamily] = useState('Inter')
  /** When on, copy outside letters settings into the active/linked text layer. */
  const [useOutsideText, setUseOutsideText] = useState(() => !!lettersOutside)
  const outsideTextRef = useRef(lettersOutside)
  outsideTextRef.current = lettersOutside
  const outsideContentRef = useRef(outsideContent)
  outsideContentRef.current = outsideContent
  const [fontSize, setFontSize] = useState(96)
  const [fontWeightV, setFontWeightV] = useState(700)
  const [bold, setBold] = useState(false)
  const [italic, setItalic] = useState(false)
  /** Line height multiplier (1.28 = default). */
  const [txtLineHeight, setTxtLineHeight] = useState(1.28)
  /** Letter spacing in px. */
  const [txtLetterSpacing, setTxtLetterSpacing] = useState(0)
  const [txtShadow, setTxtShadow] = useState(false)
  const [txtShadowColor, setTxtShadowColor] = useState('#000000b3')
  const [txtShadowBlur, setTxtShadowBlur] = useState(8)
  const [txtShadowOX, setTxtShadowOX] = useState(0)
  const [txtShadowOY, setTxtShadowOY] = useState(4)
  const [txtShadowSpread, setTxtShadowSpread] = useState(0)
  /** When set, text is edited via an on-canvas textarea (Paint-style). */
  const [textEditId, setTextEditId] = useState<string | null>(null)
  const textEditIdRef = useRef<string | null>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ w: 1, h: 1 })

  // Preset shapes
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect')
  const [polyKind, setPolyKind] = useState<ShapeKind | 'freepoly'>('rect')
  const [irregKind, setIrregKind] = useState<ShapeKind>('ellipse')
  const [freePolyN, setFreePolyN] = useState(5)
  const [openMenu, setOpenMenu] = useState<'poly' | 'irreg' | null>(null)
  /** When On, polygon / irregular shapes keep a 1:1 aspect while drawing or corner-resizing. */
  const [shapeLockAspect, setShapeLockAspect] = useState(false)
  /** Preserve shape/icon stroke width while its bounds are resized. */
  const [keepStrokeOnResize, setKeepStrokeOnResize] = useState(true)

  // Copy / paste (marquee raster selection + vector objects)
  const [hasMarquee, setHasMarquee] = useState(false)
  const [hasClip, setHasClip] = useState(false)
  const [clipLabel, setClipLabel] = useState('')
  /** coverage = adjust what the box covers · scale = resize/stretch the lifted pixels */
  const [marqueeMode, setMarqueeMode] = useState<'coverage' | 'scale'>('coverage')
  const imageFileInputRef = useRef<HTMLInputElement>(null)
  const marqueeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const marqueeStartRef = useRef<Pt | null>(null)
  const floatRef = useRef<{
    canvas: HTMLCanvasElement
    x: number
    y: number
    source?: HTMLCanvasElement
    /** Original marquee position, used to restore pixels when cancelling. */
    originX?: number
    originY?: number
    /** Finalize as a persistent pointer-selectable stamp instead of rasterizing it. */
    selectable?: boolean
    /** Top checked source layer, used to invalidate a temporary marquee if hidden. */
    sourceLayer?: PaintLayerId
    /** Marquee pixels retained separately so they return to their original canvases. */
    layerCanvases?: {
      layer: PaintLayerId
      canvas: HTMLCanvasElement
      source: HTMLCanvasElement
    }[]
    /** Existing vector objects temporarily removed while the marquee transforms them. */
    vectorState?: {
      originalLines: LineObj[]
      selectedIds: string[]
      sourceRect: { x: number; y: number; w: number; h: number }
    }
  } | null>(null)
  const floatDragRef = useRef<Pt | null>(null)
  /** Corner drag: coverage resizes the marquee rect; scale resizes the float bitmap. */
  const floatResizeRef = useRef<{
    corner: 'nw' | 'ne' | 'sw' | 'se'
    start: { x: number; y: number; w: number; h: number }
    source: HTMLCanvasElement
  } | null>(null)
  const marqueeResizeRef = useRef<{
    corner: 'nw' | 'ne' | 'sw' | 'se'
    start: { x: number; y: number; w: number; h: number }
  } | null>(null)
  /** Hysteresis keeps a 50% resize snap engaged until the pointer moves clearly away. */
  const resizeSnapLockRef = useRef({ width: false, height: false })
  const rasterClipRef = useRef<HTMLCanvasElement | null>(null)
  const vectorClipRef = useRef<LineObj | null>(null)
  const clipKindRef = useRef<'raster' | 'vector' | null>(null)
  const clipActionsRef = useRef<{
    copy: () => void; cut: () => void; paste: () => void
    liftMarquee: () => void; commitFloat: () => void; discardFloat: () => void
    clearSel: () => void; clearRegion: () => void
  }>({
    copy: () => {},
    cut: () => {},
    paste: () => {},
    liftMarquee: () => {},
    commitFloat: () => {},
    discardFloat: () => {},
    clearSel: () => {},
    clearRegion: () => {}
  })

  const linesRef = useRef<LineObj[]>([])
  const selectedIdRef = useRef<string | null>(null)
  const lineDragRef = useRef<{
    kind: 'create' | 'draw' | 'handle' | 'move' | 'rotate'
    id: string
    idx?: number
    grab?: Pt
    center?: Pt
    startAng?: number
    startRot?: number
    startRect?: { x: number; y: number; w: number; h: number }
    startCenter?: Pt
    snapshot?: LineObj[]
  } | null>(null)
  const baseTransformRef = useRef<{
    kind: 'move' | 'resize' | 'rotate'
    source: HTMLCanvasElement
    bounds: { x: number; y: number; w: number; h: number }
    grab?: Pt
    fixed?: Pt
    corner?: Corner
    center?: Pt
    startAng?: number
  } | null>(null)

  // Layer-scoped history. Each completed action stores its full before/after
  // snapshots, but restore applies only the tagged object/group/base layers.
  const historyRef = useRef<HistoryEntry[]>([])
  const lastSnapshotRef = useRef<Snap | null>(null)
  const redoOrderRef = useRef<number[]>([])

  // Interaction state
  const drawing = useRef(false)
  const startPt = useRef({ x: 0, y: 0 })
  const lastPt = useRef({ x: 0, y: 0 })
  const objectPaintStrokeRef = useRef<{ id: string; index: number } | null>(null)
  const polyPts = useRef<{ x: number; y: number }[]>([])
  /** Active window-level pointer capture so drags continue outside the canvas. */
  const pointerDragCleanupRef = useRef<(() => void) | null>(null)

  const W = resolution
  const H = resolution

  const ensureOffscreenCanvas = (ref: React.MutableRefObject<HTMLCanvasElement | null>) => {
    if (!ref.current) ref.current = document.createElement('canvas')
    if (ref.current.width !== W || ref.current.height !== H) {
      ref.current.width = W
      ref.current.height = H
    }
    return ref.current
  }
  const containerCtx = () => ensureOffscreenCanvas(containerCanvasRef).getContext('2d')
  const contentCtx = () => ensureOffscreenCanvas(contentCanvasRef).getContext('2d')
  const baseCanvas = (id: PaintLayerId): HTMLCanvasElement =>
    id === 'content'
      ? ensureOffscreenCanvas(baseContentCanvasRef)
      : ensureOffscreenCanvas(baseContainerCanvasRef)
  const layerIsEditable = (id: PaintLayerId): boolean =>
    id === 'content'
      ? editContentRef.current
      : editContainerRef.current && containerUsableRef.current
  /** Writable paint overlay for a base id. */
  const layerCanvas = (id: PaintLayerId): HTMLCanvasElement =>
    id === 'content'
      ? ensureOffscreenCanvas(contentCanvasRef)
      : ensureOffscreenCanvas(containerCanvasRef)
  /** Draw live base then paint overlay for one stack slot. */
  const drawBaseAndOverlay = (ctx: CanvasRenderingContext2D, id: PaintLayerId) => {
    ctx.drawImage(baseCanvas(id), 0, 0)
    ctx.drawImage(layerCanvas(id), 0, 0)
  }

  // All checked layers (Outer + Inner). Used by eraser, fill, marquee, Remove BG, etc.
  const targetCtxs = (): CanvasRenderingContext2D[] => {
    return [...layerOrderRef.current].reverse()
      .filter(layerIsEditable)
      .map((id) => layerCanvas(id)?.getContext('2d') ?? null)
      .filter((ctx): ctx is CanvasRenderingContext2D => !!ctx)
  }

  const targetCanvases = (): HTMLCanvasElement[] => {
    return [...layerOrderRef.current].reverse()
      .filter(layerIsEditable)
      .map(layerCanvas)
      .filter((canvas): canvas is HTMLCanvasElement => !!canvas)
  }

  /**
   * Brush (and other “add paint” tools): topmost checked layer wins.
   * Stack when saving: Outer → paint-on-outer → Inner → paint-on-inner (+ session shapes).
   */
  const addPaintCtxs = (): CanvasRenderingContext2D[] => {
    const id = layerOrderRef.current.find(layerIsEditable)
    if (!id) return []
    const ctx = layerCanvas(id)?.getContext('2d')
    return ctx ? [ctx] : []
  }

  /** Layer new vectors / brush strokes are assigned to (topmost checked layer). */
  const activeAddLayer = (): 'container' | 'content' =>
    layerOrderRef.current.find(layerIsEditable) ?? 'content'

  /**
   * Stamp target for floating images / paste commit.
   * The topmost checked layer receives committed images.
   */
  const topEditableCtx = (): CanvasRenderingContext2D | null => addPaintCtxs()[0] ?? null

  const vectorLayerOf = (l: LineObj): 'container' | 'content' =>
    l.layer === 'container' ? 'container' : 'content'

  const isVectorVisible = (l: LineObj): boolean => {
    // Marquee-derived objects have no panel row, so they follow their source
    // base layer. They must never become an invisible-to-the-panel render source.
    if (l.marqueeItem && !layerIsEditable(vectorLayerOf(l))) return false
    // Visibility is row-local: an unchecked group disables only the group,
    // never a checked child nested under it.
    return (l.visible ?? l.editable ?? true) !== false
  }

  /** A checked ancestor group owns edits; otherwise the item edits itself. */
  const checkedGroupTarget = (l: LineObj): LineObj | null => {
    let parentId = l.parentId
    while (parentId) {
      const parent = linesRef.current.find((item) => item.id === parentId)
      if (!parent) return null
      if (parent.type === 'group' && isVectorVisible(parent)) return parent
      parentId = parent.parentId
    }
    return null
  }

  const addPaintTargetLabel = (): string | null => {
    const id = layerOrderRef.current.find(layerIsEditable)
    return id === 'content' ? 'Inner paint' : id === 'container' ? 'Outer paint' : null
  }

  const editLayersLabel = (): string =>
    [editContainer && containerUsable ? 'Outer paint' : null, editContent ? 'Inner paint' : null]
      .filter(Boolean)
      .join(' + ') || 'none'

  const snapshotState = useCallback((): Snap | null => {
    const cc = containerCtx()
    const ct = contentCtx()
    if (!cc || !ct) return null
    return {
      container: cc.getImageData(0, 0, W, H),
      content: ct.getImageData(0, 0, W, H),
      lines: cloneLines(linesRef.current),
      layerOrder: [...layerOrderRef.current]
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H])

  const imageDataChanged = (a: ImageData, b: ImageData): boolean => {
    if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return true
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return true
    return false
  }

  const syncHistFlags = () => {
    setCanUndo(historyRef.current.some((entry) => entry.applied))
    setCanRedo(redoOrderRef.current.some((idx) => {
      const entry = historyRef.current[idx]
      return !!entry && !entry.applied
    }))
  }

  const inferHistoryTags = (before: Snap, after: Snap): string[] => {
    const tags = new Set<string>()
    if (imageDataChanged(before.container, after.container)) tags.add('base:container')
    if (imageDataChanged(before.content, after.content)) tags.add('base:content')
    if (before.layerOrder.join('|') !== after.layerOrder.join('|')) {
      tags.add('base:container')
      tags.add('base:content')
    }
    const beforeById = new Map(before.lines.map((l) => [l.id, l]))
    const afterById = new Map(after.lines.map((l) => [l.id, l]))
    const ids = new Set([...beforeById.keys(), ...afterById.keys()])
    for (const id of ids) {
      const oldLine = beforeById.get(id)
      const newLine = afterById.get(id)
      if (JSON.stringify(oldLine) === JSON.stringify(newLine)) continue
      tags.add(`object:${id}`)
      const parentId = newLine?.parentId ?? oldLine?.parentId
      if (parentId) tags.add(`object:${parentId}`)
    }
    if (before.lines.map((l) => l.id).join('|') !== after.lines.map((l) => l.id).join('|')) {
      const beforeIndex = new Map(before.lines.map((l, index) => [l.id, index]))
      after.lines.forEach((l, index) => {
        if (beforeIndex.get(l.id) !== index) {
          tags.add(`object:${l.id}`)
          if (l.parentId) tags.add(`object:${l.parentId}`)
        }
      })
    }
    return [...tags]
  }

  const pushHistory = useCallback((extraTags: string[] = []) => {
    const after = snapshotState()
    const before = lastSnapshotRef.current
    if (!after) return
    if (!before) {
      lastSnapshotRef.current = after
      syncHistFlags()
      return
    }
    const tags = [...new Set([...inferHistoryTags(before, after), ...extraTags])]
    if (!tags.length) return
    // A new edit branches from the currently visible state.
    historyRef.current = historyRef.current.filter((entry) => entry.applied)
    redoOrderRef.current = []
    historyRef.current.push({ before, after, tags, applied: true })
    if (historyRef.current.length > 30) historyRef.current.shift()
    lastSnapshotRef.current = after
    syncHistFlags()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotState])

  // Load live bases (read-only) + paint overlays (writable).
  useEffect(() => {
    const baseCc = ensureOffscreenCanvas(baseContainerCanvasRef).getContext('2d')
    const baseCt = ensureOffscreenCanvas(baseContentCanvasRef).getContext('2d')
    const cc = containerCtx()
    const ct = contentCtx()
    if (!baseCc || !baseCt || !cc || !ct) return
    baseCc.clearRect(0, 0, W, H)
    baseCt.clearRect(0, 0, W, H)
    cc.clearRect(0, 0, W, H)
    ct.clearRect(0, 0, W, H)

    const loadInto = (ctx: CanvasRenderingContext2D, src: string | null): Promise<void> =>
      new Promise((resolve) => {
        if (!src) { resolve(); return }
        const img = new Image()
        img.onload = () => {
          const r = Math.min(W / img.width, H / img.height)
          const dw = img.width * r
          const dh = img.height * r
          ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
          resolve()
        }
        img.onerror = () => resolve()
        img.src = src
      })

    Promise.all([
      loadInto(baseCc, containerImage),
      loadInto(baseCt, contentImage),
      loadInto(cc, containerOverlayImage),
      loadInto(ct, contentOverlayImage)
    ]).then(() => {
      const restoredOrder = normalizeLayerOrder(initialLayerOrder)
      layerOrderRef.current = restoredOrder
      setLayerOrder(restoredOrder)
      // Outer usable if the icon reports a container OR the live base has pixels.
      let usable = !!hasContainer
      if (!usable) {
        const sample = baseCc.getImageData(0, 0, W, H).data
        for (let i = 3; i < sample.length; i += 16) {
          if (sample[i] > 8) { usable = true; break }
        }
      }
      containerUsableRef.current = usable
      setContainerUsable(usable)
      if (usable && hasContainer) {
        editContainerRef.current = true
        setEditContainer(true)
      }

      // Restore editable vectors from a previous paint session (if any).
      // Letters → linked text; other types → contentBound stamp proxy.
      const outside = outsideTextRef.current
      const outsideAll = outsideContentRef.current
      let restored: LineObj[] = []
      let seededProxy: LineObj | null = null
      let autoSelected = false

      if (initialVectors && initialVectors.length) {
        // Drop any persisted contentBound stamps — they must stay Paint-ephemeral
        // so they cannot double with live Inner settings outside.
        restored = cloneLines(
          stripContentProxyVectors(initialVectors) as unknown as LineObj[]
        ).map((l) => ({
          ...l,
          visible: l.visible ?? l.editable ?? true
        }))
      } else if (outside && outsideAll?.kind !== 'proxy') {
        const seeded = lineFromOutsideText(outside, W)
        restored = [seeded]
        autoSelected = true
        setUseOutsideText(true)
        setTextValue(seeded.text ?? '')
        setFontFamily(seeded.fontFamily ?? 'Inter')
        setFontSize(seeded.fontSize ?? 48)
        setFontWeightV(seeded.weight ?? 700)
        setBold(!!seeded.bold)
        setItalic(!!seeded.italic)
        setTxtLetterSpacing(seeded.letterSpacing ?? 0)
        setTxtShadow(!!seeded.shadow)
        setTxtShadowColor(seeded.shadowColor ?? '#000000b3')
        setTxtShadowBlur(seeded.shadowBlur ?? 8)
        setTxtShadowOX(seeded.shadowOffsetX ?? 0)
        setTxtShadowOY(seeded.shadowOffsetY ?? 4)
        setTxtShadowSpread(seeded.shadowSpread ?? 0)
        selectedIdRef.current = seeded.id
        setSelectedId(seeded.id)
        setSelectedLayerIds(new Set([seeded.id]))
        setTool('pointer')
        loadFont(seeded.fontFamily ?? 'Inter').then(() => {
          // Re-center after font metrics settle.
          const cur = linesRef.current.find((l) => l.id === seeded.id)
          if (!cur || !outsideTextRef.current) return
          const next = applyOutsideTextToLine(cur, outsideTextRef.current, W)
          linesRef.current = linesRef.current.map((l) => (l.id === next.id ? next : l))
          setLines([...linesRef.current])
          setTxtShadow(!!next.shadow)
          setTxtShadowColor(next.shadowColor ?? '#000000b3')
          setTxtShadowBlur(next.shadowBlur ?? 8)
          setTxtShadowOX(next.shadowOffsetX ?? 0)
          setTxtShadowOY(next.shadowOffsetY ?? 4)
          setTxtShadowSpread(next.shadowSpread ?? 0)
          redrawLinesRef.current()
          drawHandles()
        })
      }

      // Non-letter Inner: lift centered bake into a movable/resizable contentBound stamp.
      if (outsideAll?.kind === 'proxy') {
        const crop = cropOpaqueToDataUrl(baseCt.canvas)
        if (crop) {
          const existing = restored.find(
            (l) => l.contentBound && (l.type === 'stamp' || l.type === 'shape')
          )
          if (existing) {
            const next = applyOutsideContentToProxy(existing, outsideAll, W, crop)
            restored = restored.map((l) => (l.id === next.id ? next : l))
            seededProxy = next
          } else {
            seededProxy = lineFromContentProxy(crop, outsideAll, W)
            restored = [...restored, seededProxy]
          }
          // Live Inner settings stay outside — clear base so we don't double-draw.
          baseCt.clearRect(0, 0, W, H)
          autoSelected = true
          selectedIdRef.current = seededProxy.id
          setSelectedId(seededProxy.id)
          setSelectedLayerIds(new Set([seededProxy.id]))
          setTool('pointer')
          setTxtShadow(!!seededProxy.shadow)
          setTxtShadowColor(seededProxy.shadowColor ?? '#000000b3')
          setTxtShadowBlur(seededProxy.shadowBlur ?? 8)
          setTxtShadowOX(seededProxy.shadowOffsetX ?? 0)
          setTxtShadowOY(seededProxy.shadowOffsetY ?? 4)
          setTxtShadowSpread(seededProxy.shadowSpread ?? 0)
          ensureStampImage(crop.dataUrl, () => {
            redrawLinesRef.current()
            drawHandles()
          })
        }
      }

      if (!autoSelected) {
        selectedIdRef.current = null
        setSelectedId(null)
        setSelectedLayerIds(new Set())
      }
      if (initialVectors && initialVectors.length && outside && outsideAll?.kind !== 'proxy') {
        const linked = restored.find((l) => l.type === 'text' && l.linkedOutsideText)
        const linkOutside = !!(linked && outside)
        setUseOutsideText(linkOutside)
        // Re-apply live outside Inner letters settings (text/font/color/size/offset).
        if (linkOutside && linked && outside) {
          const next = applyOutsideTextToLine(linked, outside, W)
          restored = restored.map((l) => (l.id === next.id ? next : l))
          setTextValue(next.text ?? '')
          setFontFamily(next.fontFamily ?? 'Inter')
          setFontSize(next.fontSize ?? 48)
          setFontWeightV(next.weight ?? 700)
          setBold(!!next.bold)
          setItalic(!!next.italic)
          setTxtLetterSpacing(next.letterSpacing ?? 0)
          setColor(next.color)
          setTxtShadow(!!next.shadow)
          setTxtShadowColor(next.shadowColor ?? '#000000b3')
          setTxtShadowBlur(next.shadowBlur ?? 8)
          setTxtShadowOX(next.shadowOffsetX ?? 0)
          setTxtShadowOY(next.shadowOffsetY ?? 4)
          setTxtShadowSpread(next.shadowSpread ?? 0)
          selectedIdRef.current = next.id
          setSelectedId(next.id)
          setSelectedLayerIds(new Set([next.id]))
          loadFont(next.fontFamily ?? 'Inter').then(() => {
            const cur = linesRef.current.find((l) => l.id === next.id)
            if (!cur || !outsideTextRef.current) return
            const recentered = applyOutsideTextToLine(cur, outsideTextRef.current, W)
            linesRef.current = linesRef.current.map((l) => (l.id === recentered.id ? recentered : l))
            setLines([...linesRef.current])
            setTxtShadow(!!recentered.shadow)
            setTxtShadowColor(recentered.shadowColor ?? '#000000b3')
            setTxtShadowBlur(recentered.shadowBlur ?? 8)
            setTxtShadowOX(recentered.shadowOffsetX ?? 0)
            setTxtShadowOY(recentered.shadowOffsetY ?? 4)
            setTxtShadowSpread(recentered.shadowSpread ?? 0)
            redrawLinesRef.current()
            drawHandles()
          })
        }
      }

      linesRef.current = restored
      setLines(restored)

      historyRef.current = []
      redoOrderRef.current = []
      lastSnapshotRef.current = null
      redrawLinesRef.current()
      pushHistory()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerImage, contentImage, containerOverlayImage, contentOverlayImage, hasContainer, initialVectors, initialLayerOrder])

  const restoreTaggedSnapshot = (snap: Snap, tags: string[]) => {
    const cc = containerCtx()
    const ct = contentCtx()
    if (!cc || !ct) return
    if (tags.includes('base:container')) cc.putImageData(snap.container, 0, 0)
    if (tags.includes('base:content')) ct.putImageData(snap.content, 0, 0)
    if (tags.includes('base:container') && tags.includes('base:content')) {
      const restoredOrder = normalizeLayerOrder(snap.layerOrder)
      layerOrderRef.current = restoredOrder
      setLayerOrder(restoredOrder)
    }
    const ids = new Set(tags.filter((tag) => tag.startsWith('object:')).map((tag) => tag.slice(7)))
    const desiredById = new Map(snap.lines.filter((l) => ids.has(l.id)).map((l) => [l.id, cloneLines([l])[0]]))
    const restored = linesRef.current.filter((l) => !ids.has(l.id))
    // Insert affected items relative to the nearest unaffected item in the
    // target snapshot, preserving every unrelated item's current data/order.
    for (const desired of snap.lines) {
      if (!ids.has(desired.id)) continue
      const item = desiredById.get(desired.id)
      if (!item) continue
      const desiredIndex = snap.lines.findIndex((l) => l.id === desired.id)
      let insertAt = restored.length
      for (let i = desiredIndex + 1; i < snap.lines.length; i++) {
        const nextId = snap.lines[i].id
        const currentIndex = restored.findIndex((l) => l.id === nextId)
        if (currentIndex >= 0) { insertAt = currentIndex; break }
      }
      restored.splice(insertAt, 0, item)
    }
    linesRef.current = restored
    setLines(restored)
    const restoredIds = new Set(restored.map((l) => l.id))
    setSelectedLayerIds((prev) => new Set([...prev].filter((id) => restoredIds.has(id))))
    redrawLinesRef.current()
    drawHandles()
    lastSnapshotRef.current = snapshotState()
  }
  const dropFloating = () => {
    floatRef.current = null
    floatResizeRef.current = null
    floatDragRef.current = null
    marqueeResizeRef.current = null
    marqueeRef.current = null
    marqueeStartRef.current = null
    setHasMarquee(false)
    const p = previewRef.current?.getContext('2d')
    if (p) p.clearRect(0, 0, W, H)
  }
  const cancelFloating = () => {
    const f = floatRef.current
    if (f?.layerCanvases?.length && f.originX != null && f.originY != null) {
      for (const item of f.layerCanvases) {
        layerCanvas(item.layer).getContext('2d')?.drawImage(item.source, f.originX, f.originY)
      }
    }
    if (f?.vectorState) {
      const restored = cloneLines(f.vectorState.originalLines)
      linesRef.current = restored
      setLines(restored)
    }
    dropFloating()
    redrawLinesRef.current()
    drawHandles()
  }
  const shiftHeldRef = useRef(false)
  const undo = useCallback(() => {
    // Cancel an uncommitted marquee first, restoring pixels/objects to their
    // original layers instead of losing the lifted content.
    if (floatRef.current || marqueeRef.current) {
      cancelFloating()
      return
    }
    let idx = -1
    for (let i = historyRef.current.length - 1; i >= 0; i--) {
      const entry = historyRef.current[i]
      if (entry.applied) { idx = i; break }
    }
    if (idx < 0) return
    dropFloating()
    const entry = historyRef.current[idx]
    restoreTaggedSnapshot(entry.before, entry.tags)
    entry.applied = false
    redoOrderRef.current.push(idx)
    syncHistFlags()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const redo = useCallback(() => {
    let stackIndex = -1
    for (let i = redoOrderRef.current.length - 1; i >= 0; i--) {
      const idx = redoOrderRef.current[i]
      const entry = historyRef.current[idx]
      if (entry && !entry.applied) { stackIndex = i; break }
    }
    if (stackIndex < 0) return
    dropFloating()
    const [idx] = redoOrderRef.current.splice(stackIndex, 1)
    const entry = historyRef.current[idx]
    restoreTaggedSnapshot(entry.after, entry.tags)
    entry.applied = true
    syncHistFlags()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    syncHistFlags()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedBaseLayer])

  const clearAll = () => {
    const ctxs = targetCtxs()
    if (!ctxs.length) return
    for (const ctx of ctxs) ctx.clearRect(0, 0, W, H)
    redrawLines()
    pushHistory()
  }

  const [bgRemoving, setBgRemoving] = useState(false)

  /** Rotate / flip the full paint canvas (both layers) + all session vectors. */
  const applyCanvasXform = (mode: CanvasXform) => {
    if (textEditIdRef.current) endTextEditRef.current()
    if (floatRef.current) { floatRef.current = null; setHasMarquee(false) }
    if (marqueeRef.current) { marqueeRef.current = null; setHasMarquee(false) }

    if (containerCanvasRef.current) transformCanvasPixels(containerCanvasRef.current, mode)
    if (contentCanvasRef.current) transformCanvasPixels(contentCanvasRef.current, mode)

    const next = linesRef.current.map((l) => transformLineObj(l, mode, W))
    linesRef.current = next
    commitLines(next)
    selectedIdRef.current = null
    setSelectedId(null)
    redrawLines()
    clearPreview()
    pushHistory()
  }

  /** Remove background on the prioritized editable layer (corner flood-fill). */
  const removeBgOnLayers = async () => {
    const targets = targetCanvases()
    if (!targets.length) return
    setBgRemoving(true)
    try {
      for (const canvas of targets) {
        const result = await removeImageBackground(canvas.toDataURL('image/png'))
        if (!result.success || !result.dataUrl) continue
        await new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => {
            const ctx = canvas.getContext('2d')!
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            resolve()
          }
          img.onerror = () => resolve()
          img.src = result.dataUrl!
        })
      }
      redrawLines()
      pushHistory()
    } finally {
      setBgRemoving(false)
    }
  }

  const finishPolygonRef = useRef<() => void>(() => {})

  const deleteSelectedRef = useRef<() => void>(() => {})
  const endTextEditRef = useRef<() => void>(() => {})
  const startTextEditRef = useRef<(id: string) => void>(() => {})
  const nudgeSelectedRef = useRef<(dx: number, dy: number) => void>(() => {})
  const nudgeEraserRef = useRef<(dx: number, dy: number) => void>(() => {})
  const saveCurrentCanvasesRef = useRef<() => void>(() => {})
  const canSaveRef = useRef(false)
  /** After arrow-nudge while erasing, ignore mouse motion until mouseup (tip stays keyboard-driven). */
  const eraserArrowLockedRef = useRef(false)
  const nudgePendingRef = useRef(false)
  const pushHistoryRef = useRef(pushHistory)
  pushHistoryRef.current = pushHistory

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = true
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 's') {
        e.preventDefault()
        e.stopPropagation()
        if (!e.repeat && canSaveRef.current) saveCurrentCanvasesRef.current()
        return
      }
      if ((e.ctrlKey || e.metaKey) && k === 'c' && !inField) { e.preventDefault(); clipActionsRef.current.copy(); return }
      if ((e.ctrlKey || e.metaKey) && k === 'x' && !inField) { e.preventDefault(); clipActionsRef.current.cut(); return }
      if ((e.ctrlKey || e.metaKey) && k === 'v' && !inField) {
        e.preventDefault()
        clipActionsRef.current.paste()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inField) {
        // While typing on-canvas text, let the caret handle Delete/Backspace.
        if (textEditIdRef.current) return
        if (floatRef.current) { e.preventDefault(); clipActionsRef.current.discardFloat(); return }
        if (marqueeRef.current) { e.preventDefault(); clipActionsRef.current.clearRegion(); return }
        if (selectedIdRef.current) { e.preventDefault(); deleteSelectedRef.current(); return }
      }
      if (
        !inField &&
        !textEditIdRef.current &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) {
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        // While mouse is held with the eraser, arrows move the tip for exact erasure.
        if (tool === 'eraser' && drawing.current) {
          e.preventDefault()
          nudgeEraserRef.current(dx, dy)
          return
        }
        const hasTarget = !!(floatRef.current || marqueeRef.current || selectedIdRef.current)
        if (hasTarget) {
          e.preventDefault()
          nudgeSelectedRef.current(dx, dy)
          nudgePendingRef.current = true
          return
        }
      }
      if (e.key === 'Enter' && floatRef.current) { e.preventDefault(); clipActionsRef.current.commitFloat(); return }
      if (e.key === 'Enter' && marqueeRef.current) { e.preventDefault(); clipActionsRef.current.clearSel(); return }
      if (e.key === 'Escape') {
        if (textEditIdRef.current) {
          e.preventDefault()
          endTextEditRef.current()
          return
        }
        if (floatRef.current) { clipActionsRef.current.discardFloat(); return }
        if (marqueeRef.current) { clipActionsRef.current.clearSel(); return }
        onClose(); return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        // Capture even when focus is in the Icons search field.
        if (e.repeat) return
        e.preventDefault()
        e.stopPropagation()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (e.repeat) return
        e.preventDefault()
        e.stopPropagation()
        redo()
        return
      }
      if ((e.key === 'Enter' || e.key === 'Escape') && tool === 'polygon' && polyPts.current.length) {
        finishPolygonRef.current()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = false
      if (
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        nudgePendingRef.current
      ) {
        nudgePendingRef.current = false
        pushHistoryRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKeyUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, onClose, tool])

  // Map a mouse event to working-resolution coordinates.
  const toCanvas = (e: React.MouseEvent): { x: number; y: number } => {
    const el = previewRef.current!
    const rect = el.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H
    }
  }
  const clampToCanvas = (pt: Pt): Pt => ({
    x: Math.max(0, Math.min(W, pt.x)),
    y: Math.max(0, Math.min(H, pt.y))
  })
  const clientToCanvas = (e: { clientX: number; clientY: number }): Pt => {
    const el = previewRef.current!
    const rect = el.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H
    }
  }

  const clearPreview = () => {
    const p = previewRef.current?.getContext('2d')
    if (p) p.clearRect(0, 0, W, H)
  }

  type AlignmentPoint = 'start' | 'center' | 'end'
  type AlignmentSnap = {
    dx: number
    dy: number
    x: boolean
    y: boolean
    xAt: AlignmentPoint | null
    yAt: AlignmentPoint | null
  }
  /** Snap an item's centre or outer edges to matching canvas guides. */
  const snapRectToCanvas = (item: { x: number; y: number; w: number; h: number }): AlignmentSnap => {
    const screenRect = previewRef.current?.getBoundingClientRect()
    const scale = screenRect?.width ? W / screenRect.width : 1
    // Same deliberately-light magnetic range for centre and all four edges.
    const threshold = 6 * scale
    const xCandidates: { delta: number; at: AlignmentPoint }[] = [
      { delta: -item.x, at: 'start' },
      { delta: W / 2 - (item.x + item.w / 2), at: 'center' },
      { delta: W - (item.x + item.w), at: 'end' }
    ]
    const yCandidates: { delta: number; at: AlignmentPoint }[] = [
      { delta: -item.y, at: 'start' },
      { delta: H / 2 - (item.y + item.h / 2), at: 'center' },
      { delta: H - (item.y + item.h), at: 'end' }
    ]
    const xMatch = xCandidates
      .filter((candidate) => Math.abs(candidate.delta) <= threshold)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]
    const yMatch = yCandidates
      .filter((candidate) => Math.abs(candidate.delta) <= threshold)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]
    return {
      dx: xMatch?.delta ?? 0,
      dy: yMatch?.delta ?? 0,
      x: !!xMatch,
      y: !!yMatch,
      xAt: xMatch?.at ?? null,
      yAt: yMatch?.at ?? null
    }
  }

  const boundsForLine = (l: LineObj): { x: number; y: number; w: number; h: number } => {
    const center = objCenter(l)
    const points = flattenLine(l).map((pt) => rotatePt(pt, center, l.rot ?? 0))
    const xs = points.map((pt) => pt.x)
    const ys = points.map((pt) => pt.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }

  /** Keep every group box tightly fitted to its children, deepest groups first. */
  const syncGroupBounds = (items = linesRef.current): void => {
    const depthOf = (line: LineObj): number => {
      let depth = 0
      let parentId = line.parentId
      const seen = new Set<string>()
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId)
        depth++
        parentId = items.find((item) => item.id === parentId)?.parentId
      }
      return depth
    }
    const groups = items
      .filter((line) => line.type === 'group')
      .sort((a, b) => depthOf(b) - depthOf(a))
    for (const group of groups) {
      const children = items.filter((line) => line.parentId === group.id)
      if (!children.length) continue
      const boxes = children.map(boundsForLine)
      const left = Math.min(...boxes.map((box) => box.x))
      const top = Math.min(...boxes.map((box) => box.y))
      const right = Math.max(...boxes.map((box) => box.x + box.w))
      const bottom = Math.max(...boxes.map((box) => box.y + box.h))
      group.pts = [{ x: left, y: top }, { x: right, y: bottom }]
      group.rot = 0
    }
  }

  const descendantIds = (groupId: string, items = linesRef.current): Set<string> => {
    const ids = new Set<string>()
    let changed = true
    while (changed) {
      changed = false
      for (const item of items) {
        if (item.parentId === groupId || (item.parentId && ids.has(item.parentId))) {
          if (!ids.has(item.id)) {
            ids.add(item.id)
            changed = true
          }
        }
      }
    }
    return ids
  }

  /** Object layers that receive brush/eraser directly (not base overlays). */
  const selectedPaintShape = (): LineObj | null => {
    const selected = linesRef.current.find((item) => item.id === selectedIdRef.current)
    if (!selected) return null
    const l = checkedGroupTarget(selected) ?? selected
    return (l.type === 'shape' || l.type === 'stamp' || l.type === 'group') && isVectorVisible(l) ? l : null
  }

  const selectedObjectOwnsRasterTools = (): boolean => {
    const selected = linesRef.current.find((item) => item.id === selectedIdRef.current)
    if (!selected || !isVectorVisible(selected)) return false
    const l = checkedGroupTarget(selected) ?? selected
    return l.type === 'shape' || l.type === 'stamp' || l.type === 'group' ||
      l.type === 'poly' || l.type === 'text'
  }

  const shapeLocalPaintPoint = (l: LineObj, canvasPt: Pt): Pt => {
    const local = rotatePt(canvasPt, objCenter(l), -(l.rot ?? 0))
    const a = l.pts[0], b = l.pts[1]
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    const w = Math.max(1, Math.abs(b.x - a.x)), h = Math.max(1, Math.abs(b.y - a.y))
    return { x: (local.x - x) / w, y: (local.y - y) / h }
  }

  type EraserPointSnap = { pt: Pt; xGuide: number | null; yGuide: number | null; angle: number | null }
  const snapEraserPoint = (raw: Pt): EraserPointSnap => {
    if (shiftHeldRef.current && drawing.current) {
      const dx = raw.x - startPt.current.x, dy = raw.y - startPt.current.y
      const distance = Math.hypot(dx, dy)
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
      return {
        pt: { x: startPt.current.x + Math.cos(angle) * distance, y: startPt.current.y + Math.sin(angle) * distance },
        xGuide: null,
        yGuide: null,
        angle
      }
    }

    const screenRect = previewRef.current?.getBoundingClientRect()
    const threshold = 6 * (screenRect?.width ? W / screenRect.width : 1)
    const xs = [0, W / 2, W]
    const ys = [0, H / 2, H]
    for (const l of linesRef.current) {
      if (!isVectorVisible(l)) continue
      const b = boundsForLine(l)
      xs.push(b.x, b.x + b.w / 2, b.x + b.w)
      ys.push(b.y, b.y + b.h / 2, b.y + b.h)
    }
    const nearest = (value: number, candidates: number[]): number | null => {
      const sorted = candidates
        .map((candidate) => ({ candidate, delta: Math.abs(candidate - value) }))
        .filter(({ delta }) => delta <= threshold)
        .sort((a, b) => a.delta - b.delta)
      return sorted[0]?.candidate ?? null
    }
    const xGuide = nearest(raw.x, xs)
    const yGuide = nearest(raw.y, ys)
    return {
      pt: { x: xGuide ?? raw.x, y: yGuide ?? raw.y },
      xGuide,
      yGuide,
      angle: null
    }
  }

  const drawEraserSnapGuides = (snap: EraserPointSnap) => {
    if (snap.xGuide == null && snap.yGuide == null && snap.angle == null) return
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    const rect = previewRef.current?.getBoundingClientRect()
    const scale = rect?.width ? W / rect.width : 1
    p.save()
    p.strokeStyle = '#ec4899'
    p.fillStyle = '#ec4899'
    p.lineWidth = Math.max(1, 1.25 * scale)
    p.setLineDash([5 * scale, 4 * scale])
    if (snap.xGuide != null) {
      p.beginPath(); p.moveTo(snap.xGuide, 0); p.lineTo(snap.xGuide, H); p.stroke()
    }
    if (snap.yGuide != null) {
      p.beginPath(); p.moveTo(0, snap.yGuide); p.lineTo(W, snap.yGuide); p.stroke()
    }
    if (snap.angle != null) {
      p.beginPath()
      p.moveTo(startPt.current.x, startPt.current.y)
      p.lineTo(snap.pt.x, snap.pt.y)
      p.stroke()
      p.setLineDash([])
      p.font = `600 ${11 * scale}px Inter, sans-serif`
      p.fillText(
        `${Math.round((snap.angle * 180) / Math.PI)}°`,
        snap.pt.x + 8 * scale,
        snap.pt.y - 8 * scale
      )
    }
    p.restore()
  }

  /** Magenta smart guides shown while a dragged item is aligned. */
  const drawAlignmentGuides = (snap: AlignmentSnap) => {
    if (!snap.x && !snap.y) return
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    const rect = previewRef.current?.getBoundingClientRect()
    const scale = rect?.width ? W / rect.width : 1
    const cx = W / 2
    const cy = H / 2
    p.save()
    p.strokeStyle = '#ec4899'
    p.fillStyle = '#ec4899'
    p.lineWidth = Math.max(1, 1.25 * scale)
    p.setLineDash([5 * scale, 4 * scale])
    if (snap.x) {
      const gx = snap.xAt === 'start' ? 1 * scale : snap.xAt === 'end' ? W - 1 * scale : cx
      p.beginPath()
      p.moveTo(gx, 0)
      p.lineTo(gx, H)
      p.stroke()
    }
    if (snap.y) {
      const gy = snap.yAt === 'start' ? 1 * scale : snap.yAt === 'end' ? H - 1 * scale : cy
      p.beginPath()
      p.moveTo(0, gy)
      p.lineTo(W, gy)
      p.stroke()
    }
    p.setLineDash([])
    p.font = `600 ${11 * scale}px Inter, sans-serif`
    if (snap.xAt === 'center' || snap.yAt === 'center') {
      p.beginPath()
      p.arc(cx, cy, 3.5 * scale, 0, Math.PI * 2)
      p.fill()
      p.textAlign = 'left'
      p.textBaseline = 'bottom'
      p.fillText('Center', cx + 7 * scale, cy - 6 * scale)
    }
    if (snap.xAt === 'start' || snap.xAt === 'end') {
      p.textAlign = snap.xAt === 'start' ? 'left' : 'right'
      p.textBaseline = 'top'
      p.fillText(snap.xAt === 'start' ? 'Left edge' : 'Right edge',
        snap.xAt === 'start' ? 7 * scale : W - 7 * scale, 7 * scale)
    }
    if (snap.yAt === 'start' || snap.yAt === 'end') {
      p.textAlign = 'left'
      p.textBaseline = snap.yAt === 'start' ? 'top' : 'bottom'
      p.fillText(snap.yAt === 'start' ? 'Top edge' : 'Bottom edge',
        7 * scale, snap.yAt === 'start' ? 24 * scale : H - 7 * scale)
    }
    p.restore()
  }

  // Outline showing the eraser tip footprint at the cursor.
  const drawEraserCursor = (pt: { x: number; y: number }) => {
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    clearPreview()
    p.save()
    p.lineWidth = 3
    p.strokeStyle = 'rgba(0,0,0,0.55)'
    strokeBrushTipOutline(p, eraserTip, pt.x, pt.y, size)
    p.stroke()
    p.lineWidth = 1.5
    p.strokeStyle = 'rgba(255,255,255,0.98)'
    strokeBrushTipOutline(p, eraserTip, pt.x, pt.y, size)
    p.stroke()
    p.restore()
  }

  // ── Vector line helpers ────────────────────────────────────────────────────
  /** Sole viewport painter. Only checked base rasters + visible object layers. */
  const redrawLines = useCallback(() => {
    const displayEl = displayCompositeRef.current
    if (!displayEl) return

    const skipId = textEditIdRef.current
    const showContent = !!editContentRef.current
    const showContainer = !!(editContainerRef.current && containerUsableRef.current)

    const frame = document.createElement('canvas')
    frame.width = W
    frame.height = H
    const frameCtx = frame.getContext('2d')!

    for (const item of linesRef.current) {
      if (item.type === 'stamp' && item.imageDataUrl && isVectorVisible(item)) {
        const a = item.pts[0], b = item.pts[1]
        const width = a && b ? Math.max(1, Math.abs(b.x - a.x)) : 1
        const height = a && b ? Math.max(1, Math.abs(b.y - a.y)) : 1
        ensureStampImage(
          stampRenderDataUrl(item, width, height),
          () => redrawLinesRef.current()
        )
      }
    }

    for (const id of [...layerOrderRef.current].reverse()) {
      const baseVisible = id === 'content' ? showContent : showContainer
      if (baseVisible) drawBaseAndOverlay(frameCtx, id)
      for (const l of linesRef.current) {
        if (
          l.parentId ||
          vectorLayerOf(l) !== id ||
          (skipId && l.id === skipId && l.type === 'text')
        ) continue
        renderObjectTree(frameCtx, l, linesRef.current, isVectorVisible)
      }
    }

    // Hard-clear presentation canvas (size assign drops retained GPU buffers).
    displayEl.width = W
    displayEl.height = H
    const display = displayEl.getContext('2d')
    if (display) display.drawImage(frame, 0, 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, editContent, editContainer, containerUsable, layerOrder])
  const redrawLinesRef = useRef(redrawLines)
  redrawLinesRef.current = redrawLines

  // Screen position of the rotate pin (a small handle above the object's top edge).
  const rotatePinAt = (l: LineObj): Pt =>
    rotatePt({ ...objTopCenter(l), y: objTopCenter(l).y - ROTATE_PIN_LEN }, objCenter(l), l.rot ?? 0)

  const drawRotatePin = (p: CanvasRenderingContext2D, l: LineObj) => {
    const c = objCenter(l)
    const anchor = rotatePt(objTopCenter(l), c, l.rot ?? 0)
    const pin = rotatePinAt(l)
    p.save()
    p.strokeStyle = '#10b981'
    p.lineWidth = 2
    p.setLineDash([])
    p.beginPath(); p.moveTo(anchor.x, anchor.y); p.lineTo(pin.x, pin.y); p.stroke()
    p.fillStyle = '#ffffff'
    p.beginPath(); p.arc(pin.x, pin.y, 7, 0, Math.PI * 2); p.fill(); p.stroke()
    p.restore()
  }

  /** Live angle readout while rotating. Common 15° angles use a magenta snap guide. */
  const drawRotationGuide = (l: LineObj, snapped: boolean, rotationOverride?: number) => {
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    const rect = previewRef.current?.getBoundingClientRect()
    const scale = rect?.width ? W / rect.width : 1
    const c = objCenter(l)
    const rot = rotationOverride ?? l.rot ?? 0
    const radius = Math.max(34 * scale, dist(c, objTopCenter(l)) + 12 * scale)
    const start = -Math.PI / 2
    const end = start + rot
    const reference = { x: c.x, y: c.y - radius }
    const direction = rotatePt(reference, c, rot)
    const color = snapped ? '#ec4899' : '#22d3ee'
    const degrees = ((rot * 180 / Math.PI) % 360 + 360) % 360
    const rounded = Math.round(degrees * 10) / 10
    const label = `${rounded}°`

    p.save()
    p.strokeStyle = color
    p.fillStyle = color
    p.lineWidth = Math.max(1, 1.5 * scale)
    p.setLineDash([5 * scale, 4 * scale])
    p.beginPath()
    p.moveTo(c.x, c.y)
    p.lineTo(reference.x, reference.y)
    p.moveTo(c.x, c.y)
    p.lineTo(direction.x, direction.y)
    p.stroke()
    p.setLineDash([])
    if (Math.abs(rot) > 0.002) {
      p.beginPath()
      p.arc(c.x, c.y, radius * 0.62, start, end, rot < 0)
      p.stroke()
    }
    p.beginPath()
    p.arc(c.x, c.y, 3.5 * scale, 0, Math.PI * 2)
    p.fill()

    p.font = `600 ${12 * scale}px Inter, sans-serif`
    const tw = p.measureText(label).width
    const padX = 6 * scale
    const padY = 4 * scale
    const lx = direction.x + 10 * scale
    const ly = direction.y - 10 * scale
    p.fillStyle = 'rgba(15, 23, 42, 0.92)'
    roundedRect(p, lx - padX, ly - 12 * scale - padY, tw + padX * 2, 16 * scale + padY * 2, 5 * scale)
    p.fill()
    p.fillStyle = '#ffffff'
    p.textAlign = 'left'
    p.textBaseline = 'alphabetic'
    p.fillText(label, lx, ly)
    p.restore()
  }

  const alphaBounds = (canvas: HTMLCanvasElement | null): { x: number; y: number; w: number; h: number } | null => {
    if (!canvas) return null
    const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
    if (!data) return null
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] === 0) continue
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
    return right < left || bottom < top
      ? null
      : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
  }

  const drawContentHandles = (p: CanvasRenderingContext2D): boolean => {
    if (selectedBaseLayerRef.current !== 'content' || !editContentRef.current) return false
    const bounds = alphaBounds(contentCanvasRef.current)
    if (!bounds) return false
    const corners = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y + bounds.h }
    ]
    p.save()
    p.strokeStyle = '#3b82f6'
    p.lineWidth = 2
    p.setLineDash([6, 4])
    p.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h)
    p.setLineDash([])
    p.fillStyle = '#ffffff'
    for (const corner of corners) {
      p.beginPath()
      p.arc(corner.x, corner.y, 7, 0, Math.PI * 2)
      p.fill()
      p.stroke()
    }
    const anchor = { x: bounds.x + bounds.w / 2, y: bounds.y }
    const pin = { x: anchor.x, y: anchor.y - ROTATE_PIN_LEN }
    p.strokeStyle = '#10b981'
    p.beginPath()
    p.moveTo(anchor.x, anchor.y)
    p.lineTo(pin.x, pin.y)
    p.stroke()
    p.beginPath()
    p.arc(pin.x, pin.y, 7, 0, Math.PI * 2)
    p.fill()
    p.stroke()
    p.restore()
    return true
  }

  const drawHandles = useCallback(() => {
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    p.clearRect(0, 0, W, H)
    const l = linesRef.current.find((x) => x.id === selectedIdRef.current)
    if (!l && drawContentHandles(p)) return
    // Never leave handles (or any preview pixels) for a hidden object layer.
    if (!l || !isVectorVisible(l)) return
    const c = objCenter(l)
    const rot = l.rot ?? 0
    if (l.type === 'text') {
      const b = textBBox(l)
      const corners = [
        { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }
      ].map((pt) => rotatePt(pt, c, rot))
      p.save()
      p.strokeStyle = '#3b82f6'
      p.lineWidth = 2
      p.setLineDash([6, 4])
      p.beginPath()
      p.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < corners.length; i++) p.lineTo(corners[i].x, corners[i].y)
      p.closePath(); p.stroke()
      p.restore()
      p.save()
      p.fillStyle = '#ffffff'
      p.strokeStyle = '#3b82f6'
      p.lineWidth = 2.5
      p.beginPath(); p.arc(corners[0].x, corners[0].y, 7, 0, Math.PI * 2); p.fill(); p.stroke()
      p.restore()
      drawRotatePin(p, l)
      return
    }
    for (let i = 0; i < l.pts.length; i++) {
      const isEnd = i === 0 || i === l.pts.length - 1
      const pt = rotatePt(l.pts[i], c, rot)
      p.save()
      p.fillStyle = '#ffffff'
      p.strokeStyle = isEnd ? '#3b82f6' : '#f59e0b'
      p.lineWidth = 2.5
      if (isEnd) {
        p.beginPath(); p.arc(pt.x, pt.y, 7, 0, Math.PI * 2); p.fill(); p.stroke()
      } else {
        p.beginPath(); p.rect(pt.x - 6, pt.y - 6, 12, 12); p.fill(); p.stroke()
      }
      p.restore()
    }
    drawRotatePin(p, l)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H])

  const commitLines = useCallback((arr: LineObj[]) => {
    linesRef.current = arr
    setLines(arr)
  }, [])

  // Load the active text font and redraw once it's ready (metrics change).
  useEffect(() => {
    loadFont(fontFamily).then(() => { redrawLines(); drawHandles() })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily])

  const selectLine = (l: LineObj, preservePanelSelection = false) => {
    const editTarget = checkedGroupTarget(l) ?? l
    selectedIdRef.current = editTarget.id
    setSelectedId(editTarget.id)
    if (!preservePanelSelection) setSelectedLayerIds(new Set([l.id]))
    // Keep lineType a valid Line kind (poly/shape/stamp/text are chosen via their tools).
    if (l.type !== 'poly' && l.type !== 'shape' && l.type !== 'stamp' && l.type !== 'text' && l.type !== 'group') setLineType(l.type)
    if (l.type === 'polyline' || l.type === 'free') setLinePointCount(l.pts.length)
    setStartCap(l.startCap)
    setEndCap(l.endCap)
    setLineDash(l.dash)
    setSize(lineBorderWidth(l) || l.thickness)
    setColor(l.color)
    setHexText(isGradientColor(l.color) ? firstSolidColor(l.color) : l.color)
    setBorderColor(lineBorderColor(l))
    setBorderRadius(lineBorderRadius(l))
    setKeepStrokeOnResize(l.keepStrokeOnResize ?? true)
    if (l.type === 'poly' || l.type === 'shape') setShapeFill(!!l.fill)
    if (l.type === 'shape' && l.shape) setShapeKind(l.shape)
    if (l.type === 'drawn') setDrawnCurve(!!l.drawnCurve)
    if (l.type === 'text' || l.contentBound) {
      if (l.type === 'text') {
        setTextValue(l.text ?? '')
        setFontFamily(l.fontFamily ?? 'Inter')
        setFontSize(l.fontSize ?? 48)
        setFontWeightV(l.weight ?? 400)
        setBold(!!l.bold)
        setItalic(!!l.italic)
        setTxtLineHeight(l.lineHeight ?? 1.28)
        setTxtLetterSpacing(l.letterSpacing ?? 0)
      }
      setTxtShadow(!!l.shadow)
      setTxtShadowColor(l.shadowColor ?? '#000000b3')
      setTxtShadowBlur(l.shadowBlur ?? 8)
      setTxtShadowOX(l.shadowOffsetX ?? 0)
      setTxtShadowOY(l.shadowOffsetY ?? 4)
      setTxtShadowSpread(l.shadowSpread ?? 0)
    }
  }

  const updateSelectedLive = (patch: Partial<LineObj> | ((l: LineObj) => Partial<LineObj>)) => {
    const id = selectedIdRef.current
    if (!id) return
    const selected = linesRef.current.find((l) => l.id === id)
    const targetId = selected ? (checkedGroupTarget(selected)?.id ?? id) : id
    const next = linesRef.current.map((l) =>
      l.id === targetId ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l
    )
    commitLines(next)
    redrawLines()
    drawHandles()
  }
  const updateSelected = (patch: Partial<LineObj> | ((l: LineObj) => Partial<LineObj>)) => {
    if (!selectedIdRef.current) return
    updateSelectedLive(patch)
    pushHistory()
  }

  const deleteSelected = () => {
    const id = selectedIdRef.current
    if (!id) return
    const selected = linesRef.current.find((l) => l.id === id)
    // Linked letters stay — they are the live Inner text. contentBound proxies
    // may be deleted (a fresh proxy is re-seeded next time Paint opens).
    if (selected?.linkedOutsideText) return
    const deleteIds = new Set([
      id,
      ...(selected?.type === 'group'
        ? linesRef.current.filter((l) => l.parentId === id).map((l) => l.id)
        : [])
    ])
    if (textEditIdRef.current === id) {
      textEditIdRef.current = null
      setTextEditId(null)
    }
    const remaining = linesRef.current.filter((l) => !deleteIds.has(l.id))
    syncGroupBounds(remaining)
    commitLines(remaining)
    selectedIdRef.current = null
    setSelectedId(null)
    setSelectedLayerIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    redrawLines()
    clearPreview()
    pushHistory()
  }
  deleteSelectedRef.current = deleteSelected

  const endTextEdit = () => {
    const id = textEditIdRef.current
    if (!id) return
    const raw = textAreaRef.current?.value ?? textValue
    const next = raw.replace(/\s+$/g, '')
    textEditIdRef.current = null
    setTextEditId(null)
    const l = linesRef.current.find((x) => x.id === id)
    if (!l || l.type !== 'text') {
      redrawLines(); drawHandles()
      return
    }
    if (!next.trim()) {
      linesRef.current = linesRef.current.filter((x) => x.id !== id)
      if (selectedIdRef.current === id) {
        selectedIdRef.current = null
        setSelectedId(null)
      }
      commitLines(linesRef.current)
      setTextValue('')
    } else {
      l.text = next
      setTextValue(next)
      commitLines([...linesRef.current])
      pushHistory()
      // Done typing — switch to pointer so the next click won't place another text.
      setTool('pointer')
    }
    redrawLines(); drawHandles()
  }

  const startTextEdit = (id: string) => {
    const l = linesRef.current.find((x) => x.id === id)
    if (!l || l.type !== 'text') return
    textEditIdRef.current = id
    setTextEditId(id)
    setTextValue(l.text ?? '')
    selectLine(l)
    redrawLines(); drawHandles()
    requestAnimationFrame(() => {
      const el = textAreaRef.current
      if (!el) return
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    })
  }

  endTextEditRef.current = endTextEdit
  startTextEditRef.current = startTextEdit

  // Track canvas stage layout size so the on-canvas text editor can be positioned.
  // Use offsetWidth/Height (ignore CSS zoom transform from PreviewStage).
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const sync = () => {
      setStageSize({ w: el.offsetWidth || 1, h: el.offsetHeight || 1 })
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Handle hit-test in screen space (handles are drawn rotated around the centre).
  const handleIndexAt = (l: LineObj, pt: Pt): number => {
    const c = objCenter(l)
    const rot = l.rot ?? 0
    for (let i = 0; i < l.pts.length; i++) if (dist(rotatePt(l.pts[i], c, rot), pt) <= 12) return i
    return -1
  }

  const setLineEndAndControls = (l: LineObj, end: Pt) => {
    const a = l.pts[0]
    if (l.type === 'straight') l.pts = [a, end]
    else if (l.type === 'curved') l.pts = [a, mid(a, end), end]
    else if (l.type === 'polyline' || l.type === 'free') l.pts = linePts(a, end, l.pts.length)
  }

  const paintContentFromSnapshot = (
    source: HTMLCanvasElement,
    sourceBounds: { x: number; y: number; w: number; h: number },
    targetBounds: { x: number; y: number; w: number; h: number }
  ) => {
    const canvas = ensureOffscreenCanvas(contentCanvasRef)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      source,
      sourceBounds.x, sourceBounds.y, sourceBounds.w, sourceBounds.h,
      targetBounds.x, targetBounds.y, targetBounds.w, targetBounds.h
    )
  }

  const beginContentTransform = (pt: Pt): boolean => {
    if (selectedBaseLayerRef.current !== 'content' || !editContentRef.current) return false
    const canvas = contentCanvasRef.current
    const bounds = alphaBounds(canvas)
    if (!canvas || !bounds) return false
    const corners: { corner: Corner; point: Pt; fixed: Pt }[] = [
      { corner: 'nw', point: { x: bounds.x, y: bounds.y }, fixed: { x: bounds.x + bounds.w, y: bounds.y + bounds.h } },
      { corner: 'ne', point: { x: bounds.x + bounds.w, y: bounds.y }, fixed: { x: bounds.x, y: bounds.y + bounds.h } },
      { corner: 'se', point: { x: bounds.x + bounds.w, y: bounds.y + bounds.h }, fixed: { x: bounds.x, y: bounds.y } },
      { corner: 'sw', point: { x: bounds.x, y: bounds.y + bounds.h }, fixed: { x: bounds.x + bounds.w, y: bounds.y } }
    ]
    const source = cloneCanvas(canvas)
    const pin = { x: bounds.x + bounds.w / 2, y: bounds.y - ROTATE_PIN_LEN }
    if (dist(pin, pt) <= 12) {
      const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
      baseTransformRef.current = {
        kind: 'rotate',
        source,
        bounds,
        center,
        startAng: Math.atan2(pt.y - center.y, pt.x - center.x)
      }
      return true
    }
    const handle = corners.find((item) => dist(item.point, pt) <= 12)
    if (handle) {
      baseTransformRef.current = {
        kind: 'resize',
        source,
        bounds,
        fixed: handle.fixed,
        corner: handle.corner
      }
      return true
    }
    if (
      pt.x >= bounds.x && pt.x <= bounds.x + bounds.w &&
      pt.y >= bounds.y && pt.y <= bounds.y + bounds.h
    ) {
      baseTransformRef.current = { kind: 'move', source, bounds, grab: pt }
      return true
    }
    return false
  }

  const lineDown = (pt: Pt) => {
    // Finish on-canvas text editing when interacting elsewhere.
    if (textEditIdRef.current) {
      const editing = linesRef.current.find((l) => l.id === textEditIdRef.current)
      if (editing?.type === 'text') {
        const q = rotatePt(pt, objCenter(editing), -(editing.rot ?? 0))
        const onText = pointInPoly(flattenLine(editing), q)
        const onHandle = handleIndexAt(editing, pt) >= 0 || dist(rotatePinAt(editing), pt) <= 12
        if (onText && !onHandle) return // keep caret in the textarea
        endTextEditRef.current()
        // Corner / pin: fall through so rotate/move can start on this click.
        // Click outside: stop here — do not place a new text on the same click.
        if (!onHandle) return
      } else {
        endTextEditRef.current()
        return
      }
    }
    if (tool === 'pointer') {
      if (beginContentTransform(pt)) return
      // 1. Dragging the rotate pin or a handle of the selected object.
      const sel = linesRef.current.find((l) => l.id === selectedIdRef.current)
      if (sel && isVectorVisible(sel)) {
        if (dist(rotatePinAt(sel), pt) <= 12) {
          const center = objCenter(sel)
          lineDragRef.current = {
            kind: 'rotate', id: sel.id, center,
            startAng: Math.atan2(pt.y - center.y, pt.x - center.x),
            startRot: sel.rot ?? 0,
            ...(sel.type === 'group' ? { snapshot: cloneLines(linesRef.current) } : {})
          }
          return
        }
        const hi = handleIndexAt(sel, pt)
        if (hi >= 0) {
          resizeSnapLockRef.current = { width: false, height: false }
          const snapshotResize =
            sel.pts.length === 2 &&
            (sel.type === 'shape' || sel.type === 'stamp' || sel.type === 'group')
          lineDragRef.current = {
            kind: 'handle',
            id: sel.id,
            idx: hi,
            ...(snapshotResize
              ? {
                  startRect: boundsForLine(sel),
                  startCenter: objCenter(sel),
                  startRot: sel.rot ?? 0,
                  snapshot: cloneLines(linesRef.current)
                }
              : {})
          }
          return
        }
      }

      // 2. Selecting / moving an existing visible object (topmost first).
      const hit = [...linesRef.current].reverse().find((l) => {
        if (!isVectorVisible(l)) return false
        const q = rotatePt(pt, objCenter(l), -(l.rot ?? 0))
        return l.type === 'text'
          ? pointInPoly(flattenLine(l), q)
          : lineHitDist(l, q) <= Math.max(8, l.thickness) ||
            (l.type === 'poly' && l.fill && pointInPoly(l.pts, q)) ||
            (l.type === 'shape' && pointInRect(l.pts[0], l.pts[1], q)) ||
            ((l.type === 'stamp' || l.type === 'group') && l.pts.length >= 2 && pointInRect(l.pts[0], l.pts[1], q))
      })
      if (hit) {
        selectLine(hit)
        lineDragRef.current = { kind: 'move', id: selectedIdRef.current ?? hit.id, grab: pt }
        redrawLines(); drawHandles()
        return
      }

      // Empty Pointer click deselects.
      lineDragRef.current = null
      selectedIdRef.current = null
      setSelectedId(null)
      redrawLines(); drawHandles()
      return
    }
    // Text: place a new text object and edit it on the canvas.
    if (tool === 'text') {
      if (useOutsideText && outsideTextRef.current) {
        const nl = lineFromOutsideText(outsideTextRef.current, W)
        // Keep optical center (linked letters); click only starts edit.
        linesRef.current = [...linesRef.current, nl]
        commitLines([...linesRef.current])
        selectLine(nl)
        loadFont(nl.fontFamily ?? 'Inter').then(() => {
          const cur = linesRef.current.find((l) => l.id === nl.id)
          if (!cur || !outsideTextRef.current) return
          const next = applyOutsideTextToLine(cur, outsideTextRef.current, W)
          linesRef.current = linesRef.current.map((l) => (l.id === next.id ? next : l))
          commitLines(linesRef.current)
          redrawLines(); drawHandles()
        })
        startTextEditRef.current(nl.id)
        return
      }
      const id = genId()
      const nl: LineObj = {
        id, type: 'text', pts: [pt], startCap: 'none', endCap: 'none', dash: 'solid',
        thickness: size, color,
        text: '', fontFamily, fontSize, weight: fontWeightV, bold, italic,
        lineHeight: txtLineHeight, letterSpacing: txtLetterSpacing,
        shadow: txtShadow, shadowColor: txtShadowColor, shadowBlur: txtShadowBlur,
        shadowOffsetX: txtShadowOX, shadowOffsetY: txtShadowOY, shadowSpread: txtShadowSpread,
        layer: activeAddLayer()
      }
      // Place so typical glyph ink is canvas-centered (not the em / textarea box).
      nl.pts = [opticalTopLeftForText({ ...nl, text: 'H' }, W / 2, H / 2)]
      linesRef.current = [...linesRef.current, nl]
      commitLines([...linesRef.current])
      selectLine(nl)
      loadFont(fontFamily).then(() => { redrawLines(); drawHandles() })
      startTextEditRef.current(id)
      return
    }
    // 3. Creating a new object (assigned to the active add layer — Inner preferred when both on).
    const id = genId()
    const layer = activeAddLayer()
    let nl: LineObj
    if (tool === 'shape') {
      nl = {
        id, type: 'shape', shape: shapeKind, pts: [pt, { ...pt }], startCap: 'none', endCap: 'none',
        dash: lineDash, thickness: size, color, fill: shapeFill,
        borderColor, borderWidth: size, borderRadius, keepStrokeOnResize, layer
      }
    } else if (tool === 'freepoly') {
      const n = Math.max(3, Math.min(60, freePolyN))
      nl = {
        id, type: 'poly', pts: regularPolyPts(pt, pt, n), startCap: 'none', endCap: 'none',
        dash: lineDash, thickness: size, color, fill: shapeFill,
        borderColor, borderWidth: size, borderRadius, keepStrokeOnResize, layer
      }
    } else {
      let pts: Pt[]
      const n = Math.max(2, Math.min(40, linePointCount))
      if (lineType === 'drawn') pts = [pt]
      else if (lineType === 'straight') pts = [pt, { ...pt }]
      else if (lineType === 'curved') pts = [pt, { ...pt }, { ...pt }]
      else pts = linePts(pt, pt, n) // polyline / free
      nl = {
        id, type: lineType, pts, startCap, endCap, dash: lineDash, thickness: size, color,
        borderColor: color, borderWidth: size, borderRadius, layer,
        ...(lineType === 'drawn' ? { drawnCurve } : {})
      }
    }
    linesRef.current = [...linesRef.current, nl]
    selectedIdRef.current = id
    setSelectedId(id)
    lineDragRef.current = { kind: (tool === 'line' && lineType === 'drawn') ? 'draw' : 'create', id, grab: pt }
    redrawLines()
  }

  const lineMove = (pt: Pt) => {
    const baseTransform = baseTransformRef.current
    if (baseTransform) {
      if (baseTransform.kind === 'move' && baseTransform.grab) {
        const dx = pt.x - baseTransform.grab.x
        const dy = pt.y - baseTransform.grab.y
        paintContentFromSnapshot(baseTransform.source, baseTransform.bounds, {
          x: baseTransform.bounds.x + dx,
          y: baseTransform.bounds.y + dy,
          w: baseTransform.bounds.w,
          h: baseTransform.bounds.h
        })
      } else if (baseTransform.kind === 'resize' && baseTransform.fixed) {
        const end = shiftHeldRef.current
          ? lockAspectRatioEnd(
              baseTransform.fixed,
              pt,
              baseTransform.bounds.w / Math.max(1, baseTransform.bounds.h)
            )
          : pt
        paintContentFromSnapshot(baseTransform.source, baseTransform.bounds, {
          x: Math.min(baseTransform.fixed.x, end.x),
          y: Math.min(baseTransform.fixed.y, end.y),
          w: Math.max(1, Math.abs(end.x - baseTransform.fixed.x)),
          h: Math.max(1, Math.abs(end.y - baseTransform.fixed.y))
        })
      } else if (
        baseTransform.kind === 'rotate' &&
        baseTransform.center &&
        baseTransform.startAng != null
      ) {
        const angle = Math.atan2(pt.y - baseTransform.center.y, pt.x - baseTransform.center.x)
        const raw = angle - baseTransform.startAng
        const step = Math.PI / 12
        const nearest = Math.round(raw / step) * step
        const delta = Math.abs(Math.atan2(Math.sin(raw - nearest), Math.cos(raw - nearest))) <= (3 * Math.PI / 180)
          ? nearest
          : raw
        const canvas = ensureOffscreenCanvas(contentCanvasRef)
        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0, 0, W, H)
        ctx.save()
        ctx.translate(baseTransform.center.x, baseTransform.center.y)
        ctx.rotate(delta)
        ctx.translate(-baseTransform.center.x, -baseTransform.center.y)
        ctx.drawImage(baseTransform.source, 0, 0)
        ctx.restore()
      }
      redrawLines()
      drawHandles()
      return
    }
    const dr = lineDragRef.current
    if (!dr) return
    const l = linesRef.current.find((x) => x.id === dr.id)
    if (!l) return
    if (dr.kind === 'draw') {
      const last = l.pts[l.pts.length - 1]
      // Fixed adjustable-point count overrides sampling: capture densely, resample on up.
      // Distance mode (On): place points at a travel-distance interval.
      // Default (Off): original behaviour — add a point on every small mouse move.
      const nFilled = drawnPointCount.trim() !== '' && Number(drawnPointCount) >= 2
      const minDist = nFilled || !drawnDistanceMode
        ? 2
        : Math.max(8, size * 1.2)
      if (dist(last, pt) >= minDist) l.pts.push(pt)
    } else if (dr.kind === 'create') {
      const origin = dr.grab ?? l.pts[0]
      const end = ((shapeLockAspect || shiftHeldRef.current) && (l.type === 'shape' || l.type === 'poly' || l.type === 'stamp'))
        ? lockAspectEnd(origin, pt)
        : pt
      if (l.type === 'shape' || l.type === 'stamp') l.pts = [origin, end]
      else if (l.type === 'poly') l.pts = regularPolyPts(origin, end, l.pts.length)
      else setLineEndAndControls(l, pt)
    } else if (dr.kind === 'handle') {
      const resizeSnapshot = dr.snapshot
      const sourceLine = resizeSnapshot?.find((item) => item.id === l.id)
      const snapshotResize = !!(
        sourceLine &&
        sourceLine.pts.length === 2 &&
        (l.type === 'shape' || l.type === 'stamp' || l.type === 'group')
      )
      if (snapshotResize && sourceLine && resizeSnapshot) {
        l.pts = sourceLine.pts.map((point) => ({ ...point }))
        l.rot = sourceLine.rot
        l.thickness = sourceLine.thickness
        l.borderWidth = sourceLine.borderWidth
        l.fontSize = sourceLine.fontSize
        if (l.type === 'group') {
          const descendants = descendantIds(l.id, resizeSnapshot)
          for (const current of linesRef.current) {
            if (!descendants.has(current.id)) continue
            const source = resizeSnapshot.find((item) => item.id === current.id)
            if (!source) continue
            current.pts = source.pts.map((point) => ({ ...point }))
            current.rot = source.rot
            current.thickness = source.thickness
            current.borderWidth = source.borderWidth
            current.fontSize = source.fontSize
            current.paintStrokes = source.paintStrokes
              ? structuredClone(source.paintStrokes)
              : source.paintStrokes
          }
        }
      }
      // Convert against the drag-start frame. Using the live changing centre
      // causes repeated Shift-resize moves to compound and collapse the box.
      let local = rotatePt(
        pt,
        dr.startCenter ?? objCenter(l),
        -(dr.startRot ?? l.rot ?? 0)
      )
      const idx = dr.idx!
      const fixed = l.pts.length === 2 ? l.pts[1 - idx] : null
      const before = l.pts.length === 2
        ? {
            x: Math.min(l.pts[0].x, l.pts[1].x),
            y: Math.min(l.pts[0].y, l.pts[1].y),
            w: Math.abs(l.pts[1].x - l.pts[0].x),
            h: Math.abs(l.pts[1].y - l.pts[0].y)
          }
        : null
      let resizeCorner: Corner | null = null
      if (fixed && !(l.rot ?? 0) && (l.type === 'shape' || l.type === 'stamp')) {
        resizeCorner = `${local.y < fixed.y ? 'n' : 's'}${local.x < fixed.x ? 'w' : 'e'}` as Corner
      }
      // Preset shapes / stamps use 2 bbox corners — lock aspect against the opposite corner.
      if (fixed) {
        if (l.type === 'group' && shiftHeldRef.current && dr.startRect) {
          local = lockAspectRatioEnd(fixed, local, dr.startRect.w / Math.max(1, dr.startRect.h))
        } else if (
          (shapeLockAspect || shiftHeldRef.current) &&
          (l.type === 'shape' || l.type === 'stamp')
        ) {
          local = lockAspectEnd(fixed, local)
        }
      }
      const groupBefore = l.type === 'group' && l.pts.length >= 2
        ? {
            x: Math.min(l.pts[0].x, l.pts[1].x),
            y: Math.min(l.pts[0].y, l.pts[1].y),
            w: Math.max(1, Math.abs(l.pts[1].x - l.pts[0].x)),
            h: Math.max(1, Math.abs(l.pts[1].y - l.pts[0].y))
          }
        : null
      l.pts[idx] = local
      if (groupBefore) {
        const gx = Math.min(l.pts[0].x, l.pts[1].x)
        const gy = Math.min(l.pts[0].y, l.pts[1].y)
        const gw = Math.max(1, Math.abs(l.pts[1].x - l.pts[0].x))
        const gh = Math.max(1, Math.abs(l.pts[1].y - l.pts[0].y))
        const descendants = descendantIds(l.id)
        for (const child of linesRef.current) {
          if (!descendants.has(child.id)) continue
          child.pts = child.pts.map((p) => ({
            x: gx + ((p.x - groupBefore.x) / groupBefore.w) * gw,
            y: gy + ((p.y - groupBefore.y) / groupBefore.h) * gh
          }))
          const strokeScale = Math.min(gw / groupBefore.w, gh / groupBefore.h)
          if (child.type === 'text') {
            child.fontSize = Math.max(1, (child.fontSize ?? 48) * strokeScale)
          }
          if (child.keepStrokeOnResize === false) {
            child.thickness *= strokeScale
            if (child.borderWidth != null) child.borderWidth *= strokeScale
          }
        }
        syncGroupBounds()
      }
      // Unrotated box items also receive the 50% dimension snap/readout.
      if (
        fixed &&
        before &&
        !(l.rot ?? 0) &&
        (l.type === 'shape' || l.type === 'stamp')
      ) {
        const corner: Corner = resizeCorner ??
          `${local.y < fixed.y ? 'n' : 's'}${local.x < fixed.x ? 'w' : 'e'}` as Corner
        const box = {
          x: Math.min(local.x, fixed.x),
          y: Math.min(local.y, fixed.y),
          w: Math.abs(local.x - fixed.x),
          h: Math.abs(local.y - fixed.y)
        }
        // Resize handles track the pointer directly. Alignment remains visual;
        // unlike object movement, corner dragging does not magnetically detach
        // the handle from the cursor.
        if (l.type === 'shape' && l.keepStrokeOnResize === false) {
          const strokeScale = Math.min(
            Math.max(1, box.w) / Math.max(1, before.w),
            Math.max(1, box.h) / Math.max(1, before.h)
          )
          l.thickness *= strokeScale
          if (l.borderWidth != null) l.borderWidth *= strokeScale
        }
        syncGroupBounds()
        redrawLines()
        drawHandles()
        drawAlignmentGuides(resizeEdgeGuide(box, corner))
        return
      }
      if (before && l.type === 'shape' && l.keepStrokeOnResize === false) {
        const afterW = Math.max(1, Math.abs(l.pts[1].x - l.pts[0].x))
        const afterH = Math.max(1, Math.abs(l.pts[1].y - l.pts[0].y))
        const strokeScale = Math.min(
          afterW / Math.max(1, before.w),
          afterH / Math.max(1, before.h)
        )
        l.thickness *= strokeScale
        if (l.borderWidth != null) l.borderWidth *= strokeScale
      }
      syncGroupBounds()
    } else if (dr.kind === 'move') {
      const d = { x: pt.x - dr.grab!.x, y: pt.y - dr.grab!.y }
      l.pts = l.pts.map((p) => ({ x: p.x + d.x, y: p.y + d.y }))
      if (l.type === 'group') {
        const descendants = descendantIds(l.id)
        for (const child of linesRef.current) {
          if (descendants.has(child.id)) {
            child.pts = child.pts.map((p) => ({ x: p.x + d.x, y: p.y + d.y }))
          }
        }
      }
      const snap = snapRectToCanvas(boundsForLine(l))
      if (snap.x || snap.y) {
        l.pts = l.pts.map((p) => ({ x: p.x + snap.dx, y: p.y + snap.dy }))
        if (l.type === 'group') {
          const descendants = descendantIds(l.id)
          for (const child of linesRef.current) {
            if (descendants.has(child.id)) {
              child.pts = child.pts.map((p) => ({ x: p.x + snap.dx, y: p.y + snap.dy }))
            }
          }
        }
      }
      syncGroupBounds()
      // While snapped, retain the virtual grab point on that axis so slow,
      // continued cursor movement accumulates and can cleanly break the magnet.
      dr.grab = {
        x: snap.x ? dr.grab!.x : pt.x,
        y: snap.y ? dr.grab!.y : pt.y
      }
      redrawLines()
      drawHandles()
      drawAlignmentGuides(snap)
      return
    } else if (dr.kind === 'rotate') {
      const c = dr.center!
      const ang = Math.atan2(pt.y - c.y, pt.x - c.x)
      const rawRot = (dr.startRot ?? 0) + (ang - (dr.startAng ?? 0))
      const snapStep = Math.PI / 12 // 15°
      const nearest = Math.round(rawRot / snapStep) * snapStep
      const difference = Math.atan2(Math.sin(rawRot - nearest), Math.cos(rawRot - nearest))
      const snapped = Math.abs(difference) <= (3 * Math.PI / 180)
      const nextRot = snapped ? nearest : rawRot
      if (l.type === 'group' && dr.snapshot) {
        const snapshot = dr.snapshot
        const sourceGroup = snapshot.find((item) => item.id === l.id)
        if (!sourceGroup) return
        const delta = nextRot - (dr.startRot ?? 0)
        const ids = descendantIds(l.id, snapshot)
        for (const current of linesRef.current) {
          if (!ids.has(current.id) || current.type === 'group') continue
          const source = snapshot.find((item) => item.id === current.id)
          if (!source) continue
          const sourceCenter = objCenter(source)
          const nextCenter = rotatePt(sourceCenter, c, delta)
          const dx = nextCenter.x - sourceCenter.x
          const dy = nextCenter.y - sourceCenter.y
          current.pts = source.pts.map((point) => ({ x: point.x + dx, y: point.y + dy }))
          current.rot = (source.rot ?? 0) + delta
        }
        syncGroupBounds()
        const rotatedGroupIds = new Set([l.id, ...ids])
        for (const current of linesRef.current) {
          if (current.type !== 'group' || !rotatedGroupIds.has(current.id)) continue
          const source = snapshot.find((item) => item.id === current.id)
          if (!source?.paintStrokes?.length || source.pts.length < 2 || current.pts.length < 2) continue
          const sx = Math.min(source.pts[0].x, source.pts[1].x)
          const sy = Math.min(source.pts[0].y, source.pts[1].y)
          const sw = Math.max(1, Math.abs(source.pts[1].x - source.pts[0].x))
          const sh = Math.max(1, Math.abs(source.pts[1].y - source.pts[0].y))
          const nx = Math.min(current.pts[0].x, current.pts[1].x)
          const ny = Math.min(current.pts[0].y, current.pts[1].y)
          const nw = Math.max(1, Math.abs(current.pts[1].x - current.pts[0].x))
          const nh = Math.max(1, Math.abs(current.pts[1].y - current.pts[0].y))
          current.paintStrokes = source.paintStrokes.map((stroke) => ({
            ...stroke,
            pts: stroke.pts.map((point) => {
              const rotated = rotatePt({ x: sx + point.x * sw, y: sy + point.y * sh }, c, delta)
              return { x: (rotated.x - nx) / nw, y: (rotated.y - ny) / nh }
            })
          }))
        }
      } else {
        l.rot = nextRot
        syncGroupBounds()
      }
      redrawLines()
      drawHandles()
      drawRotationGuide(l, snapped, l.type === 'group' ? nextRot : undefined)
      return
    }
    redrawLines(); drawHandles()
  }

  const lineUp = (pt: Pt) => {
    if (baseTransformRef.current) {
      baseTransformRef.current = null
      redrawLines()
      drawHandles()
      pushHistory(['base:content'])
      return
    }
    const dr = lineDragRef.current
    lineDragRef.current = null
    resizeSnapLockRef.current = { width: false, height: false }
    if (!dr) return
    const l = linesRef.current.find((x) => x.id === dr.id)
    // Discard accidental zero-size creations.
    if (l && (dr.kind === 'create' || dr.kind === 'draw')) {
      const tooSmall = (l.type === 'poly' || l.type === 'shape')
        ? (dr.grab ? dist(dr.grab, pt) < 4 : true)
        : dist(flattenLine(l)[0], flattenLine(l)[flattenLine(l).length - 1]) < 3
      if (tooSmall && !(dr.kind === 'draw' && l.pts.length > 4)) {
        linesRef.current = linesRef.current.filter((x) => x.id !== dr.id)
        selectedIdRef.current = null
        setSelectedId(null)
        commitLines(linesRef.current)
        redrawLines(); clearPreview()
        return
      }
    }
    // Drawn freehand: always keep the final cursor position, then optionally
    // resample to a fixed adjustable-point count (overrides distance/default).
    if (l && dr.kind === 'draw' && l.type === 'drawn') {
      const last = l.pts[l.pts.length - 1]
      if (!last || dist(last, pt) > 0.5) l.pts.push(pt)
      const n = Number(drawnPointCount)
      if (drawnPointCount.trim() !== '' && n >= 2) {
        l.pts = resampleAlong(l.pts, Math.max(2, Math.min(200, Math.round(n))))
      }
    }
    syncGroupBounds()
    commitLines([...linesRef.current])
    redrawLines(); drawHandles()
    pushHistory()
  }

  /** Continue a vector drag after mousedown on an HTML overlay (above the textarea). */
  const beginWindowDrag = () => {
    startPointerDragCapture()
  }

  const stopPointerDragCapture = () => {
    pointerDragCleanupRef.current?.()
    pointerDragCleanupRef.current = null
  }

  /**
   * Track mousemove/mouseup on window so drawing keeps following the cursor when
   * it leaves the canvas (and so mouseup outside the canvas still finishes the stroke).
   */
  const startPointerDragCapture = () => {
    stopPointerDragCapture()
    const onWinMove = (ev: MouseEvent) => {
      shiftHeldRef.current = ev.shiftKey
      handlePointerMoveRef.current(clientToCanvas(ev))
    }
    const onWinUp = (ev: MouseEvent) => {
      shiftHeldRef.current = ev.shiftKey
      stopPointerDragCapture()
      handlePointerUpRef.current(clientToCanvas(ev))
    }
    window.addEventListener('mousemove', onWinMove)
    window.addEventListener('mouseup', onWinUp)
    pointerDragCleanupRef.current = () => {
      window.removeEventListener('mousemove', onWinMove)
      window.removeEventListener('mouseup', onWinUp)
    }
  }

  const handlePointerMoveRef = useRef<(pt: Pt) => void>(() => {})
  const handlePointerUpRef = useRef<(pt: Pt) => void>(() => {})

  // Reset transient preview / polygon state whenever the tool changes.
  // Leaving Select finalizes temporary marquee pixels back onto their source layers.
  const prevToolRef = useRef(tool)
  useEffect(() => {
    const prev = prevToolRef.current
    prevToolRef.current = tool
    stopPointerDragCapture()
    baseTransformRef.current = null
    if (prev === 'select' && tool !== 'select') {
      if (!floatRef.current && marqueeRef.current) {
        clipActionsRef.current.liftMarquee()
      }
      if (floatRef.current) clipActionsRef.current.commitFloat()
      marqueeRef.current = null
      marqueeStartRef.current = null
      setHasMarquee(false)
    }
    if (textEditIdRef.current) endTextEditRef.current()
    clearPreview()
    polyPts.current = []
    lineDragRef.current = null
    objectPaintStrokeRef.current = null
    drawing.current = false
    if (
      tool !== 'line' && tool !== 'freepoly' && tool !== 'pointer' &&
      tool !== 'text' && tool !== 'brush' && tool !== 'eraser' && tool !== 'fill'
    ) {
      selectedIdRef.current = null
      setSelectedId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  useEffect(() => () => stopPointerDragCapture(), [])

  // Keep the line overlay + handles in sync with line/selection/tool state.
  useEffect(() => {
    const sel = linesRef.current.find((l) => l.id === selectedIdRef.current)
    if (sel && !isVectorVisible(sel)) {
      selectedIdRef.current = null
      setSelectedId(null)
      setSelectedLayerIds((prev) => {
        const next = new Set(prev)
        for (const id of prev) {
          const item = linesRef.current.find((l) => l.id === id)
          if (!item || !isVectorVisible(item)) next.delete(id)
        }
        return next
      })
      clearPreview()
    }
    redrawLines()
    if (floatRef.current) drawSelOverlay()
    else if (tool === 'pointer') drawHandles()
    else clearPreview()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, selectedId, tool])

  // Fingerprint of every visibility checkbox. Remounting the display canvas on
  // change defeats Chromium's transformed-layer bitmap cache (stale frames after
  // uncheck). When nothing is visible, CSS-hide the canvas so the checkerboard
  // always shows through even if a GPU texture lags one frame.
  const layerVisibilitySig = useMemo(() => {
    const bases = `${editContent ? 1 : 0}:${editContainer && containerUsable ? 1 : 0}`
    const objects = lines
      .map((l) => `${l.id}:${(l.visible ?? l.editable ?? true) === false ? 0 : 1}:${l.parentId ?? ''}:${l.marqueeItem ? 1 : 0}`)
      .join('|')
    return `${bases}::${objects}`
  }, [editContent, editContainer, containerUsable, lines])
  const anythingLayerVisible = useMemo(() => {
    if (editContent || (editContainer && containerUsable)) return true
    return lines.some((l) =>
      !l.marqueeItem && (l.visible ?? l.editable ?? true) !== false
    )
  }, [editContent, editContainer, containerUsable, lines])

  // Keep object overlays refreshed when base-layer editability changes.
  useEffect(() => {
    const containerVisible = editContainer && containerUsable
    // A lifted marquee temporarily owns pixels removed from every checked
    // source canvas. Finalize it before hiding either source so toggling a
    // layer can never permanently discard those pixels.
    if (
      floatRef.current &&
      (
        (!editContent && floatRef.current.sourceLayer === 'content') ||
        (!containerVisible && floatRef.current.sourceLayer === 'container')
      )
    ) {
      clipActionsRef.current.commitFloat()
    }
    const sel = linesRef.current.find((l) => l.id === selectedIdRef.current)
    if (sel && !isVectorVisible(sel)) {
      selectedIdRef.current = null
      setSelectedId(null)
    }
    clearPreview()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editContainer, editContent, containerUsable])

  // Paint after the display canvas remounts on a visibility change (new ref).
  useLayoutEffect(() => {
    clearPreview()
    redrawLinesRef.current()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerVisibilitySig])

  const strokeStyleFor = (ctx: CanvasRenderingContext2D) => {
    const c = pixelColor(color)
    ctx.lineWidth = size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = c
    ctx.fillStyle = c
  }

  // Flattened composite (eyedropper + save snapshot).
  // Order: live base → paint overlay → vectors per stack slot.
  const compositeCanvas = (): HTMLCanvasElement => {
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const x = c.getContext('2d')!
    for (const id of [...layerOrderRef.current].reverse()) {
      if (layerIsEditable(id)) drawBaseAndOverlay(x, id)
      for (const l of linesRef.current) {
        if (l.parentId || vectorLayerOf(l) !== id) continue
        renderObjectTree(x, l, linesRef.current, isVectorVisible)
      }
    }
    return c
  }

  /**
   * Overlays + vectors only (no live bases) for outside preview/export.
   * Skip linkedOutsideText / contentBound — those stay as live Inner settings
   * outside so size/offset/shadow/text edits update without re-opening Paint.
   * When `layer` is set, only that paint stack is included.
   */
  const decorationsCanvas = (layer?: PaintLayerId): HTMLCanvasElement => {
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const x = c.getContext('2d')!
    const show = (l: LineObj) =>
      !l.linkedOutsideText &&
      !l.contentBound &&
      (l.visible ?? l.editable ?? true) !== false
    const ids = layer
      ? [layer]
      : [...layerOrderRef.current].reverse()
    for (const id of ids) {
      x.drawImage(layerCanvas(id), 0, 0)
      for (const l of linesRef.current) {
        if (l.parentId || vectorLayerOf(l) !== id) continue
        renderObjectTree(x, l, linesRef.current, show)
      }
    }
    return c
  }

  // ── Flood fill (single layer) ────────────────────────────────────────────────
  // Session vector items (lines/shapes/text drawn this session) act as walls so
  // fill stops at their strokes/fills instead of flooding the whole background.
  // Optional edge-clean pass fills thin anti-aliased / leftover outline fringes
  // next to the filled region, but skips thick opaque borders (designed on purpose).
  const fillStampPixels = (item: LineObj, canvasPoint: Pt): LineObj | null => {
    if (item.type !== 'stamp' || !item.imageDataUrl || item.pts.length < 2) return null
    const a = item.pts[0], b = item.pts[1]
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    const displayW = Math.max(1, Math.abs(b.x - a.x))
    const displayH = Math.max(1, Math.abs(b.y - a.y))
    const localPoint = rotatePt(canvasPoint, objCenter(item), -(item.rot ?? 0))
    if (
      localPoint.x < x || localPoint.y < y ||
      localPoint.x > x + displayW || localPoint.y > y + displayH
    ) return null

    const width = Math.max(1, Math.round(displayW))
    const height = Math.max(1, Math.round(displayH))
    // Use the stamp's stable committed image as the edit source. The resized
    // SVG preview may still be decoding and is only a presentation cache.
    const image = ensureStampImage(item.imageDataUrl)
    if (!image) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    const px = Math.max(0, Math.min(width - 1, Math.floor(((localPoint.x - x) / displayW) * width)))
    const py = Math.max(0, Math.min(height - 1, Math.floor(((localPoint.y - y) / displayH) * height)))
    const clickedIndex = (py * width + px) * 4
    const tr = data[clickedIndex], tg = data[clickedIndex + 1]
    const tb = data[clickedIndex + 2], ta = data[clickedIndex + 3]
    const fill = pixelColor(color)
    const fr = parseInt(fill.slice(1, 3), 16)
    const fg = parseInt(fill.slice(3, 5), 16)
    const fb = parseInt(fill.slice(5, 7), 16)
    const fa = parseInt(fill.slice(7, 9) || 'ff', 16)
    let changed = false

    if (ta > 2 && item.sourceSvgMarkup) {
      // Preserve vector quality when the user clicks an SVG stroke/fill.
      const sourceSvgMarkup = applySvgColor(item.sourceSvgMarkup, fill)
      const imageDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sourceSvgMarkup)}`
      ensureStampImage(imageDataUrl, () => redrawLinesRef.current())
      return { ...item, color: fill, sourceSvgMarkup, imageDataUrl }
    }

    if (ta > 2) {
      // Recolour every pixel belonging to the clicked colour slot. This catches
      // disconnected SVG strokes while leaving a differently-coloured interior.
      for (let i = 0; i < data.length; i += 4) {
        if (
          data[i + 3] > 0 &&
          Math.abs(data[i] - tr) + Math.abs(data[i + 1] - tg) + Math.abs(data[i + 2] - tb) <= 72
        ) {
          data[i] = fr; data[i + 1] = fg; data[i + 2] = fb
          data[i + 3] = Math.round((data[i + 3] * fa) / 255)
          changed = true
        }
      }
    } else {
      // Transparent clicks flood only their connected region. Opaque icon pixels
      // are barriers, so an outlined icon's inside and outside stay separate.
      const visited = new Uint8Array(width * height)
      const stack: number[] = [px, py]
      while (stack.length >= 2) {
        const cy = stack.pop()!
        const cx = stack.pop()!
        if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue
        const p = cy * width + cx
        if (visited[p]) continue
        visited[p] = 1
        const i = p * 4
        if (data[i + 3] > 2) continue
        data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = fa
        changed = true
        stack.push(cx - 1, cy, cx + 1, cy, cx, cy - 1, cx, cy + 1)
      }
    }

    if (!changed) return null
    ctx.putImageData(imageData, 0, 0)
    const imageDataUrl = canvas.toDataURL('image/png')
    ensureStampImage(imageDataUrl, () => redrawLinesRef.current())
    return {
      ...item,
      imageDataUrl,
      color: fill,
      // Pixel fill makes this stamp a raster-edited object. Keeping the old SVG
      // would overwrite the edit during the next resize/redraw.
      sourceSvgMarkup: undefined,
      sourceStampSize: undefined,
      keepStrokeOnResize: undefined
    }
  }

  const fillSelectedObjectLayer = (canvasPoint: Pt): boolean => {
    // Fill follows the clicked icon even when it was not selected beforehand.
    const clickedStamp = [...linesRef.current].reverse().find((item) => {
      if (item.type !== 'stamp' || !isVectorVisible(item) || item.pts.length < 2) return false
      const local = rotatePt(canvasPoint, objCenter(item), -(item.rot ?? 0))
      return pointInRect(item.pts[0], item.pts[1], local)
    })
    const selected = clickedStamp ??
      linesRef.current.find((item) => item.id === selectedIdRef.current)
    if (!selected || !isVectorVisible(selected)) return false
    const target = checkedGroupTarget(selected) ?? selected
    const targetIds = target.type === 'group'
      ? descendantIds(target.id)
      : new Set([target.id])
    const fillColor = firstSolidColor(color)
    const imageUrls: string[] = []
    let changed = false

    const next = linesRef.current.map((item): LineObj => {
      if (!targetIds.has(item.id) || item.type === 'group') return item
      if (item.type === 'stamp') {
        const filled = fillStampPixels(item, canvasPoint)
        if (!filled) return item
        imageUrls.push(filled.imageDataUrl ?? '')
        changed = true
        return filled
      }
      changed = true
      if (item.type === 'shape' || item.type === 'poly') {
        return { ...item, color: fillColor, fill: true }
      }
      return { ...item, color: fillColor, borderColor: fillColor }
    })

    if (!changed) return false
    commitLines(next)
    for (const url of imageUrls) ensureStampImage(url, () => redrawLinesRef.current())
    redrawLines()
    drawHandles()
    pushHistory()
    return true
  }

  const recolorAllOpaque = (ctx: CanvasRenderingContext2D) => {
    const img = ctx.getImageData(0, 0, W, H)
    const data = img.data
    const fill = pixelColor(color)
    const fr = parseInt(fill.slice(1, 3), 16)
    const fg = parseInt(fill.slice(3, 5), 16)
    const fb = parseInt(fill.slice(5, 7), 16)
    const fa = parseInt(fill.slice(7, 9) || 'ff', 16)
    // Tint RGB to the fill colour; keep each pixel's alpha so soft edges stay soft.
    // Fully transparent pixels are left alone.
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue
      data[i] = fr
      data[i + 1] = fg
      data[i + 2] = fb
      // When fill colour has reduced alpha, scale existing alpha so the silhouette
      // still respects soft edges while adopting the fill opacity.
      data[i + 3] = Math.round((data[i + 3] * fa) / 255)
    }
    ctx.putImageData(img, 0, 0)
  }

  /**
   * Flood-fill the paint overlay. Matching uses live base + overlay appearance
   * so clicks on the visible icon work; writes go only into the overlay.
   */
  const floodFill = (ctx: CanvasRenderingContext2D, sx: number, sy: number, underlay?: HTMLCanvasElement | null) => {
    const overlayImg = ctx.getImageData(0, 0, W, H)
    const overlay = overlayImg.data
    // Sample/match against what the user sees (base under overlay).
    const sampleCanvas = document.createElement('canvas')
    sampleCanvas.width = W
    sampleCanvas.height = H
    const sampleCtx = sampleCanvas.getContext('2d')!
    if (underlay) sampleCtx.drawImage(underlay, 0, 0)
    sampleCtx.drawImage(ctx.canvas, 0, 0)
    const data = sampleCtx.getImageData(0, 0, W, H).data
    const px = Math.floor(sx), py = Math.floor(sy)
    if (px < 0 || py < 0 || px >= W || py >= H) return

    // Only object layers are walls. Including the target base canvas here made
    // its own opaque line pixels unclickable, so Inner content strokes could
    // never be recoloured. Render roots recursively to remain safe for groups.
    const wallCanvas = document.createElement('canvas')
    wallCanvas.width = W
    wallCanvas.height = H
    const wallCtx = wallCanvas.getContext('2d')!
    for (const root of linesRef.current) {
      if (root.parentId || root.marqueeItem) continue
      renderObjectTree(wallCtx, root, linesRef.current, isVectorVisible)
    }
    const wall = wallCtx.getImageData(0, 0, W, H).data
    const isWall = (i: number) => wall[i + 3] > 20

    const idx = (py * W + px) * 4
    if (isWall(idx)) return // clicked on a vector wall
    const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3]
    const fill = pixelColor(color)
    const fr = parseInt(fill.slice(1, 3), 16)
    const fg = parseInt(fill.slice(3, 5), 16)
    const fb = parseInt(fill.slice(5, 7), 16)
    const fa = parseInt(fill.slice(7, 9) || 'ff', 16)

    const tol = 32
    // Same / near-same colour — nothing to do (also prevents an infinite loop if
    // painted pixels would still match the target within tolerance).
    if (
      Math.abs(fr - tr) <= tol &&
      Math.abs(fg - tg) <= tol &&
      Math.abs(fb - tb) <= tol &&
      Math.abs(fa - ta) <= tol
    ) return

    const rgbDist = (i: number, r: number, g: number, b: number) =>
      Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b)

    const filled = new Uint8Array(W * H)
    const paintAt = (i: number, p: number) => {
      data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = fa
      overlay[i] = fr; overlay[i + 1] = fg; overlay[i + 2] = fb; overlay[i + 3] = fa
      filled[p] = 1
    }

    // Must check `filled` — after painting, a near-target fill colour can still
    // satisfy the colour match and re-enqueue forever (app hang).
    const matchXY = (x: number, y: number): boolean => {
      const p = y * W + x
      if (filled[p]) return false
      const i = p * 4
      if (isWall(i)) return false
      return (
        Math.abs(data[i] - tr) <= tol &&
        Math.abs(data[i + 1] - tg) <= tol &&
        Math.abs(data[i + 2] - tb) <= tol &&
        Math.abs(data[i + 3] - ta) <= tol
      )
    }

    const stack: number[] = [px, py]
    // Safety: never visit more than the canvas pixel count.
    let painted = 0
    const maxPaint = W * H
    while (stack.length >= 2 && painted < maxPaint) {
      const y = stack.pop()!
      const x = stack.pop()!
      if (x < 0 || y < 0 || x >= W || y >= H || !matchXY(x, y)) continue

      let ny = y
      while (ny > 0 && matchXY(x, ny - 1)) ny--

      let spanLeft = false
      let spanRight = false
      for (; ny < H && matchXY(x, ny); ny++) {
        paintAt((ny * W + x) * 4, ny * W + x)
        painted++
        if (x > 0) {
          if (matchXY(x - 1, ny)) {
            if (!spanLeft) { stack.push(x - 1, ny); spanLeft = true }
          } else spanLeft = false
        }
        if (x < W - 1) {
          if (matchXY(x + 1, ny)) {
            if (!spanRight) { stack.push(x + 1, ny); spanRight = true }
          } else spanRight = false
        }
      }
    }

    if (fillCleanEdges) {
      // Pass 2–3: absorb anti-aliased fringes and thin leftover outline rings
      // next to the filled area. Thick opaque bands of a different color stay.
      const fringeTol = 110
      const opaqueA = 210
      const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

      const isThinLeftoverOutline = (x: number, y: number, i: number): boolean => {
        if (data[i + 3] < opaqueA) return false
        if (rgbDist(i, fr, fg, fb) <= 24) return false
        if (rgbDist(i, tr, tg, tb) <= fringeTol) return false // handled as fringe
        // Must sit against the filled region
        let toward: [number, number] | null = null
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          if (filled[ny * W + nx]) { toward = [dx, dy]; break }
        }
        if (!toward) return false
        // Measure how thick this same-colour band is walking away from the fill
        const ox = -toward[0], oy = -toward[1]
        const br = data[i], bg0 = data[i + 1], bb = data[i + 2]
        let thickness = 1
        for (let s = 1; s <= 5; s++) {
          const nx = x + ox * s, ny = y + oy * s
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) break
          const ni = (ny * W + nx) * 4
          const same =
            Math.abs(data[ni] - br) + Math.abs(data[ni + 1] - bg0) + Math.abs(data[ni + 2] - bb) <= 48 &&
            data[ni + 3] >= opaqueA * 0.65
          if (!same) break
          thickness++
        }
        // Thin rings (1–2px) are leftover outlines; thicker = designed border
        return thickness <= 2
      }

      const isFringe = (x: number, y: number, i: number): boolean => {
        if (isWall(i)) return false
        const a = data[i + 3]
        const dRgb = rgbDist(i, tr, tg, tb)
        const dFull = dRgb + Math.abs(a - ta)
        // Semi-transparent or near-target AA fringe
        if (dFull <= fringeTol) return true
        if (a < opaqueA && dRgb <= fringeTol) return true
        // Thin solid leftover outline of a different colour
        if (isThinLeftoverOutline(x, y, i)) return true
        return false
      }

      for (let pass = 0; pass < 3; pass++) {
        const queue: number[] = []
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const p = y * W + x
            if (filled[p]) continue
            let adj = false
            for (const [dx, dy] of dirs) {
              const nx = x + dx, ny = y + dy
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
              if (filled[ny * W + nx]) { adj = true; break }
            }
            if (!adj) continue
            const i = p * 4
            if (isFringe(x, y, i)) queue.push(p)
          }
        }
        if (!queue.length) break
        for (const p of queue) paintAt(p * 4, p)
      }

      // Thin session outlines that contain the click: match fill colour so the
      // vector stroke doesn't remain a different-coloured ring. Thicker strokes
      // (≥ 4px) are treated as designed borders and left alone.
      const click = { x: px, y: py }
      let vectorChanged = false
      for (const l of linesRef.current) {
        if (l.type !== 'poly' && l.type !== 'shape') continue
        if ((lineBorderWidth(l) || 1) >= 4) continue
        const inside = l.type === 'poly'
          ? pointInPoly(l.pts, click)
          : pointInRect(l.pts[0], l.pts[1], click)
        if (!inside) continue
        if (l.color !== fill) {
          l.color = fill
          vectorChanged = true
        }
      }
      if (vectorChanged) {
        commitLines([...linesRef.current])
        redrawLines()
        drawHandles()
      }
    }

    // Grow fill 1px into soft / near-edge underlay pixels so live-base outlines
    // cannot peek through when the overlay is scaled outside Paint.
    {
      const grow: number[] = []
      const dirs4: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const p = y * W + x
          if (!filled[p]) continue
          for (const [dx, dy] of dirs4) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const np = ny * W + nx
            if (filled[np]) continue
            const i = np * 4
            if (isWall(i)) continue
            const a = data[i + 3]
            if (a < 10) continue
            const dRgb = rgbDist(i, tr, tg, tb)
            const nearFill = rgbDist(i, fr, fg, fb) <= 40
            // Soft AA fringe or near the original / fill colour only — do not
            // bleed into solid neighbouring regions of a different colour.
            if (a < 220 || dRgb <= 110 || nearFill) grow.push(np)
          }
        }
      }
      for (const p of grow) {
        if (!filled[p]) paintAt(p * 4, p)
      }
    }

    ctx.putImageData(overlayImg, 0, 0)
  }

  const eyedrop = (sx: number, sy: number) => {
    const ctx = compositeCanvas().getContext('2d')!
    const d = ctx.getImageData(Math.floor(sx), Math.floor(sy), 1, 1).data
    const hex =
      '#' +
      [d[0], d[1], d[2], d[3]].map((v) => v.toString(16).padStart(2, '0')).join('')
    setColor(hex)
    setHexText(hex)
  }

  const finishPolygon = () => {
    const pts = polyPts.current
    if (pts.length < 2) { polyPts.current = []; clearPreview(); return }
    // Create an editable vector polygon (so it can be re-selected/edited) rather
    // than rasterizing it straight onto the layers.
    const nl: LineObj = {
      id: genId(),
      type: 'poly',
      pts: pts.map((p) => ({ ...p })),
      startCap: 'none',
      endCap: 'none',
      dash: lineDash,
      thickness: size,
      color,
      fill: shapeFill,
      borderColor,
      borderWidth: size,
      borderRadius,
      keepStrokeOnResize,
      layer: activeAddLayer()
    }
    linesRef.current = [...linesRef.current, nl]
    polyPts.current = []
    clearPreview()
    selectLine(nl)
    commitLines([...linesRef.current])
    redrawLines(); drawHandles()
    pushHistory()
  }
  finishPolygonRef.current = finishPolygon

  const drawPolyPreview = (cur?: { x: number; y: number }) => {
    const p = previewRef.current!.getContext('2d')!
    clearPreview()
    const pts = polyPts.current
    if (!pts.length) return
    strokeStyleFor(p)
    p.beginPath()
    p.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y)
    if (cur) p.lineTo(cur.x, cur.y)
    p.stroke()
    p.fillStyle = '#ffffff'
    for (const pt of pts) { p.beginPath(); p.arc(pt.x, pt.y, 3, 0, Math.PI * 2); p.fill() }
  }

  // ── Copy / paste ─────────────────────────────────────────────────────────────
  const CORNER_HIT = 10
  type Corner = 'nw' | 'ne' | 'sw' | 'se'
  const snapResizePointToCanvasEdges = (pt: Pt, corner: Corner): Pt => {
    const screenRect = previewRef.current?.getBoundingClientRect()
    const threshold = 6 * (screenRect?.width ? W / screenRect.width : 1)
    const west = corner === 'nw' || corner === 'sw'
    const north = corner === 'nw' || corner === 'ne'
    return {
      x: west
        ? (pt.x <= threshold ? 0 : pt.x)
        : (pt.x >= W - threshold ? W : pt.x),
      y: north
        ? (pt.y <= threshold ? 0 : pt.y)
        : (pt.y >= H - threshold ? H : pt.y)
    }
  }
  const resizeEdgeGuide = (
    rect: { x: number; y: number; w: number; h: number },
    corner: Corner
  ): AlignmentSnap => {
    const west = corner === 'nw' || corner === 'sw'
    const north = corner === 'nw' || corner === 'ne'
    const xAt: AlignmentPoint | null = west
      ? (Math.abs(rect.x) < 0.75 ? 'start' : null)
      : (Math.abs(rect.x + rect.w - W) < 0.75 ? 'end' : null)
    const yAt: AlignmentPoint | null = north
      ? (Math.abs(rect.y) < 0.75 ? 'start' : null)
      : (Math.abs(rect.y + rect.h - H) < 0.75 ? 'end' : null)
    return { dx: 0, dy: 0, x: !!xAt, y: !!yAt, xAt, yAt }
  }
  const cornersOf = (x: number, y: number, w: number, h: number) => ({
    nw: { x, y },
    ne: { x: x + w, y },
    sw: { x, y: y + h },
    se: { x: x + w, y: y + h }
  } as const)
  const hitCorner = (x: number, y: number, w: number, h: number, pt: Pt): Corner | null => {
    const c = cornersOf(x, y, w, h)
    for (const k of ['nw', 'ne', 'sw', 'se'] as const) {
      if (dist(pt, c[k]) <= CORNER_HIT) return k
    }
    return null
  }
  const resizeRect = (
    corner: Corner,
    start: { x: number; y: number; w: number; h: number },
    pt: Pt,
    lockAspect = false
  ): { x: number; y: number; w: number; h: number } => {
    if (lockAspect && start.w >= 4 && start.h >= 4) {
      const aspect = start.w / start.h
      let fixedX: number
      let fixedY: number
      if (corner === 'se') { fixedX = start.x; fixedY = start.y }
      else if (corner === 'sw') { fixedX = start.x + start.w; fixedY = start.y }
      else if (corner === 'ne') { fixedX = start.x; fixedY = start.y + start.h }
      else { fixedX = start.x + start.w; fixedY = start.y + start.h }

      let w = Math.abs(pt.x - fixedX)
      let h = Math.abs(pt.y - fixedY)
      if (w / aspect > h) h = w / aspect
      else w = h * aspect

      // Keep the resized box inside the canvas. The opposite corner remains fixed.
      const growsRight = corner === 'se' || corner === 'ne'
      const growsDown = corner === 'se' || corner === 'sw'
      const maxW = Math.max(0, growsRight ? W - fixedX : fixedX)
      const maxH = Math.max(0, growsDown ? H - fixedY : fixedY)
      const fit = Math.min(1, maxW / Math.max(1, w), maxH / Math.max(1, h))
      w *= fit
      h *= fit
      // Keep a 4px minimum where space permits without ever crossing an edge.
      const minW = Math.min(4, maxW, maxH * aspect)
      w = Math.max(minW, w)
      h = w / aspect

      if (corner === 'se') return { x: fixedX, y: fixedY, w, h }
      if (corner === 'sw') return { x: fixedX - w, y: fixedY, w, h }
      if (corner === 'ne') return { x: fixedX, y: fixedY - h, w, h }
      return { x: fixedX - w, y: fixedY - h, w, h }
    }

    // The dragged corner may touch, but never pass, a canvas edge.
    const bounded = {
      x: Math.max(0, Math.min(W, pt.x)),
      y: Math.max(0, Math.min(H, pt.y))
    }
    let x = start.x, y = start.y, w = start.w, h = start.h
    if (corner === 'nw') { w = start.x + start.w - bounded.x; h = start.y + start.h - bounded.y; x = bounded.x; y = bounded.y }
    else if (corner === 'ne') { w = bounded.x - start.x; h = start.y + start.h - bounded.y; y = bounded.y }
    else if (corner === 'sw') { w = start.x + start.w - bounded.x; h = bounded.y - start.y; x = bounded.x }
    else { w = bounded.x - start.x; h = bounded.y - start.y }
    if (w < 4) { if (corner === 'nw' || corner === 'sw') x = start.x + start.w - 4; w = 4 }
    if (h < 4) { if (corner === 'nw' || corner === 'ne') y = start.y + start.h - 4; h = 4 }
    return { x, y, w, h }
  }

  type HalfSizeSnap = {
    rect: { x: number; y: number; w: number; h: number }
    width: boolean
    height: boolean
  }
  /** Snap resized selections near 50% of the canvas width or height. */
  const snapResizeToHalfCanvas = (
    rect: { x: number; y: number; w: number; h: number },
    corner: Corner,
    start: { x: number; y: number; w: number; h: number },
    lockAspect: boolean
  ): HalfSizeSnap => {
    const screenRect = previewRef.current?.getBoundingClientRect()
    const scale = screenRect?.width ? W / screenRect.width : 1
    const threshold = 10 * scale
    const releaseThreshold = 22 * scale
    const targetW = W / 2
    const targetH = H / 2
    const widthNear = Math.abs(rect.w - targetW) <= (
      resizeSnapLockRef.current.width ? releaseThreshold : threshold
    )
    const heightNear = Math.abs(rect.h - targetH) <= (
      resizeSnapLockRef.current.height ? releaseThreshold : threshold
    )
    const fixedX = corner === 'se' || corner === 'ne' ? start.x : start.x + start.w
    const fixedY = corner === 'se' || corner === 'sw' ? start.y : start.y + start.h
    const place = (w: number, h: number) => ({
      x: corner === 'nw' || corner === 'sw' ? fixedX - w : fixedX,
      y: corner === 'nw' || corner === 'ne' ? fixedY - h : fixedY,
      w,
      h
    })
    const fits = (r: { x: number; y: number; w: number; h: number }) =>
      r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H

    if (lockAspect && start.w > 0 && start.h > 0) {
      const aspect = start.w / start.h
      const options: { rect: typeof rect; width: boolean; height: boolean; error: number }[] = []
      if (widthNear) {
        const candidate = place(targetW, targetW / aspect)
        if (fits(candidate)) options.push({
          rect: candidate,
          width: true,
          height: Math.abs(candidate.h - targetH) < 0.5,
          error: Math.abs(rect.w - targetW)
        })
      }
      if (heightNear) {
        const candidate = place(targetH * aspect, targetH)
        if (fits(candidate)) options.push({
          rect: candidate,
          width: Math.abs(candidate.w - targetW) < 0.5,
          height: true,
          error: Math.abs(rect.h - targetH)
        })
      }
      if (options.length) {
        options.sort((a, b) => a.error - b.error)
        resizeSnapLockRef.current.width = options[0].width
        resizeSnapLockRef.current.height = options[0].height
        return options[0]
      }
      resizeSnapLockRef.current = { width: false, height: false }
      return { rect, width: false, height: false }
    }

    let next = rect
    let width = false
    let height = false
    if (widthNear) {
      const candidate = place(targetW, next.h)
      if (fits(candidate)) { next = candidate; width = true }
    }
    if (heightNear) {
      const candidate = place(next.w, targetH)
      if (fits(candidate)) { next = candidate; height = true }
    }
    resizeSnapLockRef.current = { width, height }
    return { rect: next, width, height }
  }

  const drawHalfSizeGuides = (
    rect: { x: number; y: number; w: number; h: number },
    snap: Pick<HalfSizeSnap, 'width' | 'height'>
  ) => {
    if (!snap.width && !snap.height) return
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    const screenRect = previewRef.current?.getBoundingClientRect()
    const scale = screenRect?.width ? W / screenRect.width : 1
    p.save()
    p.strokeStyle = '#ec4899'
    p.fillStyle = '#ec4899'
    p.lineWidth = Math.max(1, 1.25 * scale)
    p.setLineDash([5 * scale, 4 * scale])
    p.font = `600 ${11 * scale}px Inter, sans-serif`
    if (snap.width) {
      p.beginPath()
      p.moveTo(rect.x, 0)
      p.lineTo(rect.x, H)
      p.moveTo(rect.x + rect.w, 0)
      p.lineTo(rect.x + rect.w, H)
      p.stroke()
      p.textAlign = 'center'
      p.textBaseline = 'top'
      p.fillText('50% width', rect.x + rect.w / 2, 7 * scale)
    }
    if (snap.height) {
      p.beginPath()
      p.moveTo(0, rect.y)
      p.lineTo(W, rect.y)
      p.moveTo(0, rect.y + rect.h)
      p.lineTo(W, rect.y + rect.h)
      p.stroke()
      p.textAlign = 'left'
      p.textBaseline = 'middle'
      p.fillText('50% height', 7 * scale, rect.y + rect.h / 2)
    }
    p.restore()
  }

  const scaleFloatTo = (
    f: {
      canvas: HTMLCanvasElement
      x: number
      y: number
      source?: HTMLCanvasElement
      selectable?: boolean
      sourceLayer?: PaintLayerId
      layerCanvases?: {
        layer: PaintLayerId
        canvas: HTMLCanvasElement
        source: HTMLCanvasElement
      }[]
      vectorState?: {
        originalLines: LineObj[]
        selectedIds: string[]
        sourceRect: { x: number; y: number; w: number; h: number }
      }
    },
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    const nw = Math.max(4, Math.round(w))
    const nh = Math.max(4, Math.round(h))
    if (!f.source) f.source = cloneCanvas(f.canvas)
    const src = f.source
    const canvas = document.createElement('canvas')
    canvas.width = nw
    canvas.height = nh
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, 0, 0, nw, nh)
    f.canvas = canvas
    if (f.layerCanvases) {
      for (const item of f.layerCanvases) {
        const scaled = document.createElement('canvas')
        scaled.width = nw
        scaled.height = nh
        const scaledCtx = scaled.getContext('2d')!
        scaledCtx.imageSmoothingEnabled = true
        scaledCtx.imageSmoothingQuality = 'high'
        scaledCtx.drawImage(item.source, 0, 0, nw, nh)
        item.canvas = scaled
      }
    }
    f.x = Math.max(0, Math.min(W - nw, Math.round(x)))
    f.y = Math.max(0, Math.min(H - nh, Math.round(y)))
  }

  const drawSelOverlay = () => {
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    p.clearRect(0, 0, W, H)
    const box = (x: number, y: number, w: number, h: number, scaled: boolean) => {
      p.save()
      p.lineWidth = 1.5
      p.setLineDash([6, 4])
      p.strokeStyle = 'rgba(0,0,0,0.55)'
      p.strokeRect(x + 0.5, y + 0.5, w, h)
      p.strokeStyle = scaled ? '#f59e0b' : '#3b82f6'
      p.lineDashOffset = 3
      p.strokeRect(x + 0.5, y + 0.5, w, h)
      p.restore()
      p.save()
      for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        p.fillStyle = '#ffffff'
        p.strokeStyle = scaled ? '#f59e0b' : '#3b82f6'
        p.lineWidth = 2
        p.setLineDash([])
        p.beginPath()
        p.arc(cx, cy, 5, 0, Math.PI * 2)
        p.fill()
        p.stroke()
      }
      p.restore()
    }
    const f = floatRef.current
    if (f) { p.drawImage(f.canvas, f.x, f.y); box(f.x, f.y, f.canvas.width, f.canvas.height, true); return }
    const m = marqueeRef.current
    if (m) box(m.x, m.y, m.w, m.h, false)
  }

  nudgeSelectedRef.current = (dx, dy) => {
    const f = floatRef.current
    if (f) {
      f.x += dx
      f.y += dy
      drawSelOverlay()
      return
    }
    const m = marqueeRef.current
    if (m && !selectedIdRef.current) {
      m.x += dx
      m.y += dy
      drawSelOverlay()
      return
    }
    if (!selectedIdRef.current) return
    updateSelectedLive((l) => ({
      pts: l.pts.map((p) => ({ x: p.x + dx, y: p.y + dy }))
    }))
  }

  nudgeEraserRef.current = (dx, dy) => {
    if (!drawing.current) return
    const from = lastPt.current
    const to = {
      x: Math.max(0, Math.min(W, from.x + dx)),
      y: Math.max(0, Math.min(H, from.y + dy))
    }
    if (to.x === from.x && to.y === from.y) {
      drawEraserCursor(to)
      return
    }
    const c = pixelColor(color)
    const activeObjectStroke = objectPaintStrokeRef.current
    if (activeObjectStroke) {
      const l = linesRef.current.find((item) => item.id === activeObjectStroke.id)
      const stroke = l?.paintStrokes?.[activeObjectStroke.index]
      if (l && stroke) {
        stroke.pts.push(shapeLocalPaintPoint(l, to))
        redrawLines()
      }
    } else {
      for (const ctx of targetCtxs()) {
        strokeBrushTip(ctx, eraserTip, from.x, from.y, to.x, to.y, size, c, true)
      }
      redrawLines()
    }
    lastPt.current = to
    eraserArrowLockedRef.current = true
    drawEraserCursor(to)
  }

  // Composite of ALL currently-checked editable layers — used for marquee copy/lift.
  const compositeTargets = (): HTMLCanvasElement => {
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const x = c.getContext('2d')!
    for (const canvas of targetCanvases()) x.drawImage(canvas, 0, 0)
    return c
  }

  /** Fit a multi-object marquee to the exact visible bounds of touched selected layers. */
  const fitMarqueeToSelectedLayers = (
    marquee: { x: number; y: number; w: number; h: number }
  ): boolean => {
    const selectedIds = new Set(
      [...selectedLayerIds].filter((id) => {
        const l = linesRef.current.find((item) => item.id === id)
        return !!l && !l.marqueeItem && isVectorVisible(l)
      })
    )
    if (selectedIds.size < 2) return false

    const hasSelectedAncestor = (l: LineObj): boolean => {
      let parentId = l.parentId
      while (parentId) {
        if (selectedIds.has(parentId)) return true
        parentId = linesRef.current.find((item) => item.id === parentId)?.parentId
      }
      return false
    }
    const intersects = (b: { x: number; y: number; w: number; h: number }): boolean =>
      b.x + b.w >= marquee.x && b.x <= marquee.x + marquee.w &&
      b.y + b.h >= marquee.y && b.y <= marquee.y + marquee.h
    const touched = linesRef.current.filter((l) =>
      selectedIds.has(l.id) && !hasSelectedAncestor(l) && intersects(boundsForLine(l))
    )
    if (!touched.length) return false

    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    for (const l of touched) {
      if (l.type === 'group') renderGroup(ctx, l, linesRef.current, isVectorVisible)
      else renderLine(ctx, l)
    }
    const data = ctx.getImageData(0, 0, W, H).data
    let left = W, top = H, right = -1, bottom = -1
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] === 0) continue
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
    if (right < left || bottom < top) return false
    marquee.x = left
    marquee.y = top
    marquee.w = right - left + 1
    marquee.h = bottom - top + 1
    return true
  }

  const cloneCanvas = (src: HTMLCanvasElement): HTMLCanvasElement => {
    const c = document.createElement('canvas')
    c.width = src.width; c.height = src.height
    c.getContext('2d')!.drawImage(src, 0, 0)
    return c
  }

  const rasterizeFloatToOriginalLayers = (
    f: NonNullable<typeof floatRef.current>
  ) => {
    if (f.layerCanvases?.length) {
      for (const item of f.layerCanvases) {
        layerCanvas(item.layer)?.getContext('2d')?.drawImage(item.canvas, f.x, f.y)
      }
      return
    }
    topEditableCtx()?.drawImage(f.canvas, f.x, f.y)
  }

  const restoreTransformedMarqueeVectors = (
    f: NonNullable<typeof floatRef.current>
  ) => {
    const state = f.vectorState
    if (!state) return
    const sx = f.canvas.width / Math.max(1, state.sourceRect.w)
    const sy = f.canvas.height / Math.max(1, state.sourceRect.h)
    const strokeScale = Math.min(Math.abs(sx), Math.abs(sy))
    const selected = new Set(state.selectedIds)
    const next = cloneLines(state.originalLines).map((line) => {
      if (!selected.has(line.id)) return line
      line.pts = line.pts.map((point) => ({
        x: f.x + (point.x - state.sourceRect.x) * sx,
        y: f.y + (point.y - state.sourceRect.y) * sy
      }))
      if (line.type === 'text') {
        line.fontSize = Math.max(1, (line.fontSize ?? 48) * strokeScale)
      }
      if (line.keepStrokeOnResize === false) {
        line.thickness = Math.max(0.1, line.thickness * strokeScale)
        if (line.borderWidth != null) {
          line.borderWidth = Math.max(0, line.borderWidth * strokeScale)
        }
      }
      return line
    })
    linesRef.current = next
    syncGroupBounds(next)
    commitLines(next)
  }

  const commitFloat = () => {
    const f = floatRef.current
    if (!f) return
    if (f.selectable) {
      const dataUrl = f.canvas.toDataURL('image/png')
      ensureStampImage(dataUrl)
      const nl: LineObj = {
        id: genId(),
        type: 'stamp',
        pts: [
          { x: f.x, y: f.y },
          { x: f.x + f.canvas.width, y: f.y + f.canvas.height }
        ],
        startCap: 'none',
        endCap: 'none',
        dash: 'solid',
        thickness: 0,
        color: '#000000ff',
        imageDataUrl: dataUrl,
        stampSource: 'image',
        marqueeItem: !!f.sourceLayer,
        layer: f.sourceLayer ?? activeAddLayer()
      }
      floatRef.current = null
      marqueeRef.current = null
      setHasMarquee(false)
      linesRef.current = [...linesRef.current, nl]
      commitLines(linesRef.current)
      selectLine(nl)
      // Finalized marquee content is now a normal object. Pointer mode is the
      // only mode allowed to manipulate normal objects.
      if (tool !== 'pointer') setTool('pointer')
      redrawLines()
      drawHandles()
      pushHistory()
      return
    }
    // Temporary marquee edits return to their original raster canvases.
    rasterizeFloatToOriginalLayers(f)
    restoreTransformedMarqueeVectors(f)
    floatRef.current = null
    setHasMarquee(false)
    drawSelOverlay()
    redrawLines()
    pushHistory()
  }

  // Lift marquee pixels into a floating selection (clears them from editable layers).
  const liftMarquee = () => {
    const m = marqueeRef.current
    if (!m || m.w < 3 || m.h < 3) { marqueeRef.current = null; setHasMarquee(false); drawSelOverlay(); return }
    const x = Math.round(m.x), y = Math.round(m.y), w = Math.round(m.w), h = Math.round(m.h)
    const activeLayers = [...layerOrderRef.current].reverse().filter(layerIsEditable)
    const layerCanvases = activeLayers.map((layer) => {
      const cropped = document.createElement('canvas')
      cropped.width = w
      cropped.height = h
      const sourceCanvas = layerCanvas(layer)
      if (sourceCanvas) cropped.getContext('2d')!.drawImage(sourceCanvas, x, y, w, h, 0, 0, w, h)
      return { layer, canvas: cropped, source: cloneCanvas(cropped) }
    })
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const compositeCtx = canvas.getContext('2d')!
    for (const item of layerCanvases) compositeCtx.drawImage(item.canvas, 0, 0)

    // Marquee also transforms any visible top-level paint objects it touches.
    // Keep their complete subtrees so groups remain groups after the edit.
    const intersectsMarquee = (line: LineObj) => {
      const b = boundsForLine(line)
      return b.x + b.w >= x && b.x <= x + w && b.y + b.h >= y && b.y <= y + h
    }
    const roots = linesRef.current.filter(
      (line) => !line.parentId && isVectorVisible(line) && intersectsMarquee(line)
    )
    const selectedIds = new Set<string>()
    const includeSubtree = (id: string) => {
      if (selectedIds.has(id)) return
      selectedIds.add(id)
      for (const child of linesRef.current) {
        if (child.parentId === id) includeSubtree(child.id)
      }
    }
    for (const root of roots) includeSubtree(root.id)
    const vectorState = selectedIds.size
      ? {
          originalLines: cloneLines(linesRef.current),
          selectedIds: [...selectedIds],
          sourceRect: { x, y, w, h }
        }
      : undefined
    if (roots.length) {
      const vectors = document.createElement('canvas')
      vectors.width = W
      vectors.height = H
      const vectorsCtx = vectors.getContext('2d')!
      for (const root of roots) {
        renderObjectTree(vectorsCtx, root, linesRef.current, isVectorVisible)
      }
      compositeCtx.drawImage(vectors, x, y, w, h, 0, 0, w, h)
    }
    // Empty marquee: do not create an invisible selectable item.
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, w, h).data
    let hasPixels = false
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) { hasPixels = true; break }
    }
    if (!hasPixels) {
      marqueeRef.current = null
      setHasMarquee(false)
      drawSelOverlay()
      return
    }
    for (const ctx of targetCtxs()) ctx.clearRect(x, y, w, h)
    if (selectedIds.size) {
      linesRef.current = linesRef.current.filter((line) => !selectedIds.has(line.id))
    }
    redrawLines()
    const source = cloneCanvas(canvas)
    floatRef.current = {
      canvas,
      x,
      y,
      source,
      originX: x,
      originY: y,
      selectable: false,
      sourceLayer: layerOrderRef.current.find(layerIsEditable),
      layerCanvases,
      vectorState
    }
    marqueeRef.current = null
    setHasMarquee(true)
    drawSelOverlay()
  }

  // Stamp a floating selection back onto the layers and turn it into a coverage marquee
  // (pixels stay on the canvas so expanding the box can cover more of the image).
  const floatToCoverageMarquee = () => {
    const f = floatRef.current
    if (!f) return
    rasterizeFloatToOriginalLayers(f)
    restoreTransformedMarqueeVectors(f)
    marqueeRef.current = { x: f.x, y: f.y, w: f.canvas.width, h: f.canvas.height }
    floatRef.current = null
    setHasMarquee(true)
    redrawLines()
    pushHistory()
    drawSelOverlay()
  }

  const applyMarqueeMode = (mode: 'coverage' | 'scale') => {
    if (mode === marqueeMode) return
    if (mode === 'scale') {
      if (!floatRef.current && marqueeRef.current) liftMarquee()
    } else {
      if (floatRef.current) floatToCoverageMarquee()
    }
    setMarqueeMode(mode)
  }

  /** Place an external image as a floating selection on the top editable layer. */
  const placeExternalImage = (dataUrl: string, at?: Pt) => {
    const img = new Image()
    img.onload = () => {
      if (floatRef.current) commitFloat()
      const maxW = W * 0.85
      const maxH = H * 0.85
      const scale = Math.min(1, maxW / Math.max(1, img.width), maxH / Math.max(1, img.height))
      const dw = Math.max(4, Math.round(img.width * scale))
      const dh = Math.max(4, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = dw
      canvas.height = dh
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, dw, dh)
      const x = at ? Math.round(at.x - dw / 2) : Math.round((W - dw) / 2)
      const y = at ? Math.round(at.y - dh / 2) : Math.round((H - dh) / 2)
      floatRef.current = { canvas, x, y, source: cloneCanvas(canvas), selectable: true }
      marqueeRef.current = null
      setHasMarquee(true)
      setMarqueeMode('scale')
      if (tool !== 'select') setTool('select')
      drawSelOverlay()
    }
    img.onerror = () => {}
    img.src = dataUrl
  }

  /** Rasterize an SVG (tinted with the current paint colour) and place it as a selectable stamp. */
  const placeSvgMarkup = async (
    svgMarkup: string,
    at?: Pt,
    source: 'library' | 'image' = 'image'
  ) => {
    let svg = svgMarkup.trim()
    if (!svg.includes('<svg')) return
    const paintColor = firstSolidColor(color)
    svg = applySvgColor(svg, paintColor)
    const sizePx = Math.round(W * 0.35)
    const canvas = document.createElement('canvas')
    canvas.width = sizePx
    canvas.height = sizePx
    const ctx = canvas.getContext('2d')!
    await drawSvgOnCanvas(ctx, svg, 0, 0, sizePx, sizePx)
    placeStampFromCanvas(canvas, at, source, svg)
  }

  /** Place a raster stamp as a pointer-selectable vector (library icons, custom SVG). */
  const placeStampFromCanvas = (
    canvas: HTMLCanvasElement,
    at?: Pt,
    source: 'library' | 'image' = 'image',
    sourceSvgMarkup?: string
  ) => {
    // Drop any uncommitted float so it doesn't fight the new stamp.
    if (floatRef.current) {
      floatRef.current = null
      setHasMarquee(false)
      const p = previewRef.current?.getContext('2d')
      if (p) p.clearRect(0, 0, W, H)
    }
    const dw = Math.max(4, canvas.width)
    const dh = Math.max(4, canvas.height)
    const dataUrl = canvas.toDataURL('image/png')
    ensureStampImage(dataUrl)
    const x = at ? Math.round(at.x - dw / 2) : Math.round((W - dw) / 2)
    const y = at ? Math.round(at.y - dh / 2) : Math.round((H - dh) / 2)
    const id = genId()
    const nl: LineObj = {
      id,
      type: 'stamp',
      pts: [{ x, y }, { x: x + dw, y: y + dh }],
      startCap: 'none',
      endCap: 'none',
      dash: 'solid',
      thickness: 0,
      color: firstSolidColor(color),
      imageDataUrl: dataUrl,
      stampSource: source,
      sourceSvgMarkup,
      sourceStampSize: sourceSvgMarkup ? Math.min(dw, dh) : undefined,
      keepStrokeOnResize: sourceSvgMarkup ? keepStrokeOnResize : undefined,
      visible: true,
      layer: activeAddLayer()
    }
    linesRef.current = [...linesRef.current, nl]
    commitLines(linesRef.current)
    selectLine(nl)
    setTool('pointer')
    redrawLines()
    drawHandles()
    pushHistory()
    // Leave icon-search focus so Ctrl+Z goes to paint undo, not the text field.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  const placeSvgMarkupRef = useRef(placeSvgMarkup)
  placeSvgMarkupRef.current = placeSvgMarkup

  const handleStageDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const pt = clientToCanvas(e)
    const svgData = e.dataTransfer.getData(PAINT_SVG_MIME) || e.dataTransfer.getData('text/plain')
    if (svgData && svgData.includes('<svg')) {
      const fromLibrary = e.dataTransfer.types.includes(PAINT_SVG_MIME) ||
        e.dataTransfer.types.includes(PAINT_LUCIDE_MIME)
      await placeSvgMarkup(svgData, pt, fromLibrary ? 'library' : 'image')
      return
    }
    const lucideRaw = e.dataTransfer.getData(PAINT_LUCIDE_MIME)
    if (lucideRaw) {
      try {
        const parsed = JSON.parse(lucideRaw) as { name?: string; strokeWidth?: number }
        if (parsed.name) {
          const markup = await renderLucideToSvg(parsed.name, 'currentColor', parsed.strokeWidth ?? 2)
          if (markup) await placeSvgMarkup(markup, pt, 'library')
        }
      } catch {
        /* ignore bad payload */
      }
      return
    }
    const file = e.dataTransfer.files?.[0]
    if (file) {
      if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
        try {
          const text = await file.text()
          if (text.includes('<svg')) await placeSvgMarkup(text, pt)
        } catch {
          /* ignore */
        }
        return
      }
      if (file.type.startsWith('image/')) {
        try {
          const url = await readBlobAsDataUrl(file)
          placeExternalImage(url, pt)
        } catch {
          /* ignore */
        }
      }
    }
  }

  const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result)
        else reject(new Error('Failed to read image'))
      }
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
      reader.readAsDataURL(blob)
    })

  /** Try to paste an image from the OS clipboard. Returns true if one was placed. */
  const pasteSystemImage = async (): Promise<boolean> => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'))
          if (!imgType) continue
          const blob = await item.getType(imgType)
          const dataUrl = await readBlobAsDataUrl(blob)
          placeExternalImage(dataUrl)
          return true
        }
      }
    } catch {
      // Permission denied or empty — fall through to internal clipboard.
    }
    return false
  }

  const placeExternalImageRef = useRef(placeExternalImage)
  placeExternalImageRef.current = placeExternalImage

  const pasteRaster = () => {
    const clip = rasterClipRef.current
    if (!clip) return
    if (floatRef.current) commitFloat()
    const x = Math.round((W - clip.width) / 2) + 12
    const y = Math.round((H - clip.height) / 2) + 12
    const canvas = cloneCanvas(clip)
    floatRef.current = { canvas, x, y, source: cloneCanvas(clip), selectable: true }
    marqueeRef.current = null
    setHasMarquee(true)
    setMarqueeMode('scale')
    if (tool !== 'select') setTool('select')
    drawSelOverlay()
  }

  const copyVector = (cut: boolean): boolean => {
    const l = linesRef.current.find((x) => x.id === selectedIdRef.current)
    if (!l) return false
    vectorClipRef.current = cloneLines([l])[0]
    clipKindRef.current = 'vector'
    setHasClip(true)
    setClipLabel(
      l.type === 'shape' ? 'Shape'
        : l.type === 'poly' ? 'Polygon'
          : l.type === 'text' ? 'Text'
            : l.type === 'stamp' ? 'Icon'
              : 'Line'
    )
    if (cut) deleteSelectedRef.current()
    return true
  }

  const pasteVector = () => {
    const c = vectorClipRef.current
    if (!c) return
    const nl: LineObj = {
      ...c,
      id: genId(),
      pts: c.pts.map((p) => ({ x: p.x + 16, y: p.y + 16 })),
      layer: c.layer ?? activeAddLayer()
    }
    if (nl.type === 'stamp' && nl.imageDataUrl) ensureStampImage(nl.imageDataUrl)
    linesRef.current = [...linesRef.current, nl]
    selectLine(nl)
    if (tool !== 'pointer') {
      if (nl.type === 'text' && tool !== 'text') setTool('pointer')
      else if (nl.type === 'stamp') setTool('pointer')
      else if (nl.type === 'poly' && tool !== 'freepoly') setTool('freepoly')
      else if (nl.type === 'shape' && tool !== 'shape') setTool('pointer')
      else if (nl.type !== 'poly' && nl.type !== 'shape' && nl.type !== 'text' && tool !== 'line') setTool('line')
    }
    commitLines([...linesRef.current])
    redrawLines(); drawHandles()
    pushHistory()
  }

  // Copy whatever is currently in edit mode: a floating raster selection,
  // an unlifted marquee region, or a selected vector object.
  const doCopy = () => {
    if (floatRef.current) {
      rasterClipRef.current = cloneCanvas(floatRef.current.canvas)
      clipKindRef.current = 'raster'
      setHasClip(true)
      setClipLabel('Region')
      return
    }
    const m = marqueeRef.current
    if (m && m.w >= 3 && m.h >= 3) {
      const x = Math.round(m.x), y = Math.round(m.y), w = Math.round(m.w), h = Math.round(m.h)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(compositeTargets(), x, y, w, h, 0, 0, w, h)
      rasterClipRef.current = canvas
      clipKindRef.current = 'raster'
      setHasClip(true)
      setClipLabel('Region')
      return
    }
    if (selectedIdRef.current) copyVector(false)
  }
  const doCut = () => {
    if (floatRef.current) { doCopy(); floatRef.current = null; setHasMarquee(false); drawSelOverlay(); pushHistory(); return }
    const m = marqueeRef.current
    if (m && m.w >= 3 && m.h >= 3) {
      doCopy()
      for (const ctx of targetCtxs()) ctx.clearRect(Math.round(m.x), Math.round(m.y), Math.round(m.w), Math.round(m.h))
      marqueeRef.current = null
      setHasMarquee(false)
      drawSelOverlay()
      redrawLines()
      pushHistory()
      return
    }
    if (selectedIdRef.current) copyVector(true)
  }
  const doPaste = () => {
    void (async () => {
      if (await pasteSystemImage()) return
      if (clipKindRef.current === 'vector') pasteVector()
      else if (clipKindRef.current === 'raster') pasteRaster()
    })()
  }

  const isSvgFile = (file: File) =>
    file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)

  const onExternalImageFile = (file: File | null | undefined) => {
    if (!file) return
    if (isSvgFile(file)) {
      void file
        .text()
        .then((text) => {
          if (text.includes('<svg')) void placeSvgMarkup(text)
        })
        .catch(() => {})
      return
    }
    if (!file.type.startsWith('image/')) return
    void readBlobAsDataUrl(file).then(placeExternalImage).catch(() => {})
  }

  clipActionsRef.current = {
    copy: doCopy,
    cut: doCut,
    paste: doPaste,
    liftMarquee,
    commitFloat,
    // Escape/cancel restores a lifted marquee to its original source layers.
    discardFloat: cancelFloating,
    clearSel: () => { marqueeRef.current = null; setHasMarquee(false); drawSelOverlay() },
    clearRegion: () => {
      const m = marqueeRef.current
      if (!m) return
      for (const ctx of targetCtxs()) ctx.clearRect(Math.round(m.x), Math.round(m.y), Math.round(m.w), Math.round(m.h))
      marqueeRef.current = null
      setHasMarquee(false)
      drawSelOverlay()
      redrawLines()
      pushHistory()
    }
  }

  // OS paste (Edit menu / some hosts) — prefer image files from clipboardData.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      const items = e.clipboardData?.items
      if (!items?.length) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (!item.type.startsWith('image/')) continue
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) return
        void readBlobAsDataUrl(file)
          .then((url) => placeExternalImageRef.current(url))
          .catch(() => {})
        return
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  // ── Pointer handlers ─────────────────────────────────────────────────────────
  const handlePointerMove = (pt: Pt) => {
    if (tool === 'line' || tool === 'freepoly' || tool === 'pointer' || tool === 'shape' || tool === 'text') { lineMove(pt); return }

    if (tool === 'select') {
      const lockAspect = shiftHeldRef.current
      // Coverage: resize the marquee rectangle (what it covers)
      const mr = marqueeResizeRef.current
      if (mr && marqueeRef.current) {
        const magneticPt = snapResizePointToCanvasEdges(pt, mr.corner)
        const next = resizeRect(mr.corner, mr.start, magneticPt, lockAspect)
        const snap = snapResizeToHalfCanvas(next, mr.corner, mr.start, lockAspect)
        marqueeRef.current = snap.rect
        drawSelOverlay()
        drawAlignmentGuides(resizeEdgeGuide(snap.rect, mr.corner))
        drawHalfSizeGuides(snap.rect, snap)
        return
      }
      // Scale: resize the floating bitmap
      const rz = floatResizeRef.current
      const f = floatRef.current
      if (rz && f) {
        const magneticPt = snapResizePointToCanvasEdges(pt, rz.corner)
        const next = resizeRect(rz.corner, rz.start, magneticPt, lockAspect)
        const snap = snapResizeToHalfCanvas(next, rz.corner, rz.start, lockAspect)
        scaleFloatTo(f, snap.rect.x, snap.rect.y, snap.rect.w, snap.rect.h)
        drawSelOverlay()
        drawAlignmentGuides(resizeEdgeGuide(
          { x: f.x, y: f.y, w: f.canvas.width, h: f.canvas.height },
          rz.corner
        ))
        drawHalfSizeGuides(
          { x: f.x, y: f.y, w: f.canvas.width, h: f.canvas.height },
          snap
        )
        return
      }
      const g = floatDragRef.current
      if (g && f) {
        f.x += pt.x - g.x
        f.y += pt.y - g.y
        const snap = snapRectToCanvas({
          x: f.x,
          y: f.y,
          w: f.canvas.width,
          h: f.canvas.height
        })
        f.x += snap.dx
        f.y += snap.dy
        floatDragRef.current = {
          x: snap.x ? g.x : pt.x,
          y: snap.y ? g.y : pt.y
        }
        drawSelOverlay()
        drawAlignmentGuides(snap)
        return
      }
      const s = marqueeStartRef.current
      if (s) {
        const end = clampToCanvas(pt)
        marqueeRef.current = {
          x: Math.min(s.x, end.x),
          y: Math.min(s.y, end.y),
          w: Math.abs(end.x - s.x),
          h: Math.abs(end.y - s.y)
        }
        drawSelOverlay()
      }
      return
    }

    // Eraser: erase on editable layers while dragging, always show the tip footprint.
    if (tool === 'eraser') {
      const snap = snapEraserPoint(pt)
      const activeObjectStroke = objectPaintStrokeRef.current
      if (drawing.current && activeObjectStroke) {
        const l = linesRef.current.find((item) => item.id === activeObjectStroke.id)
        const stroke = l?.paintStrokes?.[activeObjectStroke.index]
        if (l && stroke) {
          stroke.pts.push(shapeLocalPaintPoint(l, snap.pt))
          lastPt.current = snap.pt
          redrawLines()
        }
        drawEraserCursor(snap.pt)
        drawEraserSnapGuides(snap)
        return
      }
      if (drawing.current) {
        // Arrows took over this stroke — keep tip at last keyboard position.
        if (eraserArrowLockedRef.current) {
          drawEraserCursor(lastPt.current)
          return
        }
        const c = pixelColor(color)
        for (const ctx of targetCtxs()) {
          strokeBrushTip(
            ctx, eraserTip,
            lastPt.current.x, lastPt.current.y,
            snap.pt.x, snap.pt.y,
            size, c, true
          )
        }
        lastPt.current = snap.pt
        redrawLines()
      }
      drawEraserCursor(snap.pt)
      drawEraserSnapGuides(snap)
      return
    }

    if (tool === 'polygon' && polyPts.current.length) { drawPolyPreview(pt); return }
    if (!drawing.current) return

    if (tool === 'brush') {
      const activeObjectStroke = objectPaintStrokeRef.current
      if (activeObjectStroke) {
        const l = linesRef.current.find((item) => item.id === activeObjectStroke.id)
        const stroke = l?.paintStrokes?.[activeObjectStroke.index]
        if (l && stroke) {
          stroke.pts.push(shapeLocalPaintPoint(l, pt))
          redrawLines()
        }
        lastPt.current = pt
        return
      }
      const c = pixelColor(color)
      for (const ctx of addPaintCtxs()) {
        strokeBrushTip(ctx, brushTip, lastPt.current.x, lastPt.current.y, pt.x, pt.y, size, c, false)
      }
      lastPt.current = pt
      redrawLines()
    }
  }

  const handlePointerUp = (pt: Pt) => {
    if (tool === 'line' || tool === 'freepoly' || tool === 'pointer' || tool === 'shape' || tool === 'text') { lineUp(pt); return }
    if (tool === 'select') {
      if (marqueeResizeRef.current) {
        marqueeResizeRef.current = null
        resizeSnapLockRef.current = { width: false, height: false }
        drawSelOverlay()
        return
      }
      if (floatResizeRef.current) {
        floatResizeRef.current = null
        resizeSnapLockRef.current = { width: false, height: false }
        drawSelOverlay()
        return
      }
      if (floatDragRef.current) {
        floatDragRef.current = null
        drawSelOverlay()
        return
      }
      if (marqueeStartRef.current) {
        marqueeStartRef.current = null
        const m = marqueeRef.current
        if (m && (m.w < 3 || m.h < 3)) {
          marqueeRef.current = null
          setHasMarquee(false)
          drawSelOverlay()
        } else if (m) {
          fitMarqueeToSelectedLayers(m)
          // Keep as coverage marquee (pixels stay on the layers until lift)
          setHasMarquee(true)
          setMarqueeMode('coverage')
          drawSelOverlay()
        }
      }
      return
    }
    if (!drawing.current) return
    if (tool === 'brush' || tool === 'eraser') {
      drawing.current = false
      eraserArrowLockedRef.current = false
      if (objectPaintStrokeRef.current) {
        objectPaintStrokeRef.current = null
        commitLines([...linesRef.current])
        redrawLines()
      }
      pushHistory()
    }
  }

  handlePointerMoveRef.current = handlePointerMove
  handlePointerUpRef.current = handlePointerUp

  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    shiftHeldRef.current = e.shiftKey
    // Prevent PreviewStage's outside-canvas handler from starting the same drag twice.
    e.stopPropagation()
    if (openMenu) setOpenMenu(null)
    const pt = toCanvas(e)
    if (tool === 'eyedropper') { eyedrop(pt.x, pt.y); return }
    if (tool === 'line' || tool === 'freepoly' || tool === 'pointer' || tool === 'shape' || tool === 'text') {
      lineDown(pt)
      if (lineDragRef.current || baseTransformRef.current) startPointerDragCapture()
      return
    }
    if (tool === 'select') {
      const f = floatRef.current
      const m = marqueeRef.current

      // Floating selection (scale mode)
      if (f) {
        const corner = hitCorner(f.x, f.y, f.canvas.width, f.canvas.height, pt)
        if (corner) {
          if (marqueeMode === 'coverage') {
            // Switch conceptually shouldn't have float in coverage, but be safe:
            floatToCoverageMarquee()
            const nm = marqueeRef.current!
            marqueeResizeRef.current = { corner, start: { x: nm.x, y: nm.y, w: nm.w, h: nm.h } }
            resizeSnapLockRef.current = { width: false, height: false }
            startPointerDragCapture()
            return
          }
          const source = f.source ?? cloneCanvas(f.canvas)
          f.source = source
          floatResizeRef.current = {
            corner,
            start: { x: f.x, y: f.y, w: f.canvas.width, h: f.canvas.height },
            source
          }
          resizeSnapLockRef.current = { width: false, height: false }
          startPointerDragCapture()
          return
        }
        if (pt.x >= f.x && pt.x <= f.x + f.canvas.width && pt.y >= f.y && pt.y <= f.y + f.canvas.height) {
          floatDragRef.current = pt
          startPointerDragCapture()
          return
        }
        commitFloat()
      }

      // Unlifted marquee (coverage mode)
      if (m && m.w >= 3 && m.h >= 3) {
        const corner = hitCorner(m.x, m.y, m.w, m.h, pt)
        if (corner) {
          if (marqueeMode === 'scale') {
            liftMarquee()
            const fl = floatRef.current
            if (fl) {
              floatResizeRef.current = {
                corner,
                start: { x: fl.x, y: fl.y, w: fl.canvas.width, h: fl.canvas.height },
                source: fl.source ?? cloneCanvas(fl.canvas)
              }
              resizeSnapLockRef.current = { width: false, height: false }
              startPointerDragCapture()
            }
            return
          }
          marqueeResizeRef.current = { corner, start: { x: m.x, y: m.y, w: m.w, h: m.h } }
          resizeSnapLockRef.current = { width: false, height: false }
          startPointerDragCapture()
          return
        }
        if (pt.x >= m.x && pt.x <= m.x + m.w && pt.y >= m.y && pt.y <= m.y + m.h) {
          // Drag inside → lift and move
          liftMarquee()
          floatDragRef.current = pt
          setMarqueeMode('scale')
          startPointerDragCapture()
          return
        }
        // Clicking outside ends the temporary edit and merges it back into the
        // original checked raster layers; no persistent object layer is added.
        liftMarquee()
        if (floatRef.current) commitFloat()
        return
      }

      // A drag may begin in the surrounding stage; use its nearest canvas point.
      const start = clampToCanvas(pt)
      marqueeStartRef.current = start
      marqueeRef.current = { x: start.x, y: start.y, w: 0, h: 0 }
      setMarqueeMode('coverage')
      drawSelOverlay()
      startPointerDragCapture()
      return
    }

    const paintShape = (tool === 'brush' || tool === 'eraser') ? selectedPaintShape() : null
    if (paintShape) {
      const snapped = tool === 'eraser' ? snapEraserPoint(pt) : {
        pt, xGuide: null, yGuide: null, angle: null
      }
      const a = paintShape.pts[0], b = paintShape.pts[1]
      const shortSide = Math.max(1, Math.min(Math.abs(b.x - a.x), Math.abs(b.y - a.y)))
      const stroke: ObjectPaintStroke = {
        tool: tool === 'eraser' ? 'eraser' : 'brush',
        pts: [shapeLocalPaintPoint(paintShape, snapped.pt)],
        size: size / shortSide,
        color: pixelColor(color),
        tip: tool === 'eraser' ? eraserTip : brushTip
      }
      paintShape.paintStrokes = [...(paintShape.paintStrokes ?? []), stroke]
      objectPaintStrokeRef.current = { id: paintShape.id, index: paintShape.paintStrokes.length - 1 }
      drawing.current = true
      startPt.current = snapped.pt
      lastPt.current = snapped.pt
      redrawLines()
      if (tool === 'eraser') {
        drawEraserCursor(snapped.pt)
        drawEraserSnapGuides(snapped)
      }
      startPointerDragCapture()
      return
    }
    // Shape/stamp/group selected but unusable for stroke → still never paint base overlays.
    if ((tool === 'brush' || tool === 'eraser') && selectedObjectOwnsRasterTools()) {
      const selected = linesRef.current.find((item) => item.id === selectedIdRef.current)
      const l = selected ? (checkedGroupTarget(selected) ?? selected) : null
      if (l && (l.type === 'shape' || l.type === 'stamp' || l.type === 'group')) return
    }

    // Selected object layers own fill — never fall through to base overlays.
    if (tool === 'fill') {
      if (fillSelectedObjectLayer(pt)) return
      if (selectedObjectOwnsRasterTools()) return
    }

    const targets = targetCtxs()
    if (!targets.length && tool !== 'polygon' && tool !== 'brush') return
    // Brush can run with add-paint targeting even when only one layer is checked.
    if (tool === 'brush' && !addPaintCtxs().length) return

    if (tool === 'fill') {
      // Base overlays only when no object layer owns the tool.
      if (fillAllOpaque) {
        for (const ctx of targets) recolorAllOpaque(ctx)
      } else {
        for (const id of [...layerOrderRef.current].reverse().filter(layerIsEditable)) {
          const ctx = layerCanvas(id).getContext('2d')
          if (ctx) floodFill(ctx, pt.x, pt.y, baseCanvas(id))
        }
      }
      redrawLines()
      pushHistory()
      return
    }
    if (tool === 'polygon') {
      polyPts.current.push(pt)
      drawPolyPreview(pt)
      return
    }
    const initialEraserSnap = tool === 'eraser' ? snapEraserPoint(pt) : null
    const initialPoint = initialEraserSnap?.pt ?? pt
    drawing.current = true
    startPt.current = initialPoint
    lastPt.current = initialPoint
    if (tool === 'brush') {
      const c = pixelColor(color)
      for (const ctx of addPaintCtxs()) {
        stampBrushTip(ctx, brushTip, pt.x, pt.y, size, c, false)
      }
      redrawLines()
      startPointerDragCapture()
    } else if (tool === 'eraser') {
      const c = pixelColor(color)
      for (const ctx of targets) {
        stampBrushTip(ctx, eraserTip, initialPoint.x, initialPoint.y, size, c, true)
      }
      redrawLines()
      eraserArrowLockedRef.current = false
      drawEraserCursor(initialPoint)
      if (initialEraserSnap) drawEraserSnapGuides(initialEraserSnap)
      startPointerDragCapture()
    }
  }

  const onMove = (e: React.MouseEvent) => {
    // While a drag is captured on window, skip canvas moves to avoid double strokes.
    if (pointerDragCleanupRef.current) return
    shiftHeldRef.current = e.shiftKey
    handlePointerMove(toCanvas(e))
  }

  const onUp = (e: React.MouseEvent) => {
    // Window mouseup owns the finish when capture is active.
    if (pointerDragCleanupRef.current) return
    handlePointerUp(toCanvas(e))
  }

  const handleSave = async () => {
    if (textEditIdRef.current) endTextEditRef.current()
    if (tool === 'polygon' && polyPts.current.length) finishPolygon()
    if (floatRef.current) commitFloat()
    const cc = ensureOffscreenCanvas(containerCanvasRef)
    const ct = ensureOffscreenCanvas(contentCanvasRef)
    const baseCc = ensureOffscreenCanvas(baseContainerCanvasRef)
    const baseCt = ensureOffscreenCanvas(baseContentCanvasRef)
    const vectors = cloneLines(linesRef.current) as unknown as PaintVector[]
    // Inner base + overlay for optical center / offset sync when no linked text.
    const contentComposite = document.createElement('canvas')
    contentComposite.width = W
    contentComposite.height = H
    const cctx = contentComposite.getContext('2d')
    if (cctx) {
      cctx.drawImage(baseCt, 0, 0)
      cctx.drawImage(ct, 0, 0)
    }
    const contentSync = buildPaintContentSync({
      vectors,
      resolution: W,
      contentComposite,
      containerBase: baseCc,
      containerOverlay: cc,
      contentBase: baseCt,
      contentOverlay: ct,
      syncOuterFillColor
    })
    // Full Outer recolor via Fill → clear overlay so live backgroundColor /
    // containerColor owns the color (keeps favicon↔logo sync consistent).
    // Never clear for image outers (syncOuterFillColor false) — paint stays put.
    if (contentSync.clearOuterOverlay) {
      const ctx = cc.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, W, H)
    }
    // contentBound proxies are Paint-only: sync size/offset/shadow, then drop them
    // so outside live Inner settings never double with a leftover raster stamp.
    const persistVectors = stripContentProxyVectors(vectors)
    const containerDecor = decorationsCanvas('container')
    const contentDecor = decorationsCanvas('content')
    // Overlays only — live Outer/Inner settings stay outside Paint.
    await onSave(
      {
        compositePng: compositeCanvas().toDataURL('image/png'),
        containerPng: contentSync.clearOuterOverlay
          ? emptyOverlayPng(W)
          : cc.toDataURL('image/png'),
        contentPng: ct.toDataURL('image/png'),
        vectors: persistVectors,
        resolution: W,
        hasContainer: !!(hasContainer || containerUsable),
        layerOrder: [...layerOrderRef.current],
        decorationsPng: decorationsCanvas().toDataURL('image/png'),
        containerDecorationsPng: containerDecor.toDataURL('image/png'),
        contentDecorationsPng: contentDecor.toDataURL('image/png'),
        contentSync
      },
      {
        logoIds: [...saveLogoIds],
        faviconIds: [...saveFaviconIds]
      }
    )
  }

  const toggleSaveId = (kind: 'logo' | 'favicon', id: string) => {
    const setter = kind === 'logo' ? setSaveLogoIds : setSaveFaviconIds
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const movePaintLayer = (
    dragged: PaintLayerId,
    target: PaintLayerId,
    position: Exclude<LayerDropPosition, 'inside'>
  ) => {
    if (dragged === target) return
    const next = [...layerOrderRef.current]
    const from = next.indexOf(dragged)
    if (from < 0) return
    next.splice(from, 1)
    const targetIndex = next.indexOf(target)
    if (targetIndex < 0) return
    next.splice(targetIndex + (position === 'after' ? 1 : 0), 0, dragged)
    layerOrderRef.current = next
    setLayerOrder(next)
    redrawLines()
    pushHistory()
  }

  const defaultObjectLayerName = (l: LineObj): string => {
    if (l.type === 'stamp') return 'Image'
    if (l.type === 'text') return l.text?.trim() ? `Text: ${l.text.trim().slice(0, 18)}` : 'Text'
    if (l.type === 'shape') return l.shape
      ? `${l.shape.charAt(0).toUpperCase()}${l.shape.slice(1)}`
      : 'Shape'
    if (l.type === 'poly') return 'Polygon'
    if (l.type === 'drawn') return 'Drawing'
    return 'Line'
  }

  const renameObjectLayer = (id: string, name: string) => {
    const l = linesRef.current.find((item) => item.id === id)
    if (!l) return
    l.name = name.trim() || undefined
    commitLines([...linesRef.current])
    pushHistory()
  }

  const moveObjectLayer = (
    draggedId: string,
    targetKey: string,
    position: LayerDropPosition
  ): boolean => {
    const next = [...linesRef.current]
    const dragged = next.find((l) => l.id === draggedId)
    if (!dragged) return false

    // Move the complete nested subtree as one unit and preserve its paint order.
    const movingIds = new Set<string>([draggedId])
    let changed = true
    while (changed) {
      changed = false
      for (const item of next) {
        if (item.parentId && movingIds.has(item.parentId) && !movingIds.has(item.id)) {
          movingIds.add(item.id)
          changed = true
        }
      }
    }
    const moving = next.filter((item) => movingIds.has(item.id))
    const remaining = next.filter((item) => !movingIds.has(item.id))

    if (targetKey.startsWith('base:')) {
      const layer = targetKey.slice(5) as PaintLayerId
      for (const item of moving) item.layer = layer
      dragged.parentId = undefined
      remaining.push(...moving) // topmost object/group within the target base layer
    } else {
      const targetId = targetKey.slice(7)
      if (movingIds.has(targetId)) return false
      const targetIndex = remaining.findIndex((l) => l.id === targetId)
      if (targetIndex < 0) return false
      const target = remaining[targetIndex]
      const layer = vectorLayerOf(target)
      for (const item of moving) item.layer = layer

      if (position === 'inside' && target.type === 'group') {
        dragged.parentId = target.id
        // Higher array index appears higher in the panel.
        remaining.splice(targetIndex + 1, 0, ...moving)
      } else {
        dragged.parentId = target.parentId
        // Panel order is the reverse of paint-array order:
        // "before" (above) inserts after; "after" (below) inserts before.
        remaining.splice(targetIndex + (position === 'before' ? 1 : 0), 0, ...moving)
      }
    }
    syncGroupBounds(remaining)
    commitLines(remaining)
    redrawLines()
    drawHandles()
    pushHistory()
    return true
  }

  const dropLayerItem = (
    draggedKey: string,
    targetKey: string,
    position: LayerDropPosition
  ) => {
    if (draggedKey === targetKey) return
    if (draggedKey.startsWith('base:')) {
      const dragged = draggedKey.slice(5) as PaintLayerId
      let target: PaintLayerId | null = null
      if (targetKey.startsWith('base:')) target = targetKey.slice(5) as PaintLayerId
      else {
        const targetObject = linesRef.current.find((l) => l.id === targetKey.slice(7))
        if (targetObject) target = vectorLayerOf(targetObject)
      }
      if (target) movePaintLayer(dragged, target, position === 'after' ? 'after' : 'before')
      return
    }
    const moved = moveObjectLayer(draggedKey.slice(7), targetKey, position)
    if (moved && position === 'inside' && targetKey.startsWith('object:')) {
      const targetId = targetKey.slice(7)
      setCollapsedGroupIds((prev) => {
        if (!prev.has(targetId)) return prev
        const next = new Set(prev)
        next.delete(targetId)
        return next
      })
    }
  }

  const canNestDraggedIntoGroup = (draggedKey: string | null, targetGroupId: string): boolean => {
    if (!draggedKey || draggedKey.startsWith('base:')) return false
    const draggedId = draggedKey.slice(7)
    if (draggedId === targetGroupId) return false
    let current = linesRef.current.find((item) => item.id === targetGroupId)
    while (current?.parentId) {
      if (current.parentId === draggedId) return false
      current = linesRef.current.find((item) => item.id === current?.parentId)
    }
    return true
  }

  const dropPositionForRow = (
    e: React.DragEvent<HTMLElement>,
    allowInside: boolean
  ): LayerDropPosition => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5
    // Most of a group row is a nesting target; narrow edge strips still allow
    // precise reordering immediately above or below the group.
    if (allowInside && ratio >= 0.15 && ratio <= 0.85) return 'inside'
    return ratio < 0.5 ? 'before' : 'after'
  }

  /**
   * Crop a selected raster item. Portions outside the canvas are removed first;
   * otherwise transparent padding is trimmed from the image.
   */
  const cropSelectedStamp = () => {
    const l = linesRef.current.find((item) => item.id === selectedIdRef.current)
    if (!l || l.type !== 'stamp' || !l.imageDataUrl || l.pts.length < 2) return
    const img = ensureStampImage(l.imageDataUrl, () => cropSelectedStamp())
    if (!img) return

    const x = Math.min(l.pts[0].x, l.pts[1].x)
    const y = Math.min(l.pts[0].y, l.pts[1].y)
    const w = Math.max(1, Math.abs(l.pts[1].x - l.pts[0].x))
    const h = Math.max(1, Math.abs(l.pts[1].y - l.pts[0].y))
    const iw = img.naturalWidth || img.width
    const ih = img.naturalHeight || img.height
    const source = document.createElement('canvas')
    source.width = iw
    source.height = ih
    const sourceCtx = source.getContext('2d')!
    sourceCtx.drawImage(img, 0, 0)
    const pixels = sourceCtx.getImageData(0, 0, iw, ih).data

    // Begin with the source portion whose displayed bounds intersect the canvas.
    let left = Math.max(0, Math.floor((-x / w) * iw))
    let top = Math.max(0, Math.floor((-y / h) * ih))
    let right = Math.min(iw, Math.ceil(((W - x) / w) * iw))
    let bottom = Math.min(ih, Math.ceil(((H - y) / h) * ih))
    if (right <= left || bottom <= top) return

    // Trim transparent padding within the visible source portion.
    let alphaLeft = right
    let alphaTop = bottom
    let alphaRight = left
    let alphaBottom = top
    for (let py = top; py < bottom; py++) {
      for (let px = left; px < right; px++) {
        if (pixels[(py * iw + px) * 4 + 3] === 0) continue
        alphaLeft = Math.min(alphaLeft, px)
        alphaTop = Math.min(alphaTop, py)
        alphaRight = Math.max(alphaRight, px + 1)
        alphaBottom = Math.max(alphaBottom, py + 1)
      }
    }
    if (alphaRight <= alphaLeft || alphaBottom <= alphaTop) return
    left = alphaLeft
    top = alphaTop
    right = alphaRight
    bottom = alphaBottom
    if (left === 0 && top === 0 && right === iw && bottom === ih) return

    const out = document.createElement('canvas')
    out.width = right - left
    out.height = bottom - top
    out.getContext('2d')!.drawImage(
      img,
      left, top, out.width, out.height,
      0, 0, out.width, out.height
    )
    const oldCenter = objCenter(l)
    const localX = x + (left / iw) * w
    const localY = y + (top / ih) * h
    const newW = (out.width / iw) * w
    const newH = (out.height / ih) * h
    const localCenter = { x: localX + newW / 2, y: localY + newH / 2 }
    const displayedCenter = rotatePt(localCenter, oldCenter, l.rot ?? 0)
    l.pts = [
      { x: displayedCenter.x - newW / 2, y: displayedCenter.y - newH / 2 },
      { x: displayedCenter.x + newW / 2, y: displayedCenter.y + newH / 2 }
    ]
    l.imageDataUrl = out.toDataURL('image/png')
    l.sourceSvgMarkup = undefined
    l.sourceStampSize = undefined
    l.keepStrokeOnResize = undefined
    ensureStampImage(l.imageDataUrl)
    commitLines([...linesRef.current])
    redrawLines()
    drawHandles()
    pushHistory()
  }

  /** Create a persistent parent group without flattening its child objects. */
  const groupSelectedLayers = () => {
    const selectedIds = new Set(
      [...selectedLayerIds].filter((id) => {
        const l = linesRef.current.find((item) => item.id === id)
        return !!l && !l.marqueeItem
      })
    )
    // If both a group and one of its descendants are selected, group the
    // parent once rather than creating duplicate/cyclic membership.
    const hasSelectedAncestor = (l: LineObj): boolean => {
      let parentId = l.parentId
      while (parentId) {
        if (selectedIds.has(parentId)) return true
        parentId = linesRef.current.find((item) => item.id === parentId)?.parentId
      }
      return false
    }
    const ids = new Set(
      [...selectedIds].filter((id) => {
        const l = linesRef.current.find((item) => item.id === id)
        return !!l && !hasSelectedAncestor(l)
      })
    )
    if (ids.size < 2) return

    const topFirst = [...linesRef.current].reverse()
    const topmost = topFirst.find((l) => ids.has(l.id))
    if (!topmost) return
    const selected = linesRef.current.filter((l) => ids.has(l.id))
    const boxes = selected.map(boundsForLine)
    const left = Math.min(...boxes.map((b) => b.x))
    const top = Math.min(...boxes.map((b) => b.y))
    const right = Math.max(...boxes.map((b) => b.x + b.w))
    const bottom = Math.max(...boxes.map((b) => b.y + b.h))
    const parents = new Set(selected.map((l) => l.parentId))
    const commonParentId = parents.size === 1 ? selected[0]?.parentId : undefined
    const grouped: LineObj = {
      id: genId(),
      name: 'Group',
      type: 'group',
      pts: [{ x: left, y: top }, { x: right, y: bottom }],
      startCap: 'none',
      endCap: 'none',
      dash: 'solid',
      thickness: 0,
      color: '#000000ff',
      layer: vectorLayerOf(topmost),
      parentId: commonParentId
    }

    const topmostIndex = linesRef.current.findIndex((l) => l.id === topmost.id)
    const next = linesRef.current.map((l) =>
      ids.has(l.id) ? { ...l, parentId: grouped.id } : l
    )
    next.splice(topmostIndex + 1, 0, grouped)
    syncGroupBounds(next)
    commitLines(next)
    selectedIdRef.current = grouped.id
    setSelectedId(grouped.id)
    setSelectedLayerIds(new Set([grouped.id]))
    setTool('pointer')
    redrawLines()
    drawHandles()
    pushHistory([`object:${grouped.id}`, ...[...ids].map((id) => `object:${id}`)])
  }

  const ungroupSelectedLayer = () => {
    const group = linesRef.current.find((l) => l.id === selectedIdRef.current && l.type === 'group')
    if (!group) return
    const childIds = linesRef.current.filter((l) => l.parentId === group.id).map((l) => l.id)
    const next = linesRef.current
      .filter((l) => l.id !== group.id)
      .map((l) => l.parentId === group.id ? { ...l, parentId: undefined } : l)
    syncGroupBounds(next)
    commitLines(next)
    selectedIdRef.current = childIds[0] ?? null
    setSelectedId(childIds[0] ?? null)
    setSelectedLayerIds(new Set(childIds))
    redrawLines()
    drawHandles()
    pushHistory([`object:${group.id}`, ...childIds.map((id) => `object:${id}`)])
  }

  const eligibleObjectIds = lines.filter((l) => !l.marqueeItem).map((l) => l.id)
  const allObjectsSelected = eligibleObjectIds.length > 0 &&
    eligibleObjectIds.every((id) => selectedLayerIds.has(id))
  const toggleSelectAllObjects = () => {
    setTool('pointer')
    if (allObjectsSelected) {
      setSelectedLayerIds(new Set())
      selectedIdRef.current = null
      setSelectedId(null)
    } else {
      setSelectedLayerIds(new Set(eligibleObjectIds))
      const first = linesRef.current.find((l) => eligibleObjectIds.includes(l.id))
      if (first) {
        selectedIdRef.current = first.id
        setSelectedId(first.id)
      }
    }
    setSelectedBaseLayer(null)
    selectedBaseLayerRef.current = null
    clearPreview()
  }

  const canSave =
    !showSaveTargets || saveLogoIds.size > 0 || saveFaviconIds.size > 0
  saveCurrentCanvasesRef.current = () => { void handleSave() }
  canSaveRef.current = canSave

  const TOOLS: { key: Tool; icon: React.ReactNode; label: string }[] = [
    { key: 'pointer', icon: <MousePointer2 size={16} />, label: 'Pointer — click an item drawn this session to edit it' },
    { key: 'brush', icon: <Brush size={16} />, label: 'Brush' },
    { key: 'eraser', icon: <Eraser size={16} />, label: 'Eraser' },
    { key: 'fill', icon: <PaintBucket size={16} />, label: 'Fill' },
    { key: 'eyedropper', icon: <Pipette size={16} />, label: 'Pick colour' },
    { key: 'line', icon: <Minus size={16} />, label: 'Line' },
    { key: 'text', icon: <TypeIcon size={16} />, label: 'Text' },
    { key: 'polygon', icon: <PenTool size={16} />, label: 'Polygon (click points, double-click to finish)' },
    { key: 'select', icon: <BoxSelect size={16} />, label: 'Select (marquee) — drag a box, then Ctrl+C / Ctrl+V' }
  ]

  const shapeToolActive = tool === 'shape' || tool === 'polygon' || tool === 'freepoly'
  const polyGroupActive = tool === 'freepoly' || (tool === 'shape' && POLY_KIND_SET.has(shapeKind))
  const irregGroupActive = tool === 'shape' && !POLY_KIND_SET.has(shapeKind)
  const noTarget = !editContainer && !editContent

  const selectedObj = lines.find((l) => l.id === selectedId) || null
  const selectedLayerHasAncestor = (l: LineObj): boolean => {
    let parentId = l.parentId
    while (parentId) {
      if (selectedLayerIds.has(parentId)) return true
      parentId = lines.find((item) => item.id === parentId)?.parentId
    }
    return false
  }
  const groupableLayerCount = lines.filter(
    (l) => selectedLayerIds.has(l.id) && !l.marqueeItem && !selectedLayerHasAncestor(l)
  ).length
  const selectedIsGroup = selectedObj?.type === 'group'
  const panelObjectsForBase = (id: PaintLayerId): { l: LineObj; depth: number }[] => {
    const result: { l: LineObj; depth: number }[] = []
    const appendChildren = (parentId: string, depth: number) => {
      for (const child of [...lines].filter((l) => l.parentId === parentId).reverse()) {
        result.push({ l: child, depth })
        if (child.type === 'group' && !collapsedGroupIds.has(child.id)) {
          appendChildren(child.id, depth + 1)
        }
      }
    }
    const roots = [...lines]
      .filter((l) => vectorLayerOf(l) === id && !l.marqueeItem && !l.parentId)
      .reverse()
    for (const root of roots) {
      result.push({ l: root, depth: 0 })
      if (root.type === 'group' && !collapsedGroupIds.has(root.id)) appendChildren(root.id, 1)
    }
    return result
  }
  const directGroupChildCount = (groupId: string): number =>
    lines.filter((item) => item.parentId === groupId).length
  const editingText = selectedObj ? selectedObj.type === 'text' : tool === 'text'
  const editingPoly = selectedObj ? selectedObj.type === 'poly' : tool === 'freepoly'
  const editingShape = selectedObj ? selectedObj.type === 'shape' : tool === 'shape'
  const editingStamp = selectedObj?.type === 'stamp'
  const editingContentProxy = !!(selectedObj?.contentBound && editingStamp)
  const fillableCtx = editingPoly || editingShape
  const showVecOptions = !selectedIsGroup && !editingText && !editingStamp && (tool === 'line' || tool === 'freepoly' || tool === 'shape' || (selectedObj != null))

  const patchContentProxy = (patch: Partial<LineObj>, commit = true): void => {
    if (!selectedIdRef.current || !selectedObj?.contentBound) return
    if (commit) updateSelected(patch)
    else updateSelectedLive(patch)
  }

  // Live-patch the selected text object (if any) with the given fields.
  const patchText = (patch: Partial<LineObj>, commit = true): void => {
    if (selectedIdRef.current && selectedObj?.type === 'text') {
      if (commit) updateSelected(patch)
      else updateSelectedLive(patch)
    }
  }

  const applyOutsideTextSettings = (settings: OutsideTextSettings) => {
    const id = selectedIdRef.current
    const selected = id ? linesRef.current.find((l) => l.id === id) : null
    const target =
      selected?.type === 'text'
        ? selected
        : linesRef.current.find((l) => l.type === 'text' && l.linkedOutsideText)
          ?? linesRef.current.find((l) => l.type === 'text')
    if (!target) {
      const seeded = lineFromOutsideText(settings, W)
      linesRef.current = [...linesRef.current, seeded]
      commitLines(linesRef.current)
      selectLine(seeded)
      loadFont(seeded.fontFamily ?? 'Inter').then(() => {
        const cur = linesRef.current.find((l) => l.id === seeded.id)
        if (!cur) return
        const next = applyOutsideTextToLine(cur, settings, W)
        linesRef.current = linesRef.current.map((l) => (l.id === next.id ? next : l))
        commitLines(linesRef.current)
        setTextValue(next.text ?? '')
        setFontFamily(next.fontFamily ?? 'Inter')
        setFontSize(next.fontSize ?? 48)
        setFontWeightV(next.weight ?? 700)
        setBold(!!next.bold)
        setItalic(!!next.italic)
        setTxtLetterSpacing(next.letterSpacing ?? 0)
        setColor(next.color)
        setTxtShadow(!!next.shadow)
        setTxtShadowColor(next.shadowColor ?? '#000000b3')
        setTxtShadowBlur(next.shadowBlur ?? 8)
        setTxtShadowOX(next.shadowOffsetX ?? 0)
        setTxtShadowOY(next.shadowOffsetY ?? 4)
        setTxtShadowSpread(next.shadowSpread ?? 0)
        redrawLines()
        drawHandles()
        pushHistory()
      })
      return
    }
    const next = applyOutsideTextToLine(target, settings, W)
    linesRef.current = linesRef.current.map((l) => (l.id === next.id ? next : l))
    commitLines(linesRef.current)
    selectedIdRef.current = next.id
    setSelectedId(next.id)
    setTextValue(next.text ?? '')
    setFontFamily(next.fontFamily ?? 'Inter')
    setFontSize(next.fontSize ?? 48)
    setFontWeightV(next.weight ?? 700)
    setBold(!!next.bold)
    setItalic(!!next.italic)
    setTxtLetterSpacing(next.letterSpacing ?? 0)
    setColor(next.color)
    setHexText(isGradientColor(next.color) ? firstSolidColor(next.color) : next.color)
    setTxtShadow(!!next.shadow)
    setTxtShadowColor(next.shadowColor ?? '#000000b3')
    setTxtShadowBlur(next.shadowBlur ?? 8)
    setTxtShadowOX(next.shadowOffsetX ?? 0)
    setTxtShadowOY(next.shadowOffsetY ?? 4)
    setTxtShadowSpread(next.shadowSpread ?? 0)
    loadFont(next.fontFamily ?? 'Inter').then(() => { redrawLines(); drawHandles() })
    redrawLines()
    drawHandles()
    pushHistory()
  }

  const pickPolyShape = (k: ShapeKind) => {
    setPolyKind(k)
    setShapeKind(k)
    setTool('shape')
    setOpenMenu(null)
  }
  const pickIrregShape = (k: ShapeKind) => {
    setIrregKind(k)
    setShapeKind(k)
    setTool('shape')
    setOpenMenu(null)
  }

  return (
    <div style={NO_DRAG} className="fixed inset-0 z-[9998] flex flex-col bg-bg/95 backdrop-blur-sm">
      {openMenu && <div className="fixed inset-0 z-30" onClick={() => setOpenMenu(null)} />}
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface shrink-0">
        <span className="text-sm font-semibold text-text">{title}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface3 text-muted hover:text-text transition-colors"
          >
            <X size={13} /> Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            title={!canSave ? 'Select at least one variant to save to' : 'Save (Ctrl+S)'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={13} /> Save
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface shrink-0 flex-wrap">
        {/* Tools */}
        <div className="flex items-center gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTool(t.key)}
              title={t.label}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                tool === t.key ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              {t.icon}
            </button>
          ))}

          {/* Polygon shapes group */}
          <div className="relative z-40">
            <button
              onClick={() => {
                if (polyKind === 'freepoly') setTool('freepoly')
                else { setShapeKind(polyKind); setTool('shape') }
                setOpenMenu(openMenu === 'poly' ? null : 'poly')
              }}
              title="Polygon shapes ▾"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                polyGroupActive ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              <Square size={16} />
            </button>
            {openMenu === 'poly' && (
              <ShapeMenu
                title="Polygons"
                items={POLY_SHAPES}
                current={shapeKind}
                onPick={pickPolyShape}
                freePoly={{
                  n: freePolyN,
                  onN: setFreePolyN,
                  active: tool === 'freepoly',
                  onPick: () => { setPolyKind('freepoly'); setTool('freepoly'); setOpenMenu(null) }
                }}
              />
            )}
          </div>

          {/* Irregular shapes group */}
          <div className="relative z-40">
            <button
              onClick={() => { setShapeKind(irregKind); setTool('shape'); setOpenMenu(openMenu === 'irreg' ? null : 'irreg') }}
              title="Irregular shapes ▾"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                irregGroupActive ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              <Circle size={16} />
            </button>
            {openMenu === 'irreg' && (
              <ShapeMenu title="Irregular shapes" items={IRREG_SHAPES} current={shapeKind} onPick={pickIrregShape} />
            )}
          </div>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Copy / paste */}
          <button
            onClick={() => clipActionsRef.current.copy()}
            disabled={!selectedId && !hasMarquee}
            title="Copy (Ctrl+C)"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors disabled:opacity-30 disabled:hover:text-muted"
          >
            <Copy size={16} />
          </button>
          <button
            onClick={() => clipActionsRef.current.paste()}
            disabled={noTarget && !hasClip}
            title="Paste (Ctrl+V) — system image or copied region/shape. Lands on the top editable layer."
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors disabled:opacity-30 disabled:hover:text-muted"
          >
            <ClipboardPaste size={16} />
          </button>
          <input
            ref={imageFileInputRef}
            type="file"
            accept="image/*,.svg,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              onExternalImageFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => imageFileInputRef.current?.click()}
            disabled={noTarget}
            title="Add image or SVG on top of the highest editable layer (does not replace the icon)"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-muted"
          >
            <Upload size={16} />
          </button>

          {/* Clipboard status */}
          <div className="flex items-center gap-1.5 pl-1 text-[10px] whitespace-nowrap select-none">
            <span className="text-border">|</span>
            <span className="text-muted/70">Copied:</span>
            <span className={hasClip ? 'text-text font-medium' : 'text-muted/50'}>{hasClip ? clipLabel : 'nothing'}</span>
            <span className="text-border">|</span>
          </div>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Colour — solid / linear / radial (same picker as outside paint mode) */}
        <div className="flex items-center gap-2">
          <button
            ref={colorSwatchRef}
            type="button"
            onClick={() => {
              if (colorSwatchRef.current) {
                setColorPopupRect(colorSwatchRef.current.getBoundingClientRect())
                setColorPopupOpen(true)
              }
            }}
            className="w-8 h-8 shrink-0 rounded cursor-pointer border border-border/50 overflow-hidden"
            style={{ background: color }}
            title="Colour — click for solid / gradient"
          />
          {isGradientColor(color) ? (
            <button
              type="button"
              onClick={() => {
                if (colorSwatchRef.current) {
                  setColorPopupRect(colorSwatchRef.current.getBoundingClientRect())
                  setColorPopupOpen(true)
                }
              }}
              className="w-28 px-2 py-1 rounded bg-surface3 border border-border text-xs text-muted font-mono text-left truncate hover:border-accent transition-colors"
              title="Edit gradient"
            >
              gradient
            </button>
          ) : (
            <input
              type="text"
              value={hexText}
              onChange={(e) => {
                setHexText(e.target.value)
                const n = normalizeHex(e.target.value)
                if (n) {
                  setColor(n)
                  if (selectedIdRef.current) {
                    updateSelectedLive((l) =>
                      l.type === 'poly' || l.type === 'shape'
                        ? { color: n }
                        : { color: n, borderColor: n }
                    )
                  }
                }
              }}
              onBlur={() => setHexText(color)}
              placeholder="#RRGGBBAA"
              className="w-28 px-2 py-1 rounded bg-surface3 border border-border text-xs font-mono text-text focus:outline-none focus:border-accent"
              title="Hex with optional alpha (#RRGGBB or #RRGGBBAA)"
            />
          )}
          {colorPopupOpen && colorPopupRect && (
            <ColorPickerPopup
              value={color}
              onChange={(c) => {
                setColor(c)
                if (!isGradientColor(c)) setHexText(c)
                if (selectedIdRef.current) {
                  updateSelectedLive((l) =>
                    l.type === 'poly' || l.type === 'shape'
                      ? { color: c }
                      : { color: c, borderColor: c }
                  )
                }
              }}
              onClose={() => {
                setColorPopupOpen(false)
                if (selectedIdRef.current) pushHistory()
              }}
              rect={colorPopupRect}
            />
          )}
        </div>

        {!isGradientColor(color) && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted">Opacity</span>
            <input
              type="range" min={0} max={100} value={hexAlpha(color)}
              onChange={(e) => {
                const c = withAlpha(color, Number(e.target.value))
                setColor(c)
                setHexText(c)
                if (selectedIdRef.current) {
                  updateSelectedLive((l) =>
                    l.type === 'poly' || l.type === 'shape'
                      ? { color: c }
                      : { color: c, borderColor: c }
                  )
                }
              }}
              onMouseUp={() => { if (selectedIdRef.current) pushHistory() }}
              className="w-24"
            />
            <span className="text-[10px] text-muted w-7 text-right">{hexAlpha(color)}%</span>
          </div>
        )}

        <div className="w-px h-6 bg-border" />

        {/* Size / thickness / border width */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted">
            {fillableCtx || tool === 'shape' || tool === 'freepoly' || tool === 'polygon'
              ? 'Border width'
              : tool === 'line'
                ? 'Thickness'
                : 'Size'}
          </span>
          <input
            type="range" min={0} max={128} value={size}
            onChange={(e) => {
              const v = Number(e.target.value)
              setSize(v)
              if (selectedIdRef.current) {
                updateSelectedLive((l) =>
                  l.type === 'poly' || l.type === 'shape'
                    ? { thickness: v, borderWidth: v }
                    : { thickness: v, borderWidth: v }
                )
              }
            }}
            onMouseUp={() => { if (selectedIdRef.current) pushHistory() }}
            className="w-28"
          />
          <span className="text-[10px] text-muted w-8 text-right">{size}px</span>
        </div>

        {tool === 'brush' && (
          <div className="flex items-center gap-1" title="Brush tip shape">
            <span className="text-[11px] text-muted mr-0.5">Tip</span>
            {BRUSH_TIPS.map((t) => (
              <button
                key={t.value}
                type="button"
                title={t.label}
                onClick={() => setBrushTip(t.value)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  brushTip === t.value ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
                }`}
              >
                <BrushTipIcon tip={t.value} />
              </button>
            ))}
          </div>
        )}

        {tool === 'eraser' && (
          <div className="flex items-center gap-1" title="Eraser shape">
            <span className="text-[11px] text-muted mr-0.5">Shape</span>
            {([
              { value: 'round' as const, label: 'Circle' },
              { value: 'square' as const, label: 'Square' }
            ]).map((t) => (
              <button
                key={t.value}
                type="button"
                title={t.label}
                onClick={() => setEraserTip(t.value)}
                className={`h-8 px-2 rounded-lg flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                  eraserTip === t.value ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
                }`}
              >
                <BrushTipIcon tip={t.value} />
                {t.label}
              </button>
            ))}
          </div>
        )}

        {(shapeToolActive || fillableCtx) && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={shapeFill}
              onChange={(e) => { setShapeFill(e.target.checked); if (fillableCtx && selectedIdRef.current) updateSelected({ fill: e.target.checked }) }}
            />
            Fill shape
          </label>
        )}
        {(tool === 'shape' || tool === 'freepoly' || editingShape || editingPoly) && (
          <label
            className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none"
            title="Keep a square bounding box while drawing or resizing polygon / irregular shapes"
          >
            <input
              type="checkbox"
              checked={shapeLockAspect}
              onChange={(e) => setShapeLockAspect(e.target.checked)}
              className="accent-accent"
            />
            Lock aspect ratio
          </label>
        )}
        {(tool === 'shape' || tool === 'freepoly' || editingShape || editingPoly ||
          (editingStamp && !!selectedObj?.sourceSvgMarkup)) && (
          <label
            className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none"
            title="Keep the current stroke width instead of scaling it with the object"
          >
            <input
              type="checkbox"
              checked={keepStrokeOnResize}
              onChange={(e) => {
                const keep = e.target.checked
                setKeepStrokeOnResize(keep)
                if (selectedIdRef.current) updateSelected({ keepStrokeOnResize: keep })
              }}
              className="accent-accent"
            />
            Keep stroke on resize
          </label>
        )}

        <div className="w-px h-6 bg-border" />

        {/* Canvas transform — full canvas + session vectors */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => applyCanvasXform('ccw90')}
            title="Rotate canvas 90° counter-clockwise"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors"
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            onClick={() => applyCanvasXform('cw90')}
            title="Rotate canvas 90° clockwise"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors"
          >
            <RotateCw size={15} />
          </button>
          <button
            type="button"
            onClick={() => applyCanvasXform('180')}
            title="Rotate canvas 180°"
            className="h-8 px-1.5 rounded-lg flex items-center justify-center bg-surface3 text-[10px] font-semibold text-muted hover:text-text transition-colors"
          >
            180°
          </button>
          <button
            type="button"
            onClick={() => applyCanvasXform('flipH')}
            title="Flip horizontally"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors"
          >
            <FlipHorizontal2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => applyCanvasXform('flipV')}
            title="Flip vertically"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors"
          >
            <FlipVertical2 size={15} />
          </button>
          <button
            type="button"
            disabled={noTarget || bgRemoving}
            onClick={() => { void removeBgOnLayers() }}
            title="Remove background on checked layers (flood-fill from corners)"
            className="h-8 px-2 rounded-lg flex items-center gap-1 bg-surface3 text-[10px] font-medium text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles size={12} />
            {bgRemoving ? '…' : 'Remove BG'}
          </button>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Undo / redo / clear */}
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Undo2 size={15} />
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Redo2 size={15} />
          </button>
          {selectedObj?.type === 'stamp' && (
            <button
              onClick={cropSelectedStamp}
              title="Crop selected image to the canvas and trim transparent padding"
              className="h-8 px-2 rounded-lg flex items-center gap-1 bg-surface3 text-[10px] font-medium text-muted hover:text-text transition-colors"
            >
              <CropIcon size={14} /> Crop
            </button>
          )}
          <button
            onClick={() => {
              if (floatRef.current) clipActionsRef.current.discardFloat()
              else if (marqueeRef.current) clipActionsRef.current.clearRegion()
              else if (selectedIdRef.current) deleteSelectedRef.current()
            }}
            disabled={!selectedId && !hasMarquee}
            title="Delete selected item (Del)"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-danger transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-muted">
            <Trash2 size={15} />
          </button>
          <button onClick={clearAll} title="Clear editable layers"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-danger transition-colors">
            <Ban size={15} />
          </button>
        </div>
      </div>

      {/* Fill options */}
      {tool === 'fill' && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface2 shrink-0 flex-wrap">
          <span className="text-[11px] font-semibold text-text">Fill</span>
          <label
            className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none"
            title="Recolor every non-transparent pixel on the editable layer(s) to the fill colour. Soft edges keep their transparency."
          >
            <input
              type="checkbox"
              checked={fillAllOpaque}
              onChange={(e) => setFillAllOpaque(e.target.checked)}
              className="accent-accent"
            />
            All non-transparent
          </label>
          <label
            className={`flex items-center gap-1.5 text-[11px] select-none ${
              fillAllOpaque ? 'text-muted/40 cursor-not-allowed' : 'text-muted cursor-pointer'
            }`}
            title="Also paint thin anti-aliased fringes and 1–2px leftover outlines next to the fill. Thick opaque borders (designed on purpose) are left alone."
          >
            <input
              type="checkbox"
              checked={fillCleanEdges}
              disabled={fillAllOpaque}
              onChange={(e) => setFillCleanEdges(e.target.checked)}
              className="accent-accent"
            />
            Clean thin edges
          </label>
          <span className="text-[10px] text-muted">
            {fillAllOpaque
              ? 'Click any editable layer — every opaque pixel becomes the fill colour'
              : 'Fills AA fringes & thin rings · skips thick borders · thin session outlines inside the click also match fill colour'}
          </span>
        </div>
      )}

      {/* Marquee mode — Coverage vs Scale content */}
      {tool === 'select' && hasMarquee && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface2 shrink-0 flex-wrap">
          <span className="text-[11px] font-semibold text-text">Marquee</span>
          <span className="text-[9px] uppercase tracking-wide text-muted/70">Corner dots</span>
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => applyMarqueeMode('coverage')}
              title="Adjust what the box covers (pixels stay on the canvas until you move or scale)"
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                marqueeMode === 'coverage' ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              Coverage
            </button>
            <button
              onClick={() => applyMarqueeMode('scale')}
              title="Lift the selection and stretch/resize the highlighted pixels"
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                marqueeMode === 'scale' ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              Scale content
            </button>
          </div>
          <span className="text-[10px] text-muted">
            {marqueeMode === 'coverage'
              ? 'Blue box — drag corners to change the covered area'
              : 'Amber box — drag corners to stretch the selection'}
          </span>
        </div>
      )}

      {/* Inner content proxy — non-letter types: drag to move, corners to resize, shadow here */}
      {editingContentProxy && selectedObj && (
        <div className="flex items-center gap-2.5 px-4 py-2 border-b border-border bg-surface2 shrink-0 flex-nowrap overflow-x-auto">
          <span className="text-[11px] font-semibold text-text shrink-0">Inner content</span>
          <span className="text-[10px] text-muted shrink-0">
            Drag to move · corner handles to resize
          </span>
          <div className="w-px h-6 bg-border shrink-0" />
          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={txtShadow}
              onChange={(e) => {
                setTxtShadow(e.target.checked)
                patchContentProxy({ shadow: e.target.checked })
              }}
            />
            Shadow
          </label>
          {txtShadow && (
            <>
              <input
                type="color"
                value={txtShadowColor.slice(0, 7)}
                onChange={(e) => {
                  const c = e.target.value + (txtShadowColor.slice(7, 9) || 'b3')
                  setTxtShadowColor(c)
                  patchContentProxy({ shadowColor: c })
                }}
                className="w-7 h-7 shrink-0 rounded cursor-pointer border border-border/50 bg-transparent"
                title="Shadow colour"
              />
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                Blur
                <input type="number" min={0} max={128} value={txtShadowBlur}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(128, Number(e.target.value) || 0))
                    setTxtShadowBlur(v)
                    patchContentProxy({ shadowBlur: v })
                  }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                Spread
                <input type="number" min={0} max={64} value={txtShadowSpread}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(64, Number(e.target.value) || 0))
                    setTxtShadowSpread(v)
                    patchContentProxy({ shadowSpread: v })
                  }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                X
                <input type="number" min={-128} max={128} value={txtShadowOX}
                  onChange={(e) => {
                    const v = Math.max(-128, Math.min(128, Number(e.target.value) || 0))
                    setTxtShadowOX(v)
                    patchContentProxy({ shadowOffsetX: v })
                  }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                Y
                <input type="number" min={-128} max={128} value={txtShadowOY}
                  onChange={(e) => {
                    const v = Math.max(-128, Math.min(128, Number(e.target.value) || 0))
                    setTxtShadowOY(v)
                    patchContentProxy({ shadowOffsetY: v })
                  }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
            </>
          )}
          <button
            onClick={deleteSelected}
            title="Remove Inner content proxy (settings stay outside; re-opens fresh next time)"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-surface3 text-muted hover:text-danger transition-colors shrink-0 ml-auto"
          >
            <Trash2 size={12} /> Remove
          </button>
        </div>
      )}

      {/* Text options — shown for the Text tool or a selected text object */}
      {editingText && (
        <div className="flex items-center gap-2.5 px-4 py-2 border-b border-border bg-surface2 shrink-0 flex-nowrap overflow-x-auto">
          <span className="text-[11px] font-semibold text-text shrink-0">
            {textEditId ? 'Typing' : 'Text'}
          </span>
          {lettersOutside && (
            <label
              className="flex items-center gap-1.5 text-[11px] text-muted select-none shrink-0 cursor-pointer"
              title="Copy text, font, size, weight, color, spacing, and offset from outside Inner content settings"
            >
              <input
                type="checkbox"
                checked={useOutsideText}
                onChange={(e) => {
                  const on = e.target.checked
                  setUseOutsideText(on)
                  if (on && lettersOutside) applyOutsideTextSettings(lettersOutside)
                }}
                className="accent-accent"
              />
              Use outside text settings
            </label>
          )}
          <label className="flex items-center gap-1.5 text-[11px] text-muted select-none shrink-0">
            Font
            <select
              value={fontFamily}
              onChange={(e) => { setFontFamily(e.target.value); patchText({ fontFamily: e.target.value }) }}
              className="px-2 py-1 rounded-md bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent cursor-pointer max-w-[140px]"
            >
              {FONT_FAMILY_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.families.map((f) => <option key={f} value={f}>{f}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted select-none shrink-0">
            Size
            <input
              type="number" min={4} max={512} value={fontSize}
              onChange={(e) => { const v = Math.max(4, Math.min(512, Number(e.target.value) || 4)); setFontSize(v); patchText({ fontSize: v }) }}
              className="w-14 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted select-none shrink-0" title="Line height as % of font size">
            Line height
            <input
              type="number" min={80} max={300} step={1}
              value={Math.round(txtLineHeight * 100)}
              onChange={(e) => {
                const v = Math.max(0.8, Math.min(3, (Number(e.target.value) || 128) / 100))
                setTxtLineHeight(v)
                patchText({ lineHeight: v })
              }}
              className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
            />
            <span className="text-[10px] text-muted">%</span>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted select-none shrink-0" title="Extra space between characters">
            Spacing
            <input
              type="number" min={-20} max={80} step={1}
              value={txtLetterSpacing}
              onChange={(e) => {
                const v = Math.max(-20, Math.min(80, Number(e.target.value) || 0))
                setTxtLetterSpacing(v)
                patchText({ letterSpacing: v })
              }}
              className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
            />
            <span className="text-[10px] text-muted">px</span>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted select-none shrink-0">
            Weight
            <select
              value={String(fontWeightV)}
              onChange={(e) => { const v = Number(e.target.value); setFontWeightV(v); patchText({ weight: v }) }}
              className="px-2 py-1 rounded-md bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent cursor-pointer"
            >
              {FONT_WEIGHTS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </label>
          <button
            onClick={() => { const v = !bold; setBold(v); patchText({ bold: v }) }}
            title="Bold"
            className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors ${bold ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}
          >
            <BoldIcon size={15} />
          </button>
          <button
            onClick={() => { const v = !italic; setItalic(v); patchText({ italic: v }) }}
            title="Italic"
            className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors ${italic ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}
          >
            <ItalicIcon size={15} />
          </button>

          <div className="w-px h-6 bg-border shrink-0" />

          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={txtShadow}
              onChange={(e) => { setTxtShadow(e.target.checked); patchText({ shadow: e.target.checked }) }}
            />
            Shadow
          </label>
          {txtShadow && (
            <>
              <input
                type="color"
                value={txtShadowColor.slice(0, 7)}
                onChange={(e) => { const c = e.target.value + (txtShadowColor.slice(7, 9) || 'b3'); setTxtShadowColor(c); patchText({ shadowColor: c }) }}
                className="w-7 h-7 shrink-0 rounded cursor-pointer border border-border/50 bg-transparent"
                title="Shadow colour"
              />
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                Blur
                <input type="number" min={0} max={128} value={txtShadowBlur}
                  onChange={(e) => { const v = Math.max(0, Math.min(128, Number(e.target.value) || 0)); setTxtShadowBlur(v); patchText({ shadowBlur: v }) }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                Spread
                <input type="number" min={0} max={64} value={txtShadowSpread}
                  onChange={(e) => { const v = Math.max(0, Math.min(64, Number(e.target.value) || 0)); setTxtShadowSpread(v); patchText({ shadowSpread: v }) }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                X
                <input type="number" min={-128} max={128} value={txtShadowOX}
                  onChange={(e) => { const v = Math.max(-128, Math.min(128, Number(e.target.value) || 0)); setTxtShadowOX(v); patchText({ shadowOffsetX: v }) }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                Y
                <input type="number" min={-128} max={128} value={txtShadowOY}
                  onChange={(e) => { const v = Math.max(-128, Math.min(128, Number(e.target.value) || 0)); setTxtShadowOY(v); patchText({ shadowOffsetY: v }) }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
            </>
          )}
          {selectedId && (
            <button
              onClick={deleteSelected}
              title="Delete text (Del)"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-surface3 text-muted hover:text-danger transition-colors shrink-0 ml-auto"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      )}

      {/* Vector object options — shown for the Line / Free-polygon tools or a selection */}
      {showVecOptions && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface2 shrink-0 flex-wrap">
          <span className="text-[11px] font-semibold text-text">
            {editingShape
              ? (selectedObj ? 'Edit shape' : 'New shape')
              : editingPoly
                ? (selectedObj ? 'Edit polygon' : 'New polygon')
                : (selectedObj ? 'Edit line' : 'New line')}
          </span>
          {!fillableCtx && (
            <>
              <LineSelect
                label="Type"
                value={lineType}
                options={LINE_TYPES.filter((o) => o.value !== 'poly')}
                onChange={(v) => {
                  setLineType(v)
                  if (selectedIdRef.current) updateSelected((l) => ({ type: v, pts: convertPts(l, v) }))
                }}
              />
              {(lineType === 'polyline' || lineType === 'free') && (
                <label className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="uppercase tracking-wide text-[9px] text-muted/70">Points</span>
                  <input
                    type="number" min={2} max={40} value={linePointCount}
                    onChange={(e) => {
                      const n = Math.max(2, Math.min(40, Number(e.target.value) || 2))
                      setLinePointCount(n)
                      if (selectedIdRef.current) updateSelected((l) => ({ pts: resampleAlong(flattenLine(l), n) }))
                    }}
                    className="w-14 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
                  />
                </label>
              )}
              <LineSelect
                label="Start"
                value={startCap}
                options={CAP_TYPES}
                onChange={(v) => { setStartCap(v); if (selectedIdRef.current) updateSelected({ startCap: v }) }}
              />
              <LineSelect
                label="End"
                value={endCap}
                options={CAP_TYPES}
                onChange={(v) => { setEndCap(v); if (selectedIdRef.current) updateSelected({ endCap: v }) }}
              />
            </>
          )}
          <LineSelect
            label="Style"
            value={lineDash}
            options={DASH_TYPES}
            onChange={(v) => { setLineDash(v); if (selectedIdRef.current) updateSelected({ dash: v }) }}
          />
          <span className="text-border">|</span>
          <label className="flex items-center gap-1.5 text-[11px] text-muted select-none">
            <span className="uppercase tracking-wide text-[9px] text-muted/70">Border</span>
            <button
              ref={borderSwatchRef}
              type="button"
              onClick={() => {
                if (borderSwatchRef.current) {
                  setBorderPopupRect(borderSwatchRef.current.getBoundingClientRect())
                  setBorderPopupOpen(true)
                }
              }}
              className="w-7 h-7 shrink-0 rounded cursor-pointer border border-border/50 overflow-hidden"
              style={{ background: borderColor }}
              title="Border colour"
            />
          </label>
          {borderPopupOpen && borderPopupRect && (
            <ColorPickerPopup
              value={borderColor}
              onChange={(c) => {
                setBorderColor(c)
                if (!fillableCtx) setColor(c)
                if (selectedIdRef.current) {
                  updateSelectedLive((l) =>
                    l.type === 'poly' || l.type === 'shape'
                      ? { borderColor: c }
                      : { borderColor: c, color: c }
                  )
                }
              }}
              onClose={() => {
                setBorderPopupOpen(false)
                if (selectedIdRef.current) pushHistory()
              }}
              rect={borderPopupRect}
            />
          )}
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="uppercase tracking-wide text-[9px] text-muted/70">Width</span>
            <input
              type="number"
              min={0}
              max={128}
              value={size}
              onChange={(e) => {
                const v = Math.max(0, Math.min(128, Number(e.target.value) || 0))
                setSize(v)
                if (selectedIdRef.current) updateSelected({ thickness: v, borderWidth: v })
              }}
              className="w-14 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
              title="Border width (0 = no border)"
            />
          </label>
          {(
            editingPoly ||
            (editingShape && shapeSupportsRadius((selectedObj?.shape ?? shapeKind) as ShapeKind)) ||
            (!fillableCtx && (lineType === 'polyline' || lineType === 'free' || lineType === 'drawn'))
          ) && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="uppercase tracking-wide text-[9px] text-muted/70">Radius</span>
              <input
                type="number"
                min={0}
                max={256}
                value={borderRadius}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(256, Number(e.target.value) || 0))
                  setBorderRadius(v)
                  if (selectedIdRef.current) updateSelected({ borderRadius: v })
                }}
                className="w-14 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
                title="Border / corner radius"
              />
            </label>
          )}
          <span className="text-[10px] text-muted">
            {fillableCtx ? 'Fill colour & fill toggle use the toolbar above.' : 'Stroke colour also uses the toolbar above.'}
          </span>
          {/* Drawn (freehand) — split: set-before-draw vs edit-anytime */}
          {!fillableCtx && lineType === 'drawn' && (() => {
            const nFilled = drawnPointCount.trim() !== ''
            return (
              <>
                <span className="text-border">|</span>
                <span className="text-[9px] uppercase tracking-wide text-muted/70" title="These only affect how the next freehand stroke is captured">
                  Before draw
                </span>
                <label
                  className={`flex items-center gap-1.5 text-[11px] select-none ${
                    nFilled ? 'text-muted/40 cursor-not-allowed' : 'text-muted cursor-pointer'
                  }`}
                  title={nFilled
                    ? 'Disabled while adjustable points is set — that value overrides sampling'
                    : 'Set before drawing. On: place points by travel distance · Off: default (every mouse move)'}
                >
                  <input
                    type="checkbox"
                    checked={drawnDistanceMode}
                    disabled={nFilled}
                    onChange={(e) => setDrawnDistanceMode(e.target.checked)}
                    className="accent-accent disabled:opacity-40"
                  />
                  Distance sample
                </label>
                <label
                  className="flex items-center gap-1.5 text-[11px] text-muted select-none"
                  title="Set before drawing (also reshapes a selected freehand line). When set, overrides distance sampling."
                >
                  <span className="uppercase tracking-wide text-[9px] text-muted/70">Adjustable points</span>
                  <input
                    type="number"
                    min={2}
                    max={200}
                    value={drawnPointCount}
                    placeholder="auto"
                    onChange={(e) => {
                      const raw = e.target.value
                      setDrawnPointCount(raw)
                      const n = Number(raw)
                      if (raw.trim() !== '' && n >= 2 && selectedIdRef.current) {
                        updateSelected((l) =>
                          l.type === 'drawn'
                            ? { pts: resampleAlong(flattenLine(l), Math.max(2, Math.min(200, Math.round(n)))) }
                            : {}
                        )
                      }
                    }}
                    className="w-16 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent placeholder:text-muted/40"
                  />
                </label>
                <span className="text-border">|</span>
                <span className="text-[9px] uppercase tracking-wide text-muted/70" title="These apply immediately to the selected freehand line">
                  Anytime
                </span>
                <label
                  className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none"
                  title="Works anytime — On: smooth curve through adjustable points · Off: straight segments"
                >
                  <input
                    type="checkbox"
                    checked={drawnCurve}
                    onChange={(e) => {
                      const v = e.target.checked
                      setDrawnCurve(v)
                      if (selectedIdRef.current) updateSelected((l) => l.type === 'drawn' ? { drawnCurve: v } : {})
                    }}
                    className="accent-accent"
                  />
                  Curve points
                </label>
              </>
            )
          })()}
          {selectedId && (
            <button
              onClick={deleteSelected}
              title="Delete selected (Del)"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-surface3 text-muted hover:text-danger transition-colors"
            >
              <Trash2 size={12} /> Delete {editingShape ? 'shape' : editingPoly ? 'polygon' : 'line'}
            </button>
          )}
        </div>
      )}

      {/* Canvas + icon palette + optional save-target columns */}
      <div className="flex flex-1 min-h-0">
      {/* Left: Library / Browse / AI icon palette */}
      <aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-border shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Icons</p>
          <p className="text-[9px] text-muted/70 mt-0.5">Drag, click, or paste SVG code · mixes with paint</p>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <IconPicker
            value={paletteIcon}
            onChange={(patch) => setPaletteIcon((prev) => ({ ...prev, ...patch }))}
            onOpenSettings={onOpenSettings ?? (() => {})}
            tabs={['library', 'browse', 'svg', 'ai']}
            onPickSvg={(svg) => { void placeSvgMarkupRef.current(svg, undefined, 'library') }}
            enableDrag
            fillHeight
            keepStrokeOnResize={keepStrokeOnResize}
            onKeepStrokeOnResizeChange={setKeepStrokeOnResize}
          />
        </div>
      </aside>
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
      {/* Canvas stage — same pan/zoom as logo & favicon preview */}
      <PreviewStage
        className="flex-1 min-h-0"
        onStageMouseDown={(e) => {
          if (tool === 'select' && e.button === 0) onDown(e)
        }}
      >
        <div
          ref={stageRef}
          className="relative shadow-2xl"
          style={{
            background: CHECKER,
            width: 'min(70vh, 70vw)',
            height: 'min(70vh, 70vw)'
          }}
          onDragOver={(e) => {
            const types = [...e.dataTransfer.types]
            if (
              types.includes(PAINT_SVG_MIME) ||
              types.includes(PAINT_LUCIDE_MIME) ||
              types.includes('Files') ||
              types.includes('text/plain')
            ) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDrop={(e) => { void handleStageDrop(e) }}
        >
          {/* Only the composited frame + interaction preview mount in the stage.
              Base buffers are off-DOM. key remounts the display surface whenever
              any layer checkbox changes so Chromium cannot keep a stale bitmap. */}
          <canvas
            key={`paint-display:${layerVisibilitySig}`}
            ref={displayCompositeRef}
            width={W}
            height={H}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{
              imageRendering: 'auto',
              visibility: anythingLayerVisible ? 'visible' : 'hidden'
            }}
          />
          <canvas
            key={`paint-preview:${layerVisibilitySig}`}
            ref={previewRef}
            width={W}
            height={H}
            className="absolute inset-0 w-full h-full"
            style={{
              visibility: anythingLayerVisible ? 'visible' : 'hidden',
              cursor: tool === 'pointer' ? 'default' : tool === 'text' ? 'text' : (noTarget && tool !== 'fill' && tool !== 'eyedropper' && tool !== 'line' && tool !== 'freepoly' && tool !== 'select' && tool !== 'shape' ? 'not-allowed' : 'crosshair')
            }}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={() => {
              // Do not end the stroke here — window capture keeps following the cursor.
              if (!pointerDragCleanupRef.current && !drawing.current && tool === 'eraser') clearPreview()
            }}
            onDoubleClick={(e) => {
              if (tool === 'polygon') { finishPolygon(); return }
              if (tool !== 'pointer') return
              const pt = toCanvas(e)
              const hit = [...linesRef.current].reverse().find((l) => {
                if (l.type !== 'text' || !isVectorVisible(l)) return false
                const q = rotatePt(pt, objCenter(l), -(l.rot ?? 0))
                return pointInPoly(flattenLine(l), q)
              })
              if (hit) startTextEditRef.current(hit.id)
            }}
          />
          {textEditId && (() => {
            const l = lines.find((x) => x.id === textEditId) || linesRef.current.find((x) => x.id === textEditId)
            if (!l || l.type !== 'text') return null
            const sx = stageSize.w / W
            const sy = stageSize.h / H
            const p = l.pts[0]
            const probe: LineObj = { ...l, text: textValue || ' ' }
            const m = textMetrics(probe)
            const fs = (l.fontSize ?? fontSize) * sx
            const weight = l.bold ? 'bold' : String(l.weight ?? fontWeightV)
            const solid = firstSolidColor(l.color)
            const c = objCenter(l)
            const rot = l.rot ?? 0
            const b = textBBox(probe)
            const corner = rotatePt({ x: b.x, y: b.y }, c, rot)
            const pin = rotatePinAt({ ...l, text: textValue || ' ' })
            const exitAndDrag = (kind: 'handle' | 'rotate', ev: React.MouseEvent) => {
              ev.preventDefault()
              ev.stopPropagation()
              const id = textEditIdRef.current
              if (!id) return
              const obj = linesRef.current.find((x) => x.id === id)
              endTextEditRef.current()
              if (!obj) return
              const pt = clientToCanvas(ev)
              if (kind === 'handle') {
                lineDragRef.current = { kind: 'handle', id, idx: 0 }
              } else {
                const center = objCenter(obj)
                lineDragRef.current = {
                  kind: 'rotate', id, center,
                  startAng: Math.atan2(pt.y - center.y, pt.x - center.x),
                  startRot: obj.rot ?? 0
                }
              }
              beginWindowDrag()
            }
            return (
              <>
                <textarea
                  ref={textAreaRef}
                  value={textValue}
                  placeholder="Type here…"
                  rows={Math.max(1, textValue.split('\n').length)}
                  onChange={(e) => {
                    const v = e.target.value
                    setTextValue(v)
                    const cur = linesRef.current.find((x) => x.id === textEditIdRef.current)
                    if (cur && cur.type === 'text') {
                      cur.text = v
                      linesRef.current = [...linesRef.current]
                      setLines(linesRef.current)
                      drawHandles()
                    }
                  }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return
                    const startX = e.clientX
                    const startY = e.clientY
                    const id = textEditIdRef.current
                    if (!id) return
                    let dragging = false
                    const onMove = (ev: MouseEvent) => {
                      if (!dragging) {
                        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return
                        dragging = true
                        endTextEditRef.current()
                        lineDragRef.current = { kind: 'move', id, grab: clientToCanvas(ev) }
                      } else {
                        lineMove(clientToCanvas(ev))
                      }
                    }
                    const onUp = (ev: MouseEvent) => {
                      window.removeEventListener('mousemove', onMove)
                      window.removeEventListener('mouseup', onUp)
                      if (dragging) lineUp(clientToCanvas(ev))
                    }
                    window.addEventListener('mousemove', onMove)
                    window.addEventListener('mouseup', onUp)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      e.stopPropagation()
                      endTextEditRef.current()
                      return
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      e.stopPropagation()
                      endTextEditRef.current()
                    }
                    // Shift+Enter → native newline
                  }}
                  spellCheck={false}
                  className="absolute z-20 m-0 p-0 border border-accent/80 rounded-sm bg-transparent outline-none resize-none overflow-hidden caret-accent"
                  style={{
                    left: p.x * sx,
                    top: p.y * sy,
                    width: Math.max(fs * 0.6, m.w * sx + 4),
                    height: Math.max(fs * 1.2, m.h * sy + 2),
                    fontFamily: l.fontFamily ?? fontFamily,
                    fontSize: fs,
                    fontWeight: weight as React.CSSProperties['fontWeight'],
                    fontStyle: l.italic ? 'italic' : 'normal',
                    lineHeight: l.lineHeight ?? txtLineHeight,
                    letterSpacing: `${(l.letterSpacing ?? txtLetterSpacing) * sx}px`,
                    color: solid.length === 9 ? solid.slice(0, 7) : solid,
                    opacity: solid.length === 9 ? parseInt(solid.slice(7, 9), 16) / 255 : 1,
                    transform: `rotate(${(rot * 180) / Math.PI}deg)`,
                    transformOrigin: '0 0',
                    whiteSpace: 'pre',
                    boxShadow: '0 0 0 1px rgba(59,130,246,0.35)'
                  }}
                />
                {/* Above textarea so corner / pin can exit edit mode */}
                <button
                  type="button"
                  title="Drag to move · exits typing"
                  onMouseDown={(e) => exitAndDrag('handle', e)}
                  className="absolute z-30 rounded-full bg-white border-2 border-accent shadow cursor-grab active:cursor-grabbing"
                  style={{
                    left: corner.x * sx - 7,
                    top: corner.y * sy - 7,
                    width: 14,
                    height: 14
                  }}
                />
                <button
                  type="button"
                  title="Drag to rotate · exits typing"
                  onMouseDown={(e) => exitAndDrag('rotate', e)}
                  className="absolute z-30 rounded-full bg-white border-2 shadow cursor-grab active:cursor-grabbing"
                  style={{
                    left: pin.x * sx - 7,
                    top: pin.y * sy - 7,
                    width: 14,
                    height: 14,
                    borderColor: '#10b981'
                  }}
                />
              </>
            )
          })()}
        </div>
      </PreviewStage>

      {/* Footer — status hint */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-surface shrink-0">
        <div className="text-[11px] text-muted">
          {tool === 'text'
            ? (textEditId ? 'Typing…' : 'Text')
            : tool === 'pointer'
            ? 'Click to select · drag to move · double-click text to type · Del deletes selected (when not typing)'
            : tool === 'select'
            ? (hasMarquee
              ? (marqueeMode === 'coverage'
                ? 'Coverage mode — drag corners to adjust what the box covers · drag inside to lift & move · switch to Scale content to stretch'
                : 'Scale mode — drag corners to stretch pixels · drag inside to move · Enter place · Del delete')
              : 'Drag a box to select · then use Coverage / Scale content with the corner dots')
            : tool === 'line' || tool === 'freepoly'
            ? 'Lines/shapes are session vectors (not tied to Editable layers) • drag to draw • Fill uses them as walls'
            : tool === 'shape'
              ? 'Drag to draw the selected shape — session vectors, not tied to Editable layers'
              : tool === 'fill'
                ? (selectedObj
                  ? `Fill selected object layer: ${selectedObj.name ?? defaultObjectLayerName(selectedObj)}`
                  : noTarget
                  ? 'Select an object layer, or enable Inner content / Outer shape, to use Fill.'
                  : fillAllOpaque
                    ? `All non-transparent on: ${editLayersLabel()} · click to recolor every opaque pixel`
                    : `Fill on: ${editLayersLabel()} · session drawings act as walls`)
                : noTarget && selectedObj?.type !== 'shape'
                ? 'Enable Outer shape and/or Inner content for brush, eraser, and fill.'
                : tool === 'polygon'
                  ? 'Click to add points • double-click or Enter to finish • Esc to cancel shape'
                  : tool === 'brush'
                    ? selectedObj?.type === 'shape'
                      ? `Brush on shape layer: ${selectedObj.name ?? 'Shape'}`
                      : `Brush on: ${addPaintTargetLabel()} (topmost checked layer)`
                    : tool === 'eraser'
                      ? selectedObj?.type === 'shape'
                        ? `Eraser on shape layer: ${selectedObj.name ?? 'Shape'} · Shift snaps angle`
                        : `Eraser on: ${editLayersLabel()} · Shift snaps angle`
                      : `Brush/eraser — check editable layers in the Layers panel`}
        </div>
      </div>
      </div>

      <aside className="w-[16.9rem] shrink-0 border-l border-border bg-surface flex flex-col min-h-0">
        {showSaveTargets && (
          <section className="h-2/5 min-h-0 flex flex-col border-b border-border">
            <div className="px-3 py-2 border-b border-border shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Save to variants</p>
              <p className="text-[9px] text-muted/70 mt-0.5">Pick where this paint applies</p>
            </div>
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 min-w-0 overflow-y-auto border-r border-border px-2 py-2 space-y-1">
                <p className="text-[9px] font-semibold text-text-dim uppercase tracking-wide mb-1.5 px-1">Logo</p>
                {logoVariantOptions.length === 0 ? (
                  <p className="text-[9px] text-muted/50 px-1">None</p>
                ) : (
                  logoVariantOptions.map((v) => (
                    <label
                      key={v.id}
                      className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer text-[11px] transition-colors ${
                        saveLogoIds.has(v.id) ? 'bg-accent/15 text-text' : 'text-muted hover:bg-surface3 hover:text-text'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={saveLogoIds.has(v.id)}
                        onChange={() => toggleSaveId('logo', v.id)}
                        className="accent-accent shrink-0"
                      />
                      <span className="truncate">{v.label.trim() || 'unnamed'}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="flex-1 min-w-0 overflow-y-auto px-2 py-2 space-y-1">
                <p className="text-[9px] font-semibold text-text-dim uppercase tracking-wide mb-1.5 px-1">Favicon</p>
                {faviconVariantOptions.length === 0 ? (
                  <p className="text-[9px] text-muted/50 px-1">None</p>
                ) : (
                  faviconVariantOptions.map((v) => (
                    <label
                      key={v.id}
                      className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer text-[11px] transition-colors ${
                        saveFaviconIds.has(v.id) ? 'bg-accent/15 text-text' : 'text-muted hover:bg-surface3 hover:text-text'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={saveFaviconIds.has(v.id)}
                        onChange={() => toggleSaveId('favicon', v.id)}
                        className="accent-accent shrink-0"
                      />
                      <span className="truncate">{v.label.trim() || 'unnamed'}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        <section className={`${showSaveTargets ? 'h-3/5' : 'h-full'} min-h-0 flex flex-col`}>
          <div className="px-3 py-2 border-b border-border shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Layers</p>
            <p className="text-[9px] text-muted/70 mt-0.5">
              Drag above/below · drop on group centre to nest
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-scroll p-2 space-y-1.5">
            {layerOrder.map((id) => {
              const isContent = id === 'content'
              const enabled = isContent ? editContent : editContainer && containerUsable
              const disabled = !isContent && !containerUsable
              return (
                <React.Fragment key={id}>
                  {panelObjectsForBase(id)
                    .map(({ l, depth }) => {
                      const key = `object:${l.id}`
                      const selected = selectedLayerIds.has(l.id)
                      const objectEnabled = (l.visible ?? l.editable ?? true) !== false
                      const effectivelyEnabled = isVectorVisible(l)
                      const icon = l.type === 'group'
                        ? <Layers size={13} />
                        : l.type === 'stamp'
                        ? (l.stampSource === 'library'
                          ? <Library size={13} />
                          : <ImageIcon size={13} />)
                        : l.type === 'text'
                          ? <TypeIcon size={13} />
                          : l.type === 'shape' || l.type === 'poly'
                            ? <Square size={13} />
                            : l.type === 'drawn'
                              ? <Pencil size={13} />
                            : <Minus size={13} />
                      return (
                        <div
                          key={key}
                          draggable={renamingLayerId !== l.id}
                          onMouseDown={(e) => {
                            if (e.button !== 0 || renamingLayerId === l.id) return
                            if (!effectivelyEnabled) return
                            selectedBaseLayerRef.current = null
                            setSelectedBaseLayer(null)
                            const multi = e.ctrlKey || e.metaKey
                            if (multi) {
                              const next = new Set(selectedLayerIds)
                              if (next.has(l.id)) next.delete(l.id)
                              else next.add(l.id)
                              setSelectedLayerIds(next)
                              if (next.has(l.id)) selectLine(l, true)
                              else if (selectedIdRef.current === l.id) {
                                const fallback = linesRef.current.find((item) => next.has(item.id))
                                selectedIdRef.current = fallback?.id ?? null
                                setSelectedId(fallback?.id ?? null)
                              }
                            } else {
                              selectLine(l)
                            }
                            setTool('pointer')
                            redrawLines()
                            drawHandles()
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            setRenamingLayerId(l.id)
                            setLayerNameDraft(l.name ?? defaultObjectLayerName(l))
                          }}
                          onDragStart={(e) => {
                            draggedLayerRef.current = key
                            setLayerDropTarget(null)
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', key)
                          }}
                          onDragOver={(e) => {
                            if (draggedLayerRef.current && draggedLayerRef.current !== key) {
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                              const allowInside =
                                l.type === 'group' &&
                                canNestDraggedIntoGroup(draggedLayerRef.current, l.id)
                              const position = dropPositionForRow(e, allowInside)
                              setLayerDropTarget((prev) =>
                                prev?.key === key && prev.position === position
                                  ? prev
                                  : { key, position }
                              )
                            }
                          }}
                          onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                              setLayerDropTarget((prev) => prev?.key === key ? null : prev)
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const dragged = draggedLayerRef.current
                            const allowInside =
                              l.type === 'group' &&
                              canNestDraggedIntoGroup(dragged, l.id)
                            const position =
                              layerDropTarget?.key === key
                                ? layerDropTarget.position
                                : dropPositionForRow(e, allowInside)
                            draggedLayerRef.current = null
                            setLayerDropTarget(null)
                            if (dragged) dropLayerItem(dragged, key, position)
                          }}
                          onDragEnd={() => {
                            draggedLayerRef.current = null
                            setLayerDropTarget(null)
                          }}
                          className={`relative flex items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-[11px] transition-colors cursor-pointer ${
                            layerDropTarget?.key === key && layerDropTarget.position === 'inside'
                              ? 'ring-2 ring-accent bg-accent/25 '
                              : ''
                          }${
                            selected
                              ? 'border-accent bg-surface3/70 text-text'
                              : objectEnabled
                                ? 'border-border bg-surface3/70 text-text hover:border-muted'
                                : 'border-border bg-surface3/40 text-muted opacity-55'
                          }`}
                          style={{ marginLeft: depth * 16 }}
                          title="Drag to reorder · double-click name to rename"
                        >
                          {layerDropTarget?.key === key && layerDropTarget.position !== 'inside' && (
                            <span
                              className={`absolute left-0 right-0 h-0.5 bg-accent rounded-full pointer-events-none z-10 ${
                                layerDropTarget.position === 'before' ? '-top-1' : '-bottom-1'
                              }`}
                            >
                              <span className="absolute -left-0.5 -top-1 w-2 h-2 rounded-full bg-accent" />
                            </span>
                          )}
                          <GripVertical size={13} className="cursor-grab shrink-0" />
                          {l.type === 'group' ? (
                            <button
                              type="button"
                              draggable={false}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                setCollapsedGroupIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(l.id)) next.delete(l.id)
                                  else next.add(l.id)
                                  return next
                                })
                              }}
                              className="w-4 h-4 -mx-0.5 shrink-0 rounded flex items-center justify-center text-muted hover:text-text hover:bg-surface"
                              title={collapsedGroupIds.has(l.id) ? 'Expand group' : 'Collapse group'}
                            >
                              {collapsedGroupIds.has(l.id)
                                ? <ChevronRight size={12} />
                                : <ChevronDown size={12} />}
                            </button>
                          ) : (
                            <span className="w-3 shrink-0" />
                          )}
                          <input
                            type="checkbox"
                            checked={objectEnabled}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const checked = e.target.checked
                              const affectedIds = new Set<string>([l.id])
                              if (l.type === 'group') {
                                let changed = true
                                while (changed) {
                                  changed = false
                                  for (const item of linesRef.current) {
                                    if (
                                      item.parentId &&
                                      affectedIds.has(item.parentId) &&
                                      !affectedIds.has(item.id)
                                    ) {
                                      affectedIds.add(item.id)
                                      changed = true
                                    }
                                  }
                                }
                              }
                              // Group toggles cascade to the complete subtree.
                              // A child can still be re-enabled independently afterward.
                              const next = linesRef.current.map((item) =>
                                affectedIds.has(item.id) ? { ...item, visible: checked } : item
                              )
                              commitLines(next)
                              if (!checked) {
                                setSelectedLayerIds((prev) => {
                                  const selected = new Set(prev)
                                  for (const id of affectedIds) selected.delete(id)
                                  return selected
                                })
                              }
                              if (
                                !checked &&
                                selectedIdRef.current &&
                                affectedIds.has(selectedIdRef.current)
                              ) {
                                selectedIdRef.current = null
                                setSelectedId(null)
                              } else if (checked && l.type === 'group' && selectedIdRef.current) {
                                let current = linesRef.current.find((item) => item.id === selectedIdRef.current)
                                while (current?.parentId) {
                                  if (current.parentId === l.id) {
                                    selectedIdRef.current = l.id
                                    setSelectedId(l.id)
                                    break
                                  }
                                  current = linesRef.current.find((item) => item.id === current?.parentId)
                                }
                              }
                              clearPreview()
                              redrawLinesRef.current()
                              pushHistory()
                            }}
                            className="accent-accent shrink-0"
                          />
                          {icon}
                          {renamingLayerId === l.id ? (
                            <input
                              autoFocus
                              value={layerNameDraft}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setLayerNameDraft(e.target.value)}
                              onBlur={() => {
                                renameObjectLayer(l.id, layerNameDraft)
                                setRenamingLayerId(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                                if (e.key === 'Escape') {
                                  setRenamingLayerId(null)
                                  setLayerNameDraft('')
                                }
                              }}
                              className="min-w-0 flex-1 px-1 py-0.5 rounded bg-surface border border-accent text-[10px] text-text outline-none"
                            />
                          ) : (
                            <span className="truncate font-medium flex-1 min-w-0">
                              {l.name ?? defaultObjectLayerName(l)}
                            </span>
                          )}
                          {l.type === 'group' && (
                            <span
                              className="shrink-0 min-w-4 px-1 rounded bg-surface text-[9px] text-muted text-center"
                              title={`${directGroupChildCount(l.id)} direct child layer${directGroupChildCount(l.id) === 1 ? '' : 's'}`}
                            >
                              {directGroupChildCount(l.id)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  <div
                    draggable={!disabled}
                    onMouseDown={() => {
                      if (disabled) return
                      setTool('pointer')
                      selectedBaseLayerRef.current = id
                      setSelectedBaseLayer(id)
                      selectedIdRef.current = null
                      setSelectedId(null)
                      setSelectedLayerIds(new Set())
                      clearPreview()
                      requestAnimationFrame(() => drawHandles())
                    }}
                    onDragStart={(e) => {
                      const key = `base:${id}`
                      draggedLayerRef.current = key
                      setLayerDropTarget(null)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', key)
                    }}
                    onDragOver={(e) => {
                      const key = `base:${id}`
                      if (draggedLayerRef.current && draggedLayerRef.current !== key) {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        const position = dropPositionForRow(e, false)
                        setLayerDropTarget((prev) =>
                          prev?.key === key && prev.position === position
                            ? prev
                            : { key, position }
                        )
                      }
                    }}
                    onDragLeave={(e) => {
                      const key = `base:${id}`
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setLayerDropTarget((prev) => prev?.key === key ? null : prev)
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const dragged = draggedLayerRef.current
                      const key = `base:${id}`
                      const position =
                        layerDropTarget?.key === key
                          ? layerDropTarget.position
                          : dropPositionForRow(e, false)
                      draggedLayerRef.current = null
                      setLayerDropTarget(null)
                      if (dragged) dropLayerItem(dragged, key, position)
                    }}
                    onDragEnd={() => {
                      draggedLayerRef.current = null
                      setLayerDropTarget(null)
                    }}
                    className={`relative flex items-center gap-1.5 rounded-lg border px-1.5 py-2 text-[11px] transition-colors ${
                      disabled
                        ? 'opacity-40 border-border text-muted cursor-not-allowed'
                        : selectedBaseLayer === id
                          ? 'border-accent bg-surface3/70 text-text'
                          : enabled
                            ? 'border-border bg-surface3/70 text-text hover:border-muted'
                            : 'border-border bg-surface3/70 text-muted hover:border-muted'
                    }`}
                    title={disabled
                      ? 'This icon has no Outer shape layer'
                      : 'Live base + paint overlay. Brush/eraser/fill write to the overlay only; settings stay editable outside Paint.'}
                  >
                    {layerDropTarget?.key === `base:${id}` && (
                      <span
                        className={`absolute left-0 right-0 h-0.5 bg-accent rounded-full pointer-events-none z-10 ${
                          layerDropTarget.position === 'before' ? '-top-1' : '-bottom-1'
                        }`}
                      >
                        <span className="absolute -left-0.5 -top-1 w-2 h-2 rounded-full bg-accent" />
                      </span>
                    )}
                    <GripVertical size={13} className={disabled ? '' : 'cursor-grab shrink-0'} />
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={disabled}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        if (isContent) {
                          editContentRef.current = e.target.checked
                          setEditContent(e.target.checked)
                        } else {
                          editContainerRef.current = e.target.checked
                          setEditContainer(e.target.checked)
                        }
                        clearPreview()
                        redrawLinesRef.current()
                      }}
                      className="accent-accent shrink-0"
                    />
                    {isContent ? <ImageIcon size={13} /> : <Layers size={13} />}
                    <span className="truncate font-semibold">
                      {isContent ? 'Inner paint' : 'Outer paint'}
                    </span>
                    <span className="ml-auto text-[8px] uppercase tracking-wide text-muted/50">Overlay</span>
                  </div>
                </React.Fragment>
              )
            })}
          </div>
          <div className="shrink-0 border-t border-border p-2 space-y-1.5">
            <button
              type="button"
              onClick={toggleSelectAllObjects}
              disabled={eligibleObjectIds.length === 0}
              className="w-full h-7 rounded-lg flex items-center justify-center bg-surface3 border border-border text-[10px] font-semibold text-muted hover:text-text hover:border-muted disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              {allObjectsSelected ? 'Deselect all' : 'Select all'}
            </button>
            <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={groupSelectedLayers}
              disabled={groupableLayerCount < 2}
              title={groupableLayerCount < 2
                ? 'Ctrl-click at least two object layers'
                : `Group ${groupableLayerCount} layers nondestructively`}
              className="h-8 rounded-lg flex items-center justify-center gap-1.5 bg-surface3 border border-border text-[10px] font-semibold text-muted hover:text-text hover:border-muted disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              <Layers size={13} />
              Group{groupableLayerCount >= 2 ? ` (${groupableLayerCount})` : ''}
            </button>
            <button
              type="button"
              onClick={ungroupSelectedLayer}
              disabled={!selectedIsGroup}
              title={selectedIsGroup ? 'Keep child layers and remove their parent group' : 'Select a group layer'}
              className="h-8 rounded-lg flex items-center justify-center gap-1.5 bg-surface3 border border-border text-[10px] font-semibold text-muted hover:text-text hover:border-muted disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              Ungroup
            </button>
            </div>
            <p className="mt-1 text-[8px] text-center text-muted/55">
              Ctrl-click layers to select multiple
            </p>
          </div>
        </section>
      </aside>
      </div>
    </div>
  )
}
