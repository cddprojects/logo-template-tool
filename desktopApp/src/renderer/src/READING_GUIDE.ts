/**
 * ═══════════════════════════════════════════════════════════════════════════
 * READING GUIDE — Image Generator (desktop + web share this renderer)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Read this file first. It is comments only (nothing runs). It maps how the
 * app fits together so you can open each file with a mental model.
 *
 * Absolute beginner (no React)? Start at beginner/00-START-HERE.ts instead —
 * line-by-line companions for main, types, App, useVersions, editors, canvas,
 * renderer, paint, and Electron vs web.
 *
 * ── What the product is ─────────────────────────────────────────────────────
 * You edit “versions”. Each version holds:
 *   • logos[]     — wordmark variants (Dark / Light / …), each with text + icon
 *   • favicons[]  — square icon variants, often synced to a logo by the same label
 *
 * Preview is drawn on HTML canvas. Export writes PNG / SVG / ICO. Paint mode
 * lets you draw on top of Outer (shape) and Inner (glyph / image / SVG).
 *
 * ── Two shells, one editor UI ───────────────────────────────────────────────
 * Desktop: Electron
 *   main process  → desktopApp/src/main/index.ts  (files, IPC, local HTTP API)
 *   preload       → desktopApp/src/preload/index.ts  (exposes window.api)
 *   renderer      → THIS folder (React UI)
 *
 * Web: Vite app in webApp/
 *   webApp/src/main.tsx installs a browser window.api, then mounts WebShell
 *   WebShell handles login; then mounts the SAME App.tsx from this folder
 *   (@renderer alias in webApp/vite.config.ts)
 *
 * Rule of thumb: almost all editing UI lives here under desktopApp/.../renderer.
 * Fix a logo bug once → both desktop and web get it after rebuild.
 *
 * ── Suggested reading order ─────────────────────────────────────────────────
 * 1. main.tsx          — React mounts, splash dismissed
 * 2. App.tsx           — shell: sidebar, tabs, undo, drag-import, which editor shows
 * 3. hooks/useVersions.ts — load/save versions, undo history, create/import
 * 4. utils/versionMigrate.ts — old templates → current field defaults
 * 5. components/LogoEditor.tsx / FaviconEditor.tsx — controls + preview loop
 * 6. components/PreviewStage.tsx — pan/zoom stage around the preview canvas
 * 7. utils/canvasPool.ts — dual-buffer present (no flash when swapping frames)
 * 8. utils/renderer.ts — drawLogo / drawFavicon / drawIcon (pixels)
 * 9. utils/paintDecorations.ts + IconPaintEditor.tsx — paint overlays / punch
 * 10. desktopApp/src/main/index.ts — disk, templates folder, IPC (desktop only)
 * 11. webApp/src/platform/api.ts — same window.api methods, but talk to the server
 *
 * ── Data flow (happy path) ──────────────────────────────────────────────────
 * Sidebar picks a version id
 *   → App passes that version’s logos/favicons into LogoEditor / FaviconEditor
 *   → User moves a slider → editor calls onChange(variants)
 *   → App → useVersions.updateVersion → debounce save via window.api.saveVersions
 *   → Preview useEffect re-renders offscreen → presentPreviewCanvas → screen
 *
 * ── Logo ↔ favicon sync ─────────────────────────────────────────────────────
 * When logo.iconLinked is true and a favicon shares the exact same label
 * (“Dark” with “Dark”), the logo icon preview is drawn from the favicon
 * (drawSyncedFaviconIcon). Unlink to edit the logo icon independently.
 *
 * ── Paint sessions ──────────────────────────────────────────────────────────
 * Stored on icon.paintSession or favicon.paintSession (PNG planes + vectors).
 * migratePaintSession / versionMigrate only ADD missing fields — never clear
 * bake flags (that used to punch holes through Outer+Inner).
 *
 * ── Templates (.igtemplate) ─────────────────────────────────────────────────
 * JSON: { schemaVersion, name, logos, favicons }.
 * “Update all templates” remigrates open versions and rewrites library files.
 */
export {}
