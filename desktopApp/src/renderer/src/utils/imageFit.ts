/**
 * Keep uploaded rasters small enough to save.
 * Full-resolution photos (plus Color 1–5 mark maps) were blowing the
 * workspace request past the server limit on every autosave.
 */

const MAX_EDGE = 1024
/** Already-small data URLs are left untouched. */
const MAX_KEEP_CHARS = 700_000

const fitCache = new Map<string, string>()

/** Colour-id maps. Resizing these with smoothing or JPEG destroys the ids. */
const INDEX_MAP_KEYS = new Set([
  'imageColorMarkPng',
  'imageColorRegionPng',
  'colorMarkPng',
  'colorRegionPng'
])

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function looksLikeIndexMap(data: Uint8ClampedArray): boolean {
  let checked = 0
  let indexLike = 0
  const step = Math.max(4, Math.floor(data.length / 4 / 4000) * 4)
  for (let i = 0; i < data.length; i += step) {
    const a = data[i + 3] ?? 0
    if (a === 0) continue
    checked++
    if (a === 255 && (data[i + 2] ?? 0) <= 1) indexLike++
  }
  return checked > 0 && indexLike / checked > 0.98
}

function hasPartialAlpha(data: Uint8ClampedArray): boolean {
  const step = Math.max(4, Math.floor(data.length / 4 / 8000) * 4)
  for (let i = 3; i < data.length; i += step) {
    const a = data[i] ?? 255
    if (a !== 0 && a !== 255) return true
  }
  return false
}

/**
 * Shrink a raster data URL so the longest side is at most 1024px.
 * JPEG when the image is fully opaque. PNG when it has transparency or is a
 * Color 1–5 / region map (those must stay exact ids, so they are not blurred).
 * SVG and non-image URLs are returned unchanged.
 */
export async function fitRasterDataUrl(
  dataUrl: string,
  maxEdge = MAX_EDGE,
  opts?: { indexMap?: boolean; png?: boolean }
): Promise<string> {
  if (!dataUrl.startsWith('data:image/') || dataUrl.startsWith('data:image/svg')) return dataUrl
  const cacheKey = `${opts?.indexMap ? 'idx' : opts?.png ? 'png' : 'fit'}:${maxEdge}:${dataUrl}`
  const cached = fitCache.get(cacheKey)
  if (cached) return cached

  const img = await loadImage(dataUrl)
  if (!img || !img.width || !img.height) return dataUrl

  const longest = Math.max(img.width, img.height)
  if (longest <= maxEdge && dataUrl.length <= MAX_KEEP_CHARS) return dataUrl

  const probeEdge = 160
  const probeScale = Math.min(1, probeEdge / longest)
  const probe = document.createElement('canvas')
  probe.width = Math.max(1, Math.round(img.width * probeScale))
  probe.height = Math.max(1, Math.round(img.height * probeScale))
  const pctx = probe.getContext('2d', { willReadFrequently: true })
  if (!pctx) return dataUrl
  pctx.imageSmoothingEnabled = false
  pctx.drawImage(img, 0, 0, probe.width, probe.height)
  const probePx = pctx.getImageData(0, 0, probe.width, probe.height).data
  const indexMap = opts?.indexMap === true || looksLikeIndexMap(probePx)

  const scale = Math.min(1, maxEdge / longest)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return dataUrl
  ctx.imageSmoothingEnabled = !indexMap
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  let fitted: string
  if (indexMap) {
    fitted = canvas.toDataURL('image/png')
  } else {
    const fittedPx = ctx.getImageData(0, 0, w, h).data
    fitted = opts?.png || hasPartialAlpha(fittedPx)
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', 0.85)
  }
  if (fitted !== dataUrl) fitCache.set(cacheKey, fitted)
  return fitted
}

/** Read an image file and shrink rasters. SVG is kept as-is. */
export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result) {
        reject(new Error('Failed to read image'))
        return
      }
      const svg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
      if (svg) {
        resolve(result)
        return
      }
      fitRasterDataUrl(result, 1024, { png: true }).then(resolve, reject)
    }
    reader.readAsDataURL(file)
  })
}

/** Replace oversized raster data URLs anywhere in a JSON tree. Mutates in place. */
export async function shrinkRastersInValue(value: unknown): Promise<void> {
  if (value == null) return
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      if (typeof item === 'string' && item.startsWith('data:image/') && !item.startsWith('data:image/svg')) {
        value[i] = await fitRasterDataUrl(item)
      } else {
        await shrinkRastersInValue(item)
      }
    }
    return
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    for (const key of Object.keys(rec)) {
      const item = rec[key]
      if (typeof item === 'string' && item.startsWith('data:image/') && !item.startsWith('data:image/svg')) {
        rec[key] = await fitRasterDataUrl(item, MAX_EDGE, {
          indexMap: INDEX_MAP_KEYS.has(key)
        })
      } else {
        await shrinkRastersInValue(item)
      }
    }
  }
}
