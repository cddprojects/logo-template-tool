/**
 * Authoritative in-Paint hole store (punch + see-through).
 *
 * Invariants:
 * 1. Object-local mask (`punchMaskCanvases`) is the source of truth when a
 *    local box exists. Canvas-fixed `punchMaskBits` are a derived cache.
 * 2. After any geometry change (move / rotate / scale / reshape / reopen
 *    scale), call `syncHolesAfterGeomChange` so display bits track the object.
 * 3. Never dest-out stale canvas-fixed bits when a local box exists — rewrite
 *    first, or use the local canvas path.
 * 4. Enclosed counters: prefer the user's saved hole bits over auto-detecting
 *    every counter (partial punch / see-through must survive redraw).
 * 5. Text / font string changes clear holes — do not invent B/O counters.
 * 6. Session `punchMasks` are export cache for stack punch only. Content
 *    see-through bakes into decorations; never put Inner see-through there.
 */

export type HoleMode = 'none' | 'punch' | 'see-through'
export type HoleKind = 'ink' | 'enclosed' | 'free'

export type HolePt = { x: number; y: number }

export type HoleLocalBox = { x: number; y: number; w: number; h: number }

/** Minimal object fields the hole subsystem needs. */
export type HoleItem = {
  id: string
  type?: string
  punchThrough?: boolean
  punchEnclosedHole?: boolean
  punchMask?: boolean
  holeMaskPng?: string
  holeMaskMode?: 'punch' | 'see-through'
  pts?: HolePt[]
}

export type HoleGeom = {
  localBox: (item: HoleItem) => HoleLocalBox | null
  mapDisplay: (p: HolePt, item: HoleItem) => HolePt
  unmapDisplay: (p: HolePt, item: HoleItem) => HolePt
}

/** Sync punch-mask bitmaps so dest-out does not wait on image decode. */
export const punchMaskCanvases = new Map<string, HTMLCanvasElement>()
/** Exact flood-fill hole bits (W*H) for punch-through dest-out. */
export const punchMaskBits = new Map<string, Uint8Array>()

export function mergePunchBits(prev: Uint8Array | undefined, region: Uint8Array): Uint8Array {
  if (!prev || prev.length !== region.length) return region.slice()
  const merged = prev.slice()
  for (let i = 0; i < region.length; i++) {
    if (region[i]) merged[i] = 1
  }
  return merged
}

export function clonePunchBitsMap(): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {}
  for (const [id, bits] of punchMaskBits) out[id] = bits.slice()
  return out
}

export function punchBitsEqual(a?: Uint8Array, b?: Uint8Array): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function bitsFromAlpha(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const bits = new Uint8Array(w * h)
  const n = Math.min(bits.length, (data.length / 4) | 0)
  for (let p = 0; p < n; p++) {
    if (data[p * 4 + 3] > 8) bits[p] = 1
  }
  return bits
}

export function holeModeOf(item: HoleItem): HoleMode {
  if (item.holeMaskMode === 'punch' || item.punchThrough) return 'punch'
  if (
    item.holeMaskMode === 'see-through' ||
    item.punchEnclosedHole ||
    punchMaskCanvases.has(item.id) ||
    punchMaskBits.has(item.id)
  ) {
    return item.punchThrough ? 'punch' : 'see-through'
  }
  return 'none'
}

export function holeKindOf(item: HoleItem): HoleKind | 'none' {
  if (item.punchMask) return 'free'
  if (item.punchEnclosedHole) return 'enclosed'
  if (item.punchThrough || punchMaskCanvases.has(item.id) || punchMaskBits.has(item.id)) return 'ink'
  return 'none'
}

export function objectHasFillHole(item: HoleItem): boolean {
  // Free punch stamps are operators, not fillable hole owners.
  if (item.punchMask) return false
  return !!item.punchThrough || punchMaskCanvases.has(item.id) || punchMaskBits.has(item.id)
}

export function objectHasLocalHoleMask(item: HoleItem): boolean {
  return punchMaskCanvases.has(item.id) || punchMaskBits.has(item.id)
}

/** Drop maps + optional vector flags (text edit / clear). */
export function clearObjectHoles(
  item: HoleItem,
  opts?: { clearFlags?: boolean }
): void {
  punchMaskCanvases.delete(item.id)
  punchMaskBits.delete(item.id)
  if (opts?.clearFlags !== false) {
    item.punchThrough = false
    item.punchEnclosedHole = false
    item.holeMaskPng = undefined
    item.holeMaskMode = undefined
  }
}

export function clearAllHoles(): void {
  punchMaskBits.clear()
  punchMaskCanvases.clear()
}

/**
 * After text content changes, drop hole masks instead of auto-punching every
 * new counter (B/O bowls).
 */
export function clearHolesOnTextEdit(item: HoleItem): void {
  if (item.type !== 'text') return
  if (
    !item.punchThrough &&
    !item.punchEnclosedHole &&
    !punchMaskBits.has(item.id) &&
    !punchMaskCanvases.has(item.id)
  ) {
    return
  }
  clearObjectHoles(item)
}

/**
 * Prefer the user's saved enclosed hole over auto-detecting every counter.
 * Auto-detect fights partial punch / see-through intent.
 */
export function resolveEnclosedHoleBits(
  savedBits: Uint8Array | undefined,
  autoHole: Uint8Array,
  autoN: number,
  w: number,
  h: number
): Uint8Array | null {
  const savedOk = !!(savedBits && savedBits.length === w * h && savedBits.some((v) => v))
  if (savedOk) return savedBits!
  if (autoN > 0) return autoHole
  return null
}

/** Rebuild canvas-fixed bits from the object-local mask via current geometry. */
export function rewriteDisplayBits(item: HoleItem, W: number, H: number, geom: HoleGeom): void {
  const box = geom.localBox(item)
  const src = punchMaskCanvases.get(item.id)
  if (!box || !src) return
  const cw = src.width
  const ch = src.height
  const img = src.getContext('2d')!.getImageData(0, 0, cw, ch).data
  const bits = new Uint8Array(W * H)
  for (let ly = 0; ly < ch; ly++) {
    for (let lx = 0; lx < cw; lx++) {
      if (img[(ly * cw + lx) * 4 + 3] <= 8) continue
      const local = {
        x: box.x + ((lx + 0.5) * box.w) / cw,
        y: box.y + ((ly + 0.5) * box.h) / ch
      }
      const display = geom.mapDisplay(local, item)
      const px = Math.floor(display.x)
      const py = Math.floor(display.y)
      if (px < 0 || py < 0 || px >= W || py >= H) continue
      bits[py * W + px] = 1
    }
  }
  punchMaskBits.set(item.id, bits)
}

/**
 * Attach / merge flood-fill hole coverage onto an object.
 * Writes object-local canvas when a local box exists, then rewrites display bits.
 */
export function attachFromFlood(
  item: HoleItem,
  filled: Uint8Array,
  W: number,
  H: number,
  geom: HoleGeom,
  opts?: { replace?: boolean }
): void {
  const box = geom.localBox(item)
  if (!box) {
    punchMaskBits.set(
      item.id,
      opts?.replace ? filled.slice() : mergePunchBits(punchMaskBits.get(item.id), filled)
    )
    return
  }
  const cw = Math.max(1, Math.round(box.w))
  const ch = Math.max(1, Math.round(box.h))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  const prev = opts?.replace ? undefined : punchMaskCanvases.get(item.id)
  if (prev) ctx.drawImage(prev, 0, 0, cw, ch)
  const img = ctx.getImageData(0, 0, cw, ch)
  const d = img.data
  let minX = W,
    minY = H,
    maxX = -1,
    maxY = -1
  for (let p = 0; p < filled.length; p++) {
    if (!filled[p]) continue
    const x = p % W
    const y = (p / W) | 0
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (maxX >= minX) {
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        if (!filled[py * W + px]) continue
        const local = geom.unmapDisplay({ x: px + 0.5, y: py + 0.5 }, item)
        const lx = Math.floor(((local.x - box.x) / box.w) * cw)
        const ly = Math.floor(((local.y - box.y) / box.h) * ch)
        if (lx < 0 || ly < 0 || lx >= cw || ly >= ch) continue
        const i = (ly * cw + lx) * 4
        d[i] = 255
        d[i + 1] = 255
        d[i + 2] = 255
        d[i + 3] = 255
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  punchMaskCanvases.set(item.id, canvas)
  rewriteDisplayBits(item, W, H, geom)
}

/** PNG snapshot of an object's hole bits for Save / re-enter. */
export function serializeHolePng(item: HoleItem, W: number, H: number, geom: HoleGeom): string | undefined {
  // Always refresh derived bits from local SoT before encoding — prevents
  // persisting a pre-move mask if a geom path skipped sync.
  if (punchMaskCanvases.has(item.id)) {
    rewriteDisplayBits(item, W, H, geom)
  }
  const full = punchMaskBits.get(item.id)
  if (!full || full.length !== W * H || !full.some((v) => v)) return undefined
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const d = img.data
  for (let p = 0; p < full.length; p++) {
    if (!full[p]) continue
    const i = p * 4
    d[i] = 0
    d[i + 1] = 0
    d[i + 2] = 0
    d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

/**
 * After move / rotate / scale / reshape: rewrite display bits for every object
 * that still has a local hole canvas. Call at drag-end and after reopen scale.
 */
export function syncHolesAfterGeomChange(
  items: HoleItem[],
  W: number,
  H: number,
  geom: HoleGeom,
  ids?: Iterable<string> | 'all'
): void {
  const filter =
    !ids || ids === 'all' ? null : ids instanceof Set ? ids : new Set(ids)
  for (const item of items) {
    if (filter && !filter.has(item.id)) continue
    if (!punchMaskCanvases.has(item.id)) continue
    rewriteDisplayBits(item, W, H, geom)
  }
}
