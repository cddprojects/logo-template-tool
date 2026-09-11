import React, { useRef, useEffect } from 'react'
import type {
  PaintSaveResult,
  PaintVector,
  PaintLayerId,
  PaintSaveTargets,
  PaintVariantOption,
  OutsideTextSettings,
  OutsideContentSettings
} from '../../types'
import { isGradientColor, firstSolidColor } from '../Controls'
import {
  resolveCanvasColor,
  roundedRect,
  measureSpacedText,
  fillSpacedText,
  drawTextUnderline
} from '../../utils/renderer'
import { applySvgColor, drawSvgOnCanvas } from '../../utils/iconUtils'
import { proxyBoxFromSizeRatio } from '../../utils/paintSettingsSync'
import { bakeCanvasDropShadow } from '../../utils/paintVectorRender'
import {
  drawImageAxisRect,
  drawImageHomographyQuad,
  quadIsAxisAlignedRect,
  reshapeIsApplied,
  reshapeQuadMatchesSource
} from '../../utils/paintReshape'
import { reuseCanvas, takeCanvas, releaseCanvas } from '../../utils/canvasPool'
import {
  punchMaskCanvases,
  punchMaskBits,
  seeThroughMaskCanvases,
  seeThroughMaskBits,
  bitsFromAlpha,
  clearHolesOnTextEdit,
  rewriteDisplayBits,
  attachFromFlood,
  serializeHolePng,
  serializeSeeThroughHolePng,
  syncHoleFlags,
  hasPunchCoverage,
  hasSeeThroughCoverage,
  subtractRegionFromMode,
  resolveEnclosedHoleBits,
  objectHasFillHole as holeObjectHasFillHole,
  clearObjectHoles,
  type HoleGeom,
  type HoleItem,
  type HoleFillMode
} from '../../utils/paintHoles'

export type Tool = 'pointer' | 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'shape' | 'freepoly' | 'polygon' | 'select' | 'text' | 'reshape' | 'match'

/** Paint-style brush / eraser tip shapes. */
export type BrushTip = 'round' | 'square' | 'slash' | 'backslash' | 'spray'

export const BRUSH_TIPS: { value: BrushTip; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'square', label: 'Square' },
  { value: 'slash', label: 'Calligraphy /' },
  { value: 'backslash', label: 'Calligraphy \\' },
  { value: 'spray', label: 'Spray' }
]

export function stampBrushTip(
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

export function strokeBrushTip(
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

export function strokeBrushTipOutline(p: CanvasRenderingContext2D, tip: BrushTip, x: number, y: number, brushSize: number): void {
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

export function BrushTipIcon({ tip }: { tip: BrushTip }): JSX.Element {
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
export type ShapeKind =
  // polygons (under the square button)
  | 'rect' | 'parallelogram' | 'triangle-iso' | 'triangle-right' | 'trapezoid' | 'diamond'
  | 'pentagon' | 'hexagon' | 'heptagon' | 'octagon'
  | 'star3' | 'star4' | 'star5' | 'star6' | 'star8'
  // irregular shapes (under the circle button)
  | 'ellipse' | 'semicircle' | 'quarter' | 'egg' | 'teardrop' | 'heart' | 'crescent'
  | 'cloud' | 'blob' | 'speech' | 'shield' | 'cross' | 'arrow' | 'lightning' | 'arch'

export const POLY_SHAPES: { value: ShapeKind; label: string }[] = [
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
export const IRREG_SHAPES: { value: ShapeKind; label: string }[] = [
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
export const POLY_KIND_SET = new Set<ShapeKind>(POLY_SHAPES.map((s) => s.value))

export interface IconPaintEditorProps {
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
  /**
   * Inner content box at paint resolution (outer-shadow inset, then container
   * padding). Used for letters / contentBound / library stamp size ratios.
   */
  innerDrawSize?: number
  /**
   * Outer-shape size at paint resolution (shadow inset only, no content pad).
   * Saved as paintShapeSize so preview crops decorations onto the container.
   * Defaults to innerDrawSize when the content box is the full outer shape.
   */
  paintOuterSize?: number
  title?: string
  /** Whether the icon actually has an outer shape / container to edit. */
  hasContainer?: boolean
  /** Restore session vectors when reopening an editable paint session. */
  initialVectors?: PaintVector[]
  /** Saved punch-through silhouettes so reopen / Save keep the same holes. */
  initialPunchMasks?: { layer: PaintLayerId; png: string }[]
  /** When true, Inner was baked into decorations — do not reseed a live contentBound proxy. */
  initialContentBakedInDecorations?: boolean
  /** Restore paint-layer stacking order (topmost first). */
  initialLayerOrder?: PaintLayerId[]
  /** Outer-shape size at last Save — rescale stamps if the container inset changed. */
  initialPaintShapeSize?: number
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
  /**
   * Visible outer-shape border thickness in paint pixels (clip-and-double stroke).
   * Used so Fill on the background does not recolour the border, and vice versa.
   */
  outerBorderWidthPx?: number
  /** Live outer border colour (alpha ignored when matching the shadow). */
  outerBorderColor?: string | null
  /** Live outer shadow colour (alpha ignored when matching the border). */
  outerShadowColor?: string | null
  /** Live outer fill / background colour — used to keep interior separate from the rim. */
  outerFillColor?: string | null
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
export type LineType = 'straight' | 'polyline' | 'curved' | 'free' | 'drawn' | 'poly' | 'shape' | 'text' | 'stamp' | 'group'
export type CapType = 'none' | 'arrow' | 'triangle' | 'dot' | 'square' | 'bar'
export type DashType = 'solid' | 'dotted' | 'dashed' | 'double' | 'double-dotted' | 'double-dashed'

export interface Pt { x: number; y: number }
export interface ObjectPaintStroke {
  tool: 'brush' | 'eraser'
  /** Points normalized to the shape's unrotated bounding box. */
  pts: Pt[]
  /** Brush size normalized to the shorter side of the shape. */
  size: number
  color: string
  tip: BrushTip
}
export interface LineObj {
  id: string
  /** Renameable object-layer label. */
  name?: string
  /** Independent panel visibility. Legacy sessions used `editable` for this. */
  visible?: boolean
  /** Legacy visibility field retained when reopening old paint sessions. */
  editable?: boolean
  /** Parent nondestructive group. Group children remain real object layers. */
  parentId?: string
  /** Root-only: paint below the live base + overlay for this object's paint layer. */
  belowBase?: boolean
  type: LineType
  /** Control points. straight:2 · curved:3 · free:4 · drawn:N · poly:N (vertices) */
  pts: Pt[]
  startCap: CapType
  endCap: CapType
  /** Cap tip size in paint px (arrow / triangle / dot / square / bar). */
  startCapSize?: number
  endCapSize?: number
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
  /** Regions permanently cut out of this object by marquee (canvas space). */
  marqueeCutRects?: { x: number; y: number; w: number; h: number }[]
  /** Nondestructive pixel edits replayed over a vector shape. */
  paintStrokes?: ObjectPaintStroke[]
  // text only (pts = [topLeft anchor])
  text?: string
  fontFamily?: string
  fontSize?: number
  weight?: number
  bold?: boolean
  italic?: boolean
  /** Match outside letters underline (canvas-drawn; not a CSS font style). */
  underline?: boolean
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
  /** Frozen rotation/scale origin (crop mode). */
  transformOrigin?: Pt
  /** Horizontal mirror scale (default 1). Text flip toggles ±1. */
  scaleX?: number
  /** Vertical mirror scale (default 1). Text flip toggles ±1. */
  scaleY?: number
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
  /** Saved hierarchy placeholder for live Inner (no raster). */
  contentProxySlot?: boolean
  /** Stamp bitmap was sectionally edited — bake on Save (see PaintVector.rasterEdited). */
  rasterEdited?: boolean
  /** Original pixels for Match / Color 1–5 (contentBound uploaded image). */
  imageSourceDataUrl?: string
  imageUseOriginalColors?: boolean
  imagePalette?: string[]
  imageColor1?: string
  imageColor2?: string
  imageColor3?: string
  imageColor4?: string
  imageColor5?: string
  /** Match map PNG (red = 0–5), same size as imageSourceDataUrl. */
  colorMarkPng?: string
  /** Stable Match region ids (R + G*256). */
  colorRegionPng?: string
  /** Tight unwarped source rect in canvas space (TL + size). */
  reshapeSrc?: { x: number; y: number; w: number; h: number }
  /** Destination quad in canvas space: TL, TR, BR, BL. */
  reshapeQuad?: Pt[]
  /** Quad at reshape init — used for symmetric snap distances. */
  reshapeBaseQuad?: Pt[]
  /** Transparent fill cuts a hole through every layer below this object. */
  punchThrough?: boolean
  /** Punch is the empty counter inside a glyph, not the letter ink. */
  punchEnclosedHole?: boolean
  /** Invisible flood-fill mask used only for punch-through compositing. */
  punchMask?: boolean
  /** Serialized hole silhouette so holes survive Save → re-enter. */
  holeMaskPng?: string
  seeThroughHoleMaskPng?: string
  holeMaskMode?: 'punch' | 'see-through'
}

export function paintRootOfLine(item: LineObj, items: LineObj[]): LineObj {
  let current = item
  while (current.parentId) {
    const parent = items.find((entry) => entry.id === current.parentId)
    if (!parent) break
    current = parent
  }
  return current
}

/** Index after an object and every nested descendant in the paint array. */
export function insertAfterSubtreeIndex(items: LineObj[], id: string): number {
  const start = items.findIndex((item) => item.id === id)
  if (start < 0) return items.length
  const mark = new Set<string>([id])
  let end = start
  let changed = true
  while (changed) {
    changed = false
    items.forEach((item, i) => {
      if (item.parentId && mark.has(item.parentId) && !mark.has(item.id)) {
        mark.add(item.id)
        end = Math.max(end, i)
        changed = true
      }
    })
  }
  return end + 1
}

/** Cache decoded stamp images so undo/redo redraws stay sync after the first load. */
export const stampImgCache = new Map<string, HTMLImageElement>()

export function loadPaintImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export function punchStampFromFilled(
  filled: Uint8Array,
  layerId: PaintLayerId,
  W: number,
  H: number
): LineObj | null {
  let minX = W, minY = H, maxX = -1, maxY = -1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!filled[y * W + x]) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return null
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  // 1px-thin remnants read as a "-" on the canvas after punch/see-through.
  if (Math.min(bw, bh) <= 1 && Math.max(bw, bh) >= 8) return null
  const canvas = document.createElement('canvas')
  canvas.width = bw
  canvas.height = bh
  const img = canvas.getContext('2d')!.createImageData(bw, bh)
  const d = img.data
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!filled[y * W + x]) continue
      const i = ((y - minY) * bw + (x - minX)) * 4
      d[i] = 255
      d[i + 1] = 255
      d[i + 2] = 255
      d[i + 3] = 255
    }
  }
  canvas.getContext('2d')!.putImageData(img, 0, 0)
  const dataUrl = canvas.toDataURL('image/png')
  const id = genId()
  punchMaskCanvases.set(id, canvas)
  ensureStampImage(dataUrl)
  return {
    id,
    type: 'stamp',
    pts: [{ x: minX, y: minY }, { x: minX + bw, y: minY + bh }],
    startCap: 'none',
    endCap: 'none',
    dash: 'solid',
    thickness: 0,
    color: '#00000000',
    fill: true,
    punchThrough: false,
    punchMask: true,
    imageDataUrl: dataUrl,
    stampSource: 'image',
    visible: true,
    layer: layerId
  }
}

export async function restorePunchMasks(
  lines: LineObj[],
  masks: { layer: PaintLayerId; png: string }[] | undefined,
  W: number,
  H: number
): Promise<LineObj[]> {
  const next = [...lines]
  const layerBits = new Map<PaintLayerId, Uint8Array>()
  for (const m of masks ?? []) {
    const img = await loadPaintImage(m.png)
    if (!img) continue
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const x = c.getContext('2d')!
    x.drawImage(img, 0, 0, W, H)
    layerBits.set(m.layer, bitsFromAlpha(x.getImageData(0, 0, W, H).data, W, H))
  }

  for (const l of next) {
    if (l.type === 'stamp' && l.punchMask && l.imageDataUrl && l.pts.length >= 2) {
      const img = await loadPaintImage(l.imageDataUrl)
      if (!img) continue
      const a = l.pts[0]
      const b = l.pts[1]
      const x = Math.min(a.x, b.x)
      const y = Math.min(a.y, b.y)
      const w = Math.max(1, Math.abs(b.x - a.x))
      const h = Math.max(1, Math.abs(b.y - a.y))
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d')!.drawImage(img, 0, 0, w, h)
      punchMaskCanvases.set(l.id, c)
      ensureStampImage(l.imageDataUrl)
      continue
    }
    // Per-object hole PNG (punch and/or see-through) — preferred over layer mask.
    const loadHolePng = async (
      png: string | undefined,
      mode: HoleFillMode,
      skipIfPresent: boolean
    ): Promise<boolean> => {
      if (!png) return false
      if (skipIfPresent) {
        if (mode === 'punch' && punchMaskCanvases.has(l.id)) return true
        if (mode === 'see-through' && seeThroughMaskCanvases.has(l.id)) return true
      }
      const img = await loadPaintImage(png)
      if (!img) return false
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const x = c.getContext('2d')!
      x.drawImage(img, 0, 0, W, H)
      const bits = bitsFromAlpha(x.getImageData(0, 0, W, H).data, W, H)
      if (!bits.some((v) => v)) return false
      setLocalPunchFromFilled(l, bits, W, H, { mode, replace: true, skipOtherSubtract: true })
      return true
    }
    {
      // Legacy: single holeMaskPng — route by holeMaskMode / punchThrough.
      // When seeThroughHoleMaskPng also exists, holeMaskPng is punch-only.
      const primaryMode: HoleFillMode = l.seeThroughHoleMaskPng
        ? 'punch'
        : l.holeMaskMode === 'punch' || (l.punchThrough && l.holeMaskMode !== 'see-through')
          ? 'punch'
          : 'see-through'
      const loadedPrimary = await loadHolePng(l.holeMaskPng, primaryMode, true)
      const loadedSt = await loadHolePng(l.seeThroughHoleMaskPng, 'see-through', true)
      if (loadedPrimary || loadedSt) {
        syncHoleFlags(l as HoleItem)
        continue
      }
    }
    // Stack punchMasks PNG — punch-through objects only.
    if (l.punchThrough && !punchMaskCanvases.has(l.id) && !hasPunchCoverage(l.id)) {
      const bits = layerBits.get((l.layer ?? 'content') as PaintLayerId)
      if (!bits) continue
      if (l.type === 'text') {
        const mapped = textPunchBitsFromSavedLayer(l, bits, W, H)
        if (!mapped) continue
        let hole = mapped.bits
        if (mapped.enclosed) {
          l.punchEnclosedHole = true
        }
        setLocalPunchFromFilled(l, hole, W, H, { mode: 'punch' })
      } else {
        setLocalPunchFromFilled(l, bits, W, H, { mode: 'punch' })
      }
      syncHoleFlags(l as HoleItem)
      continue
    }
    // Older sessions: enclosed flag without holeMaskPng — do NOT invent every
    // counter (would turn a partial punch into all B/O bowls). User re-fills.
    
  }

  for (const [layer, bits] of layerBits) {
    const hasOp = next.some((l) =>
      (l.layer ?? 'content') === layer &&
      (l.punchMask || (l.punchThrough && punchMaskBits.has(l.id)))
    )
    if (hasOp) continue
    const stamp = punchStampFromFilled(bits, layer, W, H)
    if (stamp) {
      stamp.punchThrough = true
      next.push(stamp)
    }
  }
  return next
}

export function destOutFilledMask(
  ctx: CanvasRenderingContext2D,
  filled: Uint8Array,
  w: number,
  h: number
): void {
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  const n = Math.min(filled.length, w * h)
  for (let p = 0; p < n; p++) {
    if (!filled[p]) continue
    const x = p % w
    const y = (p / w) | 0
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (maxX < minX) return
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const mask = takeCanvas(bw, bh)
  try {
    const mctx = mask.getContext('2d')!
    const img = mctx.createImageData(bw, bh)
    const d = img.data
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!filled[y * w + x]) continue
        const i = ((y - minY) * bw + (x - minX)) * 4
        d[i] = 255
        d[i + 1] = 255
        d[i + 2] = 255
        d[i + 3] = 255
      }
    }
    mctx.putImageData(img, 0, 0)
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(mask, minX, minY)
    ctx.restore()
  } finally {
    releaseCanvas(mask)
  }
}
export const textOffSlot: { current: HTMLCanvasElement | null } = { current: null }
export const strokeScratchSlot: { current: HTMLCanvasElement | null } = { current: null }
export function ensureStampImage(dataUrl: string, onReady?: () => void): HTMLImageElement | null {
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
  // Canvas/data-URL stamps often decode synchronously — return them so Save
  // decorations do not rasterize an empty Inner on the first export.
  if (img.complete && img.naturalWidth > 0) return img
  return null
}

/** Wait until a stamp data URL is drawable (needed before Save decorations). */
export async function ensureStampImageDecoded(dataUrl: string): Promise<HTMLImageElement | null> {
  const ready = ensureStampImage(dataUrl)
  if (ready) return ready
  const cached = stampImgCache.get(dataUrl)
  if (!cached) return null
  try {
    if (typeof cached.decode === 'function') await cached.decode()
    else {
      await new Promise<void>((resolve, reject) => {
        cached.addEventListener('load', () => resolve(), { once: true })
        cached.addEventListener('error', () => reject(new Error('stamp decode')), { once: true })
      })
    }
  } catch {
    return null
  }
  return cached.complete && cached.naturalWidth > 0 ? cached : null
}

/** Live Inner letters / contentBound proxy — fillable material, not session walls. */
export function isLiveInnerVector(l: LineObj): boolean {
  return !!l.linkedOutsideText || !!l.contentBound || !!l.contentProxySlot
}

export type PaintSlotStep =
  | { kind: 'base' }
  | { kind: 'overlay' }
  | { kind: 'object'; l: LineObj }

/** Paint-order steps for one base slot: below-base objects → base → overlay → above-base objects.
 * Within each bucket, roots follow the lines-array / Layers-panel order. Do not force
 * linkedOutsideText / contentBound under session objects — that made one text always win. */
export function paintSlotStepsForRoots(
  roots: LineObj[],
  all: LineObj[],
  opts?: { base?: boolean; overlay?: boolean }
): PaintSlotStep[] {
  const indexOf = (l: LineObj): number => {
    const i = all.findIndex((item) => item.id === l.id)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const belowRoots = roots.filter((l) => l.belowBase).sort((a, b) => indexOf(a) - indexOf(b))
  const aboveRoots = roots.filter((l) => !l.belowBase).sort((a, b) => indexOf(a) - indexOf(b))
  const steps: PaintSlotStep[] = []
  for (const l of belowRoots) steps.push({ kind: 'object', l })
  if (opts?.base !== false) steps.push({ kind: 'base' })
  if (opts?.overlay !== false) steps.push({ kind: 'overlay' })
  for (const l of aboveRoots) steps.push({ kind: 'object', l })
  return steps
}

/** Spiral search for a pixel that may start a flood (click landed on a cut). */
export function findFillSeed(
  w: number,
  h: number,
  sx: number,
  sy: number,
  canStart: (x: number, y: number) => boolean
): { x: number; y: number } | null {
  const x0 = Math.floor(sx)
  const y0 = Math.floor(sy)
  if (canStart(x0, y0)) return { x: x0, y: y0 }
  const maxR = 16
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = x0 + dx
        const y = y0 + dy
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        if (canStart(x, y)) return { x, y }
      }
    }
  }
  return null
}

/** 4-connected flood from (sx,sy). `canVisit` receives the ImageData byte index. */
export function floodFillConnected(
  w: number,
  h: number,
  sx: number,
  sy: number,
  canVisit: (byteIndex: number) => boolean
): Uint8Array {
  const visited = new Uint8Array(w * h)
  const x0 = Math.floor(sx)
  const y0 = Math.floor(sy)
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return visited
  const start = y0 * w + x0
  if (!canVisit(start * 4)) return visited
  const stack = [start]
  visited[start] = 1
  while (stack.length) {
    const p = stack.pop()!
    const x = p % w
    const y = (p / w) | 0
    const neighbors = [x > 0 ? p - 1 : -1, x + 1 < w ? p + 1 : -1, y > 0 ? p - w : -1, y + 1 < h ? p + w : -1]
    for (const np of neighbors) {
      if (np < 0 || visited[np] || !canVisit(np * 4)) continue
      visited[np] = 1
      stack.push(np)
    }
  }
  return visited
}

/** Expand a bit mask by Chebyshev radius (clear punch rings on solid refill). */
export function dilateBitMask(bits: Uint8Array, w: number, h: number, radius = 1): Uint8Array {
  if (radius <= 0) return bits.slice()
  const out = bits.slice()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!bits[y * w + x]) continue
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          out[ny * w + nx] = 1
        }
      }
    }
  }
  return out
}

/** Empty pixels reachable from the canvas border (not enclosed holes). */
export function floodOutsideEmpty(ink: Uint8Array, w: number, h: number): Uint8Array {
  const outside = new Uint8Array(w * h)
  const stack: number[] = []
  const tryPush = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (outside[p] || ink[p]) return
    outside[p] = 1
    stack.push(p)
  }
  for (let x = 0; x < w; x++) {
    tryPush(x, 0)
    tryPush(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y)
    tryPush(w - 1, y)
  }
  while (stack.length) {
    const p = stack.pop()!
    const x = p % w
    const y = (p / w) | 0
    tryPush(x + 1, y)
    tryPush(x - 1, y)
    tryPush(x, y + 1)
    tryPush(x, y - 1)
  }
  return outside
}

/**
 * Build a hard (no-AA) letter silhouette from an isolated glyph render, then
 * punch enclosed counters. Colour of the source draw does not matter — only
 * alpha is used to find the shape; fill is always flat `l.color`.
 */
export function drawEnclosedHoleObjectFlat(
  ctx: CanvasRenderingContext2D,
  l: LineObj,
  drawBody: (c: CanvasRenderingContext2D) => void
): void {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  if (punchMaskCanvases.has(l.id) || seeThroughMaskCanvases.has(l.id)) {
    rewritePunchBitsFromLocal(l, w, h)
  }
  const punchSaved = punchMaskBits.get(l.id)
  const stSaved = seeThroughMaskBits.get(l.id)
  const savedBits =
    punchSaved && stSaved && punchSaved.length === stSaved.length
      ? (() => {
          const u = punchSaved.slice()
          for (let i = 0; i < u.length; i++) if (stSaved[i]) u[i] = 1
          return u
        })()
      : punchSaved ?? stSaved

  const body = takeCanvas(w, h)
  try {
    const bctx = body.getContext('2d')!
    bctx.imageSmoothingEnabled = false
    // Source colour is irrelevant — we only need the alpha outline of the glyph.
    drawBody(bctx)

    const img = bctx.getImageData(0, 0, w, h)
    const d = img.data
    const ink = new Uint8Array(w * h)
    // Include soft AA in the solid body so the counter edge is decided by the
    // hole punch, not by leftover fringe. Threshold low → former AA becomes fill.
    const inkT = 24
    for (let p = 0, i = 0; p < ink.length; p++, i += 4) {
      if (d[i + 3] >= inkT) ink[p] = 1
    }

    const fillColor = isTransparentPaintColor(l.color) || isGradientColor(l.color)
      ? null
      : pixelColor(l.color)
    const fr = fillColor ? parseInt(fillColor.slice(1, 3), 16) : 0
    const fg = fillColor ? parseInt(fillColor.slice(3, 5), 16) : 0
    const fb = fillColor ? parseInt(fillColor.slice(5, 7), 16) : 0

    // Hard silhouette: every ink pixel → fully opaque. Solid fills use flat colour
    // (colour-agnostic vs the canvas behind). Gradients/transparent keep source RGB.
    for (let p = 0, i = 0; p < ink.length; p++, i += 4) {
      if (!ink[p]) {
        d[i] = 0
        d[i + 1] = 0
        d[i + 2] = 0
        d[i + 3] = 0
        continue
      }
      if (fillColor) {
        d[i] = fr
        d[i + 1] = fg
        d[i + 2] = fb
      }
      d[i + 3] = 255
    }
    bctx.putImageData(img, 0, 0)

    // Counters = empty regions enclosed by the hard outline (not outside).
    // Prefer the user's saved hole (partial counters) when present — auto-detect
    // would re-punch every counter and fight punch vs see-through intent.
    const outside = floodOutsideEmpty(ink, w, h)
    const autoHole = new Uint8Array(w * h)
    let autoN = 0
    for (let p = 0; p < autoHole.length; p++) {
      if (ink[p] || outside[p]) continue
      autoHole[p] = 1
      autoN++
    }
    const hole = resolveEnclosedHoleBits(savedBits, autoHole, autoN, w, h)
    if (hole && hole.length === w * h) {
      destOutFilledMask(bctx, hole, w, h)
      // Keep each mode's display bits — do not collapse dual maps into punch-only.
    }

    if (shouldDrawObjectShadow(l)) {
      const clip = objectRenderBox(l, w, h)
      const bw = Math.max(16, Math.ceil(clip.w / 16) * 16)
      const bh = Math.max(16, Math.ceil(clip.h / 16) * 16)
      const solidSil = takeCanvas(bw, bh)
      try {
        const ss = solidSil.getContext('2d')!
        // Shadow from hard silhouette *before* counter punch (full letter body).
        ss.putImageData(
          (() => {
            const silImg = ss.createImageData(bw, bh)
            const sd = silImg.data
            for (let y = 0; y < bh; y++) {
              for (let x = 0; x < bw; x++) {
                const sx = clip.x + x
                const sy = clip.y + y
                if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue
                if (!ink[sy * w + sx]) continue
                const i = (y * bw + x) * 4
                sd[i + 3] = 255
              }
            }
            return silImg
          })(),
          0,
          0
        )
        const baked = bakeCanvasDropShadow(solidSil, {
          blur: l.shadowBlur ?? 0,
          ox: l.shadowOffsetX ?? 0,
          oy: l.shadowOffsetY ?? 0,
          spread: l.shadowSpread ?? 0,
          color: l.shadowColor ?? '#00000080',
          shadowOnly: true
        })
        ctx.drawImage(baked.canvas, clip.x - baked.inset, clip.y - baked.inset)
      } finally {
        releaseCanvas(solidSil)
      }
    }

    ctx.drawImage(body, 0, 0)
  } finally {
    releaseCanvas(body)
  }
}

/**
 * Stroke-locked SVG markup for library stamps (fixed stroke px under resize).
 * Returns null when the stamp should just use its baked PNG.
 */
export function buildStrokeLockedSvgMarkup(
  l: LineObj,
  width: number,
  height: number
): string | null {
  if (!l.keepStrokeOnResize || !l.sourceSvgMarkup || !l.sourceStampSize) return null
  const dw = Math.max(1, Math.round(width))
  const dh = Math.max(1, Math.round(height))
  // Placement raster matches authored size — avoid re-decoding SVG there.
  if (
    l.imageDataUrl &&
    Math.abs(dw - l.sourceStampSize) < 1 &&
    Math.abs(dh - l.sourceStampSize) < 1
  ) {
    return null
  }
  // Free corner-resizing is anisotropic — convert original stroke to initial
  // display-pixel width and keep it via non-scaling-stroke.
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
  svg = svg.replace(/<svg([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = String(attrs)
      .replace(/\s+width\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s+height\s*=\s*["'][^"']*["']/gi, '')
    return `<svg${cleaned} width="${dw}" height="${dh}">`
  })
  return svg
}

/** Last stroke-locked (or placement) raster shown for a stamp — used while a new size decodes. */
export const stampStrokeLiveCache = new Map<string, HTMLImageElement>()
/** Stamp ids mid box-resize — scale live cache instead of re-locking stroke every frame. */
export const stampStrokeRelockPaused = new Set<string>()

export function stampRenderDataUrl(l: LineObj, width: number, height: number): string {
  if (!l.keepStrokeOnResize || !l.sourceSvgMarkup || !l.sourceStampSize) {
    return l.imageDataUrl ?? ''
  }
  // Live resize: scale the last bitmap instead of re-decoding SVG every mousemove
  // (async fallback to the placement PNG made strokes jump constantly).
  if (stampStrokeRelockPaused.has(l.id)) {
    return l.imageDataUrl ?? ''
  }
  const markup = buildStrokeLockedSvgMarkup(l, width, height)
  if (!markup) return l.imageDataUrl ?? ''
  // Always tint with the stamp's live colour — sourceSvgMarkup alone can be stale
  // after a picker recolour (applyStampColorKeepHoles only rewrote the PNG).
  const tinted = applySvgColor(markup, firstSolidColor(l.color || '#000000ff'))
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tinted)}`
}

export function pauseStampStrokeRelock(l: LineObj): void {
  if (l.type !== 'stamp' || !l.keepStrokeOnResize || !l.sourceSvgMarkup) return
  if (l.pts.length >= 2) {
    const w = Math.max(1, Math.abs(l.pts[1].x - l.pts[0].x))
    const h = Math.max(1, Math.abs(l.pts[1].y - l.pts[0].y))
    const url = stampRenderDataUrl(l, w, h)
    const cached = url ? stampImgCache.get(url) : undefined
    if (cached && cached.complete && cached.naturalWidth > 0) {
      stampStrokeLiveCache.set(l.id, cached)
    } else if (l.imageDataUrl) {
      const img = ensureStampImage(l.imageDataUrl)
      if (img) stampStrokeLiveCache.set(l.id, img)
    }
  } else if (l.imageDataUrl) {
    const img = ensureStampImage(l.imageDataUrl)
    if (img) stampStrokeLiveCache.set(l.id, img)
  }
  stampStrokeRelockPaused.add(l.id)
}

/** Bake stroke-locked SVG into imageDataUrl at the stamp's current box (after resize). */
export async function rebakeStrokeLockedStamp(l: LineObj): Promise<boolean> {
  if (
    l.type !== 'stamp' ||
    !l.keepStrokeOnResize ||
    !l.sourceSvgMarkup ||
    !l.sourceStampSize ||
    l.pts.length < 2
  ) {
    return false
  }
  const a = l.pts[0]
  const b = l.pts[1]
  const dw = Math.max(1, Math.round(Math.abs(b.x - a.x)))
  const dh = Math.max(1, Math.round(Math.abs(b.y - a.y)))
  // Skip the "at source size use PNG" short-circuit so the bake always locks strokes.
  const locked = buildStrokeLockedSvgMarkup({ ...l, imageDataUrl: undefined }, dw, dh)
  if (!locked) return false
  const tinted = applySvgColor(locked, firstSolidColor(l.color || '#000000ff'))
  const canvas = document.createElement('canvas')
  canvas.width = dw
  canvas.height = dh
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  await drawSvgOnCanvas(ctx, tinted, 0, 0, dw, dh)
  const dataUrl = canvas.toDataURL('image/png')
  l.imageDataUrl = dataUrl
  // Keep sourceStampSize as the original stroke-lock reference (placement size).
  // Updating it here would thicken locked strokes on the next resize.
  const img = ensureStampImage(dataUrl)
  if (img) stampStrokeLiveCache.set(l.id, img)
  return true
}

export const LINE_TYPES: { value: LineType; label: string }[] = [
  { value: 'straight', label: 'Straight' },
  { value: 'polyline', label: 'Polyline (points)' },
  { value: 'curved', label: 'Curved' },
  { value: 'free', label: 'Free (bendable points)' },
  { value: 'drawn', label: 'Drawn (freehand)' }
]
export const CAP_TYPES: { value: CapType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'dot', label: 'Dot' },
  { value: 'square', label: 'Square' },
  { value: 'bar', label: 'Bar' }
]
export const DASH_TYPES: { value: DashType; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'double', label: 'Double' },
  { value: 'double-dotted', label: 'Double dotted' },
  { value: 'double-dashed', label: 'Double dashed' }
]

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const mid = (a: Pt, b: Pt): Pt => lerp(a, b, 0.5)
export const genId = (): string => Math.random().toString(36).slice(2, 10)

// N points evenly spaced along the segment a→b (all at a when a===b).
export function linePts(a: Pt, b: Pt, n: number): Pt[] {
  const out: Pt[] = []
  const c = Math.max(2, n)
  for (let i = 0; i < c; i++) out.push(lerp(a, b, i / (c - 1)))
  return out
}

// Smooth curve passing through every anchor point (Catmull-Rom → polyline).
export function catmullRom(pts: Pt[], seg = 16): Pt[] {
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
export function resampleAlong(poly: Pt[], n: number): Pt[] {
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
export const _measCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null

export function textFontStr(l: LineObj): string {
  const weight = l.bold ? Math.max(700, l.weight ?? 400) : l.weight ?? 400
  return `${l.italic ? 'italic ' : 'normal '}${weight} ${l.fontSize ?? 48}px "${l.fontFamily ?? 'Inter'}", sans-serif`
}
export function textRows(l: LineObj): string[] {
  return (l.text ?? '').split('\n')
}
export function textMetrics(l: LineObj): { w: number; h: number; lineH: number } {
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
export function textBBox(l: LineObj): { x: number; y: number; w: number; h: number } {
  const p = l.pts[0]
  const { w, h } = textMetrics(l)
  return { x: p.x, y: p.y, w, h }
}

/** Glyph ink bounds (excludes empty line-box padding). */
export function textInkBBox(l: LineObj): { x: number; y: number; w: number; h: number } {
  const p = l.pts[0]
  const rows = textRows(l)
  const fs = l.fontSize ?? 48
  const lineH = fs * (l.lineHeight ?? 1.28)
  const spacing = l.letterSpacing ?? 0
  const ctx = _measCanvas?.getContext('2d')
  if (!ctx || !rows.length) return textBBox(l)
  ctx.font = textFontStr(l)
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
  if (!Number.isFinite(inkLeft)) return textBBox(l)
  return {
    x: inkLeft,
    y: inkTop,
    w: Math.max(1, inkRight - inkLeft),
    h: Math.max(1, inkBottom - inkTop)
  }
}

export function unionTextBounds(
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

export function alphaBoundsFromCanvas(canvas: HTMLCanvasElement | null): { x: number; y: number; w: number; h: number } | null {
  if (!canvas) return null
  const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
  if (!data) return null
  let left = canvas.width
  let top = canvas.height
  let right = -1
  let bottom = -1
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

/**
 * Crop bounds after rendering an object to a full canvas (Fill bake / hole refill).
 * Never use punchLocalBox here — that UV AABB is unrotated and clips rotated
 * text/shapes (e.g. 45° square → octagon).
 */
export function bakeCropBoundsFromCanvas(
  item: LineObj,
  canvas: HTMLCanvasElement
): { x: number; y: number; w: number; h: number } | null {
  return alphaBoundsFromCanvas(canvas) ?? boundsFromLineFallback(item)
}

export function removeLineSubtree(allLines: LineObj[], rootId: string): LineObj[] {
  const drop = new Set<string>()
  const walk = (id: string) => {
    drop.add(id)
    for (const l of allLines) {
      if (l.parentId === id) walk(l.id)
    }
  }
  walk(rootId)
  return allLines.filter((l) => !drop.has(l.id))
}

/** Replace a partially-cut vector with a raster stamp of the uncut remainder. */
export function rasterizeRemainderAfterMarqueeCut(
  W: number,
  H: number,
  line: LineObj,
  cutRect: { x: number; y: number; w: number; h: number },
  allLines: LineObj[],
  vis: (l: LineObj) => boolean
): { lines: LineObj[]; added: LineObj[] } {
  const tmp = takeCanvas(W, H)
  try {
    const t = tmp.getContext('2d')!
    t.clearRect(0, 0, W, H)
    t.save()
    t.beginPath()
    t.rect(0, 0, W, H)
    t.rect(cutRect.x, cutRect.y, cutRect.w, cutRect.h)
    t.clip('evenodd')
    renderObjectTree(t, line, allLines, vis)
    t.restore()
    const bounds = alphaBoundsFromCanvas(tmp)
    const without = removeLineSubtree(allLines, line.id)
    if (!bounds) return { lines: without, added: [] }
    const crop = document.createElement('canvas')
    crop.width = bounds.w
    crop.height = bounds.h
    crop.getContext('2d')!.drawImage(tmp, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h)
    const dataUrl = crop.toDataURL('image/png')
    ensureStampImage(dataUrl)
    const stamp: LineObj = {
      id: genId(),
      type: 'stamp',
      pts: [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.w, y: bounds.y + bounds.h }
      ],
      startCap: 'none',
      endCap: 'none',
      dash: 'solid',
      thickness: 0,
      color: '#000000ff',
      imageDataUrl: dataUrl,
      stampSource: 'image',
      rot: 0,
      name: line.name ?? (line.type === 'text' ? 'Text' : 'Object'),
      layer: line.layer,
      visible: line.visible,
      editable: line.editable
    }
    return { lines: without, added: [stamp] }
  } finally {
    releaseCanvas(tmp)
  }
}

/** Canvas-space pivot for lifted marquee pixels (box center, adjusted when moved). */
export function floatRotationPivot(f: { x: number; y: number; canvas: HTMLCanvasElement }): Pt {
  return rectCenter(f.x, f.y, f.canvas.width, f.canvas.height)
}

export function floatAxisBounds(f: {
  x: number
  y: number
  canvas: HTMLCanvasElement
  rot?: number
}): { x: number; y: number; w: number; h: number } {
  const w = f.canvas.width
  const h = f.canvas.height
  const rot = f.rot ?? 0
  if (!rot) return { x: f.x, y: f.y, w, h }
  const pivot = floatRotationPivot(f)
  const corners = rectCorners(f.x, f.y, w, h, rot, pivot)
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const p of corners) {
    left = Math.min(left, p.x)
    top = Math.min(top, p.y)
    right = Math.max(right, p.x)
    bottom = Math.max(bottom, p.y)
  }
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) }
}

export function drawCanvasRotatedAt(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  x: number,
  y: number,
  sw: number,
  sh: number,
  pivot: Pt,
  rot: number
): void {
  if (!rot) {
    ctx.drawImage(src, x, y, sw, sh)
    return
  }
  ctx.save()
  ctx.translate(pivot.x, pivot.y)
  ctx.rotate(rot)
  ctx.drawImage(src, x - pivot.x, y - pivot.y, sw, sh)
  ctx.restore()
}

/** Draw a lifted marquee float with live flip / resize / rotation (matches vector commit math). */
export function drawCanvasAtMarqueeTransform(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  sr: { x: number; y: number; w: number; h: number },
  sc: Pt,
  dp: Pt,
  rot: number,
  sx: number,
  sy: number
): void {
  ctx.save()
  ctx.translate(dp.x, dp.y)
  ctx.rotate(rot)
  ctx.scale(sx, sy)
  ctx.translate(-sc.x, -sc.y)
  ctx.drawImage(src, sr.x, sr.y, sr.w, sr.h)
  ctx.restore()
}

export type MarqueeFloatLike = {
  x: number
  y: number
  canvas: HTMLCanvasElement
  rot?: number
  scaleX?: number
  scaleY?: number
  originX?: number
  originY?: number
  originW?: number
  originH?: number
  vectorState?: {
    sourcePivot: Pt
    sourceRect: { x: number; y: number; w: number; h: number }
  }
}

export function marqueeFloatSourceRect(f: MarqueeFloatLike): { x: number; y: number; w: number; h: number } {
  const w = f.canvas.width
  const h = f.canvas.height
  return f.vectorState?.sourceRect ?? {
    x: f.originX ?? f.x,
    y: f.originY ?? f.y,
    w: f.originW ?? w,
    h: f.originH ?? h
  }
}

export function marqueeFloatDestPivot(f: MarqueeFloatLike): Pt {
  const sourceRect = marqueeFloatSourceRect(f)
  if (f.originX != null && f.originY != null) {
    return floatDestPivot(f, sourceRect)
  }
  return floatRotationPivot(f)
}

export function setMarqueeFloatPosition(f: MarqueeFloatLike, dp: Pt): void {
  const sourceRect = marqueeFloatSourceRect(f)
  const sc = rectCenter(sourceRect.x, sourceRect.y, sourceRect.w, sourceRect.h)
  if (f.originX != null && f.originY != null) {
    f.x = f.originX + (dp.x - sc.x)
    f.y = f.originY + (dp.y - sc.y)
  } else {
    f.x = dp.x - f.canvas.width / 2
    f.y = dp.y - f.canvas.height / 2
  }
}

export function marqueeFloatTransform(
  f: MarqueeFloatLike
): { sc: Pt; dp: Pt; rot: number; sx: number; sy: number; flipSx: number; flipSy: number } {
  const w = f.canvas.width
  const h = f.canvas.height
  const sourceRect = marqueeFloatSourceRect(f)
  const sc = f.vectorState?.sourcePivot ?? rectCenter(sourceRect.x, sourceRect.y, sourceRect.w, sourceRect.h)
  const dp = f.originX != null && f.originY != null
    ? floatDestPivot(f, sourceRect)
    : floatRotationPivot(f)
  const flipSx = f.scaleX ?? 1
  const flipSy = f.scaleY ?? 1
  const resizeSx = f.vectorState ? w / Math.max(1, sourceRect.w) : 1
  const resizeSy = f.vectorState ? h / Math.max(1, sourceRect.h) : 1
  return {
    sc,
    dp,
    rot: f.rot ?? 0,
    sx: resizeSx * flipSx,
    sy: resizeSy * flipSy,
    flipSx,
    flipSy
  }
}

export function marqueeFloatCorners(f: MarqueeFloatLike): Pt[] {
  const sr = marqueeFloatSourceRect(f)
  const { sc, dp, rot, sx, sy } = marqueeFloatTransform(f)
  const raw = [
    { x: sr.x, y: sr.y },
    { x: sr.x + sr.w, y: sr.y },
    { x: sr.x + sr.w, y: sr.y + sr.h },
    { x: sr.x, y: sr.y + sr.h }
  ]
  return raw.map((p) => mapMarqueePoint(p, sc, dp, sx, sy, rot))
}

export function floatTransformBounds(f: MarqueeFloatLike): { x: number; y: number; w: number; h: number } {
  const corners = marqueeFloatCorners(f)
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const p of corners) {
    left = Math.min(left, p.x)
    top = Math.min(top, p.y)
    right = Math.max(right, p.x)
    bottom = Math.max(bottom, p.y)
  }
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) }
}

export function pointInMarqueeFloat(f: MarqueeFloatLike, pt: Pt): boolean {
  const w = f.canvas.width
  const h = f.canvas.height
  const rot = f.rot ?? 0
  const flipSx = f.scaleX ?? 1
  const flipSy = f.scaleY ?? 1
  if (!rot && flipSx === 1 && flipSy === 1) {
    return pt.x >= f.x && pt.x <= f.x + w && pt.y >= f.y && pt.y <= f.y + h
  }
  const corners = marqueeFloatCorners(f)
  return pointInPoly(corners, pt)
}

export function marqueeFloatRotatePinPoints(f: MarqueeFloatLike): { anchor: Pt; tip: Pt } {
  const sr = marqueeFloatSourceRect(f)
  const { sc, dp, rot, sx, sy } = marqueeFloatTransform(f)
  const anchor = mapMarqueePoint({ x: sr.x + sr.w / 2, y: sr.y }, sc, dp, sx, sy, rot)
  const dx = anchor.x - dp.x
  const dy = anchor.y - dp.y
  const len = Math.hypot(dx, dy)
  const tip =
    len > 0.5
      ? { x: anchor.x + (dx / len) * ROTATE_PIN_LEN, y: anchor.y + (dy / len) * ROTATE_PIN_LEN }
      : { x: anchor.x, y: anchor.y - ROTATE_PIN_LEN }
  return { anchor, tip }
}

export function drawRotatePinAt(p: CanvasRenderingContext2D, anchor: Pt, tip: Pt) {
  p.save()
  p.strokeStyle = '#10b981'
  p.lineWidth = 2
  p.setLineDash([])
  p.beginPath()
  p.moveTo(anchor.x, anchor.y)
  p.lineTo(tip.x, tip.y)
  p.stroke()
  p.fillStyle = '#ffffff'
  p.strokeStyle = '#10b981'
  p.beginPath()
  p.arc(tip.x, tip.y, 7, 0, Math.PI * 2)
  p.fill()
  p.stroke()
  p.restore()
}

export function marqueeFloatRotatePinHit(f: MarqueeFloatLike, pt: Pt): boolean {
  const { anchor, tip } = marqueeFloatRotatePinPoints(f)
  if (dist(pt, tip) <= ROTATE_PIN_HIT_HEAD) return true
  if (distPtToSegment(pt, anchor, tip) <= ROTATE_PIN_HIT_STEM) return true
  const left = Math.min(anchor.x, tip.x) - ROTATE_PIN_HIT_PAD
  const right = Math.max(anchor.x, tip.x) + ROTATE_PIN_HIT_PAD
  const top = Math.min(anchor.y, tip.y) - ROTATE_PIN_HIT_PAD
  const bottom = Math.max(anchor.y, tip.y) + ROTATE_PIN_HIT_PAD
  return pt.x >= left && pt.x <= right && pt.y >= top && pt.y <= bottom
}

export function marqueeFloatDrawParams(
  f: MarqueeFloatLike & { canvas: HTMLCanvasElement }
): {
  sr: { x: number; y: number; w: number; h: number }
  sc: Pt
  dp: Pt
  rot: number
  sx: number
  sy: number
  flipSx: number
  flipSy: number
  sw: number
  sh: number
} {
  const sr = marqueeFloatSourceRect(f)
  const { sc, dp, rot, sx, sy, flipSx, flipSy } = marqueeFloatTransform(f)
  return {
    sr,
    sc,
    dp,
    rot,
    sx,
    sy,
    flipSx,
    flipSy,
    sw: f.canvas.width,
    sh: f.canvas.height
  }
}

export function bakeMarqueeFloatCanvas(
  f: MarqueeFloatLike & { canvas: HTMLCanvasElement }
): { canvas: HTMLCanvasElement; bounds: { x: number; y: number; w: number; h: number } } {
  const { sr, sc, dp, rot, sx, sy } = marqueeFloatDrawParams(f)
  const bounds = floatTransformBounds(f)
  const out = document.createElement('canvas')
  out.width = Math.ceil(bounds.w)
  out.height = Math.ceil(bounds.h)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.save()
  ctx.translate(-bounds.x, -bounds.y)
  drawCanvasAtMarqueeTransform(ctx, f.canvas, sr, sc, dp, rot, sx, sy)
  ctx.restore()
  return { canvas: out, bounds }
}

export function lineReshapeable(l: LineObj): boolean {
  if (l.type === 'text') return !!(l.text?.trim())
  if (l.type === 'stamp') return l.pts.length >= 2 && !!l.imageDataUrl
  if (l.type === 'shape') return l.pts.length >= 2
  return false
}

export function renderLineUnwarpedToCanvas(ctx: CanvasRenderingContext2D, l: LineObj): void {
  const plain: LineObj = { ...l, reshapeQuad: undefined, reshapeSrc: undefined }
  const supportsObjectPaint =
    (plain.type === 'shape' || plain.type === 'stamp') &&
    !!plain.paintStrokes?.length &&
    plain.pts.length >= 2
  if (supportsObjectPaint) renderLine(ctx, plain)
  else renderLineBase(ctx, plain)
}

export function boundsFromLineFallback(l: LineObj): { x: number; y: number; w: number; h: number } | null {
  if (l.type === 'text') {
    const b = textInkBBox(l)
    if (!lineNeedsDisplayTransform(l)) return b
    const corners = [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h },
      { x: b.x, y: b.y + b.h }
    ].map((p) => mapObjDisplayPt(p, l))
    const xs = corners.map((p) => p.x)
    const ys = corners.map((p) => p.y)
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
      h: Math.max(1, Math.max(...ys) - Math.min(...ys))
    }
  }
  if (l.pts.length < 2) return null
  if (l.type === 'stamp' || l.type === 'shape') {
    const a = l.pts[0]
    const b = l.pts[1]
    const corners = [
      { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
      { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
      { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
      { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) }
    ].map((p) => mapObjDisplayPt(p, l))
    const xs = corners.map((p) => p.x)
    const ys = corners.map((p) => p.y)
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
      h: Math.max(1, Math.max(...ys) - Math.min(...ys))
    }
  }
  return null
}

export function computeReshapeSource(l: LineObj, W: number, H: number): { x: number; y: number; w: number; h: number } | null {
  const temp = document.createElement('canvas')
  temp.width = W
  temp.height = H
  const tctx = temp.getContext('2d')!
  tctx.clearRect(0, 0, W, H)
  renderLineUnwarpedToCanvas(tctx, l)
  const raw = alphaBoundsFromCanvas(temp) ?? boundsFromLineFallback(l)
  return raw ? padReshapeBounds(raw, W, H) : null
}

export const RESHAPE_PAD = 3

export function padReshapeBounds(
  b: { x: number; y: number; w: number; h: number },
  W: number,
  H: number
): { x: number; y: number; w: number; h: number } {
  const x = Math.max(0, Math.floor(b.x) - RESHAPE_PAD)
  const y = Math.max(0, Math.floor(b.y) - RESHAPE_PAD)
  const r = Math.min(W, Math.ceil(b.x + b.w) + RESHAPE_PAD)
  const btm = Math.min(H, Math.ceil(b.y + b.h) + RESHAPE_PAD)
  return { x, y, w: Math.max(1, r - x), h: Math.max(1, btm - y) }
}

export function initReshapeOnLine(l: LineObj, W: number, H: number): LineObj {
  const src = computeReshapeSource(l, W, H) ?? boundsFromLineFallback(l)
  if (!src) return l
  const quad: Pt[] = [
    { x: src.x, y: src.y },
    { x: src.x + src.w, y: src.y },
    { x: src.x + src.w, y: src.y + src.h },
    { x: src.x, y: src.y + src.h }
  ]
  return {
    ...l,
    reshapeSrc: src,
    reshapeQuad: quad,
    reshapeBaseQuad: quad.map((p) => ({ ...p }))
  }
}

/** Horizontal mirror partner (TL↔TR, BL↔BR). */
export const reshapeMirrorX = (idx: number): number => [1, 0, 3, 2][idx]
/** Vertical mirror partner (TL↔BL, TR↔BR). */
export const reshapeMirrorY = (idx: number): number => [3, 2, 1, 0][idx]
/** Partner on the same vertical edge (shared X). */
export const reshapeEdgeX = (idx: number): number => [3, 2, 1, 0][idx]
/** Partner on the same horizontal edge (shared Y). */
export const reshapeEdgeY = (idx: number): number => [1, 0, 3, 2][idx]

export type ReshapeCornerSnap = {
  pt: Pt
  verticalGuides: number[]
  horizontalGuides: number[]
  label: string | null
}

export function applyReshapeCornerSnap(
  raw: Pt,
  idx: number,
  quad: Pt[],
  base: Pt[],
  threshold: number,
  shiftAxis: 'x' | 'y' | null
): ReshapeCornerSnap {
  let nx = raw.x
  let ny = raw.y
  let label: string | null = null
  const verticalGuides: number[] = []
  const horizontalGuides: number[] = []

  type AxisSnap = { value: number; dist: number; label: string }
  const xSnaps: AxisSnap[] = []
  const ySnaps: AxisSnap[] = []

  const addX = (value: number, snapLabel: string) => {
    xSnaps.push({ value, dist: Math.abs(nx - value), label: snapLabel })
  }
  const addY = (value: number, snapLabel: string) => {
    ySnaps.push({ value, dist: Math.abs(ny - value), label: snapLabel })
  }

  const mx = reshapeMirrorX(idx)
  const my = reshapeMirrorY(idx)
  const ex = reshapeEdgeX(idx)
  const ey = reshapeEdgeY(idx)

  // Symmetric width: opposite horizontal mirror moved the same distance.
  addX(base[idx].x - (quad[mx].x - base[mx].x), 'Match width')
  // Symmetric height: opposite vertical mirror moved the same distance.
  addY(base[idx].y - (quad[my].y - base[my].y), 'Match height')
  // Same edge delta as partner on the shared edge.
  addX(base[idx].x + (quad[ex].x - base[ex].x), 'Align edge')
  addY(base[idx].y + (quad[ey].y - base[ey].y), 'Align edge')

  for (let i = 0; i < 4; i++) {
    if (i === idx) continue
    addX(quad[i].x, 'Align X')
    addY(quad[i].y, 'Align Y')
    addX(base[i].x, 'Align X')
    addY(base[i].y, 'Align Y')
  }

  if (shiftAxis !== 'y') {
    const best = xSnaps
      .filter((s) => s.dist <= threshold)
      .sort((a, b) => a.dist - b.dist)[0]
    if (best) {
      nx = best.value
      verticalGuides.push(best.value)
      label = best.label
    }
  }
  if (shiftAxis !== 'x') {
    const best = ySnaps
      .filter((s) => s.dist <= threshold)
      .sort((a, b) => a.dist - b.dist)[0]
    if (best) {
      ny = best.value
      horizontalGuides.push(best.value)
      label = label ?? best.label
    }
  }

  return { pt: { x: nx, y: ny }, verticalGuides, horizontalGuides, label }
}



export function resolveReshapeSource(
  temp: HTMLCanvasElement,
  l: LineObj,
  W: number,
  H: number
): { x: number; y: number; w: number; h: number } | null {
  const raw = alphaBoundsFromCanvas(temp) ?? boundsFromLineFallback(l)
  if (raw) return padReshapeBounds(raw, W, H)
  return l.reshapeSrc ?? null
}

/** Warp a full-canvas buffer with the object's reshape quad (uses stored reshapeSrc). */
export function drawReshapedCanvas(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  l: LineObj
): boolean {
  const quad = l.reshapeQuad
  if (!quad || quad.length !== 4) return false
  const src = l.reshapeSrc
  if (!src || src.w < 1 || src.h < 1) return false
  const q: [Pt, Pt, Pt, Pt] = [quad[0], quad[1], quad[2], quad[3]]
  if (reshapeQuadMatchesSource(q, src)) {
    ctx.drawImage(source, 0, 0)
    return true
  }
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (quadIsAxisAlignedRect(q)) {
    drawImageAxisRect(ctx, source, src.x, src.y, src.w, src.h, q)
  } else {
    drawImageHomographyQuad(ctx, source, src.x, src.y, src.w, src.h, q)
  }
  ctx.restore()
  return true
}

export function lineHasReshapeWarp(l: LineObj): boolean {
  return reshapeIsApplied(l.reshapeQuad, l.reshapeSrc)
}

export function lineHasPunchHole(l: LineObj): boolean {
  return objectHasFillHole(l) || !!l.punchEnclosedHole
}

export function renderLineWithReshape(ctx: CanvasRenderingContext2D, l: LineObj): void {
  const quad = l.reshapeQuad
  if (!quad || quad.length !== 4) {
    renderLineBase(ctx, l)
    return
  }
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const temp = takeCanvas(W, H)
  try {
    const tctx = temp.getContext('2d')!
    renderLineUnwarpedToCanvas(tctx, l)
    const src = l.reshapeSrc ?? resolveReshapeSource(temp, l, W, H)
    if (!src) {
      renderLineBase(ctx, l)
      return
    }
    const q: [Pt, Pt, Pt, Pt] = [quad[0], quad[1], quad[2], quad[3]]
    // Unchanged quad: draw normally — avoids mesh seam lines on entering reshape.
    if (reshapeQuadMatchesSource(q, src)) {
      renderLineBase(ctx, l)
      return
    }
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (quadIsAxisAlignedRect(q)) {
      drawImageAxisRect(ctx, temp, src.x, src.y, src.w, src.h, q)
    } else {
      drawImageHomographyQuad(ctx, temp, src.x, src.y, src.w, src.h, q)
    }
    ctx.restore()
  } finally {
    releaseCanvas(temp)
  }
}

export function translateReshape(l: LineObj, dx: number, dy: number): void {
  if (l.reshapeQuad) l.reshapeQuad = l.reshapeQuad.map((p) => ({ x: p.x + dx, y: p.y + dy }))
  if (l.reshapeBaseQuad) l.reshapeBaseQuad = l.reshapeBaseQuad.map((p) => ({ x: p.x + dx, y: p.y + dy }))
  if (l.reshapeSrc) l.reshapeSrc = { ...l.reshapeSrc, x: l.reshapeSrc.x + dx, y: l.reshapeSrc.y + dy }
}

export function rotateReshapeFromSnapshot(l: LineObj, source: LineObj, center: Pt, delta: number): void {
  if (source.reshapeQuad) {
    l.reshapeQuad = source.reshapeQuad.map((p) => rotatePt(p, center, delta))
  }
  if (source.reshapeBaseQuad) {
    l.reshapeBaseQuad = source.reshapeBaseQuad.map((p) => rotatePt(p, center, delta))
  }
}

/**
 * Apply a canvas/object transform to reshape fields.
 * reshapeSrc must stay axis-aligned and match unwarped content after the same
 * transform; quad indices are remapped so TL/TR/BR/BL still match that rect
 * (90° / flips move which old corner lands on the new AABB's top-left).
 */
export function mapReshapeFields(
  l: LineObj,
  mapPt: (p: Pt) => Pt
): Pick<LineObj, 'reshapeQuad' | 'reshapeBaseQuad' | 'reshapeSrc'> {
  if (!l.reshapeQuad?.length) return {}
  const mappedQuad = l.reshapeQuad.map(mapPt)
  const mappedBase = l.reshapeBaseQuad?.map(mapPt)
  const src = l.reshapeSrc
  if (!src || src.w < 1 || src.h < 1) {
    return {
      reshapeQuad: mappedQuad,
      reshapeBaseQuad: mappedBase,
      reshapeSrc: src
    }
  }
  const oldCorners = [
    { x: src.x, y: src.y },
    { x: src.x + src.w, y: src.y },
    { x: src.x + src.w, y: src.y + src.h },
    { x: src.x, y: src.y + src.h }
  ]
  const mappedCorners = oldCorners.map(mapPt)
  const xs = mappedCorners.map((p) => p.x)
  const ys = mappedCorners.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const reshapeSrc = {
    x,
    y,
    w: Math.max(1, Math.max(...xs) - x),
    h: Math.max(1, Math.max(...ys) - y)
  }
  const newStd = [
    { x: reshapeSrc.x, y: reshapeSrc.y },
    { x: reshapeSrc.x + reshapeSrc.w, y: reshapeSrc.y },
    { x: reshapeSrc.x + reshapeSrc.w, y: reshapeSrc.y + reshapeSrc.h },
    { x: reshapeSrc.x, y: reshapeSrc.y + reshapeSrc.h }
  ]
  const reshapeQuad: Pt[] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 }
  ]
  const reshapeBaseQuad = mappedBase
    ? [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 }
      ]
    : undefined
  const used = new Set<number>()
  for (let i = 0; i < 4; i++) {
    let best = 0
    let bestD = Infinity
    for (let j = 0; j < 4; j++) {
      if (used.has(j)) continue
      const d = dist(mappedCorners[i], newStd[j])
      if (d < bestD) {
        bestD = d
        best = j
      }
    }
    used.add(best)
    reshapeQuad[best] = mappedQuad[i]
    if (reshapeBaseQuad && mappedBase) reshapeBaseQuad[best] = mappedBase[i]
  }
  return { reshapeQuad, reshapeBaseQuad, reshapeSrc }
}

export function reshapeCornerAt(l: LineObj, pt: Pt): number {
  if (!l.reshapeQuad?.length) return -1
  for (let i = 0; i < l.reshapeQuad.length; i++) {
    if (dist(l.reshapeQuad[i], pt) <= 12) return i
  }
  return -1
}

export function distPtToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

export function edgeIndexAtPoly(corners: Pt[], pt: Pt, cornerExcl = 12, threshold = 10): number {
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % corners.length]
    if (dist(pt, a) <= cornerExcl || dist(pt, b) <= cornerExcl) continue
    if (distPtToSegment(pt, a, b) <= threshold) return i
  }
  return -1
}

export function reshapeEdgeAt(l: LineObj, pt: Pt): number {
  if (!l.reshapeQuad?.length) return -1
  return edgeIndexAtPoly(l.reshapeQuad, pt)
}

export function localRectCornersFromPts(pts: Pt[]): Pt[] {
  const a = pts[0]
  const b = pts[1]
  const x0 = Math.min(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 }
  ]
}

export function displayRectCorners(l: LineObj): Pt[] {
  const c = objCenter(l)
  const rot = l.rot ?? 0
  return localRectCornersFromPts(l.pts).map((p) => rotatePt(p, c, rot))
}

export function bboxEdgeAt(l: LineObj, pt: Pt): number {
  if (l.pts.length !== 2) return -1
  if (l.type !== 'shape' && l.type !== 'stamp' && l.type !== 'group') return -1
  if (l.reshapeQuad?.length === 4) return -1
  return edgeIndexAtPoly(displayRectCorners(l), pt)
}

export function translatePolyEdge(corners: Pt[], edgeIdx: number, dx: number, dy: number): Pt[] {
  const next = corners.map((p) => ({ ...p }))
  const j = (edgeIdx + 1) % corners.length
  next[edgeIdx] = { x: next[edgeIdx].x + dx, y: next[edgeIdx].y + dy }
  next[j] = { x: next[j].x + dx, y: next[j].y + dy }
  return next
}

/** Shift-drag: keep movement on the dominant canvas axis only. */
export function constrainDragDeltaAxis(d: Pt, axisLock: boolean): Pt {
  if (!axisLock) return d
  if (Math.abs(d.x) >= Math.abs(d.y)) return { x: d.x, y: 0 }
  return { x: 0, y: d.y }
}

export function parseFontWeightNum(weight: string | undefined): number {
  const n = parseInt(String(weight ?? '700'), 10)
  return Number.isFinite(n) ? Math.max(100, Math.min(900, n)) : 700
}

/**
 * Top-left anchor so glyph *ink* (not the em / line box) is centered at (cx, cy).
 * Uses the same actualBoundingBox metrics as the outside letters renderer.
 */
export function opticalTopLeftForText(
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
export function outsideOffsetToPaint(settings: OutsideTextSettings, resolution: number): Pt {
  const scale = resolution / 256
  return {
    x: (settings.offsetX ?? 0) * scale,
    y: (settings.offsetY ?? 0) * scale
  }
}

/** Map outside Inner content shadow → paint text shadow (design 256 → inner-draw px). */
export function outsideShadowToPaint(
  settings: OutsideTextSettings,
  resolution: number,
  innerDrawSize = resolution
): Pick<LineObj, 'shadow' | 'shadowColor' | 'shadowBlur' | 'shadowSpread' | 'shadowOffsetX' | 'shadowOffsetY'> {
  const scale = Math.max(1, innerDrawSize) / 256
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

export function lineFromOutsideText(
  settings: OutsideTextSettings,
  resolution: number,
  innerDrawSize = resolution
): LineObj {
  const drawArea = Math.max(1, innerDrawSize)
  const fontSize = Math.max(4, Math.round(drawArea * (settings.fontSizeRatio ?? 0.52)))
  const letterSpacing = (settings.letterSpacing ?? 0) * (drawArea / 256)
  const weight = parseFontWeightNum(settings.fontWeight)
  const off = outsideOffsetToPaint(settings, resolution)
  const shadow = outsideShadowToPaint(settings, resolution, innerDrawSize)
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
    underline: !!settings.fontUnderline,
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

/** Copy saved text vector fields into paint UI state (no geometry changes). */
export function textPanelStateFromLine(l: LineObj): {
  textValue: string
  fontFamily: string
  fontSize: number
  fontWeightV: number
  underline: boolean
  italic: boolean
  letterSpacing: number
  color: string
  shadow: boolean
  shadowColor: string
  shadowBlur: number
  shadowOX: number
  shadowOY: number
  shadowSpread: number
} {
  return {
    textValue: l.text ?? '',
    fontFamily: l.fontFamily ?? 'Inter',
    fontSize: l.fontSize ?? 48,
    fontWeightV: l.weight ?? 400,
    underline: !!l.underline,
    italic: !!l.italic,
    letterSpacing: l.letterSpacing ?? 0,
    color: l.color,
    shadow: !!l.shadow,
    shadowColor: l.shadowColor ?? '#000000b3',
    shadowBlur: l.shadowBlur ?? 8,
    shadowOX: l.shadowOffsetX ?? 0,
    shadowOY: l.shadowOffsetY ?? 3,
    shadowSpread: l.shadowSpread ?? 0
  }
}

export function applyOutsideTextToLine(
  l: LineObj,
  settings: OutsideTextSettings,
  resolution: number,
  innerDrawSize = resolution,
  opts?: { preservePosition?: boolean; linkToOutside?: boolean }
): LineObj {
  const drawArea = Math.max(1, innerDrawSize)
  const fontSize = Math.max(4, Math.round(drawArea * (settings.fontSizeRatio ?? 0.52)))
  const letterSpacing = (settings.letterSpacing ?? 0) * (drawArea / 256)
  const weight = parseFontWeightNum(settings.fontWeight)
  const off = outsideOffsetToPaint(settings, resolution)
  const shadow = outsideShadowToPaint(settings, resolution, innerDrawSize)
  const link = opts?.linkToOutside ?? !!l.linkedOutsideText
  const next: LineObj = {
    ...l,
    color: settings.textColor || l.color,
    text: settings.text ?? l.text,
    fontFamily: settings.fontFamily || l.fontFamily,
    fontSize,
    weight,
    bold: weight >= 700,
    italic: !!settings.fontItalic,
    underline: !!settings.fontUnderline,
    letterSpacing,
    linkedOutsideText: link ? true : undefined,
    ...shadow
  }
  if (!opts?.preservePosition) {
    next.pts = [opticalTopLeftForText(next, resolution / 2 + off.x, resolution / 2 + off.y)]
  }
  return next
}

/** Scale a paint object around the canvas center (icon Size / Size % after Save). */
export function scalePaintLineAround(l: LineObj, cx: number, cy: number, s: number): LineObj {
  if (!Number.isFinite(s) || Math.abs(s - 1) < 0.001) return l
  const map = (p: Pt): Pt => ({ x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s })
  const scaleN = (n: number | undefined) => (n == null ? undefined : n * s)
  return {
    ...l,
    pts: l.pts.map(map),
    fontSize: scaleN(l.fontSize),
    thickness: l.thickness * s,
    borderWidth: scaleN(l.borderWidth),
    letterSpacing: scaleN(l.letterSpacing),
    shadowBlur: scaleN(l.shadowBlur),
    shadowSpread: scaleN(l.shadowSpread),
    shadowOffsetX: scaleN(l.shadowOffsetX),
    shadowOffsetY: scaleN(l.shadowOffsetY),
    sourceStampSize: scaleN(l.sourceStampSize),
    reshapeQuad: l.reshapeQuad?.map(map),
    reshapeBaseQuad: l.reshapeBaseQuad?.map(map),
    reshapeSrc: l.reshapeSrc
      ? {
          x: cx + (l.reshapeSrc.x - cx) * s,
          y: cy + (l.reshapeSrc.y - cy) * s,
          w: l.reshapeSrc.w * s,
          h: l.reshapeSrc.h * s
        }
      : l.reshapeSrc
  }
}

/** Stamp proxy for non-letter Inner content (move / resize / shadow in Paint). */
export function lineFromContentProxy(
  crop: { dataUrl: string; w: number; h: number },
  settings: OutsideContentSettings,
  resolution: number,
  innerDrawSize = resolution
): LineObj {
  const off = outsideOffsetToPaint(settings, resolution)
  const shadow = outsideShadowToPaint(settings, resolution, innerDrawSize)
  const cx = resolution / 2 + off.x
  const cy = resolution / 2 + off.y
  // Size from live sizeRatio; crop only supplies pixels + aspect (not bbox size).
  const { w, h } = proxyBoxFromSizeRatio(
    settings.sizeRatio,
    resolution,
    crop.w,
    crop.h,
    innerDrawSize
  )
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
    stampSource: 'image' as const,
    layer: 'content',
    contentBound: true,
    name: 'Inner content',
    visible: true,
    ...shadow
  }
}

export function applyOutsideContentToProxy(
  l: LineObj,
  settings: OutsideContentSettings,
  resolution: number,
  freshCrop?: { dataUrl: string; w: number; h: number },
  innerDrawSize = resolution
): LineObj {
  const off = outsideOffsetToPaint(settings, resolution)
  const shadow = outsideShadowToPaint(settings, resolution, innerDrawSize)
  const a = l.pts[0], b = l.pts[1]
  let w = Math.max(1, Math.abs((b?.x ?? 0) - (a?.x ?? 0)))
  let h = Math.max(1, Math.abs((b?.y ?? 0) - (a?.y ?? 0)))
  if (freshCrop || settings.sizeRatio != null) {
    const aspectW = freshCrop?.w ?? w
    const aspectH = freshCrop?.h ?? h
    ;({ w, h } = proxyBoxFromSizeRatio(
      settings.sizeRatio,
      resolution,
      aspectW,
      aspectH,
      innerDrawSize
    ))
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
    contentProxySlot: undefined,
    stampSource: l.stampSource ?? 'image',
    name: l.name || 'Inner content',
    layer: l.layer ?? 'content',
    ...shadow
  }
}
export function renderText(ctx: CanvasRenderingContext2D, l: LineObj): void {
  const rows = textRows(l)
  if (!l.text) return
  const p = l.pts[0]
  const { lineH } = textMetrics(l)
  const spacing = l.letterSpacing ?? 0
  const font = textFontStr(l)
  const b = unionTextBounds(textBBox(l), textInkBBox(l))

  const drawGlyphs = (target: CanvasRenderingContext2D, ox: number, oy: number, fillStyle: string | CanvasGradient) => {
    target.font = font
    target.textAlign = 'left'
    target.textBaseline = 'top'
    target.fillStyle = fillStyle
    const fs = l.fontSize ?? 48
    const underlineColor =
      typeof fillStyle === 'string' ? fillStyle : firstSolidColor(l.color)
    rows.forEach((r, i) => {
      if (!r) return
      const x = p.x + ox
      const y = p.y + i * lineH + oy
      fillSpacedText(target, r, x, y, spacing)
      if (l.underline) {
        drawTextUnderline(target, r, x, y, fs, underlineColor, 'left', 'top', spacing)
      }
    })
  }

  const hideFill = isTransparentPaintColor(l.color)
  if (!shouldDrawObjectShadow(l)) {
    if (!hideFill) {
      drawGlyphs(ctx, 0, 0, resolveCanvasColor(ctx, l.color, b.x, b.y, Math.max(1, b.w), Math.max(1, b.h)))
    }
    return
  }

  const blur = l.shadowBlur ?? 0
  const sox = l.shadowOffsetX ?? 0
  const soy = l.shadowOffsetY ?? 0
  const spread = l.shadowSpread ?? 0
  const pad = 8
  const tw = Math.max(1, Math.ceil(b.w) + pad * 2)
  const th = Math.max(1, Math.ceil(b.h) + pad * 2)
  const off = reuseCanvas(textOffSlot, tw, th)
  const o = off.getContext('2d')!
  // Whole-object see-through hides the glyphs; bake the drop-shadow from an
  // opaque silhouette so the hole does not take the shadow with it.
  drawGlyphs(
    o,
    -b.x + pad,
    -b.y + pad,
    hideFill
      ? '#000000'
      : resolveCanvasColor(o, l.color, pad, pad, Math.max(1, b.w), Math.max(1, b.h))
  )
  const baked = bakeCanvasDropShadow(off, {
    blur,
    ox: sox,
    oy: soy,
    spread,
    color: l.shadowColor ?? '#00000080',
    shadowOnly: hideFill
  })
  ctx.drawImage(baked.canvas, b.x - pad - baked.inset, b.y - pad - baked.inset)
}

// Sample a line into a flat polyline for rendering / hit-testing.
export function flattenLine(l: LineObj): Pt[] {
  const p = l.pts
  if (l.reshapeQuad?.length === 4) return [...l.reshapeQuad, l.reshapeQuad[0]]
  if (l.type === 'text') {
    const b = textInkBBox(l)
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

/** Sample whether a canvas point hits the glyph ink, its shadow, or neither. */
export function sampleLineAlphaAt(l: LineObj, x: number, y: number, withShadow: boolean): number {
  const pad = withShadow
    ? Math.max(8, Math.ceil((l.shadowBlur ?? 0) * 3 + (l.shadowSpread ?? 0) + Math.abs(l.shadowOffsetX ?? 0) + Math.abs(l.shadowOffsetY ?? 0) + 16))
    : 1
  const side = pad * 2 + 1
  const c = takeCanvas(side, side)
  try {
    const ctx = c.getContext('2d')
    if (!ctx) return 0
    ctx.setTransform(1, 0, 0, 1, -x + pad, -y + pad)
    // See-through / transparent fills hide ink — probe an opaque silhouette so
    // Fill can still hit and recolour those objects.
    const probe: LineObj = {
      ...(withShadow ? l : { ...l, shadow: false }),
      color: isTransparentPaintColor(l.color) ? '#000000' : l.color,
      punchThrough: false
    }
    renderLine(ctx, probe, { skipHole: true })
    return ctx.getImageData(pad, pad, 1, 1).data[3]
  } finally {
    releaseCanvas(c)
  }
}

export function textFillHit(l: LineObj, canvasPt: Pt, canvasW: number, canvasH: number): 'glyph' | 'shadow' | null {
  if (l.type !== 'text' || !l.text) return null
  const w = Math.max(1, Math.ceil(canvasW))
  const h = Math.max(1, Math.ceil(canvasH))
  const x = Math.max(0, Math.min(w - 1, Math.floor(canvasPt.x)))
  const y = Math.max(0, Math.min(h - 1, Math.floor(canvasPt.y)))
  if (sampleLineAlphaAt(l, x, y, false) > 12) return 'glyph'
  if (l.shadow && sampleLineAlphaAt(l, x, y, true) > 12) return 'shadow'
  return null
}

/** Fill vs live drop-shadow for stamps / shapes (same idea as textFillHit). */
export function paintObjectHit(
  l: LineObj,
  canvasPt: Pt,
  canvasW: number,
  canvasH: number
): 'fill' | 'shadow' | null {
  if (l.type === 'text') {
    const hit = textFillHit(l, canvasPt, canvasW, canvasH)
    return hit === 'glyph' ? 'fill' : hit
  }
  if (l.type !== 'stamp' && l.type !== 'shape' && l.type !== 'poly') return null
  const w = Math.max(1, Math.ceil(canvasW))
  const h = Math.max(1, Math.ceil(canvasH))
  const x = Math.max(0, Math.min(w - 1, Math.floor(canvasPt.x)))
  const y = Math.max(0, Math.min(h - 1, Math.floor(canvasPt.y)))
  if (sampleLineAlphaAt(l, x, y, false) > 12) return 'fill'
  if (l.shadow && sampleLineAlphaAt(l, x, y, true) > 12) return 'shadow'
  return null
}

// Convert an existing line's points to a different type (preserving endpoints).
export function convertPts(l: LineObj, type: LineType): Pt[] {
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

export function offsetPolyline(poly: Pt[], d: number): Pt[] {
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

export const isDoubleDash = (d: DashType): boolean => d === 'double' || d === 'double-dotted' || d === 'double-dashed'
export const isDotted = (d: DashType): boolean => d === 'dotted' || d === 'double-dotted'
export const isDashed = (d: DashType): boolean => d === 'dashed' || d === 'double-dashed'

export function dashArrayFor(d: DashType, t: number): number[] {
  if (isDotted(d)) return [0.01, t * 2]
  if (isDashed(d)) return [t * 2.6, t * 1.9]
  return []
}

export function strokePolyline(ctx: CanvasRenderingContext2D, poly: Pt[], color: string | CanvasGradient, t: number, dash: number[], cornerRadius = 0): void {
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
export function pathRoundedPolygon(ctx: CanvasRenderingContext2D, pts: Pt[], radius: number): void {
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
export function pathRoundedPolyline(ctx: CanvasRenderingContext2D, pts: Pt[], radius: number): void {
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

export function lineBorderWidth(l: LineObj): number {
  return Math.max(0, l.borderWidth ?? l.thickness)
}
export function lineBorderColor(l: LineObj): string {
  return l.borderColor ?? l.color
}
export function lineBorderRadius(l: LineObj): number {
  return Math.max(0, l.borderRadius ?? 0)
}

/** Shapes whose outline is a polygon / rect and can take a corner radius. */
export function shapeSupportsRadius(kind: ShapeKind): boolean {
  return (
    POLY_KIND_SET.has(kind) ||
    kind === 'cross' || kind === 'arrow' || kind === 'lightning' ||
    kind === 'shield' || kind === 'speech'
  )
}

// Outward unit direction at an endpoint, using a reference point at least
// `minLen` away so freehand/dense polylines give a stable, visible cap.
export function endDir(poly: Pt[], atStart: boolean, minLen: number): Pt {
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

export function defaultCapSize(thickness: number): number {
  return Math.round(Math.max(7, Math.max(0.5, thickness) * 3.2))
}

export function drawCap(
  ctx: CanvasRenderingContext2D,
  at: Pt,
  dir: Pt,
  cap: CapType,
  color: string | CanvasGradient,
  t: number,
  capSize?: number
): void {
  if (cap === 'none') return
  const s = Math.max(1, capSize ?? defaultCapSize(t))
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
export function objCenter(l: LineObj): Pt {
  if (l.transformOrigin) return { x: l.transformOrigin.x, y: l.transformOrigin.y }
  if (l.type === 'text') {
    return textInkCenter(l)
  }
  const pts = l.pts.length ? l.pts : [{ x: 0, y: 0 }]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

/** Canvas-space pivot for the rotate pin — follows the warped quad when reshaped. */
export function rotationCenter(l: LineObj): Pt {
  const quad = l.reshapeQuad
  if (quad?.length === 4) {
    return {
      x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
      y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4
    }
  }
  return objCenter(l)
}
// Rotate point p by `ang` (radians) around centre c.
export function rotatePt(p: Pt, c: Pt, ang: number): Pt {
  if (!ang) return p
  const s = Math.sin(ang), co = Math.cos(ang)
  const dx = p.x - c.x, dy = p.y - c.y
  return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co }
}

/** Apply scale-then-rotate around a chosen center (matches renderLineBase). */
export function mapObjDisplayPtAt(p: Pt, l: LineObj, center: Pt): Pt {
  const sx = l.scaleX ?? 1
  const sy = l.scaleY ?? 1
  let q = p
  if (sx !== 1 || sy !== 1) {
    q = { x: center.x + (q.x - center.x) * sx, y: center.y + (q.y - center.y) * sy }
  }
  return rotatePt(q, center, l.rot ?? 0)
}

export function unmapObjDisplayPtAt(p: Pt, l: LineObj, center: Pt): Pt {
  const sx = l.scaleX ?? 1
  const sy = l.scaleY ?? 1
  let q = rotatePt(p, center, -(l.rot ?? 0))
  if (sx !== 1 || sy !== 1) {
    q = { x: center.x + (q.x - center.x) / sx, y: center.y + (q.y - center.y) / sy }
  }
  return q
}

/** Apply scale-then-rotate around objCenter (matches renderLineBase). */
export function mapObjDisplayPt(p: Pt, l: LineObj): Pt {
  return mapObjDisplayPtAt(p, l, objCenter(l))
}

export function unmapObjDisplayPt(p: Pt, l: LineObj): Pt {
  return unmapObjDisplayPtAt(p, l, objCenter(l))
}

// Top-centre anchor (unrotated) used to attach the rotate pin.
export function objTopCenter(l: LineObj): Pt {
  if (l.type === 'text') { const b = textInkBBox(l); return { x: b.x + b.w / 2, y: b.y } }
  const pts = l.pts.length ? l.pts : [{ x: 0, y: 0 }]
  let minX = Infinity, minY = Infinity, maxX = -Infinity
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x) }
  return { x: (minX + maxX) / 2, y: minY }
}

export function renderLineBase(ctx: CanvasRenderingContext2D, l: LineObj): void {
  const c = objCenter(l)
  const rot = l.rot ?? 0
  const sx = l.scaleX ?? 1
  const sy = l.scaleY ?? 1
  if (lineNeedsDisplayTransform(l)) {
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(rot)
    ctx.scale(sx, sy)
    ctx.translate(-c.x, -c.y)
    renderLineBody(ctx, l)
    ctx.restore()
    return
  }
  renderLineBody(ctx, l)
}

export function punchLocalBox(l: LineObj): { x: number; y: number; w: number; h: number } | null {
  if (l.type === 'text') {
    const b = textInkBBox(l)
    return b.w > 0 && b.h > 0 ? b : null
  }
  if (l.pts.length < 2) return null
  const a = l.pts[0], b = l.pts[1]
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.max(1, Math.abs(b.x - a.x)),
    h: Math.max(1, Math.abs(b.y - a.y))
  }
}

/** Geometry adapter for paintHoles — keeps local masks tied to object transforms. */
export const holeGeom: HoleGeom = {
  localBox: (item) => punchLocalBox(item as LineObj),
  mapDisplay: (p, item) => mapObjDisplayPt(p, item as LineObj),
  unmapDisplay: (p, item) => unmapObjDisplayPt(p, item as LineObj)
}

export function rewritePunchBitsFromLocal(item: LineObj, W: number, H: number): void {
  rewriteDisplayBits(item as HoleItem, W, H, holeGeom, 'punch')
  rewriteDisplayBits(item as HoleItem, W, H, holeGeom, 'see-through')
}

export function setLocalPunchFromFilled(
  item: LineObj,
  filled: Uint8Array,
  W: number,
  H: number,
  opts?: { replace?: boolean; mode?: HoleFillMode; skipOtherSubtract?: boolean }
): void {
  attachFromFlood(item as HoleItem, filled, W, H, holeGeom, opts)
  syncHoleFlags(item as HoleItem)
}

/** PNG snapshot of an object's punch hole bits for Save / re-enter. */
export function serializeHoleMaskPng(item: LineObj, W: number, H: number): string | undefined {
  return serializeHolePng(item as HoleItem, W, H, holeGeom)
}

export function serializeSeeThroughMaskPng(item: LineObj, W: number, H: number): string | undefined {
  return serializeSeeThroughHolePng(item as HoleItem, W, H, holeGeom)
}

/**
 * Text / font / shape-kind changes invalidate hole geometry — drop punch and
 * see-through masks (move / rotate / uniform scale keep them via sync).
 */
export function refreshTextHoleMaskForNewGlyphs(item: LineObj, _W: number, _H: number): void {
  clearHolesOnTextEdit(item as HoleItem)
}

/** Drop punch / see-through when the object's intrinsic shape identity changes. */
export function clearHolesOnShapeIdentityChange(item: LineObj): void {
  if (
    !item.punchThrough &&
    !item.punchEnclosedHole &&
    !hasPunchCoverage(item.id) &&
    !hasSeeThroughCoverage(item.id) &&
    !item.holeMaskPng &&
    !item.seeThroughHoleMaskPng
  ) {
    return
  }
  clearObjectHoles(item as HoleItem)
}

export function objectHasFillHole(l: LineObj): boolean {
  return holeObjectHasFillHole(l as HoleItem)
}

export function objectRenderPad(l: LineObj): number {
  const stroke = Math.ceil(lineBorderWidth(l) / 2) + 2
  if (!shouldDrawObjectShadow(l)) return Math.max(8, stroke)
  return Math.ceil(
    (l.shadowBlur ?? 0) * 3 +
      (l.shadowSpread ?? 0) +
      Math.abs(l.shadowOffsetX ?? 0) +
      Math.abs(l.shadowOffsetY ?? 0) +
      16 +
      stroke
  )
}

export function objectRenderBox(l: LineObj, W: number, H: number): { x: number; y: number; w: number; h: number } {
  const pad = objectRenderPad(l)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (p: Pt) => {
    const d = mapObjDisplayPt(p, l)
    minX = Math.min(minX, d.x)
    minY = Math.min(minY, d.y)
    maxX = Math.max(maxX, d.x)
    maxY = Math.max(maxY, d.y)
  }
  if (l.reshapeQuad?.length === 4) {
    for (const p of l.reshapeQuad) add(p)
  } else if (l.type === 'text') {
    const b = textInkBBox(l)
    add({ x: b.x, y: b.y })
    add({ x: b.x + b.w, y: b.y })
    add({ x: b.x + b.w, y: b.y + b.h })
    add({ x: b.x, y: b.y + b.h })
  } else if (l.pts.length >= 2) {
    for (const p of l.pts) add(p)
    const box = punchLocalBox(l)
    if (box) {
      add({ x: box.x, y: box.y })
      add({ x: box.x + box.w, y: box.y })
      add({ x: box.x + box.w, y: box.y + box.h })
      add({ x: box.x, y: box.y + box.h })
    }
  } else {
    return { x: 0, y: 0, w: W, h: H }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: W, h: H }
  const x = Math.max(0, Math.floor(minX) - pad)
  const y = Math.max(0, Math.floor(minY) - pad)
  const x1 = Math.min(W, Math.ceil(maxX) + pad)
  const y1 = Math.min(H, Math.ceil(maxY) + pad)
  return { x, y, w: Math.max(1, x1 - x), h: Math.max(1, y1 - y) }
}

export function textPunchBitsFromSavedLayer(
  l: LineObj,
  bits: Uint8Array,
  W: number,
  H: number
): { bits: Uint8Array; enclosed: boolean } | null {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (!ctx) return { bits, enclosed: !!l.punchEnclosedHole }
  renderLineBase(ctx, { ...l, color: '#000000', shadow: false, punchThrough: false })
  const gd = ctx.getImageData(0, 0, W, H).data
  const hole = new Uint8Array(bits.length)
  let glyph = 0
  let overlap = 0
  let mask = 0
  let holeN = 0
  for (let p = 0; p < bits.length; p++) {
    const onGlyph = gd[p * 4 + 3] >= 80
    if (onGlyph) glyph++
    if (!bits[p]) continue
    mask++
    if (onGlyph) overlap++
    else {
      hole[p] = 1
      holeN++
    }
  }
  // Prefer the persisted flag when present (re-enter Paint after Save).
  if (l.punchEnclosedHole) {
    return holeN > 8 ? { bits: hole, enclosed: true } : { bits, enclosed: true }
  }
  // Whole-character / multi-glyph punch-through must keep `bits` as-is —
  // inverting to counters left punchThrough with no mask (see-through + fringe).
  const looksLikeFullGlyph = glyph > 0 && overlap >= glyph * 0.45 && holeN < overlap * 0.35
  if (looksLikeFullGlyph) {
    return { bits, enclosed: false }
  }
  // Mask mostly off-glyph → enclosed counter hole.
  return { bits, enclosed: mask > 0 && overlap < mask * 0.35 }
}

export function destOutLocalPunch(
  ctx: CanvasRenderingContext2D,
  item: LineObj,
  mode: HoleFillMode = 'see-through'
): boolean {
  const canvasMap = mode === 'punch' ? punchMaskCanvases : seeThroughMaskCanvases
  const hasLocalHole =
    item.punchMask ||
    canvasMap.has(item.id) ||
    (mode === 'punch' && !!item.punchThrough)
  if (!hasLocalHole) return false
  const box = punchLocalBox(item)
  if (!box) return false
  const sync = canvasMap.get(item.id)
  const cached = item.punchMask && item.imageDataUrl ? stampImgCache.get(item.imageDataUrl) : null
  const src = sync ?? (cached && cached.complete && cached.naturalWidth > 0 ? cached : null)
  if (!src) return false
  const paintOnto = (target: CanvasRenderingContext2D) => {
    target.save()
    target.imageSmoothingEnabled = false
    target.globalCompositeOperation = 'destination-out'
    target.drawImage(src, box.x, box.y, box.w, box.h)
    target.restore()
  }
  const paintTransformed = (target: CanvasRenderingContext2D) => {
    if (lineNeedsDisplayTransform(item)) {
      const c = objCenter(item)
      target.save()
      target.translate(c.x, c.y)
      target.rotate(item.rot ?? 0)
      target.scale(item.scaleX ?? 1, item.scaleY ?? 1)
      target.translate(-c.x, -c.y)
      paintOnto(target)
      target.restore()
      return
    }
    paintOnto(target)
  }
  // Reshape warps the hole with the object (punch first in local space, then warp).
  if (lineHasReshapeWarp(item) && item.reshapeSrc) {
    const w = ctx.canvas.width
    const h = ctx.canvas.height
    const mask = takeCanvas(w, h)
    try {
      const m = mask.getContext('2d')!
      // Opaque hole silhouette (source-over), then warp + dest-out.
      m.save()
      m.imageSmoothingEnabled = false
      if (lineNeedsDisplayTransform(item)) {
        const c = objCenter(item)
        m.translate(c.x, c.y)
        m.rotate(item.rot ?? 0)
        m.scale(item.scaleX ?? 1, item.scaleY ?? 1)
        m.translate(-c.x, -c.y)
      }
      m.drawImage(src, box.x, box.y, box.w, box.h)
      m.restore()
      const warped = takeCanvas(w, h)
      try {
        if (!drawReshapedCanvas(warped.getContext('2d')!, mask, item)) {
          paintTransformed(ctx)
          return true
        }
        ctx.save()
        ctx.globalCompositeOperation = 'destination-out'
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(warped, 0, 0)
        ctx.restore()
      } finally {
        releaseCanvas(warped)
      }
    } finally {
      releaseCanvas(mask)
    }
    return true
  }
  paintTransformed(ctx)
  return true
}

/** Punch-through dest-out on the stack. Enclosed counters skip the glyph ink. */
export function destOutPunchThroughOnComposite(ctx: CanvasRenderingContext2D, item: LineObj): boolean {
  if (!item.punchEnclosedHole) return destOutLocalPunch(ctx, item, 'punch')
  // Reshape: canvas-fixed bits ignore warp; local canvas + warp matches the object.
  if (lineHasReshapeWarp(item)) {
    if (!destOutLocalPunch(ctx, item, 'punch')) return false
    const wasPunch = item.punchThrough
    item.punchThrough = false
    renderLine(ctx, item)
    item.punchThrough = wasPunch
    return true
  }
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  if (punchMaskCanvases.has(item.id)) rewritePunchBitsFromLocal(item, w, h)
  const bits = punchMaskBits.get(item.id)
  if (!bits || bits.length !== w * h) return destOutLocalPunch(ctx, item, 'punch')

  const sil = takeCanvas(w, h)
  try {
    const s = sil.getContext('2d')!
    s.imageSmoothingEnabled = false
    const wasShadow = item.shadow
    const wasPunch = item.punchThrough
    const wasColor = item.color
    item.shadow = false
    item.punchThrough = false
    // Colour irrelevant — alpha outline only. Include reshape so counters
    // line up with the warped glyph on layers below.
    if (item.type === 'text') item.color = '#000000'
    if (lineHasReshapeWarp(item)) {
      renderLine(s, item, { skipHole: true })
    } else {
      renderLineBase(s, item)
    }
    item.shadow = wasShadow
    item.punchThrough = wasPunch
    item.color = wasColor

    const inkData = s.getImageData(0, 0, w, h).data
    const ink = new Uint8Array(w * h)
    for (let p = 0; p < ink.length; p++) {
      if (inkData[p * 4 + 3] >= 24) ink[p] = 1
    }
    const outside = floodOutsideEmpty(ink, w, h)
    const hardHole = new Uint8Array(w * h)
    let holeN = 0
    for (let p = 0; p < hardHole.length; p++) {
      if (ink[p] || outside[p]) continue
      hardHole[p] = 1
      holeN++
    }
    // Prefer the user's saved hole (partial counters) — auto-detect would
    // re-punch every counter and fight punch vs see-through intent.
    const hole = resolveEnclosedHoleBits(bits, hardHole, holeN, w, h) ?? bits
    // Cut the full counter — eroding here left Outer colour along the hole edge.
    destOutFilledMask(ctx, hole, w, h)
    // Keep display bits as the saved/resolved hole — do not overwrite with
    // auto-detected full counters (that regenerates every bowl on move).
    punchMaskBits.set(item.id, hole)

    // Hard outline fill + counter punch (colour-agnostic silhouette).
    item.punchThrough = false
    renderLine(ctx, item)
    item.punchThrough = wasPunch
    return true
  } finally {
    releaseCanvas(sil)
  }
}

/** Remove hole coverage for a filled region from both modes; returns whether any hole remains. */
export function subtractLocalPunchRegion(item: LineObj, region: Uint8Array, W: number, H: number): boolean {
  const punchLeft = subtractRegionFromMode(item as HoleItem, region, 'punch', W, H, holeGeom)
  const stLeft = subtractRegionFromMode(item as HoleItem, region, 'see-through', W, H, holeGeom)
  syncHoleFlags(item as HoleItem)
  return punchLeft || stLeft || hasPunchCoverage(item.id) || hasSeeThroughCoverage(item.id)
}

/** See-through hole on this object (local mask or transparent fill — not stack punch alone). */
export function objectHasSeeThroughHole(l: LineObj): boolean {
  if (hasSeeThroughCoverage(l.id) || l.seeThroughHoleMaskPng) return true
  if (l.punchMask && !l.punchThrough) return true
  if (isTransparentPaintColor(l.color ?? '')) return true
  // Legacy: see-through stored only as holeMaskMode without punchThrough.
  if (!l.punchThrough && l.holeMaskMode === 'see-through') {
    return punchMaskCanvases.has(l.id) || punchMaskBits.has(l.id) || !!l.holeMaskPng
  }
  return false
}

/**
 * Rasterize an object (with its local hole) into a stamp so see-through / punch
 * survives Save and re-enter Paint. Clears contentBound and in-memory hole maps.
 */
export function bakeObjectAppearanceToStamp(item: LineObj, W: number, H: number): LineObj {
  const canvas = takeCanvas(W, H)
  try {
    const ctx = canvas.getContext('2d')!
    // Draw with hole applied; keep punchThrough false so we don't stack-cut Outer.
    const wasPunch = item.punchThrough
    item.punchThrough = false
    try {
      renderLine(ctx, { ...item, punchThrough: false, shadow: !!item.shadow })
    } finally {
      item.punchThrough = wasPunch
    }
    const bounds = bakeCropBoundsFromCanvas(item, canvas)
    if (!bounds) {
      clearObjectHoles(item as HoleItem)
      return {
        ...item,
        punchThrough: false,
        punchEnclosedHole: false,
        holeMaskPng: undefined,
        seeThroughHoleMaskPng: undefined,
        holeMaskMode: undefined
      }
    }
    const cw = Math.max(1, Math.round(bounds.w))
    const ch = Math.max(1, Math.round(bounds.h))
    const cropped = takeCanvas(cw, ch)
    try {
      cropped.getContext('2d')!.drawImage(
        canvas,
        bounds.x, bounds.y, bounds.w, bounds.h,
        0, 0, cw, ch
      )
      const imageDataUrl = cropped.toDataURL('image/png')
      ensureStampImage(imageDataUrl)
      clearObjectHoles(item as HoleItem)
      const { contentBound: _cb, ...rest } = item
      return {
        ...rest,
        type: 'stamp',
        pts: [
          { x: bounds.x, y: bounds.y },
          { x: bounds.x + bounds.w, y: bounds.y + bounds.h }
        ],
        rot: 0,
        scaleX: 1,
        scaleY: 1,
        imageDataUrl,
        stampSource: item.stampSource ?? 'image',
        paintStrokes: undefined,
        sourceSvgMarkup: undefined,
        sourceStampSize: undefined,
        keepStrokeOnResize: undefined,
        contentBound: undefined,
        // Keep link + glyph string so outside TE→BO can drop this bake.
        linkedOutsideText: item.linkedOutsideText,
        text: item.linkedOutsideText ? item.text : undefined,
        // Keep opaque object colour — never force white (looks like Outer went white).
        color: isTransparentPaintColor(item.color ?? '')
          ? '#ffffffff'
          : pixelColor(item.color ?? '#ffffffff'),
        punchThrough: false,
        punchEnclosedHole: false,
        punchMask: false,
        holeMaskPng: undefined,
        seeThroughHoleMaskPng: undefined,
        holeMaskMode: undefined
      }
    } finally {
      releaseCanvas(cropped)
    }
  } finally {
    releaseCanvas(canvas)
  }
}

/**
 * Older Saves baked letter Fill into a stamp (blocked in-paint text edit).
 * Restore as editable text using the stamp centre + stored glyph fields.
 */
export function letterBakeStampToEditableText(l: LineObj, W: number, H: number): LineObj {
  if (l.type !== 'stamp') return l
  if (!l.linkedOutsideText && !(l.text?.trim())) return l
  const color = isTransparentPaintColor(l.color ?? '')
    ? (l.color as string)
    : firstSolidColor(l.color ?? '#ffffffff')
  const next: LineObj = {
    ...l,
    type: 'text',
    imageDataUrl: undefined,
    stampSource: undefined,
    paintStrokes: undefined,
    sourceSvgMarkup: undefined,
    sourceStampSize: undefined,
    keepStrokeOnResize: undefined,
    color,
    text: l.text ?? '',
    name: l.name ?? 'Text',
    fontFamily: l.fontFamily ?? 'Inter',
    fontSize: l.fontSize ?? Math.round(Math.min(W, H) * 0.52),
    weight: l.weight ?? (l.bold ? 700 : 400),
    bold: l.bold ?? (l.weight ?? 400) >= 700,
    italic: !!l.italic,
    underline: !!l.underline,
    letterSpacing: l.letterSpacing ?? 0,
    lineHeight: l.lineHeight ?? 1.28
  }
  if (l.pts.length >= 2) {
    const cx = (l.pts[0].x + l.pts[1].x) / 2
    const cy = (l.pts[0].y + l.pts[1].y) / 2
    next.pts = [opticalTopLeftForText(next, cx, cy)]
  } else if (!next.pts.length) {
    next.pts = [opticalTopLeftForText(next, W / 2, H / 2)]
  }
  return next
}

/**
 * Solid-fill a punch/see-through pocket.
 * - Vector same-colour restore: mask clear only (no raster / no expand).
 * - Otherwise: crisp paint into the pocket only; keep other hole masks.
 */
export function refillHolePocket(
  item: LineObj,
  holeRegion: Uint8Array,
  fillColor: string,
  W: number,
  H: number
): LineObj {
  const fill = pixelColor(fillColor)
  const fr = parseInt(fill.slice(1, 3), 16)
  const fg = parseInt(fill.slice(3, 5), 16)
  const fb = parseInt(fill.slice(5, 7), 16)
  const fa = parseInt(fill.slice(7, 9) || 'ff', 16)
  syncHoleFlags(item as HoleItem)

  const itemSolid = firstSolidColor(item.color ?? '#ffffffff').slice(0, 7).toLowerCase()
  const fillSolid = fill.slice(0, 7).toLowerCase()
  const sameColour = itemSolid === fillSolid
  const isVector =
    (item.type === 'shape' || item.type === 'poly' || item.type === 'text') &&
    !item.paintStrokes?.length &&
    item.type !== 'stamp'

  // Same colour on a vector: clearing the hole mask restores ink — do not bake.
  if (sameColour && isVector) {
    return {
      ...item,
      color: fill,
      ...(item.type === 'shape' || item.type === 'poly' ? { fill: true as const } : {}),
      punchThrough: hasPunchCoverage(item.id),
      punchEnclosedHole:
        hasPunchCoverage(item.id) || hasSeeThroughCoverage(item.id)
          ? item.punchEnclosedHole
          : false
    }
  }

  const canvas = takeCanvas(W, H)
  try {
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    const wasPunch = item.punchThrough
    item.punchThrough = false
    try {
      // Remaining holes still cut; this pocket is already cleared from maps.
      renderLine(ctx, { ...item, punchThrough: false, shadow: false })
    } finally {
      item.punchThrough = wasPunch
    }
    const img = ctx.getImageData(0, 0, W, H)
    const d = img.data
    for (let p = 0; p < holeRegion.length; p++) {
      if (!holeRegion[p]) continue
      const i = p * 4
      d[i] = fr
      d[i + 1] = fg
      d[i + 2] = fb
      d[i + 3] = fa
    }
    ctx.putImageData(img, 0, 0)

    const bounds = bakeCropBoundsFromCanvas(item, canvas)
    if (!bounds) {
      return {
        ...item,
        color: fill,
        punchThrough: hasPunchCoverage(item.id)
      }
    }
    const cw = Math.max(1, Math.round(bounds.w))
    const ch = Math.max(1, Math.round(bounds.h))
    const cropped = takeCanvas(cw, ch)
    try {
      const cctx = cropped.getContext('2d')!
      cctx.imageSmoothingEnabled = false
      cctx.drawImage(
        canvas,
        bounds.x,
        bounds.y,
        bounds.w,
        bounds.h,
        0,
        0,
        cw,
        ch
      )
      const imageDataUrl = cropped.toDataURL('image/png')
      ensureStampImage(imageDataUrl)
      // Scrub only this pocket from hole maps — keep other ST/punch sections.
      const scrubPocket = (
        bits: Uint8Array | undefined,
        map: Map<string, Uint8Array>,
        canvases: Map<string, HTMLCanvasElement>
      ) => {
        if (!bits || bits.length !== holeRegion.length) return
        let remain = 0
        const next = new Uint8Array(bits.length)
        for (let p = 0; p < bits.length; p++) {
          if (!bits[p] || holeRegion[p]) continue
          next[p] = 1
          remain++
        }
        canvases.delete(item.id)
        if (remain > 0) map.set(item.id, next)
        else map.delete(item.id)
      }
      scrubPocket(punchMaskBits.get(item.id), punchMaskBits, punchMaskCanvases)
      scrubPocket(seeThroughMaskBits.get(item.id), seeThroughMaskBits, seeThroughMaskCanvases)
      syncHoleFlags(item as HoleItem)
      const { contentBound: _cb, ...rest } = item
      return {
        ...rest,
        type: 'stamp',
        pts: [
          { x: bounds.x, y: bounds.y },
          { x: bounds.x + bounds.w, y: bounds.y + bounds.h }
        ],
        rot: 0,
        scaleX: 1,
        scaleY: 1,
        imageDataUrl,
        stampSource: item.stampSource ?? 'image',
        paintStrokes: undefined,
        sourceSvgMarkup: undefined,
        sourceStampSize: undefined,
        keepStrokeOnResize: undefined,
        contentBound: undefined,
        // Keep link + glyph string so outside TE→BO can drop this bake.
        linkedOutsideText: item.linkedOutsideText,
        text: item.linkedOutsideText ? item.text : undefined,
        // Keep the real fill colour — never force white (stamps may tint / fallback).
        color: fill,
        punchThrough: hasPunchCoverage(item.id),
        punchEnclosedHole:
          hasPunchCoverage(item.id) || hasSeeThroughCoverage(item.id)
            ? true
            : false,
        punchMask: false,
        holeMaskPng: undefined,
        seeThroughHoleMaskPng: undefined,
        holeMaskMode: hasPunchCoverage(item.id)
          ? ('punch' as const)
          : hasSeeThroughCoverage(item.id)
            ? ('see-through' as const)
            : undefined
      }
    } finally {
      releaseCanvas(cropped)
    }
  } finally {
    releaseCanvas(canvas)
  }
}

/** Recolor / set opacity on stamp ink pixels; leave hole (near-zero alpha) pixels alone. */
export function applyStampColorKeepHoles(item: LineObj, nextColor: string): Partial<LineObj> {
  if (item.type !== 'stamp' || !item.imageDataUrl || item.pts.length < 2) {
    return { color: nextColor }
  }
  const a = item.pts[0]
  const b = item.pts[1]
  const w = Math.max(1, Math.round(Math.abs(b.x - a.x)))
  const h = Math.max(1, Math.round(Math.abs(b.y - a.y)))
  const src = ensureStampImage(item.imageDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  if (src) {
    ctx.drawImage(src, 0, 0, w, h)
  } else {
    // Decode pending — fall back to vector-style colour only.
    return { color: nextColor }
  }
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const fill = pixelColor(nextColor)
  const fr = parseInt(fill.slice(1, 3), 16)
  const fg = parseInt(fill.slice(3, 5), 16)
  const fb = parseInt(fill.slice(5, 7), 16)
  const fa = parseInt(fill.slice(7, 9) || 'ff', 16)
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] <= 8) continue
    const srcA = d[i + 3]
    d[i] = fr
    d[i + 1] = fg
    d[i + 2] = fb
    // Preserve edge coverage — full-fa flatten expands the silhouette.
    d[i + 3] = fa >= 250 ? srcA : Math.round((srcA * fa) / 255)
  }
  ctx.putImageData(img, 0, 0)
  const imageDataUrl = canvas.toDataURL('image/png')
  const placed = ensureStampImage(imageDataUrl)
  if (placed) stampStrokeLiveCache.set(item.id, placed)
  const patch: Partial<LineObj> = { imageDataUrl, color: fill }
  // Keep SVG source in sync so keepStrokeOnResize re-rasters use the new colour
  // (otherwise resize / live SVG path snaps back to the placement tint).
  if (item.sourceSvgMarkup) {
    patch.sourceSvgMarkup = applySvgColor(item.sourceSvgMarkup, fill)
  }
  return patch
}

export function destOutObjectPunch(ctx: CanvasRenderingContext2D, l: LineObj): void {
  if (l.punchMask || !objectHasFillHole(l)) return
  // Enclosed counters are flattened + hard-cut while drawing (isolated buffer).
  if (l.punchEnclosedHole) return
  // Always cut see-through pockets from object ink (even when punchThrough cuts below).
  if (hasSeeThroughCoverage(l.id) || seeThroughMaskCanvases.has(l.id)) {
    if (!destOutLocalPunch(ctx, l, 'see-through')) {
      const bits = seeThroughMaskBits.get(l.id)
      if (bits && !punchLocalBox(l)) {
        destOutFilledMask(ctx, bits, ctx.canvas.width, ctx.canvas.height)
      }
    }
  }
  if (l.punchThrough) return
  if (destOutLocalPunch(ctx, l, 'punch')) return
  if (destOutLocalPunch(ctx, l, 'see-through')) return
  // Canvas-fixed bits stay at the punch origin. After a move they leave a ghost
  // of Outer fill between the object and its shadow. Local-box objects skip them.
  if (punchLocalBox(l)) return
  const bits = punchMaskBits.get(l.id) ?? seeThroughMaskBits.get(l.id)
  if (!bits) return
  destOutFilledMask(ctx, bits, ctx.canvas.width, ctx.canvas.height)
}

export function renderLineBodyThenHole(ctx: CanvasRenderingContext2D, l: LineObj, drawBody: (c: CanvasRenderingContext2D) => void): void {
  // Enclosed letter counters: flatten AA on an isolated glyph, hard-cut the hole,
  // then composite. Flattening on the stack fails because AA is already opaque blend.
  if (l.punchEnclosedHole) {
    drawEnclosedHoleObjectFlat(ctx, l, drawBody)
    return
  }
  // `drawBody` paints fill / border / glyph with no drop-shadow.
  const destW = ctx.canvas.width
  const destH = ctx.canvas.height
  const clip = objectRenderBox(l, destW, destH)
  const bw = Math.max(16, Math.ceil(clip.w / 16) * 16)
  const bh = Math.max(16, Math.ceil(clip.h / 16) * 16)
  const paintClipped = (target: CanvasRenderingContext2D) => {
    target.save()
    target.translate(-clip.x, -clip.y)
    drawBody(target)
    target.restore()
  }
  if (shouldDrawObjectShadow(l)) {
    const sil = takeCanvas(bw, bh)
    try {
      paintClipped(sil.getContext('2d')!)
      const hole = objectHasFillHole(l)
      const baked = bakeCanvasDropShadow(sil, {
        blur: l.shadowBlur ?? 0,
        ox: l.shadowOffsetX ?? 0,
        oy: l.shadowOffsetY ?? 0,
        spread: l.shadowSpread ?? 0,
        color: l.shadowColor ?? '#00000080',
        shadowOnly: hole
      })
      ctx.drawImage(baked.canvas, clip.x - baked.inset, clip.y - baked.inset)
      if (!hole) return
    } finally {
      releaseCanvas(sil)
    }
    const body = takeCanvas(bw, bh)
    try {
      const bctx = body.getContext('2d')!
      paintClipped(bctx)
      bctx.save()
      bctx.translate(-clip.x, -clip.y)
      destOutObjectPunch(bctx, l)
      bctx.restore()
      ctx.drawImage(body, clip.x, clip.y)
    } finally {
      releaseCanvas(body)
    }
    return
  }
  drawBody(ctx)
  destOutObjectPunch(ctx, l)
}

export function renderLine(ctx: CanvasRenderingContext2D, l: LineObj, opts?: { skipHole?: boolean }): void {
  // Punch-mask stamps are hole operators, not visible pixels.
  if (l.punchMask) return
  // Punch in unwarped space, then reshape once — otherwise the hole mask stays
  // axis-aligned while the body warps and counters / fill-holes look broken.
  if (lineHasReshapeWarp(l) && lineHasPunchHole(l) && !opts?.skipHole) {
    const W = ctx.canvas.width
    const H = ctx.canvas.height
    const temp = takeCanvas(W, H)
    try {
      const tctx = temp.getContext('2d')!
      const plain: LineObj = {
        ...l,
        reshapeQuad: undefined,
        reshapeSrc: undefined,
        reshapeBaseQuad: undefined
      }
      renderLine(tctx, plain, opts)
      if (!drawReshapedCanvas(ctx, temp, l)) {
        ctx.drawImage(temp, 0, 0)
      }
    } finally {
      releaseCanvas(temp)
    }
    return
  }
  const paintBody = (c: CanvasRenderingContext2D) => {
    const prevShadow = l.shadow
    l.shadow = false
    try {
    if (l.reshapeQuad?.length === 4) {
      renderLineWithReshape(c, l)
      return
    }
    renderLineBase(c, l)
    const supportsObjectPaint = (l.type === 'shape' || l.type === 'stamp') && !!l.paintStrokes?.length && l.pts.length >= 2
    if (!supportsObjectPaint) return
    const a = l.pts[0], b = l.pts[1]
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    const w = Math.max(1, Math.abs(b.x - a.x)), h = Math.max(1, Math.abs(b.y - a.y))
    c.save()
    if (lineNeedsDisplayTransform(l)) {
      const center = objCenter(l)
      c.translate(center.x, center.y)
      c.rotate(l.rot ?? 0)
      c.scale(l.scaleX ?? 1, l.scaleY ?? 1)
      c.translate(-center.x, -center.y)
    }
    for (const stroke of l.paintStrokes!) {
      const points = stroke.pts.map((p) => ({ x: x + p.x * w, y: y + p.y * h }))
      if (!points.length) continue
      const brushSize = Math.max(0.5, stroke.size * Math.min(w, h))
      if (points.length === 1) {
        stampBrushTip(c, stroke.tip, points[0].x, points[0].y, brushSize, stroke.color, stroke.tool === 'eraser')
        continue
      }
      for (let i = 1; i < points.length; i++) {
        strokeBrushTip(
          c, stroke.tip,
          points[i - 1].x, points[i - 1].y,
          points[i].x, points[i].y,
          brushSize, stroke.color, stroke.tool === 'eraser'
        )
      }
    }
    c.restore()
    } finally {
      l.shadow = prevShadow
    }
  }
  if (opts?.skipHole) {
    paintBody(ctx)
    return
  }
  renderLineBodyThenHole(ctx, l, paintBody)
}

export function renderGroup(
  ctx: CanvasRenderingContext2D,
  group: LineObj,
  all: LineObj[],
  visible?: (item: LineObj) => boolean,
  applyGroupPaint = true
): void {
  if (group.pts.length < 2) return
  // Render and erase in an isolated surface. destination-out therefore affects
  // only this group's composite and can never punch through unrelated layers.
  const canvas = takeCanvas(ctx.canvas.width, ctx.canvas.height)
  try {
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
  } finally {
    releaseCanvas(canvas)
  }
}

export function renderObjectTree(
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

/** Opaque silhouette used as a destination-out mask (ignores the object's transparent fill). */
export function renderPunchSilhouette(
  ctx: CanvasRenderingContext2D,
  item: LineObj,
  all: LineObj[],
  visible: (l: LineObj) => boolean
): void {
  if (item.type === 'group') {
    for (const child of all) {
      if (child.parentId !== item.id) continue
      renderPunchSilhouette(ctx, child, all, visible)
    }
    return
  }
  if (!visible(item)) return
  if (!item.punchThrough && !item.punchMask && !hasPunchCoverage(item.id)) return

  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  const stampPunchBits = (bits: Uint8Array) => {
    const img = ctx.getImageData(0, 0, cw, ch)
    const d = img.data
    for (let p = 0; p < bits.length; p++) {
      if (!bits[p]) continue
      const i = p * 4
      d[i] = 0
      d[i + 1] = 0
      d[i + 2] = 0
      d[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }

  // Display-space bits already include rot/scale — stamp them without re-transforming.
  if (punchMaskCanvases.has(item.id)) rewritePunchBitsFromLocal(item, cw, ch)
  const displayBits = punchMaskBits.get(item.id)
  if (displayBits && displayBits.length === cw * ch && displayBits.some((v) => v)) {
    stampPunchBits(displayBits)
    return
  }

  // Free punchMask stamps / fallbacks: paint local silhouette under object transform.
  const drawLocal = () => {
    ctx.fillStyle = '#000000'
    if (item.type === 'shape' && item.shape && item.pts.length >= 2) {
      const sync = punchMaskCanvases.get(item.id)
      if (sync) {
        const a = item.pts[0], b = item.pts[1]
        ctx.drawImage(
          sync,
          Math.min(a.x, b.x),
          Math.min(a.y, b.y),
          Math.max(1, Math.abs(b.x - a.x)),
          Math.max(1, Math.abs(b.y - a.y))
        )
        return
      }
      const a = item.pts[0], b = item.pts[1]
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
      const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y)
      ctx.beginPath()
      traceShape(ctx, item.shape, x, y, w, h, shapeSupportsRadius(item.shape) ? lineBorderRadius(item) : 0)
      ctx.fill()
      return
    }
    if (item.type === 'poly') {
      const sync = punchMaskCanvases.get(item.id)
      const box = punchLocalBox(item)
      if (sync && box) {
        ctx.drawImage(sync, box.x, box.y, box.w, box.h)
        return
      }
      const poly = flattenLine(item)
      const verts = poly.length > 1 && dist(poly[0], poly[poly.length - 1]) < 1e-6
        ? poly.slice(0, -1)
        : poly
      ctx.beginPath()
      pathRoundedPolygon(ctx, verts, lineBorderRadius(item))
      ctx.fill()
      return
    }
    if (item.type === 'stamp' && item.pts.length >= 2) {
      const a = item.pts[0], b = item.pts[1]
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
      const w = Math.max(1, Math.abs(b.x - a.x)), h = Math.max(1, Math.abs(b.y - a.y))
      const sync = punchMaskCanvases.get(item.id)
      if (sync) {
        ctx.drawImage(sync, x, y, w, h)
        return
      }
      if (item.punchMask && item.imageDataUrl) {
        const img = stampImgCache.get(item.imageDataUrl)
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, x, y, w, h)
        }
      }
    }
  }

  if (lineNeedsDisplayTransform(item)) {
    const c = objCenter(item)
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(item.rot ?? 0)
    ctx.scale(item.scaleX ?? 1, item.scaleY ?? 1)
    ctx.translate(-c.x, -c.y)
    drawLocal()
    ctx.restore()
    return
  }
  drawLocal()
}

export function punchObjectFromComposite(
  ctx: CanvasRenderingContext2D,
  item: LineObj,
  all: LineObj[],
  visible: (l: LineObj) => boolean
): void {
  if (item.type !== 'group' && (!item.punchThrough || !visible(item))) return
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  if (destOutPunchThroughOnComposite(ctx, item)) return
  // Local-box objects normally punch via punchMaskCanvases. If that mask is
  // missing (e.g. select-object → transparent + Punch without a prior Fill),
  // fall through to silhouette rendering instead of silently doing nothing.
  if (!item.punchMask && punchLocalBox(item) && punchMaskCanvases.has(item.id)) return
  const bits = punchMaskBits.get(item.id)
  if (bits && bits.length === w * h) {
    destOutFilledMask(ctx, bits, w, h)
    return
  }
  const tmp = takeCanvas(w, h)
  try {
    const tctx = tmp.getContext('2d')!
    renderPunchSilhouette(tctx, item, all, visible)
    const mask = tctx.getImageData(0, 0, w, h).data
    let any = false
    for (let i = 3; i < mask.length; i += 16) {
      if (mask[i] > 8) { any = true; break }
    }
    if (!any && item.pts.length >= 2 && item.type !== 'stamp' && item.type !== 'text') {
      const xs = item.pts.map((p) => p.x)
      const ys = item.pts.map((p) => p.y)
      const x0 = Math.max(0, Math.floor(Math.min(...xs)))
      const y0 = Math.max(0, Math.floor(Math.min(...ys)))
      const x1 = Math.min(w, Math.ceil(Math.max(...xs)))
      const y1 = Math.min(h, Math.ceil(Math.max(...ys)))
      tctx.fillStyle = '#000000'
      tctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0))
    }
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tmp, 0, 0)
    ctx.restore()
  } finally {
    releaseCanvas(tmp)
  }
}

export function renderLineBody(ctx: CanvasRenderingContext2D, l: LineObj): void {
  if (l.type === 'text') { renderText(ctx, l); return }
  // Library / SVG stamp: draw the raster into the bounding box.
  if (l.type === 'stamp' && l.imageDataUrl && l.pts.length >= 2) {
    const a = l.pts[0], b = l.pts[1]
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    const w = Math.max(1, Math.abs(b.x - a.x)), h = Math.max(1, Math.abs(b.y - a.y))
    const softSvg = !!(l.sourceSvgMarkup && l.keepStrokeOnResize)
    let img: HTMLImageElement | null = null
    if (softSvg && stampStrokeRelockPaused.has(l.id)) {
      // Mid-resize: scale the last stable raster — never flip to a half-decoded SVG.
      img = stampStrokeLiveCache.get(l.id) ?? ensureStampImage(l.imageDataUrl)
    } else {
      const renderUrl = stampRenderDataUrl(l, w, h)
      // A stroke-locked SVG is decoded asynchronously at each new size. Prefer the
      // last good locked raster over the placement PNG so strokes do not jump.
      const fresh = renderUrl ? ensureStampImage(renderUrl) : null
      if (fresh) stampStrokeLiveCache.set(l.id, fresh)
      img = fresh ?? stampStrokeLiveCache.get(l.id) ?? ensureStampImage(l.imageDataUrl)
    }
    if (img) {
      ctx.save()
      // Paint-edited rasters must stay crisp — smoothing + later Fill hardens AA
      // outward and blurs sections that were not clicked.
      ctx.imageSmoothingEnabled = softSvg
      if (softSvg) ctx.imageSmoothingQuality = 'high'
      if (shouldDrawObjectShadow(l)) {
        const blur = l.shadowBlur ?? 0
        const ox = l.shadowOffsetX ?? 0
        const oy = l.shadowOffsetY ?? 0
        const sColor = firstSolidColor(l.shadowColor ?? '#00000080')
        if (!isTransparentPaintColor(sColor)) {
          ctx.filter = `drop-shadow(${ox}px ${oy}px ${blur}px ${sColor})`
        }
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
  drawCap(ctx, poly[0], endDir(poly, true, minLen), l.startCap, borderPaint, t, l.startCapSize)
  drawCap(ctx, poly[n - 1], endDir(poly, false, minLen), l.endCap, borderPaint, t, l.endCapSize)
}

export function pointToSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, a)
  let tt = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  tt = Math.max(0, Math.min(1, tt))
  return dist(p, { x: a.x + tt * dx, y: a.y + tt * dy })
}
export function lineHitDist(l: LineObj, p: Pt): number {
  const poly = flattenLine(l)
  let min = Infinity
  for (let i = 0; i < poly.length - 1; i++) min = Math.min(min, pointToSegDist(p, poly[i], poly[i + 1]))
  return min
}
export function cloneLines(arr: LineObj[]): LineObj[] {
  return arr.map((l) => ({
    ...l,
    pts: l.pts.map((p) => ({ ...p })),
    transformOrigin: l.transformOrigin ? { ...l.transformOrigin } : l.transformOrigin,
    reshapeQuad: l.reshapeQuad?.map((p) => ({ ...p })),
    reshapeBaseQuad: l.reshapeBaseQuad?.map((p) => ({ ...p })),
    reshapeSrc: l.reshapeSrc ? { ...l.reshapeSrc } : l.reshapeSrc,
    paintStrokes: l.paintStrokes?.map((stroke) => ({
      ...stroke,
      pts: stroke.pts.map((p) => ({ ...p }))
    }))
  }))
}

// ── Canvas / vector transforms (square canvas) ───────────────────────────────
export type CanvasXform = 'cw90' | 'ccw90' | '180' | 'flipH' | 'flipV'

export function mapCanvasPt(p: Pt, mode: CanvasXform, S: number): Pt {
  switch (mode) {
    case 'cw90':  return { x: S - p.y, y: p.x }
    case 'ccw90': return { x: p.y, y: S - p.x }
    case '180':   return { x: S - p.x, y: S - p.y }
    case 'flipH': return { x: S - p.x, y: p.y }
    case 'flipV': return { x: p.x, y: S - p.y }
  }
}

/** Rotate / flip a point around an arbitrary pivot (selection-local transform). */
export function mapLocalPt(p: Pt, mode: CanvasXform, pivot: Pt): Pt {
  const dx = p.x - pivot.x
  const dy = p.y - pivot.y
  let nx = dx
  let ny = dy
  switch (mode) {
    case 'cw90': nx = dy; ny = -dx; break
    case 'ccw90': nx = -dy; ny = dx; break
    case '180': nx = -dx; ny = -dy; break
    case 'flipH': nx = -dx; ny = dy; break
    case 'flipV': nx = dx; ny = -dy; break
  }
  return { x: pivot.x + nx, y: pivot.y + ny }
}

export type XformOpts = { canvasSpace?: boolean; pivot?: Pt; /** Multi-object or full-canvas transform — mirror around shared pivot, not each item's center. */ groupTransform?: boolean }

export function composeCanvasRot(rot: number, mode: CanvasXform): number {
  if (mode === 'cw90') return rot + Math.PI / 2
  if (mode === 'ccw90') return rot - Math.PI / 2
  if (mode === '180') return rot + Math.PI
  return rot
}

export function normalizeRot(rot: number): number {
  const twoPi = Math.PI * 2
  let r = rot % twoPi
  if (r <= -Math.PI) r += twoPi
  if (r > Math.PI) r -= twoPi
  return r
}

export function lineNeedsDisplayTransform(l: LineObj): boolean {
  return (l.rot ?? 0) !== 0 || (l.scaleX ?? 1) !== 1 || (l.scaleY ?? 1) !== 1
}

export function marqueePointBasedLine(source: LineObj): boolean {
  return (
    source.type === 'polyline' ||
    source.type === 'poly' ||
    source.type === 'straight' ||
    source.type === 'curved' ||
    source.type === 'free' ||
    source.type === 'drawn'
  )
}

export function mapMarqueePoint(p: Pt, sc: Pt, dp: Pt, sx: number, sy: number, rot: number): Pt {
  const local = { x: (p.x - sc.x) * sx, y: (p.y - sc.y) * sy }
  const rotated = rot ? rotatePt(local, { x: 0, y: 0 }, rot) : local
  return { x: dp.x + rotated.x, y: dp.y + rotated.y }
}

export function floatDestPivot(
  f: { x: number; y: number; canvas: HTMLCanvasElement; originX?: number; originY?: number },
  sourceRect: { x: number; y: number; w: number; h: number }
): Pt {
  const sc = rectCenter(sourceRect.x, sourceRect.y, sourceRect.w, sourceRect.h)
  if (f.originX != null && f.originY != null) {
    return { x: sc.x + (f.x - f.originX), y: sc.y + (f.y - f.originY) }
  }
  return rectCenter(f.x, f.y, f.canvas.width, f.canvas.height)
}

/** Apply marquee scale/rotate/move to one vector object (from its lift snapshot). */
export function applyMarqueeTransformToLine(
  source: LineObj,
  sc: Pt,
  dp: Pt,
  sx: number,
  sy: number,
  rot: number
): LineObj {
  const strokeScale = Math.min(Math.abs(sx), Math.abs(sy))
  const scalePt = (p: Pt): Pt => ({
    x: sc.x + (p.x - sc.x) * sx,
    y: sc.y + (p.y - sc.y) * sy
  })
  const mapPt = (p: Pt) => mapMarqueePoint(p, sc, dp, sx, sy, rot)

  const line: LineObj = {
    ...source,
    pts: source.pts.map((p) => ({ ...p })),
    reshapeQuad: source.reshapeQuad?.map((p) => ({ ...p })),
    reshapeBaseQuad: source.reshapeBaseQuad?.map((p) => ({ ...p })),
    paintStrokes: source.paintStrokes?.map((stroke) => ({
      ...stroke,
      pts: stroke.pts.map((p) => ({ ...p }))
    }))
  }

  if (source.reshapeQuad?.length === 4) {
    line.reshapeQuad = source.reshapeQuad.map(mapPt)
    if (source.reshapeBaseQuad?.length === 4) {
      line.reshapeBaseQuad = source.reshapeBaseQuad.map(mapPt)
    }
    line.pts = source.pts.map(mapPt)
    line.rot = source.rot ?? 0
  } else if (marqueePointBasedLine(source)) {
    line.pts = source.pts.map(mapPt)
  } else {
    const scaledPts = source.pts.map(scalePt)
    const pivot = rotationCenter({ ...source, pts: scaledPts })
    const nextPivot = rot ? rotatePt(pivot, dp, rot) : pivot
    const dx = nextPivot.x - pivot.x
    const dy = nextPivot.y - pivot.y
    line.pts = scaledPts.map((p) => ({ x: p.x + dx, y: p.y + dy }))
    line.rot = rot ? (source.rot ?? 0) + rot : (source.rot ?? 0)
  }

  if (source.type === 'text') {
    line.fontSize = Math.max(1, (source.fontSize ?? 48) * strokeScale)
  }
  if (source.keepStrokeOnResize === false) {
    line.thickness = Math.max(0.1, source.thickness * strokeScale)
    if (source.borderWidth != null) {
      line.borderWidth = Math.max(0, source.borderWidth * strokeScale)
    }
  }

  return line
}

export function textInkCenter(l: LineObj): Pt {
  const b = textInkBBox(l)
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

/** Move text so its ink center lands at a target point in display (canvas) space. */
export function moveTextDisplayInkTo(l: LineObj, targetDisplay: Pt): LineObj {
  const anchor = l.pts[0] ?? { x: 0, y: 0 }
  const ink = textInkCenter(l)
  // Ink is the scale/rotate pivot, so its display position always equals local ink coords.
  // Never use unmap here — negative scale makes unmap diverge on repeated flips.
  return {
    ...l,
    pts: [{
      x: anchor.x + (targetDisplay.x - ink.x),
      y: anchor.y + (targetDisplay.y - ink.y)
    }]
  }
}

export function transformTextLine(l: LineObj, mode: CanvasXform, S: number, opts: XformOpts): LineObj {
  const canvasSpace = opts.canvasSpace ?? false
  const groupTransform = opts.groupTransform ?? false
  const pivot = opts.pivot ?? objCenter(l)
  const rot = l.rot ?? 0
  const ink = textInkCenter(l)
  const displayInk = mapObjDisplayPt(ink, l)
  const pivotDisplay: Pt = canvasSpace
    ? { x: S / 2, y: S / 2 }
    : groupTransform
      ? pivot
      : mapObjDisplayPt(pivot, l)
  const inPlace = !canvasSpace && !groupTransform &&
    Math.hypot(displayInk.x - pivotDisplay.x, displayInk.y - pivotDisplay.y) < 0.5

  const mapDisplayPt = (p: Pt): Pt =>
    canvasSpace ? mapCanvasPt(p, mode, S) : mapLocalPt(p, mode, pivotDisplay)

  /** World flip: F∘R(θ)∘S = R(-θ)∘F∘S — negate rot and flip the matching scale. */
  const reflectOrientation = (base: LineObj): LineObj => {
    const curSx = base.scaleX ?? 1
    const curSy = base.scaleY ?? 1
    const nextRot = normalizeRot(-(base.rot ?? 0))
    if (mode === 'flipH') {
      return { ...base, rot: nextRot, scaleX: -curSx, scaleY: curSy }
    }
    return { ...base, rot: nextRot, scaleX: curSx, scaleY: -curSy }
  }

  if (mode === 'flipH' || mode === 'flipV') {
    const targetDisplay = mapDisplayPt(displayInk)
    if (inPlace) return { ...reflectOrientation(l), ...mapReshapeFields(l, mapDisplayPt) }
    // Mirror glyphs first (around ink center), then move ink to the flipped position.
    return {
      ...moveTextDisplayInkTo(reflectOrientation(l), targetDisplay),
      ...mapReshapeFields(l, mapDisplayPt)
    }
  }

  const newRot = normalizeRot(composeCanvasRot(rot, mode))
  const targetDisplay = mapDisplayPt(displayInk)
  if (inPlace) {
    return { ...l, rot: newRot, ...mapReshapeFields(l, mapDisplayPt) }
  }
  // Apply rotation first, then reposition so display ink lands on the rotated target.
  return {
    ...moveTextDisplayInkTo({ ...l, rot: newRot }, targetDisplay),
    ...mapReshapeFields(l, mapDisplayPt)
  }
}

/** Orthogonal remap — no drawImage resampling (that clips AA and shrinks ink). */
export function transformCanvasPixels(src: HTMLCanvasElement, mode: CanvasXform): void {
  const w = src.width
  const h = src.height
  if (w < 1 || h < 1) return
  const ctx = src.getContext('2d')
  if (!ctx) return
  const srcData = ctx.getImageData(0, 0, w, h)
  const s = srcData.data
  const out = ctx.createImageData(w, h)
  const d = out.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx = x
      let ny = y
      switch (mode) {
        case 'cw90': nx = w - 1 - y; ny = x; break
        case 'ccw90': nx = y; ny = h - 1 - x; break
        case '180': nx = w - 1 - x; ny = h - 1 - y; break
        case 'flipH': nx = w - 1 - x; ny = y; break
        case 'flipV': nx = x; ny = h - 1 - y; break
      }
      const si = (y * w + x) * 4
      const di = (ny * w + nx) * 4
      d[di] = s[si]
      d[di + 1] = s[si + 1]
      d[di + 2] = s[si + 2]
      d[di + 3] = s[si + 3]
    }
  }
  ctx.putImageData(out, 0, 0)
}

export function moveBoxCenterTo(l: LineObj, target: Pt): LineObj {
  const c = objCenter(l)
  const dx = target.x - c.x
  const dy = target.y - c.y
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return l
  return {
    ...l,
    pts: l.pts.map((p) => ({ x: p.x + dx, y: p.y + dy }))
  }
}

/**
 * Keep stamp / Inner-proxy box size and accumulate rot/scale.
 * Baking a 90° turn into a new AABB + raster used to clip non-square ink
 * and shrink anti-aliased edges on every click.
 */
export function transformOrientedBox(l: LineObj, mode: CanvasXform, S: number, opts: XformOpts): LineObj {
  const canvasSpace = opts.canvasSpace ?? false
  const groupTransform = opts.groupTransform ?? false
  const rot = l.rot ?? 0
  const center = objCenter(l)
  const displayCenter = mapObjDisplayPt(center, l)
  const pivot = opts.pivot ?? center
  const pivotDisplay: Pt = canvasSpace
    ? { x: S / 2, y: S / 2 }
    : groupTransform
      ? pivot
      : displayCenter
  const inPlace = !canvasSpace && !groupTransform &&
    Math.hypot(displayCenter.x - pivotDisplay.x, displayCenter.y - pivotDisplay.y) < 0.5
  const mapDisplayPt = (p: Pt): Pt =>
    canvasSpace ? mapCanvasPt(p, mode, S) : mapLocalPt(p, mode, pivotDisplay)
  const target = mapDisplayPt(displayCenter)
  const reflect = (base: LineObj): LineObj => {
    const sx = base.scaleX ?? 1
    const sy = base.scaleY ?? 1
    const nextRot = normalizeRot(-(base.rot ?? 0))
    if (mode === 'flipH') return { ...base, rot: nextRot, scaleX: -sx, scaleY: sy }
    return { ...base, rot: nextRot, scaleX: sx, scaleY: -sy }
  }
  let next = l
  if (mode === 'flipH' || mode === 'flipV') next = reflect(l)
  else next = { ...l, rot: normalizeRot(composeCanvasRot(rot, mode)) }
  next = { ...next, ...mapReshapeFields(l, mapDisplayPt) }
  if (inPlace) return next
  return moveBoxCenterTo(next, target)
}

export function transformLineObj(l: LineObj, mode: CanvasXform, S: number, opts?: XformOpts): LineObj {
  const canvasSpace = opts?.canvasSpace ?? false
  const c = objCenter(l)
  const rot = l.rot ?? 0
  const pivot = opts?.pivot ?? c

  if (l.type === 'text') {
    return transformTextLine(l, mode, S, opts ?? { canvasSpace, pivot })
  }

  const mapPt = (p: Pt) =>
    canvasSpace
      ? mapCanvasPt(rotatePt(p, c, rot), mode, S)
      : mapLocalPt(rotatePt(p, c, rot), mode, pivot)
  // Reshape quads/src are already in canvas space — do not pre-rotate them again.
  const mapReshapePt = (p: Pt) =>
    canvasSpace ? mapCanvasPt(p, mode, S) : mapLocalPt(p, mode, pivot)

  if ((l.type === 'shape' || l.type === 'stamp') && l.pts.length === 2) {
    const x0 = Math.min(l.pts[0].x, l.pts[1].x)
    const y0 = Math.min(l.pts[0].y, l.pts[1].y)
    const x1 = Math.max(l.pts[0].x, l.pts[1].x)
    const y1 = Math.max(l.pts[0].y, l.pts[1].y)
    const corners = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 }
    ].map((p) => mapPt(p))
    const xs = corners.map((p) => p.x)
    const ys = corners.map((p) => p.y)
    return {
      ...l,
      pts: [
        { x: Math.min(...xs), y: Math.min(...ys) },
        { x: Math.max(...xs), y: Math.max(...ys) }
      ],
      rot: 0,
      ...mapReshapeFields(l, mapReshapePt)
    }
  }
  const pts = l.pts.map((p) => mapPt(p))
  return { ...l, pts, rot: 0, ...mapReshapeFields(l, mapReshapePt) }
}

/** Rotate / flip stamps and oriented boxes without baking a wrong AABB. */
export function transformStampLineObj(l: LineObj, mode: CanvasXform, S: number, opts?: XformOpts): LineObj {
  // Rotated/scaled 2-pt shapes must keep rot+scale — AABB bake only works at 90° steps.
  // Reshaped objects also need the oriented path so warp src/quad stay paired with rot.
  if (
    l.type === 'stamp' ||
    l.reshapeQuad?.length === 4 ||
    (l.type === 'shape' && l.pts.length === 2 && (l.contentBound || lineNeedsDisplayTransform(l)))
  ) {
    return transformOrientedBox(l, mode, S, opts ?? { canvasSpace: false })
  }
  return transformLineObj(l, mode, S, opts)
}

export function collectTransformSubtree(rootId: string, all: LineObj[]): Set<string> {
  const ids = new Set<string>()
  const walk = (id: string) => {
    ids.add(id)
    for (const child of all) {
      if (child.parentId === id) walk(child.id)
    }
  }
  walk(rootId)
  return ids
}

// ── Preset shape geometry ─────────────────────────────────────────────────────
export function regularPolyPts(a: Pt, b: Pt, n: number): Pt[] {
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
export function lockAspectEnd(origin: Pt, end: Pt): Pt {
  const dx = end.x - origin.x
  const dy = end.y - origin.y
  const s = Math.max(Math.abs(dx), Math.abs(dy), 1)
  return {
    x: origin.x + (dx < 0 ? -s : s),
    y: origin.y + (dy < 0 ? -s : s)
  }
}

/**
 * Snap a 2-point straight-line end to horizontal or vertical when near those axes.
 * `forceOrtho` (Shift) locks to the nearest axis.
 */
export function snapStraightLineEnd(
  origin: Pt,
  end: Pt,
  thresholdPx: number,
  forceOrtho: boolean
): { pt: Pt; axis: 'h' | 'v' | null } {
  const dx = end.x - origin.x
  const dy = end.y - origin.y
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < 0.5 && ay < 0.5) return { pt: end, axis: null }

  if (forceOrtho) {
    if (ax >= ay) return { pt: { x: end.x, y: origin.y }, axis: 'h' }
    return { pt: { x: origin.x, y: end.y }, axis: 'v' }
  }

  const nearH = ay <= thresholdPx
  const nearV = ax <= thresholdPx
  if (nearH && (!nearV || ay <= ax)) {
    return { pt: { x: end.x, y: origin.y }, axis: 'h' }
  }
  if (nearV) {
    return { pt: { x: origin.x, y: end.y }, axis: 'v' }
  }

  // Longer strokes: snap by angle (~7.5° of H or V).
  const degFromH = (Math.atan2(ay, ax) * 180) / Math.PI
  const degFromV = 90 - degFromH
  const angleThresh = 7.5
  if (degFromH <= angleThresh && degFromH <= degFromV) {
    return { pt: { x: end.x, y: origin.y }, axis: 'h' }
  }
  if (degFromV <= angleThresh) {
    return { pt: { x: origin.x, y: end.y }, axis: 'v' }
  }
  return { pt: end, axis: null }
}

export function lockAspectRatioEnd(origin: Pt, end: Pt, ratio: number): Pt {
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
export function starPts(a: Pt, b: Pt, spikes: number, innerRatio = 0.45): Pt[] {
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
export function pointInRect(a: Pt, b: Pt, p: Pt): boolean {
  return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
}

/** Word-style picture crop: 0=nw 1=n 2=ne 3=e 4=se 5=s 6=sw 7=w */
export interface CropSession {
  id: string
  imgX: number
  imgY: number
  imgW: number
  imgH: number
  x: number
  y: number
  w: number
  h: number
  startPts: [Pt, Pt]
}
export const MIN_CROP = 8
export const CROP_HIT = 14
export const CROP_CURSORS = [
  'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize',
  'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'
] as const

export function stampLocalRect(l: LineObj): { x: number; y: number; w: number; h: number } {
  const x = Math.min(l.pts[0].x, l.pts[1].x)
  const y = Math.min(l.pts[0].y, l.pts[1].y)
  return {
    x,
    y,
    w: Math.max(1, Math.abs(l.pts[1].x - l.pts[0].x)),
    h: Math.max(1, Math.abs(l.pts[1].y - l.pts[0].y))
  }
}

export function cropHandleLocals(cs: CropSession): Pt[] {
  const { x, y, w, h } = cs
  return [
    { x, y },
    { x: x + w / 2, y },
    { x: x + w, y },
    { x: x + w, y: y + h / 2 },
    { x: x + w, y: y + h },
    { x: x + w / 2, y: y + h },
    { x, y: y + h },
    { x, y: y + h / 2 }
  ]
}

export function mapRectQuad(l: LineObj, x: number, y: number, w: number, h: number): Pt[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ].map((p) => mapObjDisplayPt(p, l))
}

export function cropCursorForHandle(idx: number, rot: number): string {
  const steps = (((idx + Math.round((rot * 4) / Math.PI)) % 8) + 8) % 8
  return CROP_CURSORS[steps]
}

export function pointInLocalRect(
  x: number, y: number, w: number, h: number, p: Pt
): boolean {
  return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h
}

export function clampCropPan(cs: CropSession): void {
  cs.imgX = Math.min(cs.x, Math.max(cs.x + cs.w - cs.imgW, cs.imgX))
  cs.imgY = Math.min(cs.y, Math.max(cs.y + cs.h - cs.imgH, cs.imgY))
}

export function applyCropHandleMove(
  cs: CropSession,
  idx: number,
  local: Pt,
  start: { x: number; y: number; w: number; h: number },
  lockAspect: boolean
): void {
  const imgL = cs.imgX
  const imgT = cs.imgY
  const imgR = cs.imgX + cs.imgW
  const imgB = cs.imgY + cs.imgH
  let left = start.x
  let top = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h
  const moveL = idx === 0 || idx === 6 || idx === 7
  const moveR = idx === 2 || idx === 3 || idx === 4
  const moveT = idx === 0 || idx === 1 || idx === 2
  const moveB = idx === 4 || idx === 5 || idx === 6
  if (moveL) left = local.x
  if (moveR) right = local.x
  if (moveT) top = local.y
  if (moveB) bottom = local.y
  if (lockAspect && start.h > 0) {
    const ratio = start.w / Math.max(1, start.h)
    if ((moveL || moveR) && (moveT || moveB)) {
      const origin = { x: moveL ? right : left, y: moveT ? bottom : top }
      const end = lockAspectRatioEnd(origin, { x: moveL ? left : right, y: moveT ? top : bottom }, ratio)
      if (moveL) left = end.x
      else right = end.x
      if (moveT) top = end.y
      else bottom = end.y
    } else if (moveL || moveR) {
      const w = Math.max(MIN_CROP, Math.abs(right - left))
      const h = w / ratio
      const cy = start.y + start.h / 2
      top = cy - h / 2
      bottom = cy + h / 2
    } else if (moveT || moveB) {
      const h = Math.max(MIN_CROP, Math.abs(bottom - top))
      const w = h * ratio
      const cx = start.x + start.w / 2
      left = cx - w / 2
      right = cx + w / 2
    }
  }
  if (right < left) {
    const t = left
    left = right
    right = t
  }
  if (bottom < top) {
    const t = top
    top = bottom
    bottom = t
  }
  left = Math.max(imgL, left)
  top = Math.max(imgT, top)
  right = Math.min(imgR, right)
  bottom = Math.min(imgB, bottom)
  if (right - left < MIN_CROP) {
    if (moveR && !moveL) left = Math.max(imgL, right - MIN_CROP)
    else right = Math.min(imgR, left + MIN_CROP)
  }
  if (bottom - top < MIN_CROP) {
    if (moveB && !moveT) top = Math.max(imgT, bottom - MIN_CROP)
    else bottom = Math.min(imgB, top + MIN_CROP)
  }
  cs.x = left
  cs.y = top
  cs.w = Math.max(1, right - left)
  cs.h = Math.max(1, bottom - top)
}

export function drawCropBar(
  ctx: CanvasRenderingContext2D,
  center: Pt,
  angle: number,
  length: number,
  thickness: number
): void {
  ctx.save()
  ctx.translate(center.x, center.y)
  ctx.rotate(angle)
  const hw = length / 2
  const hh = thickness / 2
  ctx.fillStyle = '#1a1a1a'
  ctx.strokeStyle = '#f5f5f5'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.rect(-hw, -hh, length, thickness)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

export function drawCropBarFrom(
  ctx: CanvasRenderingContext2D,
  origin: Pt,
  angle: number,
  length: number,
  thickness: number
): void {
  const mid = {
    x: origin.x + Math.cos(angle) * (length / 2),
    y: origin.y + Math.sin(angle) * (length / 2)
  }
  drawCropBar(ctx, mid, angle, length, thickness)
}

export function drawCropOverlay(ctx: CanvasRenderingContext2D, l: LineObj, cs: CropSession): void {
  const imgQ = mapRectQuad(l, cs.imgX, cs.imgY, cs.imgW, cs.imgH)
  const cropQ = mapRectQuad(l, cs.x, cs.y, cs.w, cs.h)
  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.beginPath()
  ctx.moveTo(imgQ[0].x, imgQ[0].y)
  for (let i = 1; i < 4; i++) ctx.lineTo(imgQ[i].x, imgQ[i].y)
  ctx.closePath()
  ctx.moveTo(cropQ[0].x, cropQ[0].y)
  for (let i = 1; i < 4; i++) ctx.lineTo(cropQ[i].x, cropQ[i].y)
  ctx.closePath()
  ctx.fill('evenodd')
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.75
  ctx.beginPath()
  ctx.moveTo(cropQ[0].x, cropQ[0].y)
  for (let i = 1; i < 4; i++) ctx.lineTo(cropQ[i].x, cropQ[i].y)
  ctx.closePath()
  ctx.stroke()
  ctx.strokeStyle = '#111111'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()

  const edgeLen = 22
  const cornerLen = 18
  const thick = 6
  drawCropBar(ctx, {
    x: (cropQ[0].x + cropQ[1].x) / 2,
    y: (cropQ[0].y + cropQ[1].y) / 2
  }, Math.atan2(cropQ[1].y - cropQ[0].y, cropQ[1].x - cropQ[0].x), edgeLen, thick)
  drawCropBar(ctx, {
    x: (cropQ[1].x + cropQ[2].x) / 2,
    y: (cropQ[1].y + cropQ[2].y) / 2
  }, Math.atan2(cropQ[2].y - cropQ[1].y, cropQ[2].x - cropQ[1].x), edgeLen, thick)
  drawCropBar(ctx, {
    x: (cropQ[2].x + cropQ[3].x) / 2,
    y: (cropQ[2].y + cropQ[3].y) / 2
  }, Math.atan2(cropQ[3].y - cropQ[2].y, cropQ[3].x - cropQ[2].x), edgeLen, thick)
  drawCropBar(ctx, {
    x: (cropQ[3].x + cropQ[0].x) / 2,
    y: (cropQ[3].y + cropQ[0].y) / 2
  }, Math.atan2(cropQ[0].y - cropQ[3].y, cropQ[0].x - cropQ[3].x), edgeLen, thick)
  drawCropBarFrom(ctx, cropQ[0], Math.atan2(cropQ[1].y - cropQ[0].y, cropQ[1].x - cropQ[0].x), cornerLen, thick)
  drawCropBarFrom(ctx, cropQ[0], Math.atan2(cropQ[3].y - cropQ[0].y, cropQ[3].x - cropQ[0].x), cornerLen, thick)
  drawCropBarFrom(ctx, cropQ[1], Math.atan2(cropQ[0].y - cropQ[1].y, cropQ[0].x - cropQ[1].x), cornerLen, thick)
  drawCropBarFrom(ctx, cropQ[1], Math.atan2(cropQ[2].y - cropQ[1].y, cropQ[2].x - cropQ[1].x), cornerLen, thick)
  drawCropBarFrom(ctx, cropQ[2], Math.atan2(cropQ[1].y - cropQ[2].y, cropQ[1].x - cropQ[2].x), cornerLen, thick)
  drawCropBarFrom(ctx, cropQ[2], Math.atan2(cropQ[3].y - cropQ[2].y, cropQ[3].x - cropQ[2].x), cornerLen, thick)
  drawCropBarFrom(ctx, cropQ[3], Math.atan2(cropQ[2].y - cropQ[3].y, cropQ[2].x - cropQ[3].x), cornerLen, thick)
  drawCropBarFrom(ctx, cropQ[3], Math.atan2(cropQ[0].y - cropQ[3].y, cropQ[0].x - cropQ[3].x), cornerLen, thick)
}

export function cropHandleAt(l: LineObj, cs: CropSession, pt: Pt): number {
  const pts = cropHandleLocals(cs).map((p) => mapObjDisplayPt(p, l))
  let best = -1
  let bestD = CROP_HIT
  for (let i = 0; i < pts.length; i++) {
    const d = dist(pts[i], pt)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
export function pointInPoly(poly: Pt[], p: Pt): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y
    if (((yi > p.y) !== (yj > p.y)) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// Trace a preset shape into the current path within bbox [x,y,w,h].
// `cornerRadius` rounds corners on polygon-like shapes (ignored for smooth curves).
export function traceShape(ctx: CanvasRenderingContext2D, kind: ShapeKind, x: number, y: number, w: number, h: number, cornerRadius = 0): void {
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

export interface OuterFillSnap {
  target: 'fill' | 'border' | 'shadow' | null
  color: string | null
  colors: { fill?: string; border?: string; shadow?: string }
  fillAll: boolean
  preserveOverlay: boolean
}

export interface Snap {
  /** Paint overlay pixels (editable brush/eraser layer). */
  container: ImageData
  content: ImageData
  /** Live baked base pixels (read-only until Remove BG / canvas xform). */
  baseContainer: ImageData
  baseContent: ImageData
  lines: LineObj[]
  layerOrder: PaintLayerId[]
  /** Punch-hole bitmasks keyed by object id (not stored on LineObj). */
  punchBits: Record<string, Uint8Array>
  /** Outer Fill → live colour sync (must undo with the fill pixels). */
  outerFill: OuterFillSnap
}

export interface HistoryEntry {
  before: Snap
  after: Snap
  tags: string[]
  applied: boolean
}

export const normalizeLayerOrder = (order?: PaintLayerId[]): PaintLayerId[] =>
  order?.length === 2 && order.includes('container') && order.includes('content')
    ? [...order]
    : ['content', 'container']

export const CHECKER =
  'repeating-conic-gradient(#3a3a4a 0% 25%, #2a2a36 0% 50%) 0 0 / 20px 20px'
export const PAINT_LAYER_MIME = 'application/x-ig-paint-layer'

// Inline -webkit-app-region (Vite strips the prefix from stylesheets).
// Overlay sits below the h-10 TitleBar so the window stays draggable; the rest
// of the modal is no-drag so canvas/tools receive clicks. Paint header empty
// space is also a drag region; Cancel/Save stay no-drag.
export const DRAG    = { WebkitAppRegion: 'drag'    } as React.CSSProperties
export const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

// Distance (px) the rotate pin sits above an object's top edge.
export const ROTATE_PIN_LEN = 30
export const ROTATE_PIN_HIT_HEAD = 20
export const ROTATE_PIN_HIT_STEM = 14
export const ROTATE_PIN_HIT_PAD = 10

export function rotatePinAnchor(l: LineObj): Pt {
  const quad = l.reshapeQuad
  if (quad?.length === 4) {
    return { x: (quad[0].x + quad[1].x) / 2, y: (quad[0].y + quad[1].y) / 2 }
  }
  return mapObjDisplayPt(objTopCenter(l), l)
}

export function rotatePinTip(l: LineObj): Pt {
  const quad = l.reshapeQuad
  if (quad?.length === 4) {
    const anchor = rotatePinAnchor(l)
    const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4
    const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4
    const dx = anchor.x - cx
    const dy = anchor.y - cy
    const len = Math.hypot(dx, dy) || 1
    return { x: anchor.x + (dx / len) * ROTATE_PIN_LEN, y: anchor.y + (dy / len) * ROTATE_PIN_LEN }
  }
  return mapObjDisplayPt({ ...objTopCenter(l), y: objTopCenter(l).y - ROTATE_PIN_LEN }, l)
}

/** Hit-test the rotate pin head and stem (generous targets so empty-canvas deselect doesn't steal the click). */
export function rotatePinHit(l: LineObj, pt: Pt): boolean {
  const anchor = rotatePinAnchor(l)
  const tip = rotatePinTip(l)
  if (dist(pt, tip) <= ROTATE_PIN_HIT_HEAD) return true
  if (distPtToSegment(pt, anchor, tip) <= ROTATE_PIN_HIT_STEM) return true
  const left = Math.min(anchor.x, tip.x) - ROTATE_PIN_HIT_PAD
  const right = Math.max(anchor.x, tip.x) + ROTATE_PIN_HIT_PAD
  const top = Math.min(anchor.y, tip.y) - ROTATE_PIN_HIT_PAD
  const bottom = Math.max(anchor.y, tip.y) + ROTATE_PIN_HIT_PAD
  return pt.x >= left && pt.x <= right && pt.y >= top && pt.y <= bottom
}

export function contentRotatePinHit(
  bounds: { x: number; y: number; w: number; h: number },
  pt: Pt
): boolean {
  const anchor = { x: bounds.x + bounds.w / 2, y: bounds.y }
  const tip = { x: anchor.x, y: anchor.y - ROTATE_PIN_LEN }
  if (dist(pt, tip) <= ROTATE_PIN_HIT_HEAD) return true
  return distPtToSegment(pt, anchor, tip) <= ROTATE_PIN_HIT_STEM
}

export function rectCenter(x: number, y: number, w: number, h: number): Pt {
  return { x: x + w / 2, y: y + h / 2 }
}

export function rectRotatePinAnchor(
  x: number,
  y: number,
  w: number,
  h: number,
  rot = 0,
  pivot?: Pt
): Pt {
  const c = pivot ?? rectCenter(x, y, w, h)
  const top = { x: x + w / 2, y: y }
  return rot ? rotatePt(top, c, rot) : top
}

export function rectRotatePinTip(
  x: number,
  y: number,
  w: number,
  h: number,
  rot = 0,
  pivot?: Pt
): Pt {
  const c = pivot ?? rectCenter(x, y, w, h)
  const anchor = rectRotatePinAnchor(x, y, w, h, rot, c)
  const dx = anchor.x - c.x
  const dy = anchor.y - c.y
  const len = Math.hypot(dx, dy)
  if (len > 0.5) {
    return { x: anchor.x + (dx / len) * ROTATE_PIN_LEN, y: anchor.y + (dy / len) * ROTATE_PIN_LEN }
  }
  return { x: anchor.x, y: anchor.y - ROTATE_PIN_LEN }
}

export function rectRotatePinHit(
  x: number,
  y: number,
  w: number,
  h: number,
  pt: Pt,
  rot = 0,
  pivot?: Pt
): boolean {
  const anchor = rectRotatePinAnchor(x, y, w, h, rot, pivot)
  const tip = rectRotatePinTip(x, y, w, h, rot, pivot)
  if (dist(pt, tip) <= ROTATE_PIN_HIT_HEAD) return true
  if (distPtToSegment(pt, anchor, tip) <= ROTATE_PIN_HIT_STEM) return true
  const left = Math.min(anchor.x, tip.x) - ROTATE_PIN_HIT_PAD
  const right = Math.max(anchor.x, tip.x) + ROTATE_PIN_HIT_PAD
  const top = Math.min(anchor.y, tip.y) - ROTATE_PIN_HIT_PAD
  const bottom = Math.max(anchor.y, tip.y) + ROTATE_PIN_HIT_PAD
  return pt.x >= left && pt.x <= right && pt.y >= top && pt.y <= bottom
}

export function rectCorners(x: number, y: number, w: number, h: number, rot = 0, pivot?: Pt): Pt[] {
  const c = pivot ?? rectCenter(x, y, w, h)
  const raw = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ]
  return rot ? raw.map((p) => rotatePt(p, c, rot)) : raw
}

export function pointInRotatedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  pt: Pt,
  rot = 0,
  pivot?: Pt
): boolean {
  if (!rot) return pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h
  const c = pivot ?? rectCenter(x, y, w, h)
  const local = rotatePt(pt, c, -rot)
  return local.x >= x && local.x <= x + w && local.y >= y && local.y <= y + h
}

// ── Colour helpers (#RRGGBBAA + CSS gradients) ───────────────────────────────
export function normalizeHex(input: string): string | null {
  let h = input.trim()
  if (!h.startsWith('#')) h = '#' + h
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return (h + 'ff').toLowerCase()
  if (/^#[0-9a-fA-F]{8}$/.test(h)) return h.toLowerCase()
  return null
}
export function hexAlpha(hex: string): number {
  if (isGradientColor(hex)) return 100
  const a = parseInt(hex.slice(7, 9) || 'ff', 16)
  return Math.round((a / 255) * 100)
}
export function withAlpha(hex: string, pct: number): string {
  if (isGradientColor(hex)) return hex
  const solid = hex.startsWith('#') ? hex : firstSolidColor(hex)
  const a = Math.round((Math.max(0, Math.min(100, pct)) / 100) * 255)
  return solid.slice(0, 7) + a.toString(16).padStart(2, '0')
}
/** Solid colour for pixel tools (brush / fill) when a gradient is selected. */
export function pixelColor(color: string): string {
  const s = firstSolidColor(color)
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s + 'ff'
  return s
}
export function isTransparentPaintColor(color: string): boolean {
  if (!color || color === 'transparent' || color === 'none') return true
  if (isGradientColor(color)) return false
  return hexAlpha(color) <= 0
}

/** Force #RRGGBB / #RRGGBBAA to fully transparent while keeping RGB. */
export function withZeroAlpha(color: string): string {
  const s = firstSolidColor(color).trim()
  if (s.startsWith('#') && s.length >= 7) return (s.slice(0, 7) + '00').toLowerCase()
  return '#00000000'
}

export function shouldDrawObjectShadow(l: LineObj): boolean {
  if (!l.shadow) return false
  if (isTransparentPaintColor(l.shadowColor ?? '')) return false
  return true
}
export function ptsBounds(pts: Pt[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 1, h: 1 }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
}
export function styleForColor(ctx: CanvasRenderingContext2D, color: string, pts: Pt[]): string | CanvasGradient {
  const b = ptsBounds(pts)
  return resolveCanvasColor(ctx, color, b.x, b.y, b.w, b.h)
}

export function LineSelect<T extends string>({
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

export function ShapePreview({ kind, px = 26 }: { kind: ShapeKind; px?: number }): JSX.Element {
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

export function ShapeMenu({
  title, items, current, onPick, freePoly, aspectLock, anchorRect
}: {
  title: string
  items: { value: ShapeKind; label: string }[]
  current: ShapeKind
  onPick: (k: ShapeKind) => void
  freePoly?: {
    n: number
    onN: (v: number) => void
    onPick: () => void
    active: boolean
  }
  /** Optional W:H aspect lock (polygons / irregular). */
  aspectLock?: {
    enabled: boolean
    onEnabled: (v: boolean) => void
    aspectW: number
    aspectH: number
    onAspectW: (v: number) => void
    onAspectH: (v: number) => void
    title?: string
  }
  /** Button rect — menu is `fixed` so it is not clipped by the two-row toolbar. */
  anchorRect: DOMRect
}): JSX.Element {
  const menuW = 264
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - menuW - 8))
  const top = anchorRect.bottom + 4
  return (
    <div
      className="fixed z-[10050] w-[264px] p-2 rounded-lg bg-surface border border-border shadow-2xl"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
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
      {aspectLock && (
        <div className={`${freePoly ? 'mt-2' : 'mt-2 pt-2 border-t border-border'} flex items-center gap-1.5 flex-wrap`}>
          <label
            className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none"
            title={aspectLock.title ?? 'When checked, keep the set aspect ratio while drawing. Hold Shift for the same while unchecked.'}
          >
            <input
              type="checkbox"
              checked={aspectLock.enabled}
              onChange={(e) => aspectLock.onEnabled(e.target.checked)}
              className="accent-accent"
            />
            Lock aspect
          </label>
          <input
            type="number"
            min={0.01}
            step="any"
            value={aspectLock.aspectW}
            onChange={(e) => {
              const v = Number(e.target.value)
              aspectLock.onAspectW(Number.isFinite(v) && v > 0 ? v : 1)
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-12 px-1 py-1 rounded bg-surface3 border border-border text-[11px] text-text text-center focus:outline-none focus:border-accent"
            title="Aspect width"
          />
          <span className="text-[11px] text-muted">:</span>
          <input
            type="number"
            min={0.01}
            step="any"
            value={aspectLock.aspectH}
            onChange={(e) => {
              const v = Number(e.target.value)
              aspectLock.onAspectH(Number.isFinite(v) && v > 0 ? v : 1)
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-12 px-1 py-1 rounded bg-surface3 border border-border text-[11px] text-text text-center focus:outline-none focus:border-accent"
            title="Aspect height"
          />
        </div>
      )}
    </div>
  )
}

/**
 * Euclidean distance (px) to the nearest outside pixel (alpha < `outsideA`).
 * Used so a curved border ring is a true offset of the silhouette, not a
 * diamond-shaped Manhattan band that misses the stroke and hits the shadow.
 */
export function alphaOutsideEDT(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  outsideA = 150
): Float32Array {
  const INF = 1e12
  const sq = new Float64Array(W * H)
  for (let i = 0; i < W * H; i++) sq[i] = data[i * 4 + 3] < outsideA ? 0 : INF

  const nMax = Math.max(W, H)
  const f = new Float64Array(nMax)
  const d = new Float64Array(nMax)
  const v = new Int32Array(nMax)
  const z = new Float64Array(nMax + 1)

  const edt1d = (n: number) => {
    let k = 0
    v[0] = 0
    z[0] = Number.NEGATIVE_INFINITY
    z[1] = Number.POSITIVE_INFINITY
    for (let q = 1; q < n; q++) {
      let s: number
      for (;;) {
        const r = v[k]
        const denom = 2 * (q - r)
        s = denom === 0 ? Number.POSITIVE_INFINITY : ((f[q] + q * q) - (f[r] + r * r)) / denom
        if (s > z[k]) break
        k--
        if (k < 0) {
          k = 0
          s = Number.NEGATIVE_INFINITY
          break
        }
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = Number.POSITIVE_INFINITY
    }
    k = 0
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++
      const r = v[k]
      d[q] = (q - r) * (q - r) + f[r]
    }
  }

  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = sq[y * W + x]
    edt1d(H)
    for (let y = 0; y < H; y++) sq[y * W + x] = d[y]
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = sq[y * W + x]
    edt1d(W)
    for (let x = 0; x < W; x++) sq[y * W + x] = d[x]
  }

  const out = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) out[i] = Math.sqrt(sq[i])
  return out
}

export function cssSolidRgb(color: string | null | undefined): [number, number, number] | null {
  if (!color || color === 'transparent') return null
  const s = firstSolidColor(color).trim()
  if (!s || s === 'transparent') return null
  const named = s.toLowerCase()
  if (named === 'white') return [255, 255, 255]
  if (named === 'black') return [0, 0, 0]
  const hex = s.match(/^#([0-9a-fA-F]{3,8})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ]
  }
  const rgb = s.match(/rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/i)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return null
}

export function rgbClose3(
  a: [number, number, number],
  b: [number, number, number],
  tol = 40
): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= tol
}

