/**
 * Lightweight paint-session migration for workspace load / import.
 *
 * Kept free of paintSettingsSync / renderer / paintHelpers so App boot
 * (useVersions) cannot hit a circular-import black screen.
 *
 * Rule of thumb: prefer live Inner (pre-migration behavior). Only keep
 * contentBakedInDecorations when a concrete bake reason still exists on
 * the session — stale flags are what blanked logo/favicon icons.
 */
import type { PaintSession, PaintVector } from '../types'
import { reshapeIsApplied } from './paintReshape'

function looksLikePaintSession(raw: Record<string, unknown>): boolean {
  return (
    typeof raw.containerPng === 'string' ||
    typeof raw.contentPng === 'string' ||
    typeof raw.decorationsPng === 'string' ||
    typeof raw.containerDecorationsPng === 'string' ||
    typeof raw.contentDecorationsPng === 'string' ||
    typeof raw.contentFrontPng === 'string' ||
    (Array.isArray(raw.vectors) && raw.vectors.length > 0) ||
    (Array.isArray(raw.punchMasks) && raw.punchMasks.length > 0) ||
    typeof raw.resolution === 'number'
  )
}

function sessionHasLayeredDecorations(session: PaintSession): boolean {
  return !!(
    session.containerDecorationsPng ||
    session.contentDecorationsPng ||
    session.contentAboveDecorationsPng ||
    session.contentBelowDecorationsPng
  )
}

function isTransparentPaintColor(color: string): boolean {
  if (!color || color === 'transparent' || color === 'none') return true
  if (color.startsWith('linear-gradient') || color.startsWith('radial-gradient')) return false
  if (/^#[0-9a-fA-F]{8}$/.test(color) && color.slice(7, 9).toLowerCase() === '00') return true
  return false
}

function isContentLayerVisible(v: PaintVector): boolean {
  return (v.layer ?? 'content') === 'content' && (v.visible ?? v.editable ?? true) !== false
}

/** Raster-edited Inner photo/stamp that replaces live pixels. */
export function sessionHasRasterEditedInner(session: PaintSession): boolean {
  return (session.vectors ?? []).some(
    (v) =>
      !!v.rasterEdited &&
      !!v.imageDataUrl &&
      !v.brushLayer &&
      !!(
        v.contentBound ||
        v.contentProxySlot ||
        v.imageSourceDataUrl ||
        (v.type === 'stamp' && v.name === 'Inner content')
      ) &&
      !!v.pts &&
      v.pts.length >= 2
  )
}

/** See-through / hole bake that must hide live Inner or Outer shows solid again. */
export function sessionHasSeeThroughBakeReason(session: PaintSession): boolean {
  return (session.vectors ?? []).some((v) => {
    if (!isContentLayerVisible(v)) return false
    if (v.punchThrough) return false
    return (
      !!v.punchEnclosedHole ||
      !!v.punchMask ||
      !!v.seeThroughHoleMaskPng ||
      v.holeMaskMode === 'see-through' ||
      isTransparentPaintColor(v.color ?? '')
    )
  })
}

/** Warped Inner proxy bake — live unwarped content would cover it. */
export function sessionHasReshapeBakeReason(session: PaintSession): boolean {
  return (session.vectors ?? []).some(
    (v) =>
      isContentLayerVisible(v) &&
      !!(v.contentBound || v.contentProxySlot) &&
      reshapeIsApplied(v.reshapeQuad, v.reshapeSrc)
  )
}

/**
 * Library stamp/shape replaced live Inner (no content proxy / linked letters).
 * Matches IconPaintEditor bakeContentProxy “replacement” branch.
 */
export function sessionHasReplacementInnerBakeReason(session: PaintSession): boolean {
  const vectors = session.vectors ?? []
  const hasLiveStandIn = vectors.some(
    (v) =>
      !!v.contentBound ||
      !!v.contentProxySlot ||
      (v.type === 'text' && !!v.linkedOutsideText)
  )
  if (hasLiveStandIn) return false
  return vectors.some((v) => {
    if (!isContentLayerVisible(v)) return false
    if (v.contentProxySlot || v.contentBound || v.brushLayer) return false
    if (v.imageSourceDataUrl || (v.type === 'stamp' && v.name === 'Inner content')) return false
    return (
      v.type === 'stamp' ||
      v.type === 'shape' ||
      v.type === 'poly' ||
      v.type === 'drawn' ||
      v.type === 'text'
    )
  })
}

/** True when skipping live Inner is required for a real Paint bake. */
export function sessionHasProvenInnerBakeReason(session: PaintSession): boolean {
  if (sessionHasRasterEditedInner(session)) return true
  if (!session.contentBakedInDecorations) return false
  if (session.paintOverlaysOnly) return false
  if (
    !session.contentDecorationsPng &&
    !session.contentAboveDecorationsPng
  ) {
    return false
  }
  if (
    session.contentDecorationsPng &&
    session.contentPng &&
    session.contentDecorationsPng === session.contentPng
  ) {
    return false
  }
  return (
    sessionHasSeeThroughBakeReason(session) ||
    sessionHasReshapeBakeReason(session) ||
    sessionHasReplacementInnerBakeReason(session)
  )
}

/**
 * Normalize a paint session from older templates / imports.
 * Stamps `version: 1`, fills missing PNG fields, clears stale bake flags, and
 * infers `paintOverlaysOnly` so layered preview/Paint restore can run.
 *
 * Does not rewrite contentBound proxies (that needs paintSettingsSync) — editors
 * still run sanitizePaintSessionProxies on open/save.
 */
export function migratePaintSession(raw: unknown): PaintSession | null {
  if (raw == null || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (!looksLikePaintSession(s)) return null

  const resolution = Math.max(1, Math.round(Number(s.resolution) || 512))
  const layerOrder =
    Array.isArray(s.layerOrder) && s.layerOrder.length === 2
      ? (s.layerOrder as PaintSession['layerOrder'])
      : (['content', 'container'] as PaintSession['layerOrder'])

  let session: PaintSession = {
    version: 1,
    resolution,
    containerPng: typeof s.containerPng === 'string' ? s.containerPng : '',
    contentPng: typeof s.contentPng === 'string' ? s.contentPng : '',
    vectors: Array.isArray(s.vectors) ? (s.vectors as PaintVector[]) : [],
    hasContainer: !!s.hasContainer,
    layerOrder,
    paintOverlaysOnly: typeof s.paintOverlaysOnly === 'boolean' ? s.paintOverlaysOnly : undefined,
    decorationsPng: typeof s.decorationsPng === 'string' ? s.decorationsPng : undefined,
    containerDecorationsPng:
      typeof s.containerDecorationsPng === 'string' ? s.containerDecorationsPng : undefined,
    contentDecorationsPng:
      typeof s.contentDecorationsPng === 'string' ? s.contentDecorationsPng : undefined,
    contentAboveDecorationsPng:
      typeof s.contentAboveDecorationsPng === 'string' ? s.contentAboveDecorationsPng : undefined,
    contentBelowDecorationsPng:
      typeof s.contentBelowDecorationsPng === 'string' ? s.contentBelowDecorationsPng : undefined,
    contentFrontPng: typeof s.contentFrontPng === 'string' ? s.contentFrontPng : undefined,
    linkedTextInDecorations:
      typeof s.linkedTextInDecorations === 'boolean' ? s.linkedTextInDecorations : undefined,
    contentBakedInDecorations:
      typeof s.contentBakedInDecorations === 'boolean' ? s.contentBakedInDecorations : undefined,
    paintShapeSize: typeof s.paintShapeSize === 'number' ? s.paintShapeSize : undefined,
    paintContentDrawSize:
      typeof s.paintContentDrawSize === 'number' ? s.paintContentDrawSize : undefined,
    paintContentSizeRatio:
      typeof s.paintContentSizeRatio === 'number' ? s.paintContentSizeRatio : undefined,
    punchMasks: Array.isArray(s.punchMasks)
      ? (s.punchMasks as PaintSession['punchMasks'])
      : undefined,
    contentSync:
      s.contentSync && typeof s.contentSync === 'object'
        ? (s.contentSync as PaintSession['contentSync'])
        : undefined
  }

  if (
    session.paintOverlaysOnly === undefined &&
    !!(session.containerPng || session.contentPng) &&
    !session.decorationsPng &&
    !sessionHasLayeredDecorations(session)
  ) {
    session = { ...session, paintOverlaysOnly: true }
  }

  if (
    !session.hasContainer &&
    !!(session.containerPng || session.containerDecorationsPng)
  ) {
    session = { ...session, hasContainer: true }
  }

  // Drop stale bake flags — live Inner must win unless a real bake reason remains.
  if (session.contentBakedInDecorations && !sessionHasProvenInnerBakeReason(session)) {
    session = {
      ...session,
      contentBakedInDecorations: false
    }
  }

  if (
    session.linkedTextInDecorations &&
    !session.decorationsPng &&
    !session.contentDecorationsPng
  ) {
    session = { ...session, linkedTextInDecorations: false }
  }

  return session
}

/** True when Paint open/restore should use overlays / vectors from this session. */
export function paintSessionIsUsable(
  session: PaintSession | null | undefined
): session is PaintSession {
  return !!migratePaintSession(session)
}
