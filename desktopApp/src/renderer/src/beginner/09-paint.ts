/**
 * WALKTHROUGH: Paint mode (guided tour — not every line of 10k+)
 *
 * Main files:
 *   components/IconPaintEditor.tsx     — the Paint UI (HUGE)
 *   components/iconPaint/paintHelpers.tsx
 *   utils/paintDecorations.ts          — bake / composite decoration PNGs
 *   utils/paintVectorRender.ts         — draw vectors onto canvas
 *   utils/paintSessionMigrate.ts       — upgrade old paintSession JSON
 *   utils/paintSettingsSync.ts         — apply Paint save → logo/favicon configs
 *   utils/paintHoles.ts / paintReshape.ts — punch masks / reshape helpers
 *
 * ── What Paint is for ───────────────────────────────────────────────────────
 * Freehand / shapes / text / punch-through on top of:
 *   OUTER (container / favicon frame)
 *   INNER (glyph / image content)
 * Results save as paintSession: PNG planes + vector list + flags.
 *
 * ── paintSession (in types.ts) — mental model ───────────────────────────────
 * Think of stacked transparent PNGs + a list of editable vectors:
 *   containerPng / contentPng — baked raster layers
 *   *DecorationsPng — brush strokes sitting above
 *   vectors[] — shapes/text/strokes you can still select later
 *   punch / hole masks — cut transparency through layers
 *   bake flags — “this was flattened into decorations” (do NOT clear casually)
 *
 * Migration only ADDS missing fields. Clearing bake flags used to punch
 * accidental holes through Outer+Inner on old templates.
 *
 * ── Opening Paint from Logo / Favicon editor ────────────────────────────────
 * User clicks Edit → lazy load IconPaintEditor
 * Parent passes:
 *   starting layers (from current icon/favicon)
 *   sizes (logoPaintInnerDrawSize / faviconInnerDrawSize, …)
 *   onSave(result) → paintSettingsSync apply* → onChange variants
 *
 * ── IconPaintEditor structure (search banners) ──────────────────────────────
 * export function IconPaintEditor (~336) — props + local tool state
 * Editable vector lines (~517)
 * Vector line helpers (~3041)
 * Flood fill (~5069)
 * Copy / paste (~7755)
 * Pointer handlers (~9400) — mouse/touch draw
 *
 * Tools roughly: brush, eraser, shapes, text, fill, select, punch-through, …
 * Layer toggles: which plane you’re editing (outer vs inner vs decorations).
 *
 * ── Save path (paintSettingsSync.ts) ────────────────────────────────────────
 * applyPaintSaveToIcon / applyPaintSaveToFavicon:
 *   merge PaintSaveResult into IconConfig or FaviconConfig
 *   update stashes (contentTypeStash) so switching content type can restore
 *   if linked: may write both logo icon and favicon twin
 *
 * ── How preview uses paint after save ───────────────────────────────────────
 * renderFavicon / drawIcon read paintSession and call decoration drawers
 * (paintDecorations / paintVectorRender). If paintSession is null/missing,
 * those paths must no-op — never crash on .vectors of null.
 *
 * ── How to learn Paint without reading 14,000 lines ─────────────────────────
 * 1. Open Paint once; note Outer vs Inner layer switch in the UI
 * 2. Draw one stroke → Save → inspect JSON: which PNG field grew
 * 3. Read applyPaintSaveToIcon in paintSettingsSync (short, purposeful)
 * 4. Grep drawUniversalBrushLayers in renderer — see null guard
 * 5. Only then open IconPaintEditor pointer handlers if you need a tool bug
 *
 * Next: 10-electron-and-web.ts (how desktop and browser wrap the same UI)
 */
export {}
