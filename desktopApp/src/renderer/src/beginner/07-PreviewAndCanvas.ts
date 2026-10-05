/**
 * WALKTHROUGH: preview stage + dual-buffer canvas
 *
 * Files:
 *   components/PreviewStage.tsx
 *   utils/canvasPool.ts  (presentPreviewCanvas)
 *
 * Open both beside this. This is why version-switching used to “flash”.
 *
 * ── What is a canvas? ───────────────────────────────────────────────────────
 * <canvas> is an HTML element that holds a bitmap (grid of pixels).
 * JavaScript draws on it with getContext('2d'). The user sees whatever
 * pixels are currently in the canvas that is visible on the page.
 *
 * Setting canvas.width or canvas.height CLEARS the bitmap. That was a
 * common flash: resize the visible canvas → one blank frame → draw.
 *
 * ── Dual buffer idea (canvasPool.ts presentPreviewCanvas) ───────────────────
 * Keep TWO canvases on screen (A and B). One is visible; one is hidden.
 *
 * presentPreviewCanvas(buffers, showingA, source):
 *   1. Pick the HIDDEN one as “back”
 *   2. Set back.width/height (clears BACK only — user still sees FRONT)
 *   3. drawImage(source) onto back (copy finished offscreen render)
 *   4. Show back (display/visibility), hide front
 *   5. Flip showingA.current
 *   6. Return the new visible canvas
 *
 * Result: the frame the user was looking at is never cleared.
 *
 * takeCanvas / releaseCanvas — recycle temporary canvases for paint/render
 * so we don’t allocate a new giant bitmap every mouse move.
 *
 * ── PreviewStage.tsx (pan / zoom wrapper) ───────────────────────────────────
 * Children (the dual canvases) sit inside a div with CSS:
 *   transform: translate(tx, ty) scale(s)
 *
 * View state: { scale, tx, ty }
 * applyView — writes transform to the DOM AND setState (for UI labels)
 *
 * Auto-fit (fit):
 *   Measure content natural size (offsetWidth — ignores transform)
 *   scale = min(90% of container / content, 1) — never upscale past 100%
 *   Center with tx/ty = 0
 *
 * fitNow() via forwardRef + useImperativeHandle:
 *   Parent (LogoEditor) calls this RIGHT AFTER presentPreviewCanvas.
 *   Why: logos render at full pixel size (e.g. 2000px wide). Without an
 *   immediate fit, one frame shows that huge canvas at scale 1 before
 *   React’s ResizeObserver catches up → “oversized flash”.
 *
 * Interaction:
 *   Middle-drag → pan (autoFitRef = false)
 *   Ctrl+wheel or right-button+wheel → zoom toward cursor
 *   Toolbar: stage background (preview only), fit, zoom ±
 *
 * transformHot / will-change:
 *   Only promote the transform layer while interacting. Permanent
 *   will-change made Chromium cache old canvas bitmaps (stale frames).
 *
 * surfaceKey prop:
 *   When version/variant changes, briefly drop will-change so Chromium
 *   picks up the new bitmap under the CSS transform.
 *
 * ── End-to-end preview pipeline ─────────────────────────────────────────────
 * User moves slider
 *   → config state changes
 *   → useEffect in Logo/FaviconEditor
 *   → renderLogo / renderFavicon on OFFSCREEN canvas
 *   → presentPreviewCanvas (swap A/B)
 *   → fitNow() (logos)
 *   → user sees new image without blank or oversized frame
 *
 * Next: 08-renderer.ts.ts (what happens inside renderLogo / renderFavicon)
 */
export {}
