/** Reusable 2D canvases so hot paths do not allocate a new bitmap every frame. */
const pool: HTMLCanvasElement[] = []
const MAX_POOL = 24

/**
 * Copy an offscreen render onto the live preview canvas.
 * Always reassigns width/height (even when unchanged) so Chromium drops any
 * compositor snapshot of the previous bitmap — canvases under CSS transform /
 * overflow+radius (PreviewStage) otherwise often keep showing the old frame.
 */
export function blitPreviewCanvas(dest: HTMLCanvasElement, source: HTMLCanvasElement): void {
  dest.width = Math.max(1, source.width)
  dest.height = Math.max(1, source.height)
  const ctx = dest.getContext('2d')
  if (!ctx) return
  reset2dState(ctx)
  ctx.drawImage(source, 0, 0)
  // Extra nudge: toggle a compositor-affecting style for one frame.
  const prev = dest.style.transform
  dest.style.transform = prev ? `${prev} translateZ(0)` : 'translateZ(0)'
  requestAnimationFrame(() => {
    if (dest.style.transform.endsWith('translateZ(0)')) dest.style.transform = prev
  })
}

/** Resize only when needed. Setting width/height to the same values still reallocates. */
export function fitCanvas(c: HTMLCanvasElement, w: number, h: number): boolean {
  const width = Math.max(1, Math.ceil(w))
  const height = Math.max(1, Math.ceil(h))
  if (c.width === width && c.height === height) return false
  c.width = width
  c.height = height
  return true
}

export function reset2dState(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.filter = 'none'
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
}

export function takeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = pool.pop() ?? (typeof document !== 'undefined' ? document.createElement('canvas') : ({} as HTMLCanvasElement))
  const width = Math.max(1, Math.ceil(w))
  const height = Math.max(1, Math.ceil(h))
  if (c.width !== width || c.height !== height) {
    c.width = width
    c.height = height
  } else {
    const ctx = c.getContext('2d')
    if (ctx) {
      reset2dState(ctx)
      ctx.clearRect(0, 0, width, height)
    }
  }
  return c
}

export function releaseCanvas(c: HTMLCanvasElement | null | undefined): void {
  if (!c || pool.length >= MAX_POOL) return
  pool.push(c)
}

/** Create or resize a long-lived canvas without clearing existing pixels. */
export function ensureCanvas(
  slot: { current: HTMLCanvasElement | null },
  w: number,
  h: number
): HTMLCanvasElement {
  const width = Math.max(1, Math.ceil(w))
  const height = Math.max(1, Math.ceil(h))
  let c = slot.current
  if (!c) {
    c = document.createElement('canvas')
    slot.current = c
  }
  if (c.width !== width || c.height !== height) {
    c.width = width
    c.height = height
  }
  return c
}

/** Resize-or-clear a long-lived canvas (single-thread sequential reuse). */
export function reuseCanvas(
  slot: { current: HTMLCanvasElement | null },
  w: number,
  h: number
): HTMLCanvasElement {
  const width = Math.max(1, Math.ceil(w))
  const height = Math.max(1, Math.ceil(h))
  let c = slot.current
  if (!c) {
    c = document.createElement('canvas')
    slot.current = c
  }
  if (c.width !== width || c.height !== height) {
    c.width = width
    c.height = height
  } else {
    const ctx = c.getContext('2d')
    if (ctx) {
      reset2dState(ctx)
      ctx.clearRect(0, 0, width, height)
    }
  }
  return c
}
