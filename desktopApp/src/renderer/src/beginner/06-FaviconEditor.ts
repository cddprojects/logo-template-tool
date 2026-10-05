/**
 * WALKTHROUGH: desktopApp/src/renderer/src/components/FaviconEditor.tsx (~1800 lines)
 * Open FaviconEditor.tsx beside this. Same patterns as LogoEditor — differences below.
 *
 * ── What is a Favicon here? ─────────────────────────────────────────────────
 * A square site icon:
 *   OUTER — frame shape (circle, rounded square, shield, map-pin, image, SVG…)
 *            + background color / transparency + border + outer shadow
 *   INNER — content (letters, lucide, shape, SVG markup, uploaded image, …)
 * Optional paintSession on the whole favicon (Outer + Inner layers in Paint).
 *
 * ── Props (search FaviconEditorProps / export function FaviconEditor) ────────
 * Same idea as LogoEditor: versionId, variants (favicons[]), onChange,
 * optional logos for unlink/apply-to-all sync, isActive, onNotify.
 *
 * ── Dual canvas preview ─────────────────────────────────────────────────────
 * Same presentPreviewCanvas(A/B) pattern as logos.
 * DIFFERENCE: preview is shown at a FIXED CSS size (previewSize), not the
 * full render pixel width. So you usually won’t see the “oversized flash”
 * logos needed fitNow() to fix. Still dual-buffer to avoid blank frames.
 *
 * ── Preview effect (search renderFavicon) ───────────────────────────────────
 * 1. offscreen canvas sized to config.size (or export size)
 * 2. await renderFavicon(offscreen, config)
 * 3. presentPreviewCanvas → visible buffer
 * renderId / busy flags same as LogoEditor (ignore stale draws).
 *
 * ── Outer vs Inner in the style panel ───────────────────────────────────────
 * OuterCategoryTabs — None / Shapes / Image / SVG for the frame
 * Content type options — letters, lucide, shape, image, Canva prompt, …
 * Color rows, border, radius, shadows mirror types in FaviconConfig
 *
 * ── Paint (~296 banner) ─────────────────────────────────────────────────────
 * Opens same IconPaintEditor with favicon-specific bake sizes
 * (faviconInnerDrawSize, bakeFaviconPaintContentLayer in renderer).
 * Save → applyPaintSaveToFavicon → onChange.
 * If a logo was linked to this label, paint may also update that logo’s
 * synced icon fields via onLogosChange helpers.
 *
 * ── Export ──────────────────────────────────────────────────────────────────
 * PNG, SVG, and ICO (multi-size). ICO builds several PNG sizes then packs.
 *
 * ── Sync relationship (remember) ────────────────────────────────────────────
 * Matching LABEL (“Dark” logo ↔ “Dark” favicon) + logo.iconLinked
 * → LogoEditor draws from THIS favicon’s content.
 * Editing favicon while linked updates what the logo preview shows.
 *
 * Study path:
 *   1. Skim FaviconConfig in types.ts
 *   2. Find renderFavicon useEffect
 *   3. Trace one Outer shape change → onChange → App → save
 *
 * Next: 07-PreviewAndCanvas.ts
 */
export {}
