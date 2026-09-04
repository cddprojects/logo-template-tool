/**
 * Authoritative in-Paint hole store (punch + see-through).
 *
 * Dual masks: punch and see-through can coexist on different sections of the
 * same object. `punchThrough` means “has any punch-mode coverage”.
 *
 * Invariants:
 * 1. Object-local canvas is SoT when a local box exists; display bits are derived.
 * 2. After geom change, call syncHolesAfterGeomChange (both modes).
 * 3. Never dest-out stale canvas-fixed bits when a local box exists.
 * 4. Enclosed counters: prefer saved hole bits over auto-detecting every counter.
 * 5. Text / font / shape-kind changes drop holes (do not invent new counters).
 * 6. Session punchMasks export punch-mode only; see-through bakes into decorations.
 */

export type HoleMode = 'none' | 'punch' | 'see-through'
export type HoleKind = 'ink' | 'enclosed' | 'free'
export type HoleFillMode = 'punch' | 'see-through'

export type HolePt = { x: number; y: number }
export type HoleLocalBox = { x: number; y: number; w: number; h: number }

export type HoleItem = {
  id: string
  type?: string
  punchThrough?: boolean
  punchEnclosedHole?: boolean
  punchMask?: boolean
  holeMaskPng?: string
  /** See-through pockets when punch and see-through coexist. */
  seeThroughHoleMaskPng?: string
  holeMaskMode?: 'punch' | 'see-through'
  pts?: HolePt[]
}

export type HoleGeom = {
  localBox: (item: HoleItem) => HoleLocalBox | null
  mapDisplay: (p: HolePt, item: HoleItem) => HolePt
  unmapDisplay: (p: HolePt, item: HoleItem) => HolePt
}

export const punchMaskCanvases = new Map<string, HTMLCanvasElement>()
export const punchMaskBits = new Map<string, Uint8Array>()
export const seeThroughMaskCanvases = new Map<string, HTMLCanvasElement>()
export const seeThroughMaskBits = new Map<string, Uint8Array>()

function canvasesFor(mode: HoleFillMode) {
  return mode === 'punch' ? punchMaskCanvases : seeThroughMaskCanvases
}
function bitsFor(mode: HoleFillMode) {
  return mode === 'punch' ? punchMaskBits : seeThroughMaskBits
}

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
  for (const [id, bits] of seeThroughMaskBits) {
    const key = `st:${id}`
    out[key] = bits.slice()
  }
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

export function hasPunchCoverage(id: string): boolean {
  return punchMaskCanvases.has(id) || !!(punchMaskBits.get(id)?.some((v) => v))
}

export function hasSeeThroughCoverage(id: string): boolean {
  return seeThroughMaskCanvases.has(id) || !!(seeThroughMaskBits.get(id)?.some((v) => v))
}

export function syncHoleFlags(item: HoleItem): void {
  const hasPunch = hasPunchCoverage(item.id)
  const hasSt = hasSeeThroughCoverage(item.id)
  item.punchThrough = hasPunch
  if (!hasPunch && !hasSt) {
    item.punchEnclosedHole = false
    item.holeMaskPng = undefined
    item.seeThroughHoleMaskPng = undefined
    item.holeMaskMode = undefined
    return
  }
  if (hasPunch && hasSt) item.holeMaskMode = 'punch'
  else if (hasPunch) item.holeMaskMode = 'punch'
  else item.holeMaskMode = 'see-through'
}

export function holeModeOf(item: HoleItem): HoleMode {
  if (hasPunchCoverage(item.id) || item.punchThrough) return 'punch'
  if (hasSeeThroughCoverage(item.id) || item.holeMaskMode === 'see-through' || item.punchEnclosedHole) {
    return 'see-through'
  }
  return 'none'
}

export function holeKindOf(item: HoleItem): HoleKind | 'none' {
  if (item.punchMask) return 'free'
  if (item.punchEnclosedHole) return 'enclosed'
  if (hasPunchCoverage(item.id) || hasSeeThroughCoverage(item.id) || item.punchThrough) return 'ink'
  return 'none'
}

export function objectHasFillHole(item: HoleItem): boolean {
  if (item.punchMask) return false
  return (
    !!item.punchThrough ||
    hasPunchCoverage(item.id) ||
    hasSeeThroughCoverage(item.id)
  )
}

export function objectHasLocalHoleMask(item: HoleItem): boolean {
  return hasPunchCoverage(item.id) || hasSeeThroughCoverage(item.id)
}

export function clearObjectHoles(item: HoleItem, opts?: { clearFlags?: boolean }): void {
  punchMaskCanvases.delete(item.id)
  punchMaskBits.delete(item.id)
  seeThroughMaskCanvases.delete(item.id)
  seeThroughMaskBits.delete(item.id)
  if (opts?.clearFlags !== false) {
    item.punchThrough = false
    item.punchEnclosedHole = false
    item.holeMaskPng = undefined
    item.seeThroughHoleMaskPng = undefined
    item.holeMaskMode = undefined
  }
}

export function clearAllHoles(): void {
  punchMaskBits.clear()
  punchMaskCanvases.clear()
  seeThroughMaskBits.clear()
  seeThroughMaskCanvases.clear()
}

export function clearHolesOnTextEdit(item: HoleItem): void {
  if (item.type !== 'text') return
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
  clearObjectHoles(item)
}

export function refreshHolesAfterTextChange(
  item: HoleItem,
  _inkBits: Uint8Array,
  _W: number,
  _H: number,
  _geom: HoleGeom
): void {
  clearHolesOnTextEdit(item)
}

export function floodOutsideEmptyBits(ink: Uint8Array, w: number, h: number): Uint8Array {
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

export function pruneTinyHoleComponents(bits: Uint8Array, w: number, h: number, minArea = 6): Uint8Array {
  const out = bits.slice()
  const seen = new Uint8Array(bits.length)
  const stack: number[] = []
  for (let start = 0; start < bits.length; start++) {
    if (!out[start] || seen[start]) continue
    stack.length = 0
    stack.push(start)
    seen[start] = 1
    const comp: number[] = []
    while (stack.length) {
      const p = stack.pop()!
      comp.push(p)
      const x = p % w
      const y = (p / w) | 0
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ] as const) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const np = ny * w + nx
        if (!out[np] || seen[np]) continue
        seen[np] = 1
        stack.push(np)
      }
    }
    if (comp.length < minArea) {
      for (const p of comp) out[p] = 0
    }
  }
  return out
}

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

/** Subtract a region from one mode's display bits (and drop empty maps). */
export function subtractRegionFromMode(
  item: HoleItem,
  region: Uint8Array,
  mode: HoleFillMode,
  W: number,
  H: number,
  geom: HoleGeom
): boolean {
  const bitsMap = bitsFor(mode)
  const canvasMap = canvasesFor(mode)
  const bits = bitsMap.get(item.id)
  if (!bits || bits.length !== region.length) {
    canvasMap.delete(item.id)
    bitsMap.delete(item.id)
    syncHoleFlags(item)
    return false
  }
  let remain = 0
  const next = new Uint8Array(bits.length)
  for (let p = 0; p < bits.length; p++) {
    if (!bits[p] || region[p]) continue
    next[p] = 1
    remain++
  }
  canvasMap.delete(item.id)
  bitsMap.delete(item.id)
  if (remain === 0) {
    syncHoleFlags(item)
    return false
  }
  attachFromFlood(item, next, W, H, geom, { replace: true, mode, skipOtherSubtract: true })
  syncHoleFlags(item)
  return true
}

export function rewriteDisplayBits(
  item: HoleItem,
  W: number,
  H: number,
  geom: HoleGeom,
  mode: HoleFillMode = 'punch'
): void {
  const box = geom.localBox(item)
  const src = canvasesFor(mode).get(item.id)
  if (!box || !src) return
  const cw = src.width
  const ch = src.height
  const img = src.getContext('2d')!.getImageData(0, 0, cw, ch).data
  const bits = new Uint8Array(W * H)
  const stamp = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= W || py >= H) return
    bits[py * W + px] = 1
  }
  for (let ly = 0; ly < ch; ly++) {
    for (let lx = 0; lx < cw; lx++) {
      if (img[(ly * cw + lx) * 4 + 3] <= 8) continue
      const local = {
        x: box.x + ((lx + 0.5) * box.w) / cw,
        y: box.y + ((ly + 0.5) * box.h) / ch
      }
      const display = geom.mapDisplay(local, item)
      const fx = display.x
      const fy = display.y
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      stamp(x0, y0)
      if (fx - x0 > 0.35) stamp(x0 + 1, y0)
      if (fy - y0 > 0.35) stamp(x0, y0 + 1)
      if (fx - x0 > 0.35 && fy - y0 > 0.35) stamp(x0 + 1, y0 + 1)
    }
  }
  bitsFor(mode).set(item.id, bits)
}

/** Move a connected hole region into `to` (and remove it from the other mode). */
export function moveConnectedRegionToMode(
  item: HoleItem,
  region: Uint8Array,
  to: HoleFillMode,
  W: number,
  H: number,
  geom: HoleGeom
): void {
  attachFromFlood(item, region, W, H, geom, { mode: to })
  syncHoleFlags(item)
}

export function attachFromFlood(
  item: HoleItem,
  filled: Uint8Array,
  W: number,
  H: number,
  geom: HoleGeom,
  opts?: { replace?: boolean; mode?: HoleFillMode; skipOtherSubtract?: boolean }
): void {
  const mode: HoleFillMode =
    opts?.mode ??
    (item.holeMaskMode === 'punch' || item.holeMaskMode === 'see-through'
      ? item.holeMaskMode
      : item.punchThrough
        ? 'punch'
        : 'see-through')
  const other: HoleFillMode = mode === 'punch' ? 'see-through' : 'punch'
  // A section cannot be both modes — remove coverage from the other map.
  if (!opts?.skipOtherSubtract) {
    subtractRegionFromMode(item, filled, other, W, H, geom)
  }

  const canvasMap = canvasesFor(mode)
  const bitsMap = bitsFor(mode)
  const box = geom.localBox(item)
  if (!box) {
    bitsMap.set(
      item.id,
      opts?.replace ? filled.slice() : mergePunchBits(bitsMap.get(item.id), filled)
    )
    syncHoleFlags(item)
    return
  }
  const cw = Math.max(1, Math.round(box.w))
  const ch = Math.max(1, Math.round(box.h))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  const prev = opts?.replace ? undefined : canvasMap.get(item.id)
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
        const u = ((local.x - box.x) / box.w) * cw
        const v = ((local.y - box.y) / box.h) * ch
        const lx0 = Math.floor(u - 0.25)
        const ly0 = Math.floor(v - 0.25)
        const lx1 = Math.floor(u + 0.25)
        const ly1 = Math.floor(v + 0.25)
        for (let ly = ly0; ly <= ly1; ly++) {
          for (let lx = lx0; lx <= lx1; lx++) {
            if (lx < 0 || ly < 0 || lx >= cw || ly >= ch) continue
            const i = (ly * cw + lx) * 4
            d[i] = 255
            d[i + 1] = 255
            d[i + 2] = 255
            d[i + 3] = 255
          }
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  canvasMap.set(item.id, canvas)
  rewriteDisplayBits(item, W, H, geom, mode)
  // Union the original flood into display bits so UV remapping cannot displace
  // isolated counters / letter bowls relative to the click region.
  const rewritten = bitsMap.get(item.id)
  if (rewritten && rewritten.length === filled.length) {
    for (let p = 0; p < filled.length; p++) {
      if (filled[p]) rewritten[p] = 1
    }
  } else if (!opts?.replace) {
    bitsMap.set(item.id, mergePunchBits(bitsMap.get(item.id), filled))
  } else {
    bitsMap.set(item.id, filled.slice())
  }
  syncHoleFlags(item)
}

function serializeBitsPng(bits: Uint8Array, W: number, H: number): string | undefined {
  if (!bits.some((v) => v)) return undefined
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(W, H)
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
  return c.toDataURL('image/png')
}

/** Punch-mode hole PNG (stack cut outside Paint). */
export function serializeHolePng(item: HoleItem, W: number, H: number, geom: HoleGeom): string | undefined {
  if (punchMaskCanvases.has(item.id)) rewriteDisplayBits(item, W, H, geom, 'punch')
  const full = punchMaskBits.get(item.id)
  if (!full || full.length !== W * H) return undefined
  return serializeBitsPng(full, W, H)
}

/** See-through-mode hole PNG (local bake outside Paint). */
export function serializeSeeThroughHolePng(
  item: HoleItem,
  W: number,
  H: number,
  geom: HoleGeom
): string | undefined {
  if (seeThroughMaskCanvases.has(item.id)) rewriteDisplayBits(item, W, H, geom, 'see-through')
  const full = seeThroughMaskBits.get(item.id)
  if (!full || full.length !== W * H) return undefined
  return serializeBitsPng(full, W, H)
}

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
    if (punchMaskCanvases.has(item.id)) rewriteDisplayBits(item, W, H, geom, 'punch')
    if (seeThroughMaskCanvases.has(item.id)) rewriteDisplayBits(item, W, H, geom, 'see-through')
  }
}
