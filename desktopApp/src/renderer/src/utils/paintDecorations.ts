import type { OutsideTextSettings, PaintLayerId, PaintSession, PaintVector } from '../types'
import { loadCachedImage } from './iconUtils'
import { isContentProxyVector, stripContentProxyVectors } from './paintSettingsSync'
import {
  contentVectorsForLiveRender,
  linkedTextHasPaintTransform,
  renderPaintContentVectors
} from './paintVectorRender'

/** True when a session still carries an ephemeral Inner content proxy. */
export function sessionHasContentProxy(
  session: PaintSession | null | undefined
): boolean {
  return !!session?.vectors?.some(isContentProxyVector)
}

/** True when Paint saved a linked Inner letters vector. */
export function sessionHasLinkedOutsideText(
  session: PaintSession | null | undefined
): boolean {
  return !!session?.vectors?.some((v) => v.type === 'text' && v.linkedOutsideText)
}

/** True when session has per-layer decoration planes (Outer under Inner). */
export function sessionHasLayeredDecorations(
  session: PaintSession | null | undefined
): boolean {
  return !!(session?.containerDecorationsPng || session?.contentDecorationsPng)
}

/**
 * True when Outer/Inner paint must be interleaved (Outer under Inner).
 * Includes overlay-only sessions after a content-type switch, which clears the
 * combined decorations flatten but keeps containerPng / contentPng.
 */
export function sessionUsesLayeredPaint(
  session: PaintSession | null | undefined
): boolean {
  if (!session || session.version !== 1) return false
  if (sessionHasLayeredDecorations(session)) return true
  if (session.paintOverlaysOnly && (session.containerPng || session.contentPng)) return true
  return false
}

/**
 * Paint-session resolution to composite at (live + overlays 1:1), or null.
 * Outside must rasterize at this size then scale, otherwise live vector edges
 * misalign with Fill overlays and old outlines reappear.
 */
export function paintCompositeResolution(
  session: PaintSession | null | undefined
): number | null {
  if (!session || session.version !== 1) return null
  const res = Math.max(0, session.resolution || 0)
  if (res < 1) return null
  if (sessionUsesLayeredPaint(session)) return res
  if (session.decorationsPng || session.containerPng || session.contentPng) return res
  if ((session.vectors?.length ?? 0) > 0) return res
  return null
}

/**
 * Live letters draw outside from current settings unless Paint owns the glyphs
 * (baked in decorations, or transformed linked text vectors rendered live).
 */
export function shouldSkipLiveLettersForPaintSession(
  session: PaintSession | null | undefined
): boolean {
  if (!session || !sessionHasLinkedOutsideText(session)) return false
  if (session.linkedTextInDecorations) return true
  return (session.vectors ?? []).some(linkedTextHasPaintTransform)
}

function shouldRenderContentVectorsLive(session: PaintSession): boolean {
  if (session.linkedTextInDecorations) return false
  return contentVectorsForLiveRender(session.vectors).length > 0
}

/**
 * When outside Inner letters settings change, keep the paint session's linked
 * text vector in sync and stop using decorations that baked the old glyphs
 * (so the live letters preview updates immediately).
 */
export function syncOutsideLettersIntoPaintSession(
  session: PaintSession | null | undefined,
  letters: OutsideTextSettings
): PaintSession | null | undefined {
  if (!session || session.version !== 1) return session
  const res = Math.max(1, session.resolution || 512)
  const weight = parseInt(String(letters.fontWeight ?? '700'), 10)
  const w = Number.isFinite(weight) ? Math.max(100, Math.min(900, weight)) : 700
  const fontSize = Math.max(4, Math.round(res * (letters.fontSizeRatio ?? 0.52)))
  const letterSpacing = (letters.letterSpacing ?? 0) * (res / 256)

  const vectors: PaintVector[] = (session.vectors ?? []).map((v) => {
    if (v.type !== 'text' || !v.linkedOutsideText) return v
    return {
      ...v,
      text: letters.text ?? '',
      color: letters.textColor || v.color || '#ffffff',
      fontFamily: letters.fontFamily || v.fontFamily || 'Inter',
      fontSize,
      weight: w,
      bold: w >= 700,
      italic: !!letters.fontItalic,
      letterSpacing
    }
  })

  const hadLinkedInDecor = !!session.linkedTextInDecorations
  return {
    ...session,
    vectors,
    linkedTextInDecorations: false,
    // Drop flat decorations that still contain old linked glyphs (stale color/transform).
    decorationsPng: hadLinkedInDecor ? undefined : session.decorationsPng,
    containerDecorationsPng: hadLinkedInDecor ? undefined : session.containerDecorationsPng,
    contentDecorationsPng: hadLinkedInDecor ? undefined : session.contentDecorationsPng
  }
}

async function drawScaledPng(
  ctx: CanvasRenderingContext2D,
  dataUrl: string | undefined,
  x: number,
  y: number,
  size: number,
  res: number
): Promise<void> {
  if (!dataUrl) return
  const img = await loadCachedImage(dataUrl)
  if (!img) return
  const scale = size / res
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0, res, res)
  ctx.restore()
}

async function drawOverlayLayers(
  ctx: CanvasRenderingContext2D,
  session: PaintSession,
  x: number,
  y: number,
  size: number
): Promise<void> {
  const res = Math.max(1, session.resolution || size)
  await drawScaledPng(ctx, session.containerPng, x, y, size, res)
  await drawScaledPng(ctx, session.contentPng, x, y, size, res)
}

/**
 * Draw one paint layer's decorations (overlay + vectors flatten) at the correct
 * z-slot: Outer after live Outer / before Inner; Inner after live Inner.
 */
export async function applyPaintLayerDecorations(
  ctx: CanvasRenderingContext2D,
  session: PaintSession | null | undefined,
  x: number,
  y: number,
  size: number,
  layer: PaintLayerId
): Promise<void> {
  if (!session || size <= 0) return
  const res = Math.max(1, session.resolution || size)

  if (sessionHasContentProxy(session)) {
    // Proxies: overlays only until next Paint save regenerates decorations.
    const png = layer === 'container' ? session.containerPng : session.contentPng
    await drawScaledPng(ctx, png, x, y, size, res)
    return
  }

  const layeredPng =
    layer === 'container' ? session.containerDecorationsPng : session.contentDecorationsPng
  if (layeredPng) {
    await drawScaledPng(ctx, layeredPng, x, y, size, res)
  } else {
    // Pre-layered sessions: fall back to raw overlay for this layer only.
    const overlay = layer === 'container' ? session.containerPng : session.contentPng
    await drawScaledPng(ctx, overlay, x, y, size, res)
  }

  if (layer === 'content' && shouldRenderContentVectorsLive(session)) {
    ctx.save()
    const scale = size / res
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    renderPaintContentVectors(ctx, session.vectors)
    ctx.restore()
  }
}

/**
 * Draw paint decorations (overlays + vectors flatten) on top of a live-rendered
 * icon/favicon. Prefers layered planes when present; else legacy `decorationsPng`.
 * When `linkedTextInDecorations` is set (legacy), live letters are skipped by
 * the renderer instead — decorations keep the baked glyphs until migrated.
 */
export async function applyPaintDecorations(
  ctx: CanvasRenderingContext2D,
  session: PaintSession | null | undefined,
  x: number,
  y: number,
  size: number
): Promise<void> {
  if (!session || size <= 0) return

  // Layered / overlay-only sessions are applied by the renderer between Outer
  // and Inner — never flatten both planes on top (that put Outer Fill above Inner).
  if (sessionUsesLayeredPaint(session)) return

  // Legacy bug: contentBound raster proxies were sometimes flattened into
  // decorationsPng while live Inner settings still drew — causing doubles.
  // Prefer overlays only until the next Paint save regenerates decorations.
  if (sessionHasContentProxy(session)) {
    // Still interleaved by the renderer when paintOverlaysOnly; otherwise top.
    if (session.paintOverlaysOnly) return
    await drawOverlayLayers(ctx, session, x, y, size)
    return
  }

  // New saves: decorations omit linked text; live letters draw underneath/above.
  if (session.decorationsPng && !session.linkedTextInDecorations) {
    const img = await loadCachedImage(session.decorationsPng)
    if (img) ctx.drawImage(img, x, y, size, size)
    return
  }

  // Legacy: decorations include linked text — draw them (renderer skips live letters).
  if (session.decorationsPng && session.linkedTextInDecorations) {
    const img = await loadCachedImage(session.decorationsPng)
    if (img) ctx.drawImage(img, x, y, size, size)
    return
  }

  await drawOverlayLayers(ctx, session, x, y, size)
}

/** Remove persisted contentBound proxies from a session (safe to call on load/save). */
export function sanitizePaintSessionProxies(
  session: PaintSession | null | undefined
): PaintSession | null | undefined {
  if (!session || session.version !== 1) return session
  if (!sessionHasContentProxy(session)) return session
  return {
    ...session,
    vectors: stripContentProxyVectors(session.vectors),
    // Drop flatten that may still include the proxy raster.
    decorationsPng: undefined,
    containerDecorationsPng: undefined,
    contentDecorationsPng: undefined
  }
}
