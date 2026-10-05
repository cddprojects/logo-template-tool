/**
 * WALKTHROUGH: desktopApp/src/renderer/src/utils/renderer.ts (~2900+ lines)
 *
 * This file turns config objects into PIXELS (and sometimes SVG text).
 * No React. Pure functions + canvas 2D API.
 *
 * You will NOT read every line. Learn the ENTRY POINTS, then dive into one path.
 *
 * ── Entry points (search these names) ───────────────────────────────────────
 * renderLogo(canvas, config, scale, …)
 *   Sizes the canvas for text+icon layout, draws background, icon, text.
 * renderFavicon(canvas, config)
 *   Square: outer shape → content → paint layers → shadows/borders.
 * drawIcon(ctx or canvas path, icon: IconConfig, …)
 *   Shared “draw this icon recipe” used by logos and some sync paths.
 * generateLogoSvg / generateFaviconSvg
 *   Build SVG markup strings for export (not canvas).
 * bakeFaviconPaintContentLayer / faviconInnerDrawSize
 *   Helpers so Paint and favicon preview agree on inner size.
 *
 * ── Top helpers (~49–200) ───────────────────────────────────────────────────
 * resolveCanvasColor — solid hex or CSS gradient → canvas fillStyle
 * firstSolidColor — pick one color for SVG / shadows
 * drawShape / buildShapePath / roundedRect — geometry for circles, hex, etc.
 * strokeInsideBorder / clipInsetShape — borders that don’t leak outside
 * withLetterSpacing / fillSpacedText — text with tracking (letter-spacing)
 * outerShadowSidePads — how much extra canvas a drop shadow needs
 *
 * ── drawIcon (~681) ─────────────────────────────────────────────────────────
 * Big switch on icon.sourceType:
 *   shape → path + fill
 *   lucide → load SVG path data, tint
 *   text → font + letters
 *   svg → parse markup
 *   image → drawImage + optional recolor slots Color 1–5
 * Then container (outer behind content), shadows, paint decoration PNGs.
 * Supersampled offscreen (2×) for sharper small icons, then composite down.
 *
 * ── renderLogo (~1430) ──────────────────────────────────────────────────────
 * 1. Measure text (fonts must be loaded — fontLoader)
 * 2. Compute layout boxes for icon-left / icon-right / icon-top
 * 3. Set canvas width/height including shadow padding
 * 4. Fill background (or leave transparent)
 * 5. drawIcon for the effective icon
 * 6. Draw primary + secondary text with fills/strokes/underlines
 *
 * Optional faviconIconSource: when linked, icon drawing may go through a
 * synced favicon path (drawSyncedFaviconIcon — search that name).
 *
 * ── renderFavicon (~2244) ───────────────────────────────────────────────────
 * 1. Square size from config.size
 * 2. Outer silhouette (math shape / image / SVG markup)
 * 3. Fill / border / outer shadow (with inset if shadow eats into shape)
 * 4. Inner content (similar to drawIcon’s content types)
 * 5. If paintSession exists: draw Universal brush / decoration layers
 *    (drawUniversalBrushLayers — MUST tolerate null session; blank bug fix)
 * 6. If no paint session, skip paint layer path entirely
 *
 * ── SVG generators (~2740+) ─────────────────────────────────────────────────
 * Parallel logic for vector export. Not pixel-perfect identical to canvas
 * for every effect, but good enough for clean brand marks.
 *
 * ── How to debug a wrong preview ────────────────────────────────────────────
 * 1. Is the CONFIG wrong? (log config in the editor effect)
 * 2. Or the DRAW wrong? (breakpoint inside renderFavicon / drawIcon)
 * 3. Paint-only wrong? Check paintSession fields / null guards
 *
 * Isolation: some paint subcalls are wrapped in try/catch so one bad layer
 * doesn’t blank the entire favicon.
 *
 * Next: 09-paint.ts
 */
export {}
