/**
 * Lightweight paint-session migration for workspace load / import.
 *
 * Kept free of paintSettingsSync / renderer / paintHelpers so App boot
 * (useVersions) cannot hit a circular-import black screen.
 */
import type { PaintSession, PaintVector } from '../types'

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

  // Stale bake flags that blank the canvas on older templates.
  if (
    session.contentBakedInDecorations &&
    (!session.contentDecorationsPng ||
      (session.contentPng && session.contentDecorationsPng === session.contentPng))
  ) {
    session = {
      ...session,
      contentBakedInDecorations: false,
      linkedTextInDecorations: false
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
