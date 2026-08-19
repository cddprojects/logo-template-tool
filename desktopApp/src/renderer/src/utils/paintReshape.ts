import { takeCanvas, releaseCanvas } from './canvasPool'

export type ReshapePt = { x: number; y: number }
export type ReshapeRect = { x: number; y: number; w: number; h: number }

export function quadIsAxisAlignedRect(quad: ReshapePt[], eps = 0.75): boolean {
  const [tl, tr, br, bl] = quad
  return (
    Math.abs(tl.y - tr.y) < eps &&
    Math.abs(bl.y - br.y) < eps &&
    Math.abs(tl.x - bl.x) < eps &&
    Math.abs(tr.x - br.x) < eps
  )
}

export function reshapeQuadMatchesSource(
  quad: ReshapePt[],
  src: ReshapeRect,
  eps = 1.5
): boolean {
  return (
    Math.abs(quad[0].x - src.x) < eps &&
    Math.abs(quad[0].y - src.y) < eps &&
    Math.abs(quad[1].x - (src.x + src.w)) < eps &&
    Math.abs(quad[1].y - src.y) < eps &&
    Math.abs(quad[2].x - (src.x + src.w)) < eps &&
    Math.abs(quad[2].y - (src.y + src.h)) < eps &&
    Math.abs(quad[3].x - src.x) < eps &&
    Math.abs(quad[3].y - (src.y + src.h)) < eps
  )
}

/** True when a dest quad actually warps the source (not just reshape-mode init). */
export function reshapeIsApplied(
  quad: ReshapePt[] | undefined,
  src?: ReshapeRect
): boolean {
  if (!quad || quad.length !== 4) return false
  if (!src) return true
  return !reshapeQuadMatchesSource(quad, src)
}

export function drawImageAxisRect(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sx: number, sy: number, sw: number, sh: number,
  quad: [ReshapePt, ReshapePt, ReshapePt, ReshapePt]
): void {
  const x = Math.min(quad[0].x, quad[3].x)
  const y = Math.min(quad[0].y, quad[1].y)
  const w = Math.max(1, Math.max(quad[1].x, quad[2].x) - x)
  const h = Math.max(1, Math.max(quad[2].y, quad[3].y) - y)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

function homographyUnitSquareToQuad(quad: [ReshapePt, ReshapePt, ReshapePt, ReshapePt]): number[] {
  const x0 = quad[0].x
  const y0 = quad[0].y
  const x1 = quad[1].x
  const y1 = quad[1].y
  const x2 = quad[2].x
  const y2 = quad[2].y
  const x3 = quad[3].x
  const y3 = quad[3].y
  const dx3 = x0 - x1 + x2 - x3
  const dy3 = y0 - y1 + y2 - y3
  let h20 = 0
  let h21 = 0
  if (Math.abs(dx3) > 1e-8 || Math.abs(dy3) > 1e-8) {
    const dx1 = x1 - x2
    const dy1 = y1 - y2
    const dx2 = x3 - x2
    const dy2 = y3 - y2
    const denom = dx1 * dy2 - dx2 * dy1
    if (Math.abs(denom) > 1e-12) {
      h20 = (dx3 * dy2 - dx2 * dy3) / denom
      h21 = (dx1 * dy3 - dx3 * dy1) / denom
    }
  }
  return [
    x1 - x0 + h20 * x1,
    x3 - x0 + h21 * x3,
    x0,
    y1 - y0 + h20 * y1,
    y3 - y0 + h21 * y3,
    y0,
    h20,
    h21,
    1
  ]
}

function invert3x3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const D = -(b * i - c * h)
  const E = a * i - c * g
  const F = -(a * h - b * g)
  const G = b * f - c * e
  const H = -(a * f - c * d)
  const I = a * e - b * d
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) return null
  const invDet = 1 / det
  return [
    A * invDet, D * invDet, G * invDet,
    B * invDet, E * invDet, H * invDet,
    C * invDet, F * invDet, I * invDet
  ]
}

function applyHomography(H: number[], x: number, y: number): ReshapePt {
  const w = H[6] * x + H[7] * y + H[8]
  if (Math.abs(w) < 1e-12) return { x: 0, y: 0 }
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w
  }
}

function sampleBilinear(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  fx: number,
  fy: number
): [number, number, number, number] {
  const x = Math.max(0, Math.min(w - 1.001, fx))
  const y = Math.max(0, Math.min(h - 1.001, fy))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  const i00 = (y0 * w + x0) * 4
  const i10 = (y0 * w + x1) * 4
  const i01 = (y1 * w + x0) * 4
  const i11 = (y1 * w + x1) * 4
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let ch = 0; ch < 4; ch++) {
    const v00 = data[i00 + ch]
    const v10 = data[i10 + ch]
    const v01 = data[i01 + ch]
    const v11 = data[i11 + ch]
    out[ch] = Math.round(
      v00 * (1 - tx) * (1 - ty) +
      v10 * tx * (1 - ty) +
      v01 * (1 - tx) * ty +
      v11 * tx * ty
    )
  }
  return out
}

/** Seamless projective quad warp — no triangle-mesh seam lines. */
export function drawImageHomographyQuad(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  quad: [ReshapePt, ReshapePt, ReshapePt, ReshapePt]
): void {
  const swi = Math.max(1, Math.ceil(sw))
  const shi = Math.max(1, Math.ceil(sh))
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = swi
  srcCanvas.height = shi
  const sctx = srcCanvas.getContext('2d')!
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(img, sx, sy, sw, sh, 0, 0, swi, shi)
  const srcData = sctx.getImageData(0, 0, swi, shi).data

  const H = homographyUnitSquareToQuad(quad)
  const Hinv = invert3x3(H)
  if (!Hinv) {
    drawImageAxisRect(ctx, img, sx, sy, sw, sh, quad)
    return
  }

  const xs = quad.map((p) => p.x)
  const ys = quad.map((p) => p.y)
  const minX = Math.max(0, Math.floor(Math.min(...xs)))
  const minY = Math.max(0, Math.floor(Math.min(...ys)))
  const maxX = Math.min(ctx.canvas.width, Math.ceil(Math.max(...xs)))
  const maxY = Math.min(ctx.canvas.height, Math.ceil(Math.max(...ys)))
  const dw = maxX - minX
  const dh = maxY - minY
  if (dw <= 0 || dh <= 0) return

  const out = ctx.createImageData(dw, dh)
  const outData = out.data
  for (let py = 0; py < dh; py++) {
    const y = minY + py
    for (let px = 0; px < dw; px++) {
      const x = minX + px
      const uv = applyHomography(Hinv, x, y)
      if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) continue
      const rgba = sampleBilinear(srcData, swi, shi, uv.x * (swi - 1), uv.y * (shi - 1))
      const oi = (py * dw + px) * 4
      outData[oi] = rgba[0]
      outData[oi + 1] = rgba[1]
      outData[oi + 2] = rgba[2]
      outData[oi + 3] = rgba[3]
    }
  }
  // putImageData replaces the dest rect (including alpha 0) and punches out
  // Outer / stage pixels already drawn under the object.
  const layer = takeCanvas(dw, dh)
  try {
    const lctx = layer.getContext('2d')!
    lctx.putImageData(out, 0, 0)
    ctx.drawImage(layer, minX, minY)
  } finally {
    releaseCanvas(layer)
  }
}

export function alphaBoundsFromCanvas(
  canvas: HTMLCanvasElement | null
): ReshapeRect | null {
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const { width, height } = canvas
  if (width < 1 || height < 1) return null
  const data = ctx.getImageData(0, 0, width, height).data
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  return right < left || bottom < top
    ? null
    : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
}

/** Warp `srcCanvas` from `src` rect onto `quad`. No-ops when the quad matches src. */
export function drawReshapedCanvas(
  ctx: CanvasRenderingContext2D,
  srcCanvas: HTMLCanvasElement,
  src: ReshapeRect,
  quad: ReshapePt[]
): boolean {
  if (quad.length !== 4) return false
  const q: [ReshapePt, ReshapePt, ReshapePt, ReshapePt] = [quad[0], quad[1], quad[2], quad[3]]
  if (reshapeQuadMatchesSource(q, src)) return false
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (quadIsAxisAlignedRect(q)) {
    drawImageAxisRect(ctx, srcCanvas, src.x, src.y, src.w, src.h, q)
  } else {
    drawImageHomographyQuad(ctx, srcCanvas, src.x, src.y, src.w, src.h, q)
  }
  ctx.restore()
  return true
}
