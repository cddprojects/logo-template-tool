/** Reusable 2D canvases so hot paths do not allocate a new bitmap every frame. */
const pool: HTMLCanvasElement[] = []
const MAX_POOL = 24

/**
 * Present an offscreen render onto a dual-canvas preview without a blank frame.
 *
 * Always paints onto the hidden buffer, then swaps visibility in the same turn.
 * Never reallocates / clears the currently visible canvas (that was the version-
 * switch flash: width/height assign wiped pixels for a frame).
 */
export function presentPreviewCanvas(
  buffers: { a: HTMLCanvasElement; b: HTMLCanvasElement },
  showingA: { current: boolean },
  source: HTMLCanvasElement
): HTMLCanvasElement {
  const w = Math.max(1, source.width)
  const h = Math.max(1, source.height)
  const back = showingA.current ? buffers.b : buffers.a
  const front = showingA.current ? buffers.a : buffers.b

  back.width = w
  back.height = h
  const ctx = back.getContext('2d')
  if (ctx) {
    reset2dState(ctx)
    ctx.drawImage(source, 0, 0)
  }

  // Visible buffer stays in normal flow so the parent keeps the new intrinsic size.
  back.style.display = 'block'
  back.style.position = 'static'
  back.style.visibility = 'visible'
  front.style.display = 'block'
  front.style.position = 'absolute'
  front.style.left = '0'
  front.style.top = '0'
  front.style.visibility = 'hidden'
  front.setAttribute('aria-hidden', 'true')
  back.removeAttribute('aria-hidden')

  showingA.current = !showingA.current
  return back
}

/**
 * Copy an offscreen render onto a single live canvas.
 * Same-size path uses 'copy' (no realloc). Prefer presentPreviewCanvas for
 * version/variant previews to avoid size-change flashes.
 */
export function blitPreviewCanvas(dest: HTMLCanvasElement, source: HTMLCanvasElement): void {
  const w = Math.max(1, source.width)
  const h = Math.max(1, source.height)
  const ctx = dest.getContext('2d')
  if (!ctx) return
  if (dest.width === w && dest.height === h) {
    reset2dState(ctx)
    ctx.globalCompositeOperation = 'copy'
    ctx.drawImage(source, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    return
  }
  dest.width = w
  dest.height = h
  reset2dState(ctx)
  ctx.drawImage(source, 0, 0)
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
