import type { OutsideTextSettings, PaintLayerId, PaintSession, PaintVector } from '../types'
import { loadCachedImage } from './iconUtils'
import { outsideShadowToPaintVector, isContentProxyVector, outsideTextAnchorPt, stripContentProxyVectors } from './paintSettingsSync'
import {
  compositeInnerContentDecor,
  contentVectorsForLiveRender,
  linkedTextHasPaintTransform,
  renderPaintContentVectors,
  renderPaintTextVector,
  type InnerContentDecor
} from './paintVectorRender'
import { takeCanvas, releaseCanvas } from './canvasPool'

export type { InnerContentDecor }

function isTransparentPaintColor(color: string): boolean {
  if (!color || color === 'transparent' || color === 'none') return true
  if (color.startsWith('linear-gradient') || color.startsWith('radial-gradient')) return false
  if (/^#[0-9a-fA-F]{8}$/.test(color) && color.slice(7, 9).toLowerCase() === '00') return true
  return false
}

/** Decode a data-URL image synchronously when the engine already has it ready. */
function loadDataUrlImageSync(src: string | undefined): HTMLImageElement | null {
  if (!src) return null
  const img = new Image()
  img.src = src
  if (img.complete && img.naturalWidth > 0) return img
  return null
}

function floodOutsideEmpty(ink: Uint8Array, w: number, h: number): Uint8Array {
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
    tryPush(x - 1, y)
    tryPush(x + 1, y)
    tryPush(x, y - 1)
    tryPush(x, y + 1)
  }
  return outside
}

function linkedLetterInkBits(v: PaintVector, w: number, h: number): Uint8Array {
  const c = takeCanvas(w, h)
  try {
    const ctx = c.getContext('2d')!
    renderPaintTextVector(ctx, {
      ...v,
      color: '#000000',
      shadow: false,
      punchThrough: false,
      punchMask: false
    })
    const data = ctx.getImageData(0, 0, w, h).data
    const ink = new Uint8Array(w * h)
    for (let p = 0; p < ink.length; p++) {
      if (data[p * 4 + 3] >= 24) ink[p] = 1
    }
    return ink
  } finally {
    releaseCanvas(c)
  }
}

function enclosedCounterBits(ink: Uint8Array, w: number, h: number): Uint8Array {
  const outside = floodOutsideEmpty(ink, w, h)
  const hole = new Uint8Array(w * h)
  for (let p = 0; p < hole.length; p++) {
    if (ink[p] || outside[p]) continue
    hole[p] = 1
  }
  return hole
}

/** Hole bits for punchMasks (cuts Outer) vs see-through (local only). */
function linkedLetterEffectBits(
  v: PaintVector,
  w: number,
  h: number
): { punch: Uint8Array | null; seeThrough: Uint8Array | null } {
  const punchMode = !!v.punchThrough
  const enclosed = !!v.punchEnclosedHole || (!!v.punchMask && !punchMode)
  const wholeSeeThrough = !punchMode && isTransparentPaintColor(v.color ?? '')
  if (!punchMode && !enclosed && !wholeSeeThrough) {
    return { punch: null, seeThrough: null }
  }
  const ink = linkedLetterInkBits(v, w, h)
  if (enclosed) {
    const counters = enclosedCounterBits(ink, w, h)
    if (!counters.some((b) => b)) {
      return punchMode ? { punch: ink, seeThrough: null } : { punch: null, seeThrough: null }
    }
    return punchMode
      ? { punch: counters, seeThrough: null }
      : { punch: null, seeThrough: counters }
  }
  if (punchMode) return { punch: ink, seeThrough: null }
  // Whole-glyph see-through: hide letter body in decorations.
  return { punch: null, seeThrough: ink }
}

function stampBitsOntoPunchCanvas(
  ctx: CanvasRenderingContext2D,
  bits: Uint8Array,
  w: number,
  h: number
): void {
  const img = ctx.getImageData(0, 0, w, h)
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

function destOutBits(
  ctx: CanvasRenderingContext2D,
  bits: Uint8Array,
  w: number,
  h: number
): void {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let p = 0; p < bits.length; p++) {
    if (!bits[p]) continue
    d[p * 4 + 3] = 0
  }
  ctx.putImageData(img, 0, 0)
}

function linkedTextHasHoleIntent(v: PaintVector): boolean {
  if (v.type !== 'text' || !v.linkedOutsideText) return false
  return (
    !!v.punchThrough ||
    !!v.punchEnclosedHole ||
    !!v.punchMask ||
    !!v.holeMaskPng ||
    !!v.seeThroughHoleMaskPng ||
    v.holeMaskMode === 'punch' ||
    v.holeMaskMode === 'see-through' ||
    isTransparentPaintColor(v.color ?? '')
  )
}

/**
 * Rebuild content punchMasks / see-through decorations so Fill / punch /
 * see-through stay correct after outside letter edits (e.g. TE→BO).
 */
function rebuildLinkedLetterPaintEffects(
  session: PaintSession,
  prevLinked: PaintVector[],
  nextVectors: PaintVector[],
  letters: OutsideTextSettings
): PaintSession {
  const res = Math.max(1, session.resolution || 512)
  const nextLinked = nextVectors.filter(
    (v) => v.type === 'text' && v.linkedOutsideText && linkedTextHasHoleIntent(v)
  )
  const anyHole =
    nextLinked.length > 0 ||
    prevLinked.some(linkedTextHasHoleIntent) ||
    !!session.contentBakedInDecorations ||
    !!session.punchMasks?.some((m) => m.layer === 'content')

  if (!anyHole) {
    return {
      ...session,
      vectors: nextVectors,
      linkedTextInDecorations: false
    }
  }

  const vectorHasSeeThrough = (v: PaintVector) =>
    !!v.seeThroughHoleMaskPng ||
    v.holeMaskMode === 'see-through' ||
    (!v.punchThrough && !!v.punchEnclosedHole) ||
    (!v.punchThrough && !!v.punchMask) ||
    (!v.punchThrough && !!v.holeMaskPng) ||
    (!v.punchThrough && isTransparentPaintColor(v.color ?? ''))
  const hasSeeThrough =
    nextLinked.some(vectorHasSeeThrough) ||
    // Prior save baked see-through; keep rebaking when flags survived.
    (!!session.contentBakedInDecorations && nextLinked.some(vectorHasSeeThrough))
  const hasPunch = nextLinked.some(
    (v) => !!v.punchThrough || v.holeMaskMode === 'punch' || (!!v.holeMaskPng && v.holeMaskMode !== 'see-through')
  )

  // ── Content punchMasks: rebuild from current punch-through vectors only.
  // Never patch the previous PNG — leftover TE holes accumulate into white
  // columns when letters change.
  const punchCanvas = document.createElement('canvas')
  punchCanvas.width = res
  punchCanvas.height = res
  const punchCtx = punchCanvas.getContext('2d')!

  for (const v of nextVectors) {
    if ((v.layer ?? 'content') !== 'content') continue
    if ((v.visible ?? v.editable ?? true) === false) continue
    if (!v.punchThrough && v.holeMaskMode !== 'punch') continue
    if (v.holeMaskPng && (v.punchThrough || v.holeMaskMode === 'punch')) {
      const img = loadDataUrlImageSync(v.holeMaskPng)
      if (img) {
        punchCtx.drawImage(img, 0, 0)
        continue
      }
    }
    // Never invent every letter counter when a partial enclosed hole lost its PNG.
    if (v.punchEnclosedHole) continue
    if (v.type === 'text' && (v.linkedOutsideText || v.punchThrough)) {
      const { punch } = linkedLetterEffectBits(v, res, res)
      if (punch) stampBitsOntoPunchCanvas(punchCtx, punch, res, res)
      continue
    }
    // Free punchMask stamps keep their silhouette image.
    if (v.punchMask && v.type === 'stamp' && v.imageDataUrl && v.pts.length >= 2) {
      const img = loadDataUrlImageSync(v.imageDataUrl)
      if (!img) continue
      const a = v.pts[0]
      const b = v.pts[1]
      punchCtx.drawImage(
        img,
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.max(1, Math.abs(b.x - a.x)),
        Math.max(1, Math.abs(b.y - a.y))
      )
    }
  }

  const punchData = punchCtx.getImageData(0, 0, res, res).data
  let anyPunch = false
  for (let i = 3; i < punchData.length; i += 4) {
    if (punchData[i] > 32) {
      anyPunch = true
      break
    }
  }
  const containerPunches = (session.punchMasks ?? []).filter((m) => m.layer !== 'content')
  const punchMasks = anyPunch
    ? [...containerPunches, { layer: 'content' as const, png: punchCanvas.toDataURL('image/png') }]
    : containerPunches

  // ── See-through: bake new letters with local holes; skip live Inner ──
  if (hasSeeThrough) {
    const decor = document.createElement('canvas')
    decor.width = res
    decor.height = res
    const dctx = decor.getContext('2d')!
    const overlay = loadDataUrlImageSync(session.contentPng)
    if (overlay) dctx.drawImage(overlay, 0, 0)
    for (const v of nextLinked) {
      const fillColor = isTransparentPaintColor(v.color ?? '')
        ? letters.textColor || '#ffffff'
        : v.color || letters.textColor || '#ffffff'
      // Draw solid glyphs then cut local see-through holes (not stack punch).
      renderPaintTextVector(dctx, {
        ...v,
        color: fillColor,
        shadow: !!v.shadow,
        punchThrough: false,
        punchMask: false
      })
      {
        const stPng =
          v.seeThroughHoleMaskPng ||
          (v.holeMaskMode === 'see-through' || (!v.punchThrough && v.holeMaskPng) ? v.holeMaskPng : undefined)
        if (stPng) {
          const img = loadDataUrlImageSync(stPng)
          if (img) {
            dctx.save()
            dctx.globalCompositeOperation = 'destination-out'
            dctx.drawImage(img, 0, 0)
            dctx.restore()
          }
          // Prefer persisted mask only — never invent every counter as a fallback.
          continue
        }
      }
      // No holeMaskPng: leave solid glyphs (user re-applies see-through in Paint).
    }
    return {
      ...session,
      vectors: nextVectors,
      linkedTextInDecorations: true,
      contentBakedInDecorations: true,
      contentDecorationsPng: decor.toDataURL('image/png'),
      decorationsPng: undefined,
      punchMasks
    }
  }

  // Punch-only: live letters + regenerated masks (no baked content decorations).
  return {
    ...session,
    vectors: nextVectors,
    linkedTextInDecorations: false,
    contentBakedInDecorations: false,
    contentDecorationsPng: hasPunch ? undefined : session.contentDecorationsPng,
    decorationsPng: hasPunch ? undefined : session.decorationsPng,
    punchMasks
  }
}

/**
 * When outside Inner letters settings change, keep the paint session's linked
 * text vector in sync and re-apply Fill / see-through / punch holes to the new
 * glyphs (e.g. TE→BO keeps counters punched).
 */
export function syncOutsideLettersIntoPaintSession(
  session: PaintSession | null | undefined,
  letters: OutsideTextSettings,
  innerDrawSize?: number
): PaintSession | null | undefined {
  if (!session || session.version !== 1) return session
  const res = Math.max(1, session.resolution || 512)
  const drawArea = Math.max(1, innerDrawSize ?? res)
  const weight = parseInt(String(letters.fontWeight ?? '700'), 10)
  const w = Number.isFinite(weight) ? Math.max(100, Math.min(900, weight)) : 700
  const fontSize = Math.max(4, Math.round(drawArea * (letters.fontSizeRatio ?? 0.52)))
  const letterSpacing = (letters.letterSpacing ?? 0) * (drawArea / 256)

  const prevLinked = (session.vectors ?? []).filter(
    (v) => v.type === 'text' && !!v.linkedOutsideText
  )

  const vectors: PaintVector[] = (session.vectors ?? []).map((v) => {
    if (v.type !== 'text' || !v.linkedOutsideText) return v
    const shadow = outsideShadowToPaintVector(letters, res, drawArea)
    const anchor = linkedTextHasPaintTransform(v)
      ? v.pts?.[0]
      : outsideTextAnchorPt(letters, res, drawArea)
    const keepTransparent = isTransparentPaintColor(v.color ?? '')
    const textChanged =
      (v.text ?? '') !== (letters.text ?? '') ||
      (v.fontFamily || '') !== (letters.fontFamily || '') ||
      Math.abs((v.fontSize ?? 0) - fontSize) > 0.5 ||
      Math.abs((v.letterSpacing ?? 0) - letterSpacing) > 0.5
    return {
      ...v,
      text: letters.text ?? '',
      // Keep transparent paint colour (whole-glyph see-through); otherwise sync fill.
      color: keepTransparent ? v.color : letters.textColor || v.color || '#ffffff',
      fontFamily: letters.fontFamily || v.fontFamily || 'Inter',
      fontSize,
      weight: w,
      bold: w >= 700,
      italic: !!letters.fontItalic,
      letterSpacing,
      // Glyph-shaped holes cannot follow a different string without inventing
      // every B/O counter — clear them so live letters stay clean.
      ...(textChanged
        ? {
            punchThrough: false,
            punchEnclosedHole: false,
            holeMaskPng: undefined,
            seeThroughHoleMaskPng: undefined,
            holeMaskMode: undefined
          }
        : {}),
      ...(anchor ? { pts: [{ x: anchor.x, y: anchor.y }] } : {}),
      ...shadow
    }
  })

  const hadHoleIntent =
    prevLinked.some(linkedTextHasHoleIntent) ||
    !!session.contentBakedInDecorations ||
    !!session.punchMasks?.some((m) => m.layer === 'content') ||
    vectors.some(linkedTextHasHoleIntent)

  const textOrFontChanged = prevLinked.some((prev) => {
    const next = vectors.find((v) => v.id === prev.id)
    if (!next) return true
    return (
      (prev.text ?? '') !== (next.text ?? '') ||
      (prev.fontFamily || '') !== (next.fontFamily || '') ||
      Math.abs((prev.fontSize ?? 0) - (next.fontSize ?? 0)) > 0.5
    )
  })

  // Text/font change: drop content punches / baked holes (stale TE shapes).
  if (textOrFontChanged && hadHoleIntent) {
    return {
      ...session,
      vectors,
      linkedTextInDecorations: false,
      contentBakedInDecorations: false,
      contentDecorationsPng: undefined,
      decorationsPng: undefined,
      contentPng: session.contentPng,
      punchMasks: session.punchMasks?.filter((m) => m.layer !== 'content')
    }
  }

  if (!hadHoleIntent) {
    // No holes — drop legacy baked-text decorations so live colour/font update.
    const hadLinkedInDecor = !!session.linkedTextInDecorations
    return {
      ...session,
      vectors,
      linkedTextInDecorations: false,
      decorationsPng: hadLinkedInDecor ? undefined : session.decorationsPng,
      containerDecorationsPng: hadLinkedInDecor ? undefined : session.containerDecorationsPng,
      contentDecorationsPng: hadLinkedInDecor ? undefined : session.contentDecorationsPng
    }
  }

  try {
    return rebuildLinkedLetterPaintEffects(session, prevLinked, vectors, letters)
  } catch {
    // Canvas unavailable — keep props synced, leave masks as-is.
    return { ...session, vectors }
  }
}

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
 * Live letters (and their Inner shadow) own unrotated linked text after Save.
 * Skip live glyphs only when Paint warped them — those draw from paint vectors
 * through compositeInnerContentDecor so shadow/border still apply.
 */
export function shouldSkipLiveLettersForPaintSession(
  session: PaintSession | null | undefined
): boolean {
  if (shouldSkipLiveInnerForPaintSession(session)) return true
  if (!session || !sessionHasLinkedOutsideText(session)) return false
  if (session.linkedTextInDecorations) return true
  return (session.vectors ?? []).some(linkedTextHasPaintTransform)
}

/** True when Paint baked a warped Inner proxy into decorations — skip live Inner. */
export function shouldSkipLiveInnerForPaintSession(
  session: PaintSession | null | undefined
): boolean {
  return !!session?.contentBakedInDecorations
}

function shouldRenderContentVectorsLive(session: PaintSession): boolean {
  if (session.linkedTextInDecorations) return false
  // Unrotated live letters already draw in the renderer; drawing them again
  // here would cover Inner overlay Fill / brush cuts.
  if (!shouldSkipLiveLettersForPaintSession(session)) return false
  return contentVectorsForLiveRender(session.vectors).length > 0
}

/** Centered outer-shape square on the paint PNG (inset when shadow was fitted). */
export function resolvePaintShapeSize(
  session: PaintSession,
  fallback?: number
): { res: number; shape: number; origin: number } {
  const res = Math.max(1, session.resolution || 512)
  const raw = session.paintShapeSize ?? fallback ?? res
  const shape = Math.max(1, Math.min(res, Math.round(raw)))
  const origin = (res - shape) / 2
  return { res, shape, origin }
}

export function sessionHasPunchMask(
  session: PaintSession | null | undefined,
  layer: PaintLayerId
): boolean {
  return !!session?.punchMasks?.some((m) => m.layer === layer)
}

/** Punch-through mask for one paint layer (opaque = hole through live pixels below). */
export async function applyPaintPunchMask(
  ctx: CanvasRenderingContext2D,
  session: PaintSession | null | undefined,
  x: number,
  y: number,
  size: number,
  layer: PaintLayerId,
  shapeFallback?: number
): Promise<void> {
  if (!session || size <= 0) return
  const png = session.punchMasks?.find((m) => m.layer === layer)?.png
  if (!png) return
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  // Soft AA + scaled smoothing leaves thin white fringe columns on punched edges.
  ctx.imageSmoothingEnabled = false
  await drawScaledPunchPng(ctx, png, x, y, size, session, shapeFallback)
  ctx.restore()
}

/**
 * Draw a punch PNG with hard alpha. Do not dilate — Paint counters are flush;
 * growing the mask outside Paint misaligned letter bowls and shape holes.
 */
async function drawScaledPunchPng(
  ctx: CanvasRenderingContext2D,
  dataUrl: string,
  x: number,
  y: number,
  size: number,
  session: PaintSession,
  shapeFallback?: number
): Promise<void> {
  const img = await loadCachedImage(dataUrl)
  if (!img) return
  const { origin, shape } = resolvePaintShapeSize(session, shapeFallback)
  const ox = Math.round(origin)
  const oy = Math.round(origin)
  const sw = Math.max(1, Math.round(shape))
  const sh = Math.max(1, Math.round(shape))
  const src = takeCanvas(sw, sh)
  try {
    const sctx = src.getContext('2d')!
    sctx.imageSmoothingEnabled = false
    sctx.drawImage(img, ox, oy, sw, sh, 0, 0, sw, sh)
    const image = sctx.getImageData(0, 0, sw, sh)
    const d = image.data
    for (let p = 0; p < sw * sh; p++) {
      const i = p * 4
      if (d[i + 3] > 40) {
        d[i] = 0
        d[i + 1] = 0
        d[i + 2] = 0
        d[i + 3] = 255
      } else {
        d[i] = 0
        d[i + 1] = 0
        d[i + 2] = 0
        d[i + 3] = 0
      }
    }
    sctx.putImageData(image, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(src, Math.round(x), Math.round(y), Math.round(size), Math.round(size))
  } finally {
    releaseCanvas(src)
  }
}

/** Apply every punch mask after the full Outer+Inner stack so a fill hole is not covered by Inner. */
export async function applyAllPaintPunchMasks(
  ctx: CanvasRenderingContext2D,
  session: PaintSession | null | undefined,
  x: number,
  y: number,
  size: number,
  shapeFallback?: number
): Promise<void> {
  if (!session?.punchMasks?.length || size <= 0) return
  for (const layer of ['container', 'content'] as PaintLayerId[]) {
    await applyPaintPunchMask(ctx, session, x, y, size, layer, shapeFallback)
  }
}

async function drawScaledPng(
  ctx: CanvasRenderingContext2D,
  dataUrl: string | undefined,
  x: number,
  y: number,
  size: number,
  session: PaintSession,
  shapeFallback?: number
): Promise<void> {
  if (!dataUrl) return
  const img = await loadCachedImage(dataUrl)
  if (!img) return
  const { origin, shape } = resolvePaintShapeSize(session, shapeFallback)
  ctx.drawImage(img, origin, origin, shape, shape, x, y, size, size)
}

function applyPaintSpaceTransform(
  ctx: CanvasRenderingContext2D,
  session: PaintSession,
  x: number,
  y: number,
  size: number,
  shapeFallback?: number
): { res: number; shape: number; origin: number } {
  const space = resolvePaintShapeSize(session, shapeFallback)
  ctx.translate(x, y)
  ctx.scale(size / space.shape, size / space.shape)
  ctx.translate(-space.origin, -space.origin)
  return space
}

async function drawOverlayLayers(
  ctx: CanvasRenderingContext2D,
  session: PaintSession,
  x: number,
  y: number,
  size: number,
  shapeFallback?: number
): Promise<void> {
  await drawScaledPng(ctx, session.containerPng, x, y, size, session, shapeFallback)
  await drawScaledPng(ctx, session.contentPng, x, y, size, session, shapeFallback)
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
  layer: PaintLayerId,
  innerDecor?: InnerContentDecor,
  shapeFallback?: number
): Promise<void> {
  if (!session || size <= 0) return
  const { res, origin, shape } = resolvePaintShapeSize(session, shapeFallback)

  if (sessionHasContentProxy(session)) {
    // Proxies: overlays only until next Paint save regenerates decorations.
    const png = layer === 'container' ? session.containerPng : session.contentPng
    await drawScaledPng(ctx, png, x, y, size, session, shapeFallback)
    return
  }

  const layeredPng =
    layer === 'container' ? session.containerDecorationsPng : session.contentDecorationsPng
  if (layeredPng) {
    await drawScaledPng(ctx, layeredPng, x, y, size, session, shapeFallback)
  } else {
    // Pre-layered sessions: fall back to raw overlay for this layer only.
    const overlay = layer === 'container' ? session.containerPng : session.contentPng
    await drawScaledPng(ctx, overlay, x, y, size, session, shapeFallback)
  }

  if (layer === 'content' && shouldRenderContentVectorsLive(session)) {
    const liveVectors = contentVectorsForLiveRender(session.vectors)
    const linkedTransform = liveVectors.some(linkedTextHasPaintTransform)
    if (linkedTransform && innerDecor) {
      const offscreen = takeCanvas(res, res)
      const cropped = takeCanvas(shape, shape)
      try {
        const offCtx = offscreen.getContext('2d')!
        offCtx.imageSmoothingEnabled = true
        offCtx.imageSmoothingQuality = 'high'
        renderPaintContentVectors(offCtx, session.vectors, innerDecor, res)
        cropped.getContext('2d')!.drawImage(
          offscreen,
          origin, origin, shape, shape,
          0, 0, shape, shape
        )
        // Outer shadow is baked into the vectors before rotate/flip. Inset still
        // needs the live hole pipeline.
        if (innerDecor.contentShadowInset) {
          compositeInnerContentDecor(ctx, cropped, x, y, size, innerDecor)
        } else {
          ctx.drawImage(cropped, x, y, size, size)
        }
      } finally {
        releaseCanvas(offscreen)
        releaseCanvas(cropped)
      }
    } else {
      ctx.save()
      applyPaintSpaceTransform(ctx, session, x, y, size, shapeFallback)
      renderPaintContentVectors(ctx, session.vectors, innerDecor, res)
      ctx.restore()
    }
  }
}

/** Draw a paint layer at `superSample`× then downscale so logo icons stay sharp. */
export async function applyPaintLayerDecorationsHiRes(
  ctx: CanvasRenderingContext2D,
  session: PaintSession | null | undefined,
  x: number,
  y: number,
  size: number,
  layer: PaintLayerId,
  innerDecor: InnerContentDecor | undefined,
  shapeFallback: number | undefined,
  superSample: number
): Promise<void> {
  const s = Math.max(1, Math.round(superSample))
  if (s <= 1 || size <= 0) {
    await applyPaintLayerDecorations(ctx, session, x, y, size, layer, innerDecor, shapeFallback)
    return
  }
  const dim = Math.max(1, Math.round(size * s))
  const off = takeCanvas(dim, dim)
  try {
    const octx = off.getContext('2d')!
    octx.imageSmoothingEnabled = true
    octx.imageSmoothingQuality = 'high'
    await applyPaintLayerDecorations(octx, session, 0, 0, dim, layer, innerDecor, shapeFallback)
    ctx.drawImage(off, x, y, size, size)
  } finally {
    releaseCanvas(off)
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
  size: number,
  shapeFallback?: number,
  _contentSizeRatio?: number
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
    await drawOverlayLayers(ctx, session, x, y, size, shapeFallback)
    return
  }

  // New saves: decorations omit linked text; live letters draw underneath/above.
  if (session.decorationsPng && !session.linkedTextInDecorations) {
    await drawScaledPng(ctx, session.decorationsPng, x, y, size, session, shapeFallback)
    return
  }

  // Legacy: decorations include linked text — draw them (renderer skips live letters).
  if (session.decorationsPng && session.linkedTextInDecorations) {
    await drawScaledPng(ctx, session.decorationsPng, x, y, size, session, shapeFallback)
    return
  }

  await drawOverlayLayers(ctx, session, x, y, size, shapeFallback)
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
    // Keep baked decorations when Inner was rasterized (see-through / punch edits).
    decorationsPng: session.contentBakedInDecorations ? session.decorationsPng : undefined,
    containerDecorationsPng: session.contentBakedInDecorations
      ? session.containerDecorationsPng
      : undefined,
    contentDecorationsPng: session.contentBakedInDecorations
      ? session.contentDecorationsPng
      : undefined,
    punchMasks: session.punchMasks
  }
}
