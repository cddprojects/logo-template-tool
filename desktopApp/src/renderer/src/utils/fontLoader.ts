/**
 * Smart font loader.
 *
 * Fonts live in public/fonts/<Family-Name>.css (one file per family).
 * We load only what the current version uses, then trickle-load the
 * rest during idle time so startup stays fast.
 */

const ALL_FAMILIES = [
  // Modern sans-serif
  'Inter', 'DM Sans', 'Manrope', 'Geist', 'Figtree', 'Outfit',
  'Plus Jakarta Sans', 'Space Grotesk', 'Rubik', 'Work Sans',
  'Quicksand', 'Mulish', 'Nunito Sans', 'Lexend', 'Karla', 'Cabin',
  'Exo 2', 'Comfortaa',
  // Classic sans-serif
  'Poppins', 'Montserrat', 'Raleway', 'Josefin Sans', 'Barlow', 'Lato',
  'Open Sans', 'Nunito', 'Source Sans 3', 'Ubuntu',
  // Serif
  'Playfair Display', 'Merriweather', 'Libre Baskerville',
  'Cormorant Garamond', 'Lora', 'EB Garamond', 'Bitter',
  'Roboto Slab', 'PT Serif', 'Crimson Text', 'Noto Serif', 'Spectral',
  'Arvo', 'Alegreya', 'Vollkorn', 'Cardo', 'Domine',
  'Libre Caslon Text', 'Tinos', 'Old Standard TT',
  // Display / stylistic
  'Bebas Neue', 'Cinzel', 'Abril Fatface', 'Fredoka',
  'Lobster', 'Pacifico', 'Righteous',
  'Oswald', 'Anton', 'Russo One', 'Lilita One', 'Squada One',
  // Handwriting / cursive / script
  'Dancing Script', 'Satisfy', 'Sacramento', 'Caveat', 'Permanent Marker',
  'Great Vibes', 'Parisienne', 'Alex Brush', 'Kaushan Script', 'Pinyon Script',
  // Monospace
  'JetBrains Mono', 'Fira Code', 'Roboto', 'Roboto Mono',
  'Inconsolata', 'Space Mono', 'Source Code Pro',
]

const loaded = new Set<string>()
// Per-family promises so multiple callers await the same load
const promises = new Map<string, Promise<void>>()

/**
 * Inject the CSS for one font family and force Chromium to actually download
 * the woff2 files.
 *
 * Chromium skips @font-face downloads for fonts that aren't referenced by
 * any DOM element — which means canvas-only fonts silently fall back to the
 * system default. We defeat this by temporarily appending a hidden <span>
 * that references the family; once the font is confirmed ready via
 * `document.fonts.check()` we remove the span.
 *
 * Returns a Promise that resolves once the 400-weight face is available.
 */
export function loadFont(family: string): Promise<void> {
  if (promises.has(family)) return promises.get(family)!

  const p = new Promise<void>((resolve) => {
    if (loaded.has(family)) { resolve(); return }
    loaded.add(family)

    const filename = family.replace(/\s+/g, '-') + '.css'
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    // Use a relative path so it resolves correctly in the packaged file:// context.
    // An absolute /fonts/... path resolves to the filesystem root (C:\fonts\...) in
    // Electron's file:// renderer — the ASAR assets live at ./fonts/... relative to
    // the HTML file, matching Vite's base:'./' build output.
    link.href = `./fonts/${filename}`

    link.onload = () => {
      // Sentinel: a hidden DOM element that references the font family.
      // This tells Chromium the font IS needed and should be downloaded now.
      const sentinel = document.createElement('span')
      sentinel.setAttribute('aria-hidden', 'true')
      sentinel.style.cssText =
        `position:absolute;top:-9999px;left:-9999px;` +
        `font-family:"${family}";font-size:1px;` +
        `visibility:hidden;pointer-events:none;user-select:none;`
      sentinel.textContent = 'a'
      document.body.appendChild(sentinel)

      // Also prod the Fonts API — belt-and-suspenders
      const weights = ['400', '700', '300', '500', '600']
      Promise.allSettled(weights.map(w => document.fonts.load(`${w} 16px "${family}"`)))
        .then(() => {
          sentinel.remove()
          resolve()
        })
        .catch(() => {
          sentinel.remove()
          resolve()
        })
    }

    link.onerror = () => resolve()
    document.head.appendChild(link)
  })

  promises.set(family, p)
  return p
}

/** Load a list of families immediately. */
export function loadFonts(families: Iterable<string>): void {
  for (const f of families) loadFont(f)
}

/**
 * Walk a plain JSON value recursively and collect every `fontFamily` value.
 */
export function extractFontFamilies(obj: unknown): Set<string> {
  const result = new Set<string>()
  function walk(v: unknown) {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) { v.forEach(walk); return }
    const o = v as Record<string, unknown>
    if (typeof o.fontFamily === 'string' && o.fontFamily) result.add(o.fontFamily)
    for (const val of Object.values(o)) walk(val)
  }
  walk(obj)
  return result
}

/**
 * Load fonts used by `versions` immediately, then schedule idle-time loading
 * of all remaining families so they're ready when the user needs them.
 */
export function initFontLoading(versions: unknown[]): void {
  // 1. Always load Inter first — it's the UI default
  loadFont('Inter')

  // 2. Load fonts actually in use right now
  const inUse = extractFontFamilies(versions)
  loadFonts(inUse)

  // 3. Trickle-load the rest during idle time
  const remaining = ALL_FAMILIES.filter((f) => !loaded.has(f))
  let i = 0
  const loadNext = (deadline?: IdleDeadline) => {
    while (i < remaining.length && (!deadline || deadline.timeRemaining() > 4)) {
      loadFont(remaining[i++])
    }
    if (i < remaining.length) {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(loadNext, { timeout: 2000 })
      } else {
        setTimeout(() => loadNext(), 200)
      }
    }
  }

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(loadNext, { timeout: 3000 })
  } else {
    setTimeout(() => loadNext(), 500)
  }
}
