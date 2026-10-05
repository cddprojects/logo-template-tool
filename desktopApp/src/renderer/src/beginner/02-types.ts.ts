/**
 * WALKTHROUGH: desktopApp/src/renderer/src/types.ts (~1100 lines)
 *
 * This file does NOT draw anything. It only describes DATA SHAPES — like
 * blank forms the rest of the app fills in. Read it as a dictionary.
 *
 * Tip: In VS Code/Cursor, Ctrl+click a type name elsewhere to jump here.
 *
 * ── Lines 1–12: file header ─────────────────────────────────────────────────
 * Explains purpose. DEFAULT_* objects later are “blank forms with defaults”.
 *
 * ── ShapeType / IconSourceType / FaviconOuterShape (≈14–41) ──────────────────
 * `export type X = 'a' | 'b'` means: a variable of type X may ONLY be those
 * string values. Example: shape can be 'circle' or 'square', not 'banana'.
 *
 * ShapeType        — geometric shapes for logo icon / container
 * IconSourceType   — what kind of icon content (shape, lucide icon, SVG, …)
 * FaviconOuterShape — outer frame of a favicon (includes map-pin, shield, …)
 *
 * ── OUTER_SHAPE_CATEGORIES / FAVICON_SHAPE_OPTIONS (≈46–65) ─────────────────
 * Arrays of { label, value } for dropdowns / button grids in the UI.
 * label = what humans see; value = what we store in config.
 *
 * ── faviconOuterCategory / isFaviconMathShape (≈67–85) ──────────────────────
 * Helper functions:
 *   faviconOuterCategory — map a shape to tab category (none/shapes/image/svg)
 *   isFaviconMathShape   — true if we can draw it with canvas path math
 *                          (not image upload / custom SVG markup)
 *
 * ── ContentType / Canva* (≈87–97) ───────────────────────────────────────────
 * What sits in the CENTER of a favicon (letters, lucide, image, Canva prompt…).
 * Canva* types support the “generate a Canva prompt” feature.
 *
 * ── IconConfig interface (≈101–≈220+) ───────────────────────────────────────
 * THE recipe for one icon (logo mark or mapped from favicon).
 *
 * Fields grouped in the source with comments:
 *   sourceType     — which family of fields is “active”
 *   shape / colors — for geometric shapes
 *   lucide*        — for Lucide icon set
 *   svgMarkup*     — for pasted SVG
 *   text / font*   — for letter icons
 *   image*         — uploaded image + recolor slots Color 1–5
 *   container*     — Outer background behind the content
 *   offset / size / visible
 *   shadow* / contentShadow* / contentBorder*
 *   paintSession?  — optional Paint-mode save data (huge nested object)
 *
 * Optional fields use `?` — they may be missing on old saved files.
 *
 * ── LogoConfig (search `export interface LogoConfig`) ───────────────────────
 * One logo variant’s full settings:
 *   text, fonts, colors, secondary line (subtitle)
 *   icon: IconConfig
 *   iconLinked — if true, preview icon from matching favicon label
 *   syncedIcon / syncedIconSnapshot — mirrors used when linked / frozen
 *   layout: icon-left / icon-right / icon-top
 *   gaps, padding, text shadow, transparentBg, backgroundColor
 *
 * ── FaviconConfig + FaviconContent ──────────────────────────────────────────
 * FaviconConfig = outer frame (shape, bg, border, shadow, size) + content + paint
 * FaviconContent = the inner mark (type + letters/svg/image fields)
 *
 * ── PaintSession / PaintVector (search those names) ─────────────────────────
 * Saved Paint editor state: PNG layers, vectors (shapes/text/strokes), punch
 * masks, bake flags. You don’t need every field on day one — know it exists
 * as “stuff Paint saved onto the icon/favicon”.
 *
 * ── Version / AssetVariant ──────────────────────────────────────────────────
 * Version = one sidebar project:
 *   id, name, description, createdAt, updatedAt
 *   logos: AssetVariant<LogoConfig>[]
 *   favicons: AssetVariant<FaviconConfig>[]
 *
 * AssetVariant<T> = { id, label, config: T }
 *   label is “Dark” / “Light” — sync matches logo↔favicon by this string.
 *
 * ── DEFAULT_ICON_CONFIG / DEFAULT_LOGO_CONFIG / DEFAULT_FAVICON_CONFIG ───────
 * Complete objects with every required field filled. Used when:
 *   • creating a new version
 *   • migrating old JSON (merge saved data ON TOP of defaults)
 *
 * ── FONT_FAMILY_GROUPS / FONT_FAMILIES ──────────────────────────────────────
 * Lists of font names for the font picker UI.
 *
 * How to study this file without drowning:
 *   1. Read Version + AssetVariant
 *   2. Skim LogoConfig and FaviconConfig field names
 *   3. Open IconConfig and note sourceType switches which fields matter
 *   4. Ignore PaintSession details until you open Paint mode
 *
 * Next: 03-App.tsx.ts
 */
export {}
