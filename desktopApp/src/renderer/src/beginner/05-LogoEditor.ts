/**
 * WALKTHROUGH: desktopApp/src/renderer/src/components/LogoEditor.tsx (~2400 lines)
 *
 * Too big for every single line. Use this as a MAP: search the banners in the
 * source file header, then read those sections. Open LogoEditor.tsx beside this.
 *
 * ── What is a Logo here? ────────────────────────────────────────────────────
 * Text (brand name) + optional subtitle + an ICON (shape / lucide / SVG /
 * letters / image). Layout: icon-left, icon-right, or icon-top.
 * Variants = chips like “Dark” / “Light” — each has its own LogoConfig.
 *
 * ── Props (interface LogoEditorProps, ~128) ─────────────────────────────────
 * versionId / versionName — which project we’re editing
 * variants — logos[] for this version
 * faviconVariants — needed so linked icons can mirror favicon by label
 * onChange(logos) — send updated array up to App → useVersions
 * onFaviconChange — when Paint on a linked icon must update the favicon twin
 * isActive — false when Favicon tab is showing (still mounted, just hidden)
 *
 * ── Top of LogoEditor function (~141) ───────────────────────────────────────
 * activeId — which variant chip is selected
 * canvasARef / canvasBRef / previewShowingA — dual preview buffers (no flash)
 * previewStageRef — call fitNow() after presenting a new bitmap
 * renderIdRef — ignore stale async renders if a newer one started
 * panelWidth — resizable style panel
 * safeConfig (useMemo) — merge missing icon fields so old saves don’t crash;
 *   memoized so unrelated UI state doesn’t rebuild config and re-trigger draw
 *
 * ── Sync with favicon (search iconLinked / resolveLogoEffectiveIcon) ────────
 * If config.iconLinked !== false AND a favicon shares the SAME label string:
 *   preview icon is built from the favicon (resolveLogoEffectiveIcon).
 * Unlink → logo icon is independent.
 * Bottom of file exports:
 *   resolveLogoEffectiveIcon — what preview/export actually draws
 *   faviconContentToIconConfig — map favicon content → IconConfig shape
 *
 * ── Preview loop (search presentPreviewCanvas / renderLogo) ─────────────────
 * Rough recipe every time config changes:
 *   1. Create/take an OFFSCREEN canvas (not on screen yet)
 *   2. await renderLogo(offscreen, effectiveConfig, scale 4, …)
 *   3. presentPreviewCanvas({ a, b }, showingA, offscreen)
 *      → paints onto the HIDDEN on-screen canvas, then swaps visibility
 *   4. previewStageRef.current?.fitNow()
 *      → shrink CSS transform NOW so the huge bitmap doesn’t flash oversized
 *
 * Busy lock (logoPreviewBusyId / pending): if another change arrives while
 * drawing, queue one more pass instead of stacking 20 parallel renders.
 *
 * ── Paint mode (~425 banner) ────────────────────────────────────────────────
 * “Edit” opens IconPaintEditor (lazy loaded).
 * On save: applyPaintSaveToIcon / applyPaintSaveToFavicon (paintSettingsSync)
 * writes paintSession PNGs + vectors back into the variant config → onChange.
 *
 * ── Variant list UI ─────────────────────────────────────────────────────────
 * Chips: select, rename, drag-reorder, add, delete, copy/paste style.
 * ApplyToAllBar — push current settings onto other variants with options.
 *
 * ── Style panel (big JSX return) ────────────────────────────────────────────
 * Built from Controls.tsx primitives: Section, ColorRow, SliderRow, …
 * Groups roughly:
 *   Text / font / colors / secondary line
 *   Layout + gaps
 *   Icon type tabs + type-specific fields
 *   Container (outer behind icon)
 *   Shadows / borders
 *   Export buttons (PNG/SVG)
 *
 * ── How to study without drowning ───────────────────────────────────────────
 * 1. Read props + active/safeConfig
 * 2. Find the useEffect that calls renderLogo
 * 3. Click through UI with DevTools: which setState / onChange fires
 * 4. Only then open Paint save path
 *
 * Next: 06-FaviconEditor.ts (same ideas, square canvas)
 */
export {}
