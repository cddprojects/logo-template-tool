import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

// ── SVG cache ─────────────────────────────────────────────────────────────────

const svgCache = new Map<string, string>()

// Lazily resolved Lucide namespace — loaded once on first call, then reused.
let _lucidePromise: Promise<Record<string, React.FC>> | null = null
function getLucideIcons(): Promise<Record<string, React.FC>> {
  if (!_lucidePromise) {
    _lucidePromise = import('lucide-react') as Promise<Record<string, React.FC>>
  }
  return _lucidePromise
}

/**
 * Render a Lucide icon to an SVG string using React's normal async rendering
 * via requestAnimationFrame — avoids flushSync which can fail in some contexts.
 */
export async function renderLucideToSvg(
  iconName: string,
  color = 'currentColor',
  strokeWidth = 2
): Promise<string> {
  const cacheKey = `${iconName}::${color}::${strokeWidth}`
  if (svgCache.has(cacheKey)) return svgCache.get(cacheKey)!

  const LucideIcons = await getLucideIcons()
  const IconComp = LucideIcons[iconName]
  if (!IconComp) return ''

  return new Promise<string>((resolve) => {
    const container = document.createElement('div')
    container.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;pointer-events:none;width:100px;height:100px;overflow:hidden;'
    document.body.appendChild(container)

    const root = createRoot(container)
    root.render(createElement(IconComp, { color, size: 100, strokeWidth }))

    const capture = () => {
      const svgEl = container.querySelector('svg')
      if (svgEl) {
        svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        if (!svgEl.getAttribute('viewBox')) svgEl.setAttribute('viewBox', '0 0 24 24')
        const markup = svgEl.outerHTML
        svgCache.set(cacheKey, markup)
        root.unmount()
        if (document.body.contains(container)) document.body.removeChild(container)
        resolve(markup)
      } else {
        // Retry one more frame
        requestAnimationFrame(() => {
          const svgEl2 = container.querySelector('svg')
          const markup = svgEl2 ? svgEl2.outerHTML : ''
          if (markup) svgCache.set(cacheKey, markup)
          root.unmount()
          if (document.body.contains(container)) document.body.removeChild(container)
          resolve(markup)
        })
      }
    }

    requestAnimationFrame(capture)
  })
}

const SKIP_COLOR = /^(none|transparent|currentcolor|inherit|unset|initial)$/i

/**
 * Returns all distinct explicit colours from an SVG in order of first appearance.
 * Ignores none/transparent/currentColor.
 */
export function getDistinctSvgColors(svgMarkup: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const re = /fill="([^"]+)"|stroke="([^"]+)"|stop-color="([^"]+)"|fill:\s*([^;")]+)|stroke:\s*([^;")]+)|stop-color:\s*([^;")]+)/g
  for (const m of svgMarkup.matchAll(re)) {
    const c = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? '').trim()
    const cl = c.toLowerCase()
    if (c && !SKIP_COLOR.test(cl) && !seen.has(cl)) {
      seen.add(cl)
      result.push(c)
    }
  }
  return result
}

/**
 * Returns true when an SVG contains more than one distinct explicit colour.
 */
export function hasMultipleColors(svgMarkup: string): boolean {
  return getDistinctSvgColors(svgMarkup).length > 1
}

/** Replace a specific colour string throughout fill/stroke/stop-color attributes and styles. */
function replaceSvgColor(svg: string, from: string, to: string): string {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return svg
    .replace(new RegExp(`fill="${esc}"`, 'gi'), `fill="${to}"`)
    .replace(new RegExp(`stroke="${esc}"`, 'gi'), `stroke="${to}"`)
    .replace(new RegExp(`stop-color="${esc}"`, 'gi'), `stop-color="${to}"`)
    .replace(new RegExp(`(fill:\\s*)${esc}`, 'gi'), `$1${to}`)
    .replace(new RegExp(`(stroke:\\s*)${esc}`, 'gi'), `$1${to}`)
    .replace(new RegExp(`(stop-color:\\s*)${esc}`, 'gi'), `$1${to}`)
}

const CSS_STOP_RE = /,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+(?:\.\d+)?)%/g

function parseCssGradientStops(body: string): { color: string; pos: number }[] {
  const stops: { color: string; pos: number }[] = []
  let m: RegExpExecArray | null
  while ((m = CSS_STOP_RE.exec(body)) !== null) {
    stops.push({ color: m[1], pos: parseFloat(m[2]) / 100 })
  }
  CSS_STOP_RE.lastIndex = 0
  return stops
}

export function isCssGradientColor(color: string): boolean {
  return (
    typeof color === 'string' &&
    (color.startsWith('linear-gradient(') || color.startsWith('radial-gradient('))
  )
}

/** First solid stop from a CSS gradient, or the colour itself. */
export function firstSolidFromCssColor(color: string): string {
  if (!isCssGradientColor(color)) return color
  const m = color.match(
    /(?:linear|radial)-gradient\([^,]+(?:,\s*[^,]+)?,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/
  )
  return m ? m[1] : '#888888'
}

/**
 * Convert a solid / CSS linear|radial gradient into an SVG paint + optional <defs> entry.
 * Gradients use objectBoundingBox so they fit each path/stroke they tint.
 */
export function svgPaintFromCssColor(
  color: string,
  id: string
): { defs: string; paint: string } {
  if (color.startsWith('linear-gradient(')) {
    const m = color.match(/linear-gradient\((\d+(?:\.\d+)?)deg(,.+)\)/)
    if (m) {
      const stops = parseCssGradientStops(m[2])
      if (stops.length >= 2) {
        // CSS 0deg = bottom→top; SVG x1/y1 → x2/y2 in objectBoundingBox.
        const rad = ((90 - parseFloat(m[1])) * Math.PI) / 180
        const x1 = 0.5 - Math.cos(rad) * 0.5
        const y1 = 0.5 + Math.sin(rad) * 0.5
        const x2 = 0.5 + Math.cos(rad) * 0.5
        const y2 = 0.5 - Math.sin(rad) * 0.5
        const stopEls = stops
          .map((s) => `<stop offset="${Math.round(s.pos * 100)}%" stop-color="${s.color}"/>`)
          .join('')
        return {
          defs: `<linearGradient id="${id}" gradientUnits="objectBoundingBox" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopEls}</linearGradient>`,
          paint: `url(#${id})`
        }
      }
    }
  }
  if (color.startsWith('radial-gradient(')) {
    const m = color.match(/radial-gradient\(circle at (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%(,.+)\)/)
    if (m) {
      const stops = parseCssGradientStops(m[3])
      if (stops.length >= 2) {
        const cx = parseFloat(m[1]) / 100
        const cy = parseFloat(m[2]) / 100
        const stopEls = stops
          .map((s) => `<stop offset="${Math.round(s.pos * 100)}%" stop-color="${s.color}"/>`)
          .join('')
        return {
          defs: `<radialGradient id="${id}" gradientUnits="objectBoundingBox" cx="${cx}" cy="${cy}" r="0.75">${stopEls}</radialGradient>`,
          paint: `url(#${id})`
        }
      }
    }
  }
  return { defs: '', paint: color }
}

function injectSvgDefs(svg: string, defsInner: string): string {
  if (!defsInner) return svg
  if (/<defs[\s>]/i.test(svg)) {
    return svg.replace(/<defs([^>]*)>/i, `<defs$1>${defsInner}`)
  }
  return svg.replace(/<svg([^>]*)>/i, `<svg$1><defs>${defsInner}</defs>`)
}

/**
 * Tint an SVG with up to five colours.
 *
 * - Single-colour mode (all extra colours empty or same as primary):
 *   replaces currentColor + all explicit fills/strokes with the primary colour.
 *
 * - Multi-colour mode:
 *   maps the SVG's distinct colours (by order of first appearance) to
 *   primary → 1st, color2 → 2nd, color3 → 3rd, color4 → 4th, color5 → 5th+.
 *   Empty extra colours fall back to primary.
 *
 * CSS linear/radial gradients are converted to SVG <defs> + url(#id) paints
 * (raw CSS gradient strings are invalid in SVG fill/stroke attributes).
 */
export function applySvgColor(
  svgMarkup: string,
  primary: string,
  color2 = '',
  color3 = '',
  color4 = '',
  color5 = ''
): string {
  if (!primary || primary === 'currentColor') return svgMarkup

  const c2 = color2.trim() || primary
  const c3 = color3.trim() || primary
  const c4 = color4.trim() || primary
  const c5 = color5.trim() || primary

  const defsParts: string[] = []
  let gradSeq = 0
  const toPaint = (color: string): string => {
    if (!isCssGradientColor(color)) return color
    const id = `ig-grad-${gradSeq++}`
    const { defs, paint } = svgPaintFromCssColor(color, id)
    if (defs) defsParts.push(defs)
    return paint
  }

  const p1 = toPaint(primary)
  const p2 = toPaint(c2)
  const p3 = toPaint(c3)
  const p4 = toPaint(c4)
  const p5 = toPaint(c5)

  let result: string
  // Single-colour shortcut
  if (c2 === primary && c3 === primary && c4 === primary && c5 === primary) {
    result = svgMarkup
      .replace(/currentColor/g, p1)
      .replace(/fill="(?!none\b|transparent\b)[^"]+"/g, `fill="${p1}"`)
      .replace(/stroke="(?!none\b|transparent\b)[^"]+"/g, `stroke="${p1}"`)
      .replace(/(fill\s*:\s*)(?!none\b|transparent\b)[^;")]+/g, `$1${p1}`)
      .replace(/(stroke\s*:\s*)(?!none\b|transparent\b)[^;")]+/g, `$1${p1}`)
  } else {
    // Multi-colour mode: map each distinct colour slot to a replacement
    const distinct = getDistinctSvgColors(svgMarkup)
    result = svgMarkup.replace(/currentColor/g, p1)
    const slots = [p1, p2, p3, p4, p5]
    distinct.forEach((orig, i) => {
      // Don't rewrite colours that are already url(#…) paints.
      if (/^url\(/i.test(orig) || isCssGradientColor(orig)) return
      result = replaceSvgColor(result, orig, slots[Math.min(i, slots.length - 1)])
    })
  }

  return injectSvgDefs(result, defsParts.join(''))
}

// ── Canvas SVG drawing ────────────────────────────────────────────────────────

// Cache decoded HTMLImageElement objects by their source (data URL or object URL).
// Avoids repeated Image() decode which is expensive for large data URLs.
const imageCache = new Map<string, HTMLImageElement>()
const MAX_IMAGE_CACHE = 60

// Cache the final rasterised HTMLImageElement for each (svgMarkup, w, h) triple.
// This is the hottest path: the same Lucide icon / complex shape is drawn many
// times per second during slider drags. With caching, after the first render each
// subsequent draw is a synchronous imageSmoothingEnabled + drawImage call.
const svgRasterCache = new Map<string, HTMLImageElement>()
const MAX_SVG_RASTER_CACHE = 80

function ensureSvgNamespace(svg: string): string {
  if (!svg.includes('xmlns')) {
    return svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  return svg
}

/**
 * Override the width/height attributes on the root <svg> element so the browser
 * rasterises at the exact target resolution rather than at the SVG's natural size.
 * This eliminates blocky/rough edges when a small-viewBox SVG is drawn at large sizes.
 */
function setSvgDimensions(svg: string, w: number, h: number): string {
  const pw = Math.ceil(w)
  const ph = Math.ceil(h)
  return svg.replace(/<svg([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\s+width\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s+height\s*=\s*["'][^"']*["']/gi, '')
    return `<svg${cleaned} width="${pw}" height="${ph}">`
  })
}

function evictOldest<K, V>(map: Map<K, V>, maxSize: number): void {
  if (map.size >= maxSize) {
    map.delete(map.keys().next().value as K)
  }
}

/**
 * Load an image from a URL, caching the decoded HTMLImageElement so that repeated
 * calls with the same URL (e.g. same data URL for a user-uploaded image) return
 * immediately without re-decoding.
 */
export function loadCachedImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  if (imageCache.has(src)) return Promise.resolve(imageCache.get(src)!)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      evictOldest(imageCache, MAX_IMAGE_CACHE)
      imageCache.set(src, img)
      resolve(img)
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * Draw an SVG markup string onto a canvas context at the given position/size.
 * The SVG is rasterised at the exact target dimensions so it stays crisp at any scale.
 * Results are cached by (markup + dimensions) so repeated draws of the same icon
 * (e.g. during slider drags) hit the cache after the first render.
 */
export function drawSvgOnCanvas(
  ctx: CanvasRenderingContext2D,
  svgMarkup: string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  let svg = ensureSvgNamespace(svgMarkup.trim())
  if (!svg) return Promise.resolve()

  // Stamp the target pixel dimensions onto the SVG root so the browser renders
  // it at full resolution instead of upscaling a small natural-size bitmap.
  svg = setSvgDimensions(svg, width, height)

  // Build a compact cache key: pixel dimensions + a prefix of the SVG content.
  // The full SVG is used for correctness; for large SVGs this is intentionally
  // cached by reference identity (same colored string → same key).
  const pw = Math.ceil(width)
  const ph = Math.ceil(height)
  const rasterKey = `${pw}x${ph}::${svg}`

  const cached = svgRasterCache.get(rasterKey)
  if (cached) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(cached, x, y, width, height)
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()

    img.onload = () => {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, x, y, width, height)
      evictOldest(svgRasterCache, MAX_SVG_RASTER_CACHE)
      svgRasterCache.set(rasterKey, img)
      URL.revokeObjectURL(url)
      resolve()
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve()
    }
    img.src = url
  })
}

export function clearIconCaches(): void {
  svgCache.clear()
  imageCache.clear()
  svgRasterCache.clear()
}

// ── AI icon generation ────────────────────────────────────────────────────────

export interface GenerateIconOptions {
  description: string
  appName?: string
  apiKey: string
  style?: 'outline' | 'filled'
}

export interface GenerateIconResult {
  success: boolean
  svgMarkup?: string
  error?: string
}

export async function generateAIIcon(opts: GenerateIconOptions): Promise<GenerateIconResult> {
  const { description, appName = '', apiKey, style = 'outline' } = opts

  const styleInstr =
    style === 'outline'
      ? 'Use stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2".'
      : 'Use fill="currentColor" with no stroke.'

  const prompt = [
    `Design a clean minimal SVG icon${appName ? ` for "${appName}"` : ''}: "${description}".`,
    'viewBox must be "0 0 24 24". Use only path/circle/rect/line/polyline/ellipse/polygon.',
    styleInstr,
    'Max 4 elements. Must be recognizable at 16px. Return ONLY valid SVG XML, no explanation.'
  ].join(' ')

  try {
    // Route through main process to avoid renderer CORS/CSP restrictions
    const result = await (window as Window & { api?: { geminiGenerate?: (p: string, k: string) => Promise<{ success: boolean; text?: string; error?: string }> } }).api?.geminiGenerate?.(prompt, apiKey)
    if (!result) return { success: false, error: 'IPC bridge unavailable' }
    if (!result.success) return { success: false, error: result.error }
    // Strip markdown code fences in case the model wraps output despite instructions
    const cleaned = (result.text ?? '').replace(/```[\w]*\n?/g, '').replace(/```/g, '')
    const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i)
    if (!match) return { success: false, error: 'No valid SVG in AI response' }
    return { success: true, svgMarkup: match[0] }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── AI image generation (SVG illustration rasterised to PNG data URL) ─────────

export interface GenerateImageResult {
  success: boolean
  dataUrl?: string
  error?: string
}

/**
 * Remove the background of an image using canvas flood-fill from all four corners.
 * Works well for solid/uniform backgrounds (AI-generated images, logos on white, etc.).
 * Runs fully offline — no API, no network, instant.
 */
export function removeImageBackground(dataUrl: string): Promise<GenerateImageResult> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const w = canvas.width
      const h = canvas.height

      // Sample the background colour from all four corners and pick the most common
      const sampleCorner = (x: number, y: number) => {
        const i = (y * w + x) * 4
        return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const
      }
      const corners = [sampleCorner(0, 0), sampleCorner(w - 1, 0), sampleCorner(0, h - 1), sampleCorner(w - 1, h - 1)]
      // Use the average of corners as the target background colour
      const bgR = Math.round(corners.reduce((s, c) => s + c[0], 0) / 4)
      const bgG = Math.round(corners.reduce((s, c) => s + c[1], 0) / 4)
      const bgB = Math.round(corners.reduce((s, c) => s + c[2], 0) / 4)

      const TOLERANCE = 40 // colour distance threshold

      const colourDistance = (i: number) =>
        Math.sqrt(
          Math.pow(data[i] - bgR, 2) +
          Math.pow(data[i + 1] - bgG, 2) +
          Math.pow(data[i + 2] - bgB, 2)
        )

      // BFS flood-fill from all four corners simultaneously
      const visited = new Uint8Array(w * h)
      const queue: number[] = []
      const seed = (x: number, y: number) => {
        const idx = y * w + x
        if (!visited[idx]) { visited[idx] = 1; queue.push(idx) }
      }
      seed(0, 0); seed(w - 1, 0); seed(0, h - 1); seed(w - 1, h - 1)

      let qi = 0
      while (qi < queue.length) {
        const idx = queue[qi++]
        const px = idx % w
        const py = Math.floor(idx / w)
        const pi = idx * 4

        if (colourDistance(pi) <= TOLERANCE) {
          // Make pixel transparent
          data[pi + 3] = 0
          // Spread to 4 neighbours
          const neighbours = [
            px > 0 ? idx - 1 : -1,
            px < w - 1 ? idx + 1 : -1,
            py > 0 ? idx - w : -1,
            py < h - 1 ? idx + w : -1,
          ]
          for (const n of neighbours) {
            if (n >= 0 && !visited[n]) { visited[n] = 1; queue.push(n) }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)
      resolve({ success: true, dataUrl: canvas.toDataURL('image/png') })
    }
    img.onerror = () => resolve({ success: false, error: 'Failed to load image for background removal' })
    img.src = dataUrl
  })
}

export async function generateAIImage(description: string, referenceImage?: string): Promise<GenerateImageResult> {
  // Pollinations.ai is free with no API key — pass empty string for token (ignored server-side)
  const prompt = `${description}, high quality, detailed, square format`
  try {
    const api = (window as Window & { api?: { geminiGenerateImage?: (p: string, k: string, img?: string) => Promise<{ success: boolean; mimeType?: string; data?: string; error?: string }> } }).api
    const result = await api?.geminiGenerateImage?.(prompt, '', referenceImage)
    if (!result) return { success: false, error: 'IPC bridge unavailable' }
    if (!result.success) return { success: false, error: result.error }
    if (!result.data) return { success: false, error: 'No image data in response' }
    const rawDataUrl = `data:${result.mimeType ?? 'image/jpeg'};base64,${result.data}`
    // Auto-remove background using canvas flood-fill (offline, instant)
    const bgResult = await removeImageBackground(rawDataUrl)
    return bgResult.success ? bgResult : { success: true, dataUrl: rawDataUrl }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── API key storage ───────────────────────────────────────────────────────────

const KEY_STORE = 'imggen:gemini_key'
export const getStoredApiKey = (): string =>
  localStorage.getItem(KEY_STORE) ?? localStorage.getItem('imggen:openai_key') ?? ''
export const storeApiKey = (key: string): void => {
  localStorage.removeItem('imggen:openai_key') // remove old key if present
  key ? localStorage.setItem(KEY_STORE, key) : localStorage.removeItem(KEY_STORE)
}

const HF_KEY_STORE = 'imggen:hf_key'
export const getStoredHFKey = (): string => localStorage.getItem(HF_KEY_STORE) ?? ''
export const storeHFKey = (key: string): void => {
  key ? localStorage.setItem(HF_KEY_STORE, key) : localStorage.removeItem(HF_KEY_STORE)
}
