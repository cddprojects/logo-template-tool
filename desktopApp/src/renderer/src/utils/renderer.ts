import type { ShapeType, LogoConfig, FaviconConfig, FaviconOuterShape, IconConfig } from '../types'
import { renderLucideToSvg, applySvgColor, drawSvgOnCanvas, loadCachedImage, svgPaintFromCssColor } from './iconUtils'
import { resolveImageDataUrl } from './imageRecolor'
import {
  applyPaintDecorations,
  applyPaintLayerDecorations,
  sessionUsesLayeredPaint,
  shouldSkipLiveLettersForPaintSession
} from './paintDecorations'

// ── Gradient color utilities ──────────────────────────────────────────────────

/**
 * Converts a CSS linear-gradient string into a CanvasGradient scoped to the
 * given rectangle, or returns the original string for solid colors.
 * Supports the format emitted by the ColorPicker popup:
 *   linear-gradient(45deg, #rrggbb 0%, #rrggbb 100%)
 */
const STOP_RE = /,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+(?:\.\d+)?)%/g
function parseColorStops(body: string): { color: string; pos: number }[] {
  const stops: { color: string; pos: number }[] = []
  let m: RegExpExecArray | null
  while ((m = STOP_RE.exec(body)) !== null) {
    stops.push({ color: m[1], pos: parseFloat(m[2]) / 100 })
  }
  STOP_RE.lastIndex = 0
  return stops
}

/**
 * Converts a CSS linear-gradient or radial-gradient string into a
 * CanvasGradient scoped to the given rectangle.  Returns the original string
 * unchanged for solid colors.
 */
export function resolveCanvasColor(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number
): string | CanvasGradient {
  if (color.startsWith('linear-gradient(')) {
    const m = color.match(/linear-gradient\((\d+(?:\.\d+)?)deg(,.+)\)/)
    if (!m) return color
    const stops = parseColorStops(m[2])
    if (stops.length < 2) return color

    // CSS: 0deg = bottom→top, 90deg = left→right.
    const rad = (90 - parseFloat(m[1])) * Math.PI / 180
    const cx = x + w / 2, cy = y + h / 2
    const len = Math.sqrt(w * w + h * h) / 2
    const grad = ctx.createLinearGradient(
      cx - Math.cos(rad) * len, cy + Math.sin(rad) * len,
      cx + Math.cos(rad) * len, cy - Math.sin(rad) * len
    )
    for (const s of stops) try { grad.addColorStop(s.pos, s.color) } catch { /* skip */ }
    return grad
  }

  if (color.startsWith('radial-gradient(')) {
    // Format: radial-gradient(circle at CX% CY%, #c1 p1%, #c2 p2%)
    const m = color.match(/radial-gradient\(circle at (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%(,.+)\)/)
    if (!m) return color
    const stops = parseColorStops(m[3])
    if (stops.length < 2) return color

    const gcx = x + w * parseFloat(m[1]) / 100
    const gcy = y + h * parseFloat(m[2]) / 100
    // Half-diagonal radius ensures the gradient reaches all corners.
    const radius = Math.sqrt(w * w + h * h) / 2
    const grad = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, radius)
    for (const s of stops) try { grad.addColorStop(s.pos, s.color) } catch { /* skip */ }
    return grad
  }

  return color
}

/**
 * Returns the first solid color from any gradient string (used where only a
 * single color is accepted, e.g. SVG fill attributes or shadow colors).
 */
export function firstSolidColor(color: string): string {
  if (!color.startsWith('linear-gradient(') && !color.startsWith('radial-gradient(')) return color
  const m = color.match(/(?:linear|radial)-gradient\([^,]+(?:,\s*[^,]+)?,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/)
  return m ? m[1] : '#888888'
}

// ── Primitive shape drawing ───────────────────────────────────────────────────

export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeType,
  x: number,
  y: number,
  size: number,
  fillColor: string | CanvasGradient,
  radiusFraction = 0
): void {
  if (shape === 'none') return
  ctx.save()
  ctx.fillStyle = fillColor

  switch (shape) {
    case 'circle':
      ctx.beginPath()
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'square':
      if (radiusFraction > 0) {
        roundedRect(ctx, x, y, size, size, size * Math.min(0.5, radiusFraction))
        ctx.fill()
      } else {
        ctx.fillRect(x, y, size, size)
      }
      break
    case 'rounded': {
      const r = size * Math.min(0.5, radiusFraction)
      roundedRect(ctx, x, y, size, size, r)
      ctx.fill()
      break
    }
    case 'hexagon': {
      const cx = x + size / 2
      const cy = y + size / 2
      const r = size / 2
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6
        i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      }
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'triangle':
      ctx.beginPath()
      ctx.moveTo(x + size / 2, y)
      ctx.lineTo(x + size, y + size)
      ctx.lineTo(x, y + size)
      ctx.closePath()
      ctx.fill()
      break
    case 'diamond':
      ctx.beginPath()
      ctx.moveTo(x + size / 2, y)
      ctx.lineTo(x + size, y + size / 2)
      ctx.lineTo(x + size / 2, y + size)
      ctx.lineTo(x, y + size / 2)
      ctx.closePath()
      ctx.fill()
      break
    case 'pentagon': {
      const cx = x + size / 2
      const cy = y + size / 2
      const r = size / 2
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2
        i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      }
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'star': {
      // outerR sized so the star fills the full width (touches left and right edges).
      // Star width = 2 * outerR * cos(18°); solving for size: outerR = size / (2*cos(π/10)).
      const outerR = size / (2 * Math.cos(Math.PI / 10))
      const innerR = outerR * (2 / 4.5)
      const cx = x + size / 2
      // Center vertically: star height = outerR * (1 + sin(54°)).
      // Place cy so top and bottom gaps are equal.
      const cy = y + outerR + (size - outerR * (1 + Math.sin(3 * Math.PI / 10))) / 2
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * i) / 5 - Math.PI / 2
        const r = i % 2 === 0 ? outerR : innerR
        i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      }
      ctx.closePath()
      ctx.fill()
      break
    }
  }
  ctx.restore()
}

/**
 * Builds only the path for a shape without filling, so callers can stroke or clip it.
 */
function buildShapePath(
  ctx: CanvasRenderingContext2D,
  shape: ShapeType,
  x: number,
  y: number,
  size: number,
  radiusFraction = 0
): void {
  if (shape === 'none') return
  switch (shape) {
    case 'circle':
      ctx.beginPath()
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
      ctx.closePath()
      break
    case 'square':
      if (radiusFraction > 0) {
        roundedRect(ctx, x, y, size, size, size * Math.min(0.5, radiusFraction))
      } else {
        ctx.beginPath()
        ctx.rect(x, y, size, size)
        ctx.closePath()
      }
      break
    case 'rounded': {
      const r = size * Math.min(0.5, radiusFraction)
      roundedRect(ctx, x, y, size, size, r)
      break
    }
    case 'hexagon': {
      const cx = x + size / 2
      const cy = y + size / 2
      const r = size / 2
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6
        i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      }
      ctx.closePath()
      break
    }
    case 'triangle':
      ctx.beginPath()
      ctx.moveTo(x + size / 2, y)
      ctx.lineTo(x + size, y + size)
      ctx.lineTo(x, y + size)
      ctx.closePath()
      break
    case 'diamond':
      ctx.beginPath()
      ctx.moveTo(x + size / 2, y)
      ctx.lineTo(x + size, y + size / 2)
      ctx.lineTo(x + size / 2, y + size)
      ctx.lineTo(x, y + size / 2)
      ctx.closePath()
      break
    case 'pentagon': {
      const cx = x + size / 2
      const cy = y + size / 2
      const r = size / 2
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2
        i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      }
      ctx.closePath()
      break
    }
    case 'star': {
      const outerR = size / (2 * Math.cos(Math.PI / 10))
      const innerR = outerR * (2 / 4.5)
      const cx = x + size / 2
      const cy = y + outerR + (size - outerR * (1 + Math.sin(3 * Math.PI / 10))) / 2
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * i) / 5 - Math.PI / 2
        const r = i % 2 === 0 ? outerR : innerR
        i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      }
      ctx.closePath()
      break
    }
  }
}

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y,     x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x,     y + h, r)
  ctx.arcTo(x,     y + h, x,     y,     r)
  ctx.arcTo(x,     y,     x + w, y,     r)
  ctx.closePath()
}


// ── Spaced text (letter-spacing) ──────────────────────────────────────────────

type CtxLetterSpacing = CanvasRenderingContext2D & { letterSpacing?: string }

/** Run `fn` with canvas letter-spacing applied (Chromium / Electron). */
export function withLetterSpacing(
  ctx: CanvasRenderingContext2D,
  spacingPx: number,
  fn: () => void
): void {
  const c = ctx as CtxLetterSpacing
  if (typeof c.letterSpacing !== 'string') {
    fn()
    return
  }
  const prev = c.letterSpacing
  c.letterSpacing = `${spacingPx || 0}px`
  try {
    fn()
  } finally {
    c.letterSpacing = prev || '0px'
  }
}

export function measureSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  spacingPx = 0
): TextMetrics {
  let metrics!: TextMetrics
  withLetterSpacing(ctx, spacingPx, () => { metrics = ctx.measureText(text) })
  return metrics
}

export function fillSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacingPx = 0
): void {
  withLetterSpacing(ctx, spacingPx, () => { ctx.fillText(text, x, y) })
}

export function strokeSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacingPx = 0
): void {
  withLetterSpacing(ctx, spacingPx, () => { ctx.strokeText(text, x, y) })
}

// ── Text underline helper ─────────────────────────────────────────────────────
//
// Canvas 2D has no native underline — we draw a line below the text baseline.
// Call this AFTER setting ctx.font and AFTER ctx.fillText / ctx.strokeText.
// `drawX` = the x passed to fillText; `drawY` = the y passed to fillText.
// `baselineMode` describes how textBaseline was set at the time of fillText.
function drawTextUnderline(
  ctx: CanvasRenderingContext2D,
  text: string,
  drawX: number,
  drawY: number,
  fontSize: number,
  color: string,
  align: 'center' | 'left',
  baselineMode: 'alphabetic' | 'top' | 'middle',
  letterSpacing = 0
): void {
  // Measure with alphabetic baseline for consistent fontBoundingBox values.
  const savedBaseline = ctx.textBaseline
  ctx.textBaseline = 'alphabetic'
  const tm = measureSpacedText(ctx, text, letterSpacing)
  ctx.textBaseline = savedBaseline

  // Convert drawY to the actual alphabetic baseline y position.
  let baselineY: number
  if (baselineMode === 'alphabetic') {
    baselineY = drawY
  } else if (baselineMode === 'top') {
    // textBaseline='top' → em-square top is at drawY → baseline = drawY + fontBoundingBoxAscent
    baselineY = drawY + (tm.fontBoundingBoxAscent ?? fontSize * 0.8)
  } else {
    // textBaseline='middle' → em-square center at drawY → baseline = drawY + (ascent - descent) / 2
    const asc = tm.fontBoundingBoxAscent  ?? fontSize * 0.8
    const dsc = tm.fontBoundingBoxDescent ?? fontSize * 0.2
    baselineY = drawY + (asc - dsc) / 2
  }

  const gap = Math.max(1, fontSize * 0.1)
  const lineW = Math.max(1, fontSize * 0.07)
  const startX = align === 'center' ? drawX - tm.width / 2 : drawX

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineW
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.moveTo(startX, baselineY + gap)
  ctx.lineTo(startX + tm.width, baselineY + gap)
  ctx.stroke()
  ctx.restore()
}

// ── Icon drawing (handles shape / lucide / svg) ───────────────────────────────

/** How far an icon outer shadow extends past each edge (render pixels). */
function iconOuterShadowPad(
  icon: IconConfig,
  size: number
): { pad: number; blur: number; spread: number; ox: number; oy: number } {
  const dprScale = size / (icon.size || size)
  const blur = (icon.shadowBlur ?? 8) * dprScale
  const spread = (icon.shadowSpread ?? 0) * dprScale
  const ox = (icon.shadowOffsetX ?? 0) * dprScale
  const oy = (icon.shadowOffsetY ?? 4) * dprScale
  const has =
    !!icon.shadowEnabled &&
    !!icon.containerEnabled &&
    icon.containerShape !== 'none'
  if (!has) return { pad: 0, blur, spread, ox, oy }
  // Gaussian blur visually spreads ~2× the blur radius at the soft fringe.
  const blurExt = blur * 2
  const pad = Math.ceil(
    Math.max(
      blurExt + spread + Math.abs(ox),
      blurExt + spread + Math.abs(oy),
      0
    )
  ) + 4
  return { pad, blur, spread, ox, oy }
}

export async function drawIcon(
  ctx: CanvasRenderingContext2D,
  icon: IconConfig,
  x: number,
  y: number,
  size: number,
  superSample = 2
): Promise<void> {
  // Paint Fill overlays are authored at session.resolution. Overlays scale via
  // drawScaledPng in applyPaintLayerDecorations — render live Inner at `size`.

  // Outer container shadow — always via an isolated padded canvas so hexagon /
  // star / etc. shadows are never clipped by the icon rect or a paint offscreen.
  const { pad: shadowPad, blur: scaledBlur, spread: iconSpread, ox: iconOx, oy: iconOy } =
    iconOuterShadowPad(icon, size)
  const dprScale = size / (icon.size || size)

  if (shadowPad > 0) {
    const cTypeForShadow = icon.containerType ?? 'color'
    const tmpW = size + shadowPad * 2
    const tmpH = size + shadowPad * 2
    const tmp = document.createElement('canvas')
    tmp.width = tmpW
    tmp.height = tmpH
    const tCtx = tmp.getContext('2d')!
    tCtx.imageSmoothingEnabled = true
    tCtx.imageSmoothingQuality = 'high'

    const HUGE = 10000
    const srcX = shadowPad - iconSpread - HUGE
    const srcY = shadowPad - iconSpread - HUGE
    const srcS = size + iconSpread * 2

    tCtx.shadowColor = firstSolidColor(icon.shadowColor ?? '#00000073')
    tCtx.shadowBlur = scaledBlur
    tCtx.shadowOffsetX = iconOx + HUGE
    tCtx.shadowOffsetY = iconOy + HUGE

    if (cTypeForShadow === 'svg' && icon.containerSvgMarkup) {
      await drawSvgOnCanvas(tCtx, icon.containerSvgMarkup, srcX, srcY, srcS, srcS)
      tCtx.shadowColor = 'transparent'
      tCtx.globalCompositeOperation = 'destination-out'
      await drawSvgOnCanvas(tCtx, icon.containerSvgMarkup, shadowPad, shadowPad, size, size)
      tCtx.globalCompositeOperation = 'source-over'
    } else if (cTypeForShadow === 'image' && icon.containerImageDataUrl) {
      const img = await loadCachedImage(icon.containerImageDataUrl)
      if (img) {
        tCtx.drawImage(img, srcX, srcY, srcS, srcS)
        tCtx.shadowColor = 'transparent'
        tCtx.globalCompositeOperation = 'destination-out'
        tCtx.drawImage(img, shadowPad, shadowPad, size, size)
        tCtx.globalCompositeOperation = 'source-over'
      } else {
        tCtx.shadowColor = 'transparent'
      }
    } else {
      const cRadFrac = (icon.containerBorderRadius ?? 0) / (icon.size || 112)
      drawShape(tCtx, icon.containerShape, srcX, srcY, srcS, '#000', cRadFrac)
      tCtx.shadowColor = 'transparent'
      tCtx.globalCompositeOperation = 'destination-out'
      const punch = Math.min(1.25, Math.max(0.5, size * 0.004))
      drawShape(
        tCtx,
        icon.containerShape,
        shadowPad + punch,
        shadowPad + punch,
        Math.max(1, size - punch * 2),
        '#000',
        cRadFrac
      )
      tCtx.globalCompositeOperation = 'source-over'
    }

    ctx.drawImage(tmp, x - shadowPad, y - shadowPad)
  } else if (icon.shadowEnabled) {
    // Container disabled — apply shadow to whatever content is drawn next
    ctx.shadowColor = firstSolidColor(icon.shadowColor ?? '#00000073')
    ctx.shadowBlur = scaledBlur
    ctx.shadowOffsetX = iconOx
    ctx.shadowOffsetY = iconOy
  }

  // Border params captured here and drawn AFTER content so the border sits on
  // top of the inner content — matching the favicon renderer's layer order.
  let _borderWidth = 0
  let _borderColor = 'transparent'
  let _borderSvgPath: string | undefined
  let _borderCRadFrac = 0

  // Draw container background shape at full icon size
  if (icon.containerEnabled && icon.containerShape !== 'none') {
    const cType = icon.containerType ?? 'color'
    const cRadFrac = (icon.containerBorderRadius ?? 0) / (icon.size || 112)
    _borderCRadFrac = cRadFrac

    if (cType === 'image' && icon.containerImageDataUrl) {
      // Clip to container shape then draw image scaled to fill it
      ctx.save()
      ctx.beginPath()
      buildShapePath(ctx, icon.containerShape, x, y, size, cRadFrac)
      ctx.clip()
      const img = await loadCachedImage(icon.containerImageDataUrl)
      if (img) ctx.drawImage(img, x, y, size, size)
      ctx.restore()
    } else if (cType === 'svg' && icon.containerSvgMarkup) {
      // Clip to container shape then rasterise the SVG into it
      ctx.save()
      ctx.beginPath()
      buildShapePath(ctx, icon.containerShape, x, y, size, cRadFrac)
      ctx.clip()
      await drawSvgOnCanvas(ctx, icon.containerSvgMarkup, x, y, size, size)
      ctx.restore()
    } else if (cType === 'color') {
      // Solid colour fill — only when explicitly using color type, NOT as a
      // fallback for image/svg containers whose data hasn't been set yet.
      // (An image/svg container with empty data should be transparent, matching
      //  the favicon renderer which also draws nothing in that case.)
      drawShape(ctx, icon.containerShape, x, y, size, resolveCanvasColor(ctx, icon.containerColor, x, y, size, size), cRadFrac)
    }
    // cType === 'image' with no URL, or 'svg' with no markup → draw nothing (transparent)

    // Capture border params — drawn after content (see bottom of function).
    // Scale by dprScale so the border proportion matches at any render DPR,
    // consistent with how shadow blur/spread/offsets and content border are scaled.
    _borderWidth = (icon.containerBorderWidth ?? 0) * dprScale
    _borderColor = icon.containerBorderColor ?? 'transparent'
    _borderSvgPath = icon.containerSvgBorderPath

    // Reset shadow so content doesn't double-shadow
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0

    // Outer paint under Inner content (layered / overlay-only sessions).
    if (sessionUsesLayeredPaint(icon.paintSession)) {
      await applyPaintLayerDecorations(ctx, icon.paintSession, x, y, size, 'container')
    }
  }

  // When a container shape is active, shrink the effective draw area by
  // containerPadding so the content sits inside the container rather than
  // overflowing its edges.
  const pad = (icon.containerEnabled && icon.containerShape !== 'none')
    ? (icon.containerPadding ?? 0.18)
    : 0
  const areaSize = size * (1 - 2 * pad)

  const cx = x + size / 2 + (icon.offsetX ?? 0) * dprScale
  const cy = y + size / 2 + (icon.offsetY ?? 0) * dprScale

  // ── Inner content via 2× supersampled offscreen canvas ──────────────────────
  // Benefits:
  //  • Downsampling SUPER×→1× when compositing provides free anti-aliasing (smooth edges).
  //  • ctx.filter='drop-shadow(...)' is used for content shadows so it follows the
  //    actual per-pixel alpha channel (unlike ctx.shadow* + drawImage(canvas)).
  const SUPER = superSample
  const contentCanvas = document.createElement('canvas')
  contentCanvas.width  = size * SUPER
  contentCanvas.height = size * SUPER
  const cCtx = contentCanvas.getContext('2d')!
  cCtx.imageSmoothingEnabled = true
  cCtx.imageSmoothingQuality = 'high'

  const localCx  = (cx - x) * SUPER   // content centre in supersampled space
  const localCy  = (cy - y) * SUPER
  const superArea = areaSize * SUPER   // effective draw area in supersampled space

  let iconShapeDrawSize = 0
  let iconOtherDrawSize = 0
  // Optical center Y for letters — stored so the border-stroke pass can reuse it.
  let iconLettersDrawY = localCy

  switch (icon.sourceType) {
    case 'shape': {
      iconShapeDrawSize = superArea * (icon.shapeSizeRatio ?? 1.0)
      {
        const sx = localCx - iconShapeDrawSize / 2
        const sy = localCy - iconShapeDrawSize / 2
        const shapeRadFrac =
          icon.shape === 'square' || icon.shape === 'rounded'
            ? (icon.shapeBorderRadius ?? 0) / (icon.size || 112)
            : 0
        drawShape(
          cCtx,
          icon.shape,
          sx, sy, iconShapeDrawSize,
          resolveCanvasColor(cCtx, icon.primaryColor, sx, sy, iconShapeDrawSize, iconShapeDrawSize),
          shapeRadFrac
        )
      }
      break
    }
    case 'lucide': {
      iconOtherDrawSize = superArea * (icon.lucideSizeRatio ?? 1.0)
      const rawSvg = await renderLucideToSvg(icon.lucideIconName, 'currentColor', icon.lucideStrokeWidth)
      if (rawSvg) {
        const coloredSvg = applySvgColor(rawSvg, icon.primaryColor)
        await drawSvgOnCanvas(cCtx, coloredSvg, localCx - iconOtherDrawSize / 2, localCy - iconOtherDrawSize / 2, iconOtherDrawSize, iconOtherDrawSize)
      }
      break
    }
    case 'svg': {
      iconOtherDrawSize = superArea * (icon.svgMarkupSizeRatio ?? 1.0)
      if (icon.svgMarkup) {
        const coloredSvg = icon.svgMarkupUseOriginalColors
          ? icon.svgMarkup
          : applySvgColor(icon.svgMarkup, icon.primaryColor, icon.svgMarkupSecondaryColor, icon.svgMarkupTertiaryColor, icon.svgMarkupColor4, icon.svgMarkupColor5)
        await drawSvgOnCanvas(cCtx, coloredSvg, localCx - iconOtherDrawSize / 2, localCy - iconOtherDrawSize / 2, iconOtherDrawSize, iconOtherDrawSize)
      }
      break
    }
    case 'letters': {
      // Whitespace-only text is used by the paint editor to blank the content
      // layer when splitting Outer shape / Inner content. Do not draw glyphs or
      // an underline (a space + underline looks like a stray "-" on the canvas).
      // When Paint saved linked text into decorationsPng, skip live letters.
      if (shouldSkipLiveLettersForPaintSession(icon.paintSession)) break
      const letterText = icon.text ?? ''
      if (letterText.length > 0 && !letterText.trim()) break
      const fontSize = superArea * (icon.fontSizeRatio ?? 0.52)
      const fontStyle = (icon.fontItalic ?? false) ? 'italic ' : ''
      const letterSp = (icon.letterSpacing ?? 0) * dprScale * SUPER
      cCtx.font = `${fontStyle}${icon.fontWeight ?? '700'} ${fontSize}px "${icon.fontFamily ?? 'Inter'}", sans-serif`
      cCtx.fillStyle = resolveCanvasColor(cCtx, icon.textColor ?? icon.primaryColor, 0, 0, superArea, superArea)
      cCtx.textAlign = 'center'
      // Use 'alphabetic' baseline + actual bounding-box metrics so the VISIBLE
      // glyph bounds are centred at localCy, matching the favicon renderer exactly.
      cCtx.textBaseline = 'alphabetic'
      const display = letterText || '?'
      const itm = measureSpacedText(cCtx, display, letterSp)
      iconLettersDrawY = localCy + (itm.actualBoundingBoxAscent - itm.actualBoundingBoxDescent) / 2
      fillSpacedText(cCtx, display, localCx, iconLettersDrawY, letterSp)
      if (icon.fontUnderline ?? false) {
        drawTextUnderline(cCtx, display, localCx, iconLettersDrawY,
          fontSize, icon.textColor ?? icon.primaryColor, 'center', 'alphabetic', letterSp)
      }
      break
    }
    case 'image': {
      iconOtherDrawSize = superArea * (icon.imageSizeRatio ?? 0.8)
      if (icon.imageDataUrl) {
        const url = await resolveImageDataUrl(icon)
        const img = await loadCachedImage(url)
        if (img) cCtx.drawImage(img, localCx - iconOtherDrawSize / 2, localCy - iconOtherDrawSize / 2, iconOtherDrawSize, iconOtherDrawSize)
      }
      break
    }
  }

  // Content border / stroke (scaled for supersampling and DPR).
  // Shapes use clip-and-double so the full borderWidth is visible inside the
  // shape regardless of geometry (hexagon, star, triangle, etc.).
  const icbw = (icon.contentBorderWidth ?? 0) * dprScale * SUPER
  if (icbw > 0) {
    const icbc = (icon.contentBorderColor ?? 'transparent') === 'transparent' ? '#000000' : icon.contentBorderColor
    cCtx.save()
    cCtx.strokeStyle = icbc
    if (icon.sourceType === 'shape' && iconShapeDrawSize > 0) {
      const sx = localCx - iconShapeDrawSize / 2
      const sy = localCy - iconShapeDrawSize / 2
      const shapeRadFrac =
        icon.shape === 'square' || icon.shape === 'rounded'
          ? (icon.shapeBorderRadius ?? 0) / (icon.size || 112)
          : 0
      buildShapePath(cCtx, icon.shape, sx, sy, iconShapeDrawSize, shapeRadFrac)
      cCtx.clip()
      cCtx.lineWidth = icbw * 2
      buildShapePath(cCtx, icon.shape, sx, sy, iconShapeDrawSize, shapeRadFrac)
      cCtx.stroke()
    } else if (icon.sourceType === 'letters') {
      cCtx.lineWidth = icbw
      const fontSize = superArea * (icon.fontSizeRatio ?? 0.52)
      const fontStyle = (icon.fontItalic ?? false) ? 'italic ' : ''
      const letterSp = (icon.letterSpacing ?? 0) * dprScale * SUPER
      cCtx.font = `${fontStyle}${icon.fontWeight ?? '700'} ${fontSize}px "${icon.fontFamily ?? 'Inter'}", sans-serif`
      cCtx.textAlign = 'center'
      cCtx.textBaseline = 'alphabetic'
      strokeSpacedText(cCtx, icon.text || '?', localCx, iconLettersDrawY, letterSp)
    } else if (iconOtherDrawSize > 0) {
      cCtx.lineWidth = icbw
      const half = iconOtherDrawSize / 2
      cCtx.strokeRect(localCx - half, localCy - half, iconOtherDrawSize, iconOtherDrawSize)
    }
    cCtx.restore()
  }

  // ── Composite content onto main canvas ────────────────────────────────────
  //
  // IMPORTANT: ctx.shadow* + ctx.drawImage(HTMLCanvasElement) shadows the
  // bounding RECTANGLE of the canvas, not its alpha channel — it always
  // produces a rectangular/circular blob regardless of content type.
  // ctx.filter='drop-shadow(...)' is the only Canvas 2D API that applies the
  // shadow per-pixel following the actual alpha channel.
  //
  // Clip to the container shape first so shadow stays inside the container
  // (the same pattern renderFaviconInner already uses for favicons).

  // Always clear any ctx.shadow* that may still be active from the outer
  // container shadow pass, to prevent it from interacting with ctx.filter.
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0

  const clipContent = icon.containerEnabled && icon.containerShape !== 'none'
  if (clipContent) {
    ctx.save()
    ctx.beginPath()
    buildShapePath(ctx, icon.containerShape, x, y, size)
    ctx.clip()
  }

  if (icon.contentShadowEnabled) {
    const cSpread = (icon.contentShadowSpread ?? 0) * dprScale
    const csx = (icon.contentShadowOffsetX ?? 0) * dprScale
    const csy = (icon.contentShadowOffsetY ?? 3) * dprScale
    const csb = (icon.contentShadowBlur   ?? 8) * dprScale
    const csc =  firstSolidColor(icon.contentShadowColor  ?? '#00000080')
    const isInset = icon.contentShadowInset ?? false

    if (isInset) {
      // Inset shadow: padded frame with content-shaped hole → drop-shadow only
      // the hole edge into the content (never leave a solid black fill).
      // Filter runs on the SUPER-sampled canvas, so offsets/blur must be × SUPER.
      const cW = contentCanvas.width
      const cH = contentCanvas.height
      const HUGE = 10000
      const fOx = csx * SUPER
      const fOy = csy * SUPER
      const fBlur = csb * SUPER
      const fSpread = cSpread * SUPER
      const pad = Math.ceil(fBlur * 2 + Math.max(cW, cH) + Math.abs(fOx) + Math.abs(fOy) + 4)

      const frameCanvas = document.createElement('canvas')
      frameCanvas.width  = cW + pad * 2
      frameCanvas.height = cH + pad * 2
      const fCtx = frameCanvas.getContext('2d')!
      fCtx.fillStyle = '#000000'
      fCtx.fillRect(0, 0, frameCanvas.width, frameCanvas.height)
      fCtx.globalCompositeOperation = 'destination-out'
      if (fSpread > 0) {
        const hs = Math.max(1, cW - fSpread * 2)
        const ho = pad + (cW - hs) / 2
        fCtx.drawImage(contentCanvas, ho, ho, hs, hs)
      } else {
        fCtx.drawImage(contentCanvas, pad, pad)
      }
      fCtx.globalCompositeOperation = 'source-over'

      // Shadow-only (frame is off-screen; only coloured drop-shadow remains)
      const shadowCanvas = document.createElement('canvas')
      shadowCanvas.width = cW
      shadowCanvas.height = cH
      const sCtx = shadowCanvas.getContext('2d')!
      sCtx.imageSmoothingEnabled = true
      sCtx.imageSmoothingQuality = 'high'
      sCtx.filter = `drop-shadow(${fOx + HUGE}px ${fOy + HUGE}px ${fBlur}px ${csc})`
      sCtx.drawImage(frameCanvas, -HUGE - pad, -HUGE - pad)
      sCtx.filter = 'none'
      sCtx.globalCompositeOperation = 'destination-in'
      sCtx.drawImage(contentCanvas, 0, 0)
      sCtx.globalCompositeOperation = 'source-over'

      // Content first, then shadow overlay
      const insetCanvas = document.createElement('canvas')
      insetCanvas.width = cW
      insetCanvas.height = cH
      const iCtx = insetCanvas.getContext('2d')!
      iCtx.drawImage(contentCanvas, 0, 0)
      iCtx.drawImage(shadowCanvas, 0, 0)

      ctx.drawImage(insetCanvas, x, y, size, size)
    } else if (cSpread > 0) {
      // Spread: draw a scaled-up version of the content far off-screen so only
      // its CSS drop-shadow lands at the correct position, then draw the
      // original (non-inflated) content cleanly on top.
      const HUGE = 10000
      const spreadSize = size + cSpread * 2
      const spreadCanvas = document.createElement('canvas')
      spreadCanvas.width  = spreadSize * SUPER
      spreadCanvas.height = spreadSize * SUPER
      const sCtx = spreadCanvas.getContext('2d')!
      sCtx.imageSmoothingEnabled = true
      sCtx.imageSmoothingQuality = 'high'
      sCtx.drawImage(contentCanvas, 0, 0, spreadSize * SUPER, spreadSize * SUPER)

      ctx.filter = `drop-shadow(${csx + HUGE}px ${csy + HUGE}px ${csb}px ${csc})`
      ctx.drawImage(spreadCanvas, x - cSpread - HUGE, y - cSpread - HUGE, spreadSize, spreadSize)
      ctx.filter = 'none'
      ctx.drawImage(contentCanvas, x, y, size, size)   // clean content on top
    } else {
      // No spread: CSS drop-shadow filter — per-pixel, follows actual alpha.
      ctx.filter = `drop-shadow(${csx}px ${csy}px ${csb}px ${csc})`
      ctx.drawImage(contentCanvas, x, y, size, size)
      ctx.filter = 'none'
    }
  } else {
    ctx.drawImage(contentCanvas, x, y, size, size)
  }

  if (clipContent) {
    ctx.restore()
  }

  // Draw container border AFTER content — matches favicon layer order (border on top).
  if (_borderWidth > 0) {
    if (_borderSvgPath) {
      // Complex SVG shapes (map-pin/shield/badge): Path2D clip-and-double border.
      // Parse the viewBox from the container SVG markup so the border transform
      // matches the xMidYMid meet scaling the browser used when drawing the image.
      const vb = icon.containerSvgMarkup
        ? (parseSvgViewBox(icon.containerSvgMarkup) ?? { x: 0, y: 0, w: 24, h: 24 })
        : { x: 0, y: 0, w: 24, h: 24 }
      const { scale: svgScale, tx, ty } = svgViewBoxTransform(vb, size)
      ctx.save()
      ctx.translate(x + tx, y + ty)
      ctx.scale(svgScale, svgScale)
      const path2d = new Path2D(_borderSvgPath)
      ctx.clip(path2d)
      ctx.strokeStyle = _borderColor === 'transparent' ? '#000000' : _borderColor
      ctx.lineWidth = (_borderWidth * 2) / svgScale
      ctx.stroke(path2d)
      ctx.restore()
    } else {
      ctx.save()
      buildShapePath(ctx, icon.containerShape, x, y, size, _borderCRadFrac)
      ctx.clip()
      ctx.strokeStyle = _borderColor === 'transparent' ? '#000000' : _borderColor
      ctx.lineWidth = _borderWidth * 2
      buildShapePath(ctx, icon.containerShape, x, y, size, _borderCRadFrac)
      ctx.stroke()
      ctx.restore()
    }
  }

  // Inner paint above live Inner; Outer paint already applied under content when layered.
  if (sessionUsesLayeredPaint(icon.paintSession)) {
    await applyPaintLayerDecorations(ctx, icon.paintSession, x, y, size, 'content')
  } else if (icon.paintSession) {
    // Legacy single-plane decorations on top of Outer + Inner.
    await applyPaintDecorations(ctx, icon.paintSession, x, y, size)
  }
}

// ── Complex favicon outer shapes ──────────────────────────────────────────────

/**
 * Returns an SVG for each complex outer shape.  ViewBoxes are set to the tight
 * bounding box of each path so the shape fills the canvas edge-to-edge when
 * rendered with xMidYMid meet (the browser's default):
 *   map-pin path bounds: x [5,19]  y [2,22]  → viewBox "5 2 14 20"
 *   shield  path bounds: x [4,20]  y [2,22]  → viewBox "4 2 16 20"
 *   badge   arc  bounds: x [2,22]  y [2,22]  → viewBox "2 2 20 20"
 *
 * Only map-pin / shield / badge stay here — hexagon and star are handled by
 * buildShapePath / drawShape for accurate math-computed geometry.
 */
const OUTER_SHAPE_SVGS: Partial<Record<FaviconOuterShape, string>> = {
  'map-pin': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="5 2 14 20"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>`,
  shield:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 2 16 20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  badge:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="2 2 20 20"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/></svg>`,
}

/**
 * Tight bounding boxes (in original 24×24 coordinate space) matching the viewBoxes
 * above.  Used to derive the canvas transform for Path2D border rendering so the
 * border overlay aligns exactly with the SVG image.
 */
const SHAPE_TIGHT_VIEWBOXES: Partial<Record<FaviconOuterShape, { x: number; y: number; w: number; h: number }>> = {
  'map-pin': { x: 5, y: 2, w: 14, h: 20 },
  shield:    { x: 4, y: 2, w: 16, h: 20 },
  badge:     { x: 2, y: 2, w: 20, h: 20 },
}

/**
 * Compute the canvas transform that the browser applies when rendering an SVG with
 * the given viewBox via xMidYMid meet into a square canvas of `canvasSize`.
 * Returns { scale, tx, ty } so that a path in the original coordinate space can
 * be drawn correctly with:
 *   ctx.translate(canvasOriginX + tx, canvasOriginY + ty)
 *   ctx.scale(scale, scale)
 *   ctx.stroke/clip(new Path2D(pathData))
 */
function svgViewBoxTransform(
  vb: { x: number; y: number; w: number; h: number },
  canvasSize: number
): { scale: number; tx: number; ty: number } {
  const scale = Math.min(canvasSize / vb.w, canvasSize / vb.h)
  const tx = (canvasSize - vb.w * scale) / 2 - vb.x * scale
  const ty = (canvasSize - vb.h * scale) / 2 - vb.y * scale
  return { scale, tx, ty }
}

/**
 * Parse the viewBox attribute from an SVG markup string.
 * Used by drawIcon to match its border transform to the container SVG's viewBox.
 */
function parseSvgViewBox(svgMarkup: string): { x: number; y: number; w: number; h: number } | null {
  const m = svgMarkup.match(/viewBox=["']([^"']+)["']/)
  if (!m) return null
  const p = m[1].trim().split(/[\s,]+/)
  if (p.length < 4) return null
  return { x: +p[0], y: +p[1], w: +p[2], h: +p[3] }
}

/**
 * SVG path data (viewBox 0 0 24 24) used for Path2D-based border rendering.
 * Hexagon and star are included here even though they are not in OUTER_SHAPE_SVGS —
 * they are rendered via buildShapePath normally, but their path data is needed for
 * the border step which uses the clip-and-double technique.
 */
const OUTER_SHAPE_BORDER_PATHS: Partial<Record<FaviconOuterShape, string>> = {
  'map-pin': `M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z`,
  shield: `M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z`,
  badge: `M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z`,
}

/**
 * For complex shapes, we draw a colored version as a background mask.
 * Returns the inner content area (x, y, size) where the content icon should be drawn.
 */
async function drawComplexOuterShape(
  ctx: CanvasRenderingContext2D,
  shape: FaviconOuterShape,
  color: string,
  size: number
): Promise<{ contentX: number; contentY: number; contentSize: number }> {
  const svgTemplate = OUTER_SHAPE_SVGS[shape]
  if (!svgTemplate) {
    return { contentX: 0, contentY: 0, contentSize: size }
  }

  // Create colored version
  const coloredSvg = svgTemplate.replace(
    />(?=<path|<polygon)/,
    ` fill="${color}">`
  )

  await drawSvgOnCanvas(ctx, coloredSvg, 0, 0, size, size)

  // Content areas are computed for the tight-viewBox rendering (xMidYMid meet).
  // map-pin  viewBox "5 2 14 20": scale=size/20, offsetX=0.15*size
  //   Pin head circle centre at orig(12,9), radius 7 → canvas centre (0.5s,0.35s), r=0.35s
  if (shape === 'map-pin') {
    const pinSize = size * 0.62
    const cx = (size - pinSize) / 2
    const cy = size * 0.035
    return { contentX: cx, contentY: cy, contentSize: pinSize }
  }
  // shield   viewBox "4 2 16 20": scale=size/20, offsetX=0.1*size
  //   Shield fills canvas height; inner body visible from y≈0 to y≈size.
  if (shape === 'shield') {
    const s = size * 0.58
    const cx = (size - s) / 2
    const cy = size * 0.18
    return { contentX: cx, contentY: cy, contentSize: s }
  }
  // badge    viewBox "2 2 20 20": fills canvas, centred at (0.5s,0.5s)
  const s = size * 0.56
  const c = (size - s) / 2
  return { contentX: c, contentY: c, contentSize: s }
}

// ── Logo renderer ─────────────────────────────────────────────────────────────

export interface LogoRenderResult {
  width: number
  height: number
}

/**
 * When a logo icon is synced to a favicon twin, reuse the favicon renderer at
 * native (or higher) resolution and downscale into the logo icon slot. This
 * matches favicon-tab sharpness better than re-drawing via drawIcon at the
 * smaller logo layout size.
 */
async function drawSyncedFaviconIcon(
  ctx: CanvasRenderingContext2D,
  faviconConfig: FaviconConfig,
  x: number,
  y: number,
  displaySize: number
): Promise<void> {
  const renderSize = Math.max(faviconConfig.size ?? 256, Math.ceil(displaySize))
  const off = document.createElement('canvas')
  off.width = renderSize
  off.height = renderSize
  await renderFavicon(off, { ...faviconConfig, size: renderSize })
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(off, x, y, displaySize, displaySize)
  ctx.restore()
}

export async function renderLogo(
  canvas: HTMLCanvasElement,
  config: LogoConfig,
  scale = 1,
  highQuality = false,
  faviconIconSource?: FaviconConfig | null
): Promise<LogoRenderResult> {
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const dpr = scale
  const { padding, gap, icon, text, secondaryText } = config
  const titleSubtitleGapPx = (config.titleSubtitleGap ?? 4) * dpr

  ctx.save()
  const primaryFont = `${config.fontItalic ? 'italic ' : ''}${config.fontWeight} ${config.fontSize * dpr}px "${config.fontFamily}", sans-serif`
  const secondaryFont = `${config.secondaryFontItalic ? 'italic ' : ''}${config.secondaryFontWeight} ${config.secondaryFontSize * dpr}px "${config.secondaryFontFamily}", sans-serif`

  // Use actualBoundingBoxRight for width (catches italic overhang).
  // For heights, split em-box metrics (for canvas sizing) from actual ink
  // metrics (for gap positioning) so that gap=0 means the ink of the two
  // lines are flush — no built-in leading between them.
  ctx.font = primaryFont
  const primarySp = (config.letterSpacing ?? 0) * dpr
  const pm = measureSpacedText(ctx, text, primarySp)
  const primaryW  = Math.max(pm.width, pm.actualBoundingBoxRight ?? pm.width)
  // Em-box height — used for canvas sizing (stable across different text content)
  const primaryEmH = (pm.fontBoundingBoxAscent ?? config.fontSize * dpr * 0.8)
                   + (pm.fontBoundingBoxDescent ?? config.fontSize * dpr * 0.2)
  // Actual ink extent above / below baseline — used for gap=0 "touching" positioning
  const primaryInkA = pm.actualBoundingBoxAscent  ?? pm.fontBoundingBoxAscent  ?? config.fontSize * dpr * 0.8
  const primaryInkD = pm.actualBoundingBoxDescent ?? pm.fontBoundingBoxDescent ?? config.fontSize * dpr * 0.2

  let secondaryW = 0
  let secondaryEmH  = 0
  let secondaryInkA = 0
  let secondaryInkD = 0
  const secondarySp = (config.secondaryLetterSpacing ?? 0) * dpr
  if (secondaryText) {
    ctx.font = secondaryFont
    const sm = measureSpacedText(ctx, secondaryText, secondarySp)
    secondaryW    = Math.max(sm.width, sm.actualBoundingBoxRight ?? sm.width)
    secondaryEmH  = (sm.fontBoundingBoxAscent ?? config.secondaryFontSize * dpr * 0.8)
                  + (sm.fontBoundingBoxDescent ?? config.secondaryFontSize * dpr * 0.2)
    secondaryInkA = sm.actualBoundingBoxAscent  ?? sm.fontBoundingBoxAscent  ?? config.secondaryFontSize * dpr * 0.8
    secondaryInkD = sm.actualBoundingBoxDescent ?? sm.fontBoundingBoxDescent ?? config.secondaryFontSize * dpr * 0.2
  }
  ctx.restore()

  const iconSize   = icon.visible ? icon.size * dpr : 0
  const textBlockW = Math.max(primaryW, secondaryW)
  // Canvas sizing uses em-box heights (stable, content-independent)
  const textBlockH = secondaryText
    ? primaryEmH + titleSubtitleGapPx + secondaryEmH
    : primaryEmH

  // drawIcon paints outer shadow on a *uniform* padded layer around the icon
  // box. Canvas margins must match that pad on every side — directional
  // (offset-only) pads under-allocate the opposite side and clip hexagon/etc.
  // shadows when offset X/Y pushes the fringe the other way.
  const hasShadow =
    icon.visible &&
    icon.shadowEnabled &&
    icon.containerEnabled &&
    icon.containerShape !== 'none'
  let iconShadowPadL = 0, iconShadowPadR = 0, iconShadowPadT = 0, iconShadowPadB = 0
  if (hasShadow) {
    const { pad: uniformPad } = iconOuterShadowPad(icon, iconSize)
    iconShadowPadL = uniformPad
    iconShadowPadR = uniformPad
    iconShadowPadT = uniformPad
    iconShadowPadB = uniformPad
  }

  // Text-shadow padding: expand the canvas so the text drop-shadow isn't clipped.
  // Folded into the per-side pads (max) so it works for either text placement.
  if (config.textShadowEnabled && (text || secondaryText)) {
    const b   = (config.textShadowBlur    ?? 0) * dpr
    const s   = (config.textShadowSpread  ?? 0) * dpr
    const tOx = (config.textShadowOffsetX ?? 0) * dpr
    const tOy = (config.textShadowOffsetY ?? 0) * dpr
    const ext = b * 1.5 + s
    iconShadowPadL = Math.max(iconShadowPadL, Math.ceil(Math.max(0, ext - tOx)) + 2)
    iconShadowPadR = Math.max(iconShadowPadR, Math.ceil(Math.max(0, ext + tOx)) + 2)
    iconShadowPadT = Math.max(iconShadowPadT, Math.ceil(Math.max(0, ext - tOy)) + 2)
    iconShadowPadB = Math.max(iconShadowPadB, Math.ceil(Math.max(0, ext + tOy)) + 2)
  }

  // ── Layout-dependent canvas sizing and element positions ──────────────────
  const layout = config.layout ?? 'icon-left'
  const hasText = !!(text || secondaryText)
  const gapPx  = icon.visible && hasText ? gap * dpr : 0

  let totalW: number, totalH: number
  let iconX: number, iconY: number
  let textX: number, textCenterY: number
  let textAlign: CanvasTextAlign = 'left'

  if (layout === 'icon-top') {
    // Vertical: icon centered above, text centered below
    const contentW = Math.max(iconSize, textBlockW)
    totalW = Math.ceil(padding * 2 * dpr + contentW + iconShadowPadL + iconShadowPadR)
    totalH = Math.ceil(padding * 2 * dpr + iconSize + gapPx + textBlockH + iconShadowPadT + iconShadowPadB)
    const ox = padding * dpr + iconShadowPadL
    const oy = padding * dpr + iconShadowPadT
    iconX  = ox + (contentW - iconSize) / 2
    iconY  = oy
    textX  = ox + contentW / 2
    textAlign    = 'center'
    textCenterY  = oy + iconSize + gapPx + textBlockH / 2
  } else {
    // Horizontal: icon-left (default) or icon-right
    const contentH = Math.max(iconSize, textBlockH)
    totalW = Math.ceil(
      padding * 2 * dpr + iconSize + gapPx + textBlockW + iconShadowPadL + iconShadowPadR
    )
    totalH = Math.ceil(padding * 2 * dpr + contentH + iconShadowPadT + iconShadowPadB)
    const ox = padding * dpr + iconShadowPadL
    const oy = padding * dpr + iconShadowPadT
    if (layout === 'icon-right' && icon.visible && hasText) {
      // Text left, icon right
      textX  = ox
      iconX  = ox + textBlockW + gapPx
    } else {
      // Icon left, text right (default)
      iconX  = ox
      textX  = ox + iconSize + gapPx
    }
    iconY       = oy + (contentH - iconSize) / 2
    textCenterY = oy + contentH / 2
  }

  canvas.width  = totalW
  canvas.height = totalH

  if (config.transparentBg) {
    ctx.clearRect(0, 0, totalW, totalH)
  } else {
    ctx.fillStyle = resolveCanvasColor(ctx, config.backgroundColor, 0, 0, totalW, totalH)
    ctx.fillRect(0, 0, totalW, totalH)
  }

  if (icon.visible && icon.shape !== 'none') {
    if (faviconIconSource) {
      await drawSyncedFaviconIcon(ctx, faviconIconSource, iconX, iconY, iconSize)
    } else {
      await drawIcon(ctx, icon, iconX, iconY, iconSize, highQuality ? 2 : 1)
    }
  }

  // ── Text rendering (ink-based positioning) ───────────────────────────────
  // All drawing uses textBaseline='alphabetic' so Y = the font's baseline.
  // Positions are derived from actualBoundingBox ink extents so that at
  // titleSubtitleGap=0 the bottom ink of the title exactly meets the top
  // ink of the subtitle — no hidden em-box leading is added.
  ctx.textAlign    = textAlign
  ctx.textBaseline = 'alphabetic'

  // Resolve each text line (baseline + ink extents) once, so the shadow pass and
  // the fill pass share identical positions.
  interface TextLine {
    text: string; font: string; color: string; w: number
    inkA: number; inkD: number; baseline: number; sizePx: number; underline: boolean
    letterSpacing: number
  }
  const lines: TextLine[] = []
  if (secondaryText) {
    const totalInkH  = primaryInkA + primaryInkD + titleSubtitleGapPx + secondaryInkA + secondaryInkD
    const inkTopY    = textCenterY - totalInkH / 2
    const baseline1  = inkTopY + primaryInkA
    const baseline2  = baseline1 + primaryInkD + titleSubtitleGapPx + secondaryInkA
    lines.push({ text, font: primaryFont, color: config.textColor, w: primaryW, inkA: primaryInkA, inkD: primaryInkD, baseline: baseline1, sizePx: config.fontSize * dpr, underline: !!config.fontUnderline, letterSpacing: primarySp })
    lines.push({ text: secondaryText, font: secondaryFont, color: config.secondaryTextColor, w: secondaryW, inkA: secondaryInkA, inkD: secondaryInkD, baseline: baseline2, sizePx: config.secondaryFontSize * dpr, underline: !!config.secondaryFontUnderline, letterSpacing: secondarySp })
  } else {
    const baseline = textCenterY + (primaryInkA - primaryInkD) / 2
    lines.push({ text, font: primaryFont, color: config.textColor, w: primaryW, inkA: primaryInkA, inkD: primaryInkD, baseline, sizePx: config.fontSize * dpr, underline: !!config.fontUnderline, letterSpacing: primarySp })
  }

  const tShadow = !!config.textShadowEnabled
  const tSpread = (config.textShadowSpread  ?? 0) * dpr
  const tBlur   = (config.textShadowBlur    ?? 0) * dpr
  const tOx     = (config.textShadowOffsetX ?? 0) * dpr
  const tOy     = (config.textShadowOffsetY ?? 0) * dpr
  const tColor  = firstSolidColor(config.textShadowColor || '#00000073')

  // Shadow pass. With spread we dilate each glyph (stroke, round joins) on an
  // offscreen layer, then cast only its CSS drop-shadow via the HUGE-offset
  // trick — mirroring the container/content spread technique. Without spread we
  // use the native canvas shadow directly while filling.
  if (tShadow && tSpread > 0) {
    const HUGE = 10000
    const shadowCanvas = document.createElement('canvas')
    shadowCanvas.width = totalW
    shadowCanvas.height = totalH
    const sc = shadowCanvas.getContext('2d')!
    sc.textAlign = textAlign
    sc.textBaseline = 'alphabetic'
    sc.fillStyle = '#000'
    sc.strokeStyle = '#000'
    sc.lineJoin = 'round'
    sc.lineWidth = tSpread * 2
    for (const ln of lines) {
      sc.font = ln.font
      strokeSpacedText(sc, ln.text, textX, ln.baseline, ln.letterSpacing)
      fillSpacedText(sc, ln.text, textX, ln.baseline, ln.letterSpacing)
      if (ln.underline) drawTextUnderline(sc, ln.text, textX, ln.baseline, ln.sizePx, '#000', textAlign === 'center' ? 'center' : 'left', 'alphabetic', ln.letterSpacing)
    }
    ctx.save()
    ctx.filter = `drop-shadow(${tOx + HUGE}px ${tOy + HUGE}px ${tBlur}px ${tColor})`
    ctx.drawImage(shadowCanvas, -HUGE, -HUGE)
    ctx.restore()
  } else if (tShadow) {
    ctx.shadowColor   = tColor
    ctx.shadowBlur    = tBlur
    ctx.shadowOffsetX = tOx
    ctx.shadowOffsetY = tOy
  }

  // Fill pass — draws the real (coloured) text.
  for (const ln of lines) {
    ctx.font      = ln.font
    ctx.fillStyle = resolveCanvasColor(ctx, ln.color, textX - ln.w / 2, ln.baseline - ln.inkA, ln.w, ln.inkA + ln.inkD)
    fillSpacedText(ctx, ln.text, textX, ln.baseline, ln.letterSpacing)
    if (ln.underline) {
      drawTextUnderline(ctx, ln.text, textX, ln.baseline, ln.sizePx, ln.color, textAlign === 'center' ? 'center' : 'left', 'alphabetic', ln.letterSpacing)
    }
  }

  // Reset shadow so it doesn't leak into anything drawn afterwards.
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0

  return { width: totalW, height: totalH }
}

// ── Favicon renderer ──────────────────────────────────────────────────────────

function clipSimpleShape(
  ctx: CanvasRenderingContext2D,
  shape: 'circle' | 'square' | 'rounded',
  size: number,
  borderWidth: number,
  radiusFraction = 0
): void {
  const inset = borderWidth / 2
  const s = size - inset * 2
  ctx.beginPath()
  switch (shape) {
    case 'circle':
      ctx.arc(size / 2, size / 2, s / 2, 0, Math.PI * 2)
      break
    case 'square':
      if (radiusFraction > 0) {
        roundedRect(ctx, inset, inset, s, s, s * Math.min(0.5, radiusFraction))
      } else {
        ctx.rect(inset, inset, s, s)
      }
      break
    case 'rounded': {
      const r = s * Math.min(0.5, radiusFraction)
      roundedRect(ctx, inset, inset, s, s, r)
      break
    }
  }
  ctx.closePath()
}

/**
 * Corner-radius fraction for the *outer* edge of a favicon shape that uses a
 * centered border stroke (square / rounded). Fill+stroke are drawn on a path
 * inset by borderWidth/2 with radius based on the inset size, so the outer
 * parallel curve has radius ≈ insetRadius + borderWidth/2. The shadow
 * silhouette must use that outer radius or a gap appears between a light
 * border and a light shadow at the curves.
 */
function faviconOuterEdgeRadiusFraction(config: FaviconConfig, size: number): number {
  const frac = Math.min(0.5, Math.max(0, (config.borderRadius ?? 0) / 256))
  const bw = Math.max(0, config.borderWidth ?? 0)
  if (
    bw <= 0 ||
    size <= 0 ||
    (config.outerShape !== 'square' && config.outerShape !== 'rounded')
  ) {
    return frac
  }
  const insetR = Math.max(0, size - bw) * frac
  return Math.min(0.5, (insetR + bw / 2) / size)
}

/**
 * Renders only the outer shape as a solid silhouette — no inner content.
 * Used as the shadow source so the shadow behaves like CSS box-shadow
 * (shadow of the container only, not the inner icon/text).
 */
async function renderFaviconOuterShapeOnly(
  ctx: CanvasRenderingContext2D,
  config: FaviconConfig,
  size: number
): Promise<void> {
  ctx.clearRect(0, 0, size, size)
  if (config.outerShape === 'none') return

  // Any opaque colour works — canvas shadow uses ctx.shadowColor, not the fill
  const solidColor = '#000000'

  if (config.outerShape === 'image' || config.outerShape === 'svg-markup') {
    // Treat the whole canvas as a solid rectangle shadow source
    ctx.fillStyle = solidColor
    ctx.fillRect(0, 0, size, size)
  } else if (config.outerShape in OUTER_SHAPE_SVGS) {
    const svgTemplate = OUTER_SHAPE_SVGS[config.outerShape]!
    const coloredSvg = svgTemplate.replace(/>(?=<path|<polygon)/, ` fill="${solidColor}">`)
    await drawSvgOnCanvas(ctx, coloredSvg, 0, 0, size, size)
  } else {
    // Match the outer edge of fill + centered border (not the fill-only radius).
    const radFrac = faviconOuterEdgeRadiusFraction(config, size)
    drawShape(ctx, config.outerShape as ShapeType, 0, 0, size, solidColor, radFrac)
  }
}

/**
 * Renders the favicon shape + content to `ctx` at (0,0) at `size×size`, without any shadow.
 * Used internally so the result can be composited with a shadow pass.
 * Paint overlays scale via applyPaintLayerDecorations at the target `size`.
 */
async function renderFaviconInner(
  ctx: CanvasRenderingContext2D,
  config: FaviconConfig,
  size: number
): Promise<void> {
  // Paint overlays scale via drawScaledPng in applyPaintLayerDecorations — render
  // live Inner at the target size so sizeRatio matches Paint (no upscale-then-shrink).
  await renderFaviconInnerAt(ctx, config, size)
}

async function renderFaviconInnerAt(
  ctx: CanvasRenderingContext2D,
  config: FaviconConfig,
  size: number
): Promise<void> {
  ctx.clearRect(0, 0, size, size)
  // Linked Paint text is composited via decorationsPng — skip live letters.
  const skipLiveLetters = shouldSkipLiveLettersForPaintSession(config.paintSession)
  const layeredPaint = sessionUsesLayeredPaint(config.paintSession)
  const paintOuterLayer = async () => {
    if (layeredPaint) {
      await applyPaintLayerDecorations(ctx, config.paintSession, 0, 0, size, 'container')
    }
  }
  const paintInnerLayer = async () => {
    if (layeredPaint) {
      await applyPaintLayerDecorations(ctx, config.paintSession, 0, 0, size, 'content')
    }
  }

  if (config.outerShape === 'none') {
    await drawFaviconContent(ctx, config.content, 0, 0, size, size / 2, skipLiveLetters)
    await paintInnerLayer()
    return
  }

  // ── Image outer shape ─────────────────────────────────────────────────────
  if (config.outerShape === 'image') {
    const imgRadFrac = (config.borderRadius ?? 0) / 256
    if (imgRadFrac > 0) {
      ctx.save()
      ctx.beginPath()
      roundedRect(ctx, 0, 0, size, size, size * Math.min(0.5, imgRadFrac))
      ctx.clip()
    }
    if (config.outerShapeImageDataUrl) {
      const img = await loadCachedImage(config.outerShapeImageDataUrl)
      if (img) ctx.drawImage(img, 0, 0, size, size)
    }
    await paintOuterLayer()
    await drawFaviconContent(ctx, config.content, 0, 0, size, size / 2, skipLiveLetters)
    await paintInnerLayer()
    if (imgRadFrac > 0) ctx.restore()
    return
  }

  // ── SVG-markup outer shape ────────────────────────────────────────────────
  if (config.outerShape === 'svg-markup') {
    if (config.outerShapeSvgMarkup) {
      const sizeRatio = config.outerShapeSvgSizeRatio ?? 1.0
      const svgSize = size * sizeRatio
      const scale = size / 256
      const ox = (config.outerShapeOffsetX ?? 0) * scale
      const oy = (config.outerShapeOffsetY ?? 0) * scale
      const dx = (size - svgSize) / 2 + ox
      const dy = (size - svgSize) / 2 + oy

      let svgToDraw = config.outerShapeSvgMarkup
      if (!(config.outerShapeSvgUseOriginalColors ?? false)) {
        svgToDraw = applySvgColor(
          svgToDraw,
          config.outerShapeSvgColor || '#ffffff',
          config.outerShapeSvgSecondaryColor || '',
          config.outerShapeSvgTertiaryColor || '',
          config.outerShapeSvgColor4 || '',
          config.outerShapeSvgColor5 || ''
        )
      }
      await drawSvgOnCanvas(ctx, svgToDraw, dx, dy, svgSize, svgSize)
    }
    await paintOuterLayer()
    await drawFaviconContent(ctx, config.content, 0, 0, size, size / 2, skipLiveLetters)
    await paintInnerLayer()
    return
  }

  // map-pin / shield / badge are true SVG-based shapes; hexagon and star are handled
  // by buildShapePath below (they are no longer in OUTER_SHAPE_SVGS).
  const isComplexSvgShape = config.outerShape in OUTER_SHAPE_SVGS

  if (isComplexSvgShape) {
    // ── Complex SVG shapes (map-pin, shield, badge) ───────────────────────────
    const fillColor = config.transparentBg ? 'transparent' : config.backgroundColor
    const { contentX, contentY, contentSize } = await drawComplexOuterShape(
      ctx, config.outerShape, fillColor, size
    )
    await paintOuterLayer()

    // Use the FULL canvas as the content reference area so that icon size ratios
    // match those of simple shapes (circle/square).  Compute the shape's visual
    // content-centre offset from the canvas centre and merge it with the user's
    // own offsetX/Y so the icon still lands inside the correct part of the shape.
    const shapeCx = contentX + contentSize / 2
    const shapeCy = contentY + contentSize / 2
    const shapeExtraOx = Math.round(shapeCx - size / 2)
    const shapeExtraOy = Math.round(shapeCy - size / 2)
    const c = config.content
    const adjustedContent = {
      ...c,
      offsetX: (c.offsetX ?? 0) + shapeExtraOx,
      offsetY: (c.offsetY ?? 0) + shapeExtraOy,
    }
    await drawFaviconContent(ctx, adjustedContent, 0, 0, size, size / 2, skipLiveLetters)
    await paintInnerLayer()

    // Border: use Path2D with clip-and-double so the stroke stays fully inside the shape.
    const bw = config.borderWidth ?? 0
    const borderCol = config.borderColor && config.borderColor !== 'transparent'
      ? config.borderColor : null
    const pathData = OUTER_SHAPE_BORDER_PATHS[config.outerShape]
    if (bw > 0 && borderCol && pathData) {
      // Mirror the xMidYMid meet transform the browser used when drawing the SVG,
      // so the Path2D border stroke lands exactly on top of the shape outline.
      const vb = SHAPE_TIGHT_VIEWBOXES[config.outerShape] ?? { x: 0, y: 0, w: 24, h: 24 }
      const { scale, tx, ty } = svgViewBoxTransform(vb, size)
      ctx.save()
      ctx.translate(tx, ty)
      ctx.scale(scale, scale)
      const path2d = new Path2D(pathData)
      ctx.clip(path2d)
      ctx.strokeStyle = borderCol
      ctx.lineWidth = (bw * 2) / scale
      ctx.stroke(path2d)
      ctx.restore()
    }
  } else {
    // ── circle / square / rounded / hexagon / star ────────────────────────────
    const fRadFrac = (config.borderRadius ?? 0) / 256
    const bw = config.borderWidth ?? 0
    const halfBorder = bw / 2
    const isSimple =
      config.outerShape === 'circle' ||
      config.outerShape === 'square' ||
      config.outerShape === 'rounded'

    // Build clip path inset by half the border so the fill + content stay inside
    // the visible edge of the border stroke.
    ctx.save()
    if (isSimple) {
      clipSimpleShape(ctx, config.outerShape, size, bw, fRadFrac)
    } else {
      // hexagon / star: shrink the bounding box uniformly by halfBorder so that
      // when the full-size border is stroked later the fill region sits inside it.
      buildShapePath(ctx, config.outerShape as ShapeType, halfBorder, halfBorder, size - bw, fRadFrac)
    }
    ctx.clip()
    if (!config.transparentBg) {
      ctx.fillStyle = resolveCanvasColor(ctx, config.backgroundColor, 0, 0, size, size)
      ctx.fill()
    }
    await paintOuterLayer()
    await drawFaviconContent(ctx, config.content, 0, 0, size, size / 2, skipLiveLetters)
    await paintInnerLayer()
    ctx.restore()

    if (bw > 0) {
      ctx.save()
      if (isSimple) {
        // clipSimpleShape already insets by borderWidth/2; stroke at full lineWidth
        clipSimpleShape(ctx, config.outerShape, size, bw, fRadFrac)
        ctx.strokeStyle = config.borderColor === 'transparent' ? '#000000' : config.borderColor
        ctx.lineWidth = bw
        ctx.stroke()
      } else {
        // clip-and-double: clip to the shape then use lineWidth×2 so only the
        // inner half is visible — the full border width shows, none bleeds outside.
        buildShapePath(ctx, config.outerShape as ShapeType, 0, 0, size, fRadFrac)
        ctx.clip()
        ctx.strokeStyle = config.borderColor === 'transparent' ? '#000000' : config.borderColor
        ctx.lineWidth = bw * 2
        buildShapePath(ctx, config.outerShape as ShapeType, 0, 0, size, fRadFrac)
        ctx.stroke()
      }
      ctx.restore()
    }
  }
}

/**
 * Fill the favicon outer-shape silhouette at (x,y,size).
 * Supports math shapes (circle/square/…) and Path2D SVG shapes (map-pin/shield/badge).
 * Returns false when the shape has no vector silhouette (none / image / svg-markup).
 */
function fillOuterShapeSilhouette(
  ctx: CanvasRenderingContext2D,
  shape: FaviconOuterShape,
  x: number,
  y: number,
  size: number,
  radiusFraction = 0
): boolean {
  const pathData = OUTER_SHAPE_BORDER_PATHS[shape]
  if (pathData) {
    const vb = SHAPE_TIGHT_VIEWBOXES[shape] ?? { x: 0, y: 0, w: 24, h: 24 }
    const { scale, tx, ty } = svgViewBoxTransform(vb, size)
    ctx.save()
    ctx.translate(x + tx, y + ty)
    ctx.scale(scale, scale)
    ctx.fill(new Path2D(pathData))
    ctx.restore()
    return true
  }
  if (
    shape === 'circle' || shape === 'square' || shape === 'rounded' ||
    shape === 'hexagon' || shape === 'star' || shape === 'triangle' ||
    shape === 'diamond' || shape === 'pentagon'
  ) {
    buildShapePath(ctx, shape as ShapeType, x, y, size, radiusFraction)
    ctx.fill()
    return true
  }
  return false
}

/**
 * Composites an inset (inner) box-shadow on top of an already-drawn favicon.
 * Works for math shapes and Path2D SVG containers (map-pin / shield / badge).
 *
 * Technique: build a padded "frame" (opaque everywhere except a shape-shaped hole),
 * CSS drop-shadow it so the shadow falls into the hole following alpha, then
 * keep only pixels inside the shape. The frame is drawn far off-screen so only
 * the coloured shadow is composited — never a solid black fill.
 */
async function applyFaviconInsetShadow(
  ctx: CanvasRenderingContext2D,
  config: FaviconConfig,
  x: number,
  y: number,
  size: number,
  shadowScale = 1
): Promise<void> {
  const shape = config.outerShape
  if (shape === 'none' || shape === 'image' || shape === 'svg-markup') return
  const iRadFrac = (config.borderRadius ?? 0) / 256

  const blur   = Math.max(0, (config.shadowBlur    ?? 12) * shadowScale)
  const ox     = (config.shadowOffsetX ?? 0)  * shadowScale
  const oy     = (config.shadowOffsetY ?? 4)  * shadowScale
  const spread = Math.max(0, (config.shadowSpread  ?? 0)  * shadowScale)
  const color  = firstSolidColor(config.shadowColor ?? '#00000073')
  const HUGE   = 10000

  // Pad the frame so its outer edge is far from the hole — otherwise a large
  // blur from the outer rect floods the entire interior with shadow.
  const pad = Math.ceil(blur * 2 + spread + Math.abs(ox) + Math.abs(oy) + 4)
  const frameW = size + pad * 2
  const frameH = size + pad * 2
  const frameCvs = document.createElement('canvas')
  frameCvs.width = frameW
  frameCvs.height = frameH
  const fCtx = frameCvs.getContext('2d')!
  fCtx.imageSmoothingEnabled = true
  fCtx.imageSmoothingQuality = 'high'
  fCtx.fillStyle = '#000000'
  fCtx.fillRect(0, 0, frameW, frameH)
  fCtx.globalCompositeOperation = 'destination-out'
  const holeSize = Math.max(1, size - spread * 2)
  const holeOff = pad + (size - holeSize) / 2
  fCtx.fillStyle = '#000000'
  if (!fillOuterShapeSilhouette(fCtx, shape, holeOff, holeOff, holeSize, iRadFrac)) return
  fCtx.globalCompositeOperation = 'source-over'

  // Frame drawn at (-HUGE - pad) so the hole aligns with (0,0) after the
  // (+HUGE) shadow offset — only the shadow (not the black frame) is visible.
  const insetCanvas = document.createElement('canvas')
  insetCanvas.width = size
  insetCanvas.height = size
  const iCtx = insetCanvas.getContext('2d')!
  iCtx.imageSmoothingEnabled = true
  iCtx.imageSmoothingQuality = 'high'
  iCtx.filter = `drop-shadow(${ox + HUGE}px ${oy + HUGE}px ${blur}px ${color})`
  iCtx.drawImage(frameCvs, -HUGE - pad, -HUGE - pad)
  iCtx.filter = 'none'

  // Keep shadow only inside the outer shape
  iCtx.globalCompositeOperation = 'destination-in'
  iCtx.fillStyle = '#000000'
  if (!fillOuterShapeSilhouette(iCtx, shape, 0, 0, size, iRadFrac)) return
  iCtx.globalCompositeOperation = 'source-over'

  ctx.drawImage(insetCanvas, x, y)
}

/** Side inset (each edge) when outer shadow shrinks the favicon shape inward. */
function faviconOuterShadowPad(config: FaviconConfig, canvasSize: number): number {
  const hasShadow = config.shadowEnabled && config.outerShape !== 'none'
  if (!hasShadow || (config.shadowInset ?? false)) return 0
  const shadowScale = canvasSize / 256
  const spread = (config.shadowSpread ?? 0) * shadowScale
  const sBlur = (config.shadowBlur ?? 12) * shadowScale
  const sOx = (config.shadowOffsetX ?? 0) * shadowScale
  const sOy = (config.shadowOffsetY ?? 4) * shadowScale
  const blurExtent = sBlur * 1.5
  const padL = Math.max(0, spread + blurExtent - sOx)
  const padR = Math.max(0, spread + blurExtent + sOx)
  const padT = Math.max(0, spread + blurExtent - sOy)
  const padB = Math.max(0, spread + blurExtent + sOy)
  return Math.ceil(Math.max(padL, padR, padT, padB)) + 2
}

/** Inner drawable size for favicon content (matches renderFavicon outer-shadow inset). */
export function faviconInnerDrawSize(config: FaviconConfig, canvasSize: number): number {
  if ((config.shadowInset ?? false) || config.outerShape === 'none') return canvasSize
  const shadowPad = faviconOuterShadowPad(config, canvasSize)
  if (shadowPad <= 0) return canvasSize
  return Math.max(16, canvasSize - shadowPad * 2)
}

/**
 * Bake Inner content for Paint at the same scale as the live favicon (shadow
 * inset), centered on a square paint-resolution canvas.
 */
export async function bakeFaviconPaintContentLayer(
  canvas: HTMLCanvasElement,
  config: FaviconConfig,
  content: FaviconConfig['content'],
  paintResolution = 512
): Promise<void> {
  const res = paintResolution
  const innerDraw = faviconInnerDrawSize(config, res)
  const innerX = Math.floor((res - innerDraw) / 2)
  const innerY = innerX
  const inner = document.createElement('canvas')
  inner.width = innerDraw
  inner.height = innerDraw
  await renderFavicon(inner, {
    ...config,
    size: innerDraw,
    paintSession: null,
    transparentBg: true,
    borderWidth: 0,
    borderColor: 'transparent',
    outerShape: 'none',
    outerShapeImageDataUrl: '',
    outerShapeSvgMarkup: '',
    shadowEnabled: false,
    content
  }).catch(() => {})
  canvas.width = res
  canvas.height = res
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, res, res)
  ctx.drawImage(inner, innerX, innerY, innerDraw, innerDraw)
}

export async function renderFavicon(canvas: HTMLCanvasElement, config: FaviconConfig): Promise<void> {
  const size = config.size           // canvas is ALWAYS this exact size
  const shadowInset = config.shadowInset ?? false
  const hasShadow = config.shadowEnabled && config.outerShape !== 'none'
  // Paint content layer: same inset as the container, but skip painting outer shadow.
  const drawOuterShadow = hasShadow && !config.shadowReserveOnly

  // Shadow values are configured at the 256px preview size.
  // Scale them proportionally so they look identical at any export resolution.
  const shadowScale = size / 256
  const spread = (config.shadowSpread  ?? 0)  * shadowScale
  const sBlur  = (config.shadowBlur    ?? 12) * shadowScale
  const sOx    = (config.shadowOffsetX ?? 0)  * shadowScale
  const sOy    = (config.shadowOffsetY ?? 4)  * shadowScale

  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, size, size)

  let decorX = 0
  let decorY = 0
  let decorSize = size

  if (shadowInset) {
    // ── INSET shadow ──────────────────────────────────────────────────────────
    // Canvas stays full-size. Favicon is drawn at full size, then the inset
    // shadow overlay is composited on top clipped to the shape interior.
    const offscreen = document.createElement('canvas')
    offscreen.width  = size
    offscreen.height = size
    const offCtxInset = offscreen.getContext('2d')!
    offCtxInset.imageSmoothingEnabled = true
    offCtxInset.imageSmoothingQuality = 'high'
    await renderFaviconInner(offCtxInset, config, size)
    ctx.drawImage(offscreen, 0, 0)

    if (drawOuterShadow) {
      await applyFaviconInsetShadow(ctx, config, 0, 0, size, shadowScale)
    }
  } else {
    // ── OUTER shadow ─────────────────────────────────────────────────────────
    // Canvas never changes size. Instead, the favicon shape shrinks inward so
    // the outer shadow fits entirely within the original size×size square.
    // shadowPad = amount to inset on each side (symmetric = 1:1 ratio preserved).
    const shadowPad = hasShadow ? faviconOuterShadowPad(config, size) : 0

    const innerSize = Math.max(16, size - shadowPad * 2)
    const innerX    = Math.floor((size - innerSize) / 2)
    const innerY    = Math.floor((size - innerSize) / 2)
    decorX = innerX
    decorY = innerY
    decorSize = innerSize

    // Render favicon at innerSize into an offscreen canvas
    const offscreen = document.createElement('canvas')
    offscreen.width  = innerSize
    offscreen.height = innerSize
    const offCtxOuter = offscreen.getContext('2d')!
    offCtxOuter.imageSmoothingEnabled = true
    offCtxOuter.imageSmoothingQuality = 'high'
    await renderFaviconInner(offCtxOuter, config, innerSize)

    if (drawOuterShadow) {
      // Shadow source: outer shape silhouette only (no inner content) so the
      // shadow behaves like CSS box-shadow, not a duplicate of the whole favicon.
      const shadowSrc = document.createElement('canvas')
      shadowSrc.width  = innerSize
      shadowSrc.height = innerSize
      const shadowSrcCtx = shadowSrc.getContext('2d')!
      shadowSrcCtx.imageSmoothingEnabled = true
      shadowSrcCtx.imageSmoothingQuality = 'high'
      await renderFaviconOuterShapeOnly(shadowSrcCtx, config, innerSize)

      // CSS filter drop-shadow follows the silhouette alpha (map-pin / shield /
      // badge). Canvas ctx.shadow* on drawImage(canvas) often shadows the
      // bounding box instead — which looks wrong for irregular outer shapes.
      // Off-canvas + HUGE offset keeps only the coloured shadow visible.
      const HUGE = 10000
      const shadowColor = firstSolidColor(config.shadowColor ?? '#00000073')
      const shadowLayer = document.createElement('canvas')
      shadowLayer.width = size
      shadowLayer.height = size
      const sCtx = shadowLayer.getContext('2d')!
      sCtx.imageSmoothingEnabled = true
      sCtx.imageSmoothingQuality = 'high'
      sCtx.filter = `drop-shadow(${sOx + HUGE}px ${sOy + HUGE}px ${sBlur}px ${shadowColor})`
      sCtx.drawImage(
        shadowSrc,
        innerX - spread - HUGE,
        innerY - spread - HUGE,
        innerSize + spread * 2,
        innerSize + spread * 2
      )
      sCtx.filter = 'none'

      // Erase shadow from INSIDE the favicon shape so it sits behind, not on top.
      // Shrink the punch slightly so the shadow tucks under the border's AA edge —
      // prevents a hairline gap between a light border and a light shadow.
      const punchInset = Math.min(1.25 * shadowScale, Math.max(0.5, innerSize * 0.004))
      sCtx.globalCompositeOperation = 'destination-out'
      sCtx.drawImage(
        shadowSrc,
        innerX + punchInset,
        innerY + punchInset,
        Math.max(1, innerSize - punchInset * 2),
        Math.max(1, innerSize - punchInset * 2)
      )
      sCtx.globalCompositeOperation = 'source-over'
      ctx.drawImage(shadowLayer, 0, 0)
    }

    // STEP 3 — draw the full favicon ON TOP of the (now clipped) shadow
    ctx.drawImage(offscreen, innerX, innerY)
  }

  // Legacy single-plane decorations only. Layered / overlay sessions are applied
  // inside renderFaviconInner (Outer under Inner).
  if (config.paintSession && !sessionUsesLayeredPaint(config.paintSession)) {
    await applyPaintDecorations(ctx, config.paintSession, decorX, decorY, decorSize)
  }
}

async function drawFaviconContent(
  ctx: CanvasRenderingContext2D,
  content: FaviconConfig['content'],
  areaX: number,
  areaY: number,
  areaSize: number,
  canvasCenter: number,
  skipLiveLetters = false
): Promise<void> {
  // Legacy svg-path (Path2D) case: coordinates live in the main canvas space,
  // so we cannot use the offscreen-canvas approach. Fall back to ctx.shadow*.
  if (content.type === 'svg') {
    if (content.contentShadowEnabled) {
      ctx.shadowColor   = firstSolidColor(content.contentShadowColor  ?? '#00000080')
      ctx.shadowBlur    = content.contentShadowBlur   ?? 8
      ctx.shadowOffsetX = content.contentShadowOffsetX ?? 0
      ctx.shadowOffsetY = content.contentShadowOffsetY ?? 3
    }
    if (content.svgPath) {
      // Path2D has no tight bbox here — scope gradient to the content area.
      ctx.fillStyle = resolveCanvasColor(
        ctx,
        content.svgColor,
        areaX, areaY, areaSize, areaSize
      )
      ctx.fill(new Path2D(content.svgPath))
    }
    if (content.contentShadowEnabled) {
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0
    }
    return
  }

  // For all other content types: draw to an offscreen canvas so that
  // ctx.drawImage(HTMLCanvasElement) with ctx.shadow* casts a per-pixel shadow
  // (follows alpha channel), not a rectangular-bounding-box shadow.
  const localCx = areaSize / 2 + (content.offsetX ?? 0)
  const localCy = areaSize / 2 + (content.offsetY ?? 0)

  const offscreen = document.createElement('canvas')
  offscreen.width  = areaSize
  offscreen.height = areaSize
  const offCtx = offscreen.getContext('2d')!
  offCtx.imageSmoothingEnabled = true
  offCtx.imageSmoothingQuality = 'high'

  let shapeDrawSize = 0  // captured for border re-use
  let iconDrawSize = 0
  // Optical center Y for letters — stored here so the border-stroke pass reuses it
  // without re-measuring the font a second time.
  let lettersDrawY = localCy

  switch (content.type) {
    case 'letters': {
      // Whitespace-only = intentional blank (paint layer split). Skip draw so a
      // space + underline cannot leave a stray dash on the outer-shape layer.
      // Linked Paint text is drawn via decorationsPng instead of live letters.
      if (skipLiveLetters) break
      const letterText = content.text ?? ''
      if (letterText.length > 0 && !letterText.trim()) break
      const fontSize = areaSize * content.fontSizeRatio
      const fontStyle = (content.fontItalic ?? false) ? 'italic ' : ''
      const letterSp = (content.letterSpacing ?? 0) * (areaSize / 256)
      offCtx.font = `${fontStyle}${content.fontWeight} ${fontSize}px "${content.fontFamily}", sans-serif`
      offCtx.fillStyle = resolveCanvasColor(offCtx, content.textColor, 0, 0, areaSize, areaSize)
      offCtx.textAlign = 'center'
      // Use 'alphabetic' baseline + actual bounding-box metrics so the VISIBLE
      // glyph bounds are centred at localCy, not the em-square midpoint.
      offCtx.textBaseline = 'alphabetic'
      const display = letterText || '?'
      const tm = measureSpacedText(offCtx, display, letterSp)
      lettersDrawY = localCy + (tm.actualBoundingBoxAscent - tm.actualBoundingBoxDescent) / 2
      fillSpacedText(offCtx, display, localCx, lettersDrawY, letterSp)
      if (content.fontUnderline ?? false) {
        drawTextUnderline(offCtx, display, localCx, lettersDrawY,
          fontSize, content.textColor, 'center', 'alphabetic', letterSp)
      }
      break
    }
    case 'shape': {
      shapeDrawSize = areaSize * content.shapeSizeRatio
      {
        const sx = localCx - shapeDrawSize / 2
        const sy = localCy - shapeDrawSize / 2
        const shapeRadFrac =
          content.shape === 'square' || content.shape === 'rounded'
            ? (content.shapeBorderRadius ?? 0) / 256
            : 0
        drawShape(
          offCtx,
          content.shape,
          sx, sy, shapeDrawSize,
          resolveCanvasColor(offCtx, content.shapeColor, sx, sy, shapeDrawSize, shapeDrawSize),
          shapeRadFrac
        )
      }
      break
    }
    case 'lucide': {
      iconDrawSize = areaSize * content.lucideSizeRatio
      const rawSvg = await renderLucideToSvg(content.lucideIconName, 'currentColor', content.lucideStrokeWidth)
      if (rawSvg) {
        const coloredSvg = applySvgColor(rawSvg, content.lucideColor)
        await drawSvgOnCanvas(offCtx, coloredSvg, localCx - iconDrawSize / 2, localCy - iconDrawSize / 2, iconDrawSize, iconDrawSize)
      }
      break
    }
    case 'svg-markup': {
      iconDrawSize = areaSize * content.svgMarkupSizeRatio
      if (content.svgMarkup) {
        const coloredSvg = content.svgMarkupUseOriginalColors
          ? content.svgMarkup
          : applySvgColor(content.svgMarkup, content.lucideColor, content.svgMarkupSecondaryColor, content.svgMarkupTertiaryColor, content.svgMarkupColor4, content.svgMarkupColor5)
        await drawSvgOnCanvas(offCtx, coloredSvg, localCx - iconDrawSize / 2, localCy - iconDrawSize / 2, iconDrawSize, iconDrawSize)
      }
      break
    }
    case 'image': {
      iconDrawSize = areaSize * (content.imageSizeRatio ?? 0.8)
      if (content.imageDataUrl) {
        const url = await resolveImageDataUrl(content)
        const img = await loadCachedImage(url)
        if (img) offCtx.drawImage(img, localCx - iconDrawSize / 2, localCy - iconDrawSize / 2, iconDrawSize, iconDrawSize)
      }
      break
    }
    case 'canva':
      break
  }

  // Content border / stroke.
  // Shapes use clip-and-double so the full borderWidth is visible inside the
  // shape for any geometry (hexagon, star, triangle, etc.).
  const cbw = (content.contentBorderWidth ?? 0) * (areaSize / 256)
  if (cbw > 0) {
    const cbc = (content.contentBorderColor ?? 'transparent') === 'transparent' ? '#000000' : content.contentBorderColor
    offCtx.save()
    offCtx.strokeStyle = cbc
    if (content.type === 'shape' && shapeDrawSize > 0) {
      const sx = localCx - shapeDrawSize / 2
      const sy = localCy - shapeDrawSize / 2
      const shapeRadFrac =
        content.shape === 'square' || content.shape === 'rounded'
          ? (content.shapeBorderRadius ?? 0) / 256
          : 0
      buildShapePath(offCtx, content.shape, sx, sy, shapeDrawSize, shapeRadFrac)
      offCtx.clip()
      offCtx.lineWidth = cbw * 2
      buildShapePath(offCtx, content.shape, sx, sy, shapeDrawSize, shapeRadFrac)
      offCtx.stroke()
    } else if (content.type === 'letters') {
      offCtx.lineWidth = cbw
      const fontSize = areaSize * content.fontSizeRatio
      const fontStyle = (content.fontItalic ?? false) ? 'italic ' : ''
      const letterSp = (content.letterSpacing ?? 0) * (areaSize / 256)
      offCtx.font = `${fontStyle}${content.fontWeight} ${fontSize}px "${content.fontFamily}", sans-serif`
      offCtx.textAlign = 'center'
      offCtx.textBaseline = 'alphabetic'
      strokeSpacedText(offCtx, content.text || '?', localCx, lettersDrawY, letterSp)
    } else if (iconDrawSize > 0) {
      offCtx.lineWidth = cbw
      const half = iconDrawSize / 2
      offCtx.strokeRect(localCx - half, localCy - half, iconDrawSize, iconDrawSize)
    }
    offCtx.restore()
  }

  // Composite offscreen content onto main canvas.
  // Use ctx.filter='drop-shadow(...)' — the only Canvas 2D method that follows
  // the actual alpha channel. ctx.shadow* + drawImage(canvas) shadows the
  // bounding rectangle in Chromium, always producing a blob regardless of content.
  if (content.contentShadowEnabled) {
    // Shadow controls are authored at the 256px preview size — scale with the
    // content area so blur/offset look the same at any export resolution.
    const cScale = areaSize / 256
    const cSpread = (content.contentShadowSpread ?? 0) * cScale
    const csx = (content.contentShadowOffsetX ?? 0) * cScale
    const csy = (content.contentShadowOffsetY ?? 3) * cScale
    const csb = (content.contentShadowBlur   ?? 8) * cScale
    const csc = firstSolidColor(content.contentShadowColor  ?? '#00000080')
    const isInset = content.contentShadowInset ?? false

    if (isInset) {
      // Inset shadow: padded frame with content hole → shadow-only overlay on content.
      const cW = areaSize
      const cH = areaSize
      const HUGE = 10000
      const pad = Math.ceil(csb * 2 + Math.max(cW, cH) + Math.abs(csx) + Math.abs(csy) + 4)

      const frameCanvas = document.createElement('canvas')
      frameCanvas.width  = cW + pad * 2
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
        fCtx.drawImage(offscreen, pad, pad)
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
      sCtx.drawImage(offscreen, 0, 0)
      sCtx.globalCompositeOperation = 'source-over'

      const insetCanvas = document.createElement('canvas')
      insetCanvas.width = cW
      insetCanvas.height = cH
      const iCtx = insetCanvas.getContext('2d')!
      iCtx.drawImage(offscreen, 0, 0)
      iCtx.drawImage(shadowCanvas, 0, 0)

      ctx.drawImage(insetCanvas, areaX, areaY)
    } else if (cSpread > 0) {
      // Spread: inflate source off-screen so only the CSS drop-shadow lands,
      // then draw clean original on top.
      const HUGE = 10000
      const spreadSize = areaSize + cSpread * 2
      const spreadCanvas = document.createElement('canvas')
      spreadCanvas.width  = spreadSize
      spreadCanvas.height = spreadSize
      const sCtx = spreadCanvas.getContext('2d')!
      sCtx.imageSmoothingEnabled = true
      sCtx.imageSmoothingQuality = 'high'
      sCtx.drawImage(offscreen, 0, 0, spreadSize, spreadSize)

      ctx.filter = `drop-shadow(${csx + HUGE}px ${csy + HUGE}px ${csb}px ${csc})`
      ctx.drawImage(spreadCanvas, areaX - cSpread - HUGE, areaY - cSpread - HUGE)
      ctx.filter = 'none'
      ctx.drawImage(offscreen, areaX, areaY)   // clean content on top
    } else {
      // No spread — per-pixel CSS drop-shadow.
      ctx.filter = `drop-shadow(${csx}px ${csy}px ${csb}px ${csc})`
      ctx.drawImage(offscreen, areaX, areaY)
      ctx.filter = 'none'
    }
  } else {
    ctx.drawImage(offscreen, areaX, areaY)
  }
}

// ── SVG generation ────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function generateLogoSvg(config: LogoConfig): Promise<string> {
  const { padding, gap, icon, text, secondaryText } = config

  const tmp = document.createElement('canvas')
  const ctx = tmp.getContext('2d')!
  ctx.font = `${config.fontItalic ? 'italic ' : ''}${config.fontWeight} ${config.fontSize}px "${config.fontFamily}", sans-serif`
  const pm = measureSpacedText(ctx, text, config.letterSpacing ?? 0)
  const primaryW = Math.max(pm.width, pm.actualBoundingBoxRight ?? pm.width)
  const primaryH = config.fontSize * 1.2

  let secondaryW = 0
  let secondaryH = 0
  if (secondaryText) {
    ctx.font = `${config.secondaryFontItalic ? 'italic ' : ''}${config.secondaryFontWeight} ${config.secondaryFontSize}px "${config.secondaryFontFamily}", sans-serif`
    const sm = measureSpacedText(ctx, secondaryText, config.secondaryLetterSpacing ?? 0)
    secondaryW = Math.max(sm.width, sm.actualBoundingBoxRight ?? sm.width)
    secondaryH = config.secondaryFontSize * 1.3
  }

  const iconSize = icon.visible ? icon.size : 0
  const textBlockW = Math.max(primaryW, secondaryW)
  const textBlockH = secondaryText ? primaryH + secondaryH : primaryH
  const w = Math.ceil(padding * 2 + iconSize + (icon.visible ? gap : 0) + textBlockW)
  const h = Math.ceil(padding * 2 + Math.max(iconSize, textBlockH))

  let bg = config.transparentBg ? '' : `<rect width="${w}" height="${h}" fill="${config.backgroundColor}"/>`

  let iconSvg = ''
  if (icon.visible) {
    if (icon.sourceType === 'lucide') {
      const rawSvg = await renderLucideToSvg(icon.lucideIconName, 'currentColor', icon.lucideStrokeWidth)
      const svgMarkup = applySvgColor(rawSvg, icon.primaryColor)
      if (svgMarkup) {
        const iy = padding + (Math.max(iconSize, textBlockH) - iconSize) / 2
        iconSvg = `<g transform="translate(${padding}, ${iy}) scale(${iconSize / 100})">${svgMarkup}</g>`
      }
    } else if (icon.sourceType === 'shape') {
      const iy = padding + (Math.max(iconSize, textBlockH) - iconSize) / 2
      const { defs, paint } = svgPaintFromCssColor(icon.primaryColor, 'logo-shape-fill')
      iconSvg = `${defs ? `<defs>${defs}</defs>` : ''}${shapeToSvgEl(icon.shape, padding, iy, iconSize, paint)}`
    } else if (icon.sourceType === 'svg' && icon.svgMarkup) {
      iconSvg = icon.svgMarkup
    } else if (icon.sourceType === 'image' && icon.imageDataUrl) {
      const iy = padding + (Math.max(iconSize, textBlockH) - iconSize) / 2
      const isr = icon.imageSizeRatio ?? 1
      const dim = iconSize * isr
      const ix = padding + (iconSize - dim) / 2
      const iyy = iy + (iconSize - dim) / 2
      const imgHref = await resolveImageDataUrl(icon)
      iconSvg = `<image href="${imgHref}" x="${ix}" y="${iyy}" width="${dim}" height="${dim}" preserveAspectRatio="xMidYMid meet"/>`
    }
  }

  const textX = padding + iconSize + (icon.visible ? gap : 0)
  const textCenterY = padding + Math.max(iconSize, textBlockH) / 2

  const primaryFontStyle    = config.fontItalic           ? ' font-style="italic"' : ''
  const primaryDecoration   = config.fontUnderline         ? ' text-decoration="underline"' : ''
  const primarySpacing      = (config.letterSpacing ?? 0) !== 0 ? ` letter-spacing="${config.letterSpacing ?? 0}"` : ''
  const secondaryFontStyle  = config.secondaryFontItalic   ? ' font-style="italic"' : ''
  const secondaryDecoration = config.secondaryFontUnderline ? ' text-decoration="underline"' : ''
  const secondarySpacing    = (config.secondaryLetterSpacing ?? 0) !== 0 ? ` letter-spacing="${config.secondaryLetterSpacing ?? 0}"` : ''

  let textSvg = ''
  if (secondaryText) {
    const totalTH = primaryH + secondaryH
    const startY = textCenterY - totalTH / 2 + config.fontSize
    textSvg = `
    <text x="${textX}" y="${startY}" font-family="${config.fontFamily}, sans-serif" font-size="${config.fontSize}" font-weight="${config.fontWeight}"${primaryFontStyle}${primaryDecoration}${primarySpacing} fill="${config.textColor}">${escapeXml(text)}</text>
    <text x="${textX}" y="${startY + primaryH}" font-family="${config.secondaryFontFamily}, sans-serif" font-size="${config.secondaryFontSize}" font-weight="${config.secondaryFontWeight}"${secondaryFontStyle}${secondaryDecoration}${secondarySpacing} fill="${config.secondaryTextColor}">${escapeXml(secondaryText)}</text>`
  } else {
    textSvg = `<text x="${textX}" y="${textCenterY}" dominant-baseline="middle" font-family="${config.fontFamily}, sans-serif" font-size="${config.fontSize}" font-weight="${config.fontWeight}"${primaryFontStyle}${primaryDecoration}${primarySpacing} fill="${config.textColor}">${escapeXml(text)}</text>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg}${iconSvg}${textSvg}</svg>`
}

export async function generateFaviconSvg(config: FaviconConfig): Promise<string> {
  const size = config.size
  const content = config.content
  const center = size / 2

  let outerEl = ''
  const fill = config.transparentBg ? 'none' : config.backgroundColor
  const stroke =
    config.borderWidth > 0 && config.borderColor !== 'transparent'
      ? ` stroke="${config.borderColor}" stroke-width="${config.borderWidth}"`
      : ''

  if (config.outerShape === 'none') {
    outerEl = '' // no background container
  } else if (config.outerShape in OUTER_SHAPE_SVGS) {
    // map-pin / shield / badge: embed SVG with fill + stroke
    const svgSrc = OUTER_SHAPE_SVGS[config.outerShape]!
    // stroke-width is in viewBox (0-24) units, scale from canvas pixels
    const svgStroke = config.borderWidth > 0 && config.borderColor !== 'transparent'
      ? ` stroke="${config.borderColor}" stroke-width="${(config.borderWidth * 2 * 24) / size}" paint-order="stroke fill"`
      : ''
    outerEl = svgSrc.replace(
      /viewBox="[^"]*"/,
      `viewBox="0 0 24 24" width="${size}" height="${size}"`
    ).replace(/<(path|polygon)/g, `<$1 fill="${fill}"${svgStroke}`)
  } else {
    const s = size - (config.borderWidth || 0)
    switch (config.outerShape) {
      case 'circle':
        outerEl = `<circle cx="${center}" cy="${center}" r="${s / 2}" fill="${fill}"${stroke}/>`
        break
      case 'square': {
        const r = s * Math.min(0.5, (config.borderRadius ?? 0) / 256)
        outerEl = `<rect x="${(config.borderWidth || 0) / 2}" y="${(config.borderWidth || 0) / 2}" width="${s}" height="${s}"${r > 0 ? ` rx="${r}"` : ''} fill="${fill}"${stroke}/>`
        break
      }
      case 'rounded': {
        const r = s * Math.min(0.5, (config.borderRadius ?? 0) / 256)
        outerEl = `<rect x="${(config.borderWidth || 0) / 2}" y="${(config.borderWidth || 0) / 2}" width="${s}" height="${s}" rx="${r}" fill="${fill}"${stroke}/>` 
        break
      }
      case 'hexagon':
      case 'triangle':
      case 'diamond':
      case 'pentagon':
      case 'star': {
        const half = (config.borderWidth || 0) / 2
        outerEl = shapeToSvgEl(
          config.outerShape as ShapeType,
          half,
          half,
          size - (config.borderWidth || 0) * 2,
          fill === 'none' ? 'none' : fill
        ).replace('/>', `${stroke}/>`)
        break
      }
    }
  }

  let innerEl = ''
  switch (content.type) {
    case 'letters': {
      const fs = size * content.fontSizeRatio
      const fStyle = (content.fontItalic ?? false) ? ' font-style="italic"' : ''
      const fDeco  = (content.fontUnderline ?? false) ? ' text-decoration="underline"' : ''
      const fSp    = (content.letterSpacing ?? 0) !== 0 ? ` letter-spacing="${(content.letterSpacing ?? 0) * (size / 256)}"` : ''
      innerEl = `<text x="${center}" y="${center}" text-anchor="middle" dominant-baseline="middle" font-family="${content.fontFamily}, sans-serif" font-size="${fs}" font-weight="${content.fontWeight}"${fStyle}${fDeco}${fSp} fill="${content.textColor}">${escapeXml(content.text || '?')}</text>`
      break
    }
    case 'shape': {
      const ss = size * content.shapeSizeRatio
      const { defs, paint } = svgPaintFromCssColor(content.shapeColor, 'favicon-shape-fill')
      const shapeRadFrac =
        content.shape === 'square' || content.shape === 'rounded'
          ? (content.shapeBorderRadius ?? 0) / 256
          : 0
      innerEl = `${defs ? `<defs>${defs}</defs>` : ''}${shapeToSvgEl(content.shape, center - ss / 2, center - ss / 2, ss, paint, shapeRadFrac)}`
      break
    }
    case 'lucide': {
      const is = size * content.lucideSizeRatio
      const rawSvg = await renderLucideToSvg(content.lucideIconName, 'currentColor', content.lucideStrokeWidth)
      if (rawSvg) {
        const svgMarkup = applySvgColor(rawSvg, content.lucideColor)
        innerEl = `<g transform="translate(${center - is / 2}, ${center - is / 2}) scale(${is / 100})">${svgMarkup}</g>`
      }
      break
    }
    case 'svg-markup': {
      if (content.svgMarkup) {
        const is = size * content.svgMarkupSizeRatio
        const colored = content.svgMarkupUseOriginalColors
          ? content.svgMarkup
          : applySvgColor(content.svgMarkup, content.lucideColor, content.svgMarkupSecondaryColor, content.svgMarkupTertiaryColor, content.svgMarkupColor4, content.svgMarkupColor5)
        innerEl = `<g transform="translate(${center - is / 2}, ${center - is / 2})">${colored}</g>`
      }
      break
    }
    case 'svg': {
      if (content.svgPath) {
        const { defs, paint } = svgPaintFromCssColor(content.svgColor, 'favicon-svg-path-fill')
        innerEl = `${defs ? `<defs>${defs}</defs>` : ''}<path d="${content.svgPath}" fill="${paint}"/>`
      }
      break
    }
    case 'image': {
      if (content.imageDataUrl) {
        const is = size * (content.imageSizeRatio ?? 0.8)
        const imgHref = await resolveImageDataUrl(content)
        innerEl = `<image href="${imgHref}" x="${center - is / 2}" y="${center - is / 2}" width="${is}" height="${is}" preserveAspectRatio="xMidYMid meet"/>`
      }
      break
    }
    case 'canva':
      break
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${outerEl}${innerEl}</svg>`
}

function shapeToSvgEl(shape: ShapeType, x: number, y: number, size: number, fill: string, radiusFraction = 0): string {
  switch (shape) {
    case 'circle':
      return `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2}" fill="${fill}"/>`
    case 'square': {
      const r = size * Math.min(0.5, Math.max(0, radiusFraction))
      return r > 0
        ? `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="${fill}"/>`
        : `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}"/>`
    }
    case 'rounded': {
      const r = size * Math.min(0.5, radiusFraction)
      return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="${fill}"/>`
    }
    case 'hexagon': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6
        return `${x + size / 2 + (size / 2) * Math.cos(a)},${y + size / 2 + (size / 2) * Math.sin(a)}`
      }).join(' ')
      return `<polygon points="${pts}" fill="${fill}"/>`
    }
    case 'triangle':
      return `<polygon points="${x + size / 2},${y} ${x + size},${y + size} ${x},${y + size}" fill="${fill}"/>`
    case 'diamond':
      return `<polygon points="${x + size / 2},${y} ${x + size},${y + size / 2} ${x + size / 2},${y + size} ${x},${y + size / 2}" fill="${fill}"/>`
    case 'pentagon': {
      const pts = Array.from({ length: 5 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2
        return `${x + size / 2 + (size / 2) * Math.cos(a)},${y + size / 2 + (size / 2) * Math.sin(a)}`
      }).join(' ')
      return `<polygon points="${pts}" fill="${fill}"/>`
    }
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = (Math.PI * i) / 5 - Math.PI / 2
        const r = i % 2 === 0 ? size / 2 : size / 4.5
        return `${x + size / 2 + r * Math.cos(a)},${y + size / 2 + r * Math.sin(a)}`
      }).join(' ')
      return `<polygon points="${pts}" fill="${fill}"/>`
    }
    default:
      return ''
  }
}
