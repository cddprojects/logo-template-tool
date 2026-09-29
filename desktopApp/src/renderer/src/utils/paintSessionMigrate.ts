/**
 * Lightweight paint-session normalization for workspace load / import.
 *
 * Kept free of paintSettingsSync / renderer / paintHelpers so App boot
 * (useVersions) cannot hit a circular-import black screen.
 *
 * ADDITIVE ONLY. Never clear save-time flags such as contentBakedInDecorations
 * or linkedTextInDecorations — clearing them re-enables live destination-out
 * punch on the main canvas and erases Outer + Inner together.
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

/**
 * Fill missing fields / stamp version:1 so older templates load.
 * Does not rewrite bake flags, overlays-only, or vectors.
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

  // Infer hasContainer when Outer overlay / decorations exist but flag was omitted.
  if (
    !session.hasContainer &&
    !!(session.containerPng || session.containerDecorationsPng)
  ) {
    session = { ...session, hasContainer: true }
  }

  // One-time repair for workspaces damaged by destructive migrate (8de6359–883b7d5):
  // those builds cleared contentBakedInDecorations, which re-enabled live
  // destination-out punch and erased Outer+Inner. Restore the flag only when
  // see-through hole payload still on the session proves Save had baked Inner.
  if (!session.contentBakedInDecorations) {
    const hasSeeThroughPayload = (session.vectors ?? []).some(
      (v) =>
        (v.layer ?? 'content') === 'content' &&
        (v.visible ?? v.editable ?? true) !== false &&
        (!!v.seeThroughHoleMaskPng || v.holeMaskMode === 'see-through')
    )
    if (hasSeeThroughPayload) {
      session = { ...session, contentBakedInDecorations: true }
    }
  }

  return session
}

/** True when Paint open/restore should use overlays / vectors from this session. */
export function paintSessionIsUsable(
  session: PaintSession | null | undefined
): session is PaintSession {
  return !!migratePaintSession(session)
}
