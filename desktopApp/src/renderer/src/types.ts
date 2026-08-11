export type ShapeType =
  | 'circle'
  | 'square'
  | 'rounded'
  | 'hexagon'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'star'
  | 'none'

export type IconSourceType = 'shape' | 'lucide' | 'svg' | 'letters' | 'image'

export type FaviconOuterShape =
  | 'none'
  | 'circle'
  | 'square'
  | 'rounded'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'star'
  | 'map-pin'
  | 'shield'
  | 'badge'
  | 'image'
  | 'svg-markup'

/** Top-level outer / container category shared by favicon + logo icon. */
export type OuterShapeCategory = 'none' | 'shapes' | 'image' | 'svg'

export const OUTER_SHAPE_CATEGORIES: { label: string; value: OuterShapeCategory }[] = [
  { label: 'None', value: 'none' },
  { label: 'Shapes', value: 'shapes' },
  { label: 'Image', value: 'image' },
  { label: 'SVG', value: 'svg' }
]

/** Geometric / badge shapes shown under the Shapes category (favicon outer). */
export const FAVICON_SHAPE_OPTIONS: { label: string; value: FaviconOuterShape }[] = [
  { label: 'Circle', value: 'circle' },
  { label: 'Square', value: 'square' },
  { label: 'Triangle', value: 'triangle' },
  { label: 'Diamond', value: 'diamond' },
  { label: 'Pentagon', value: 'pentagon' },
  { label: 'Hexagon', value: 'hexagon' },
  { label: 'Star', value: 'star' },
  { label: 'Map Pin', value: 'map-pin' },
  { label: 'Shield', value: 'shield' },
  { label: 'Badge', value: 'badge' }
]

export function faviconOuterCategory(shape: FaviconOuterShape): OuterShapeCategory {
  if (shape === 'none') return 'none'
  if (shape === 'image') return 'image'
  if (shape === 'svg-markup') return 'svg'
  return 'shapes'
}

export function isFaviconMathShape(shape: FaviconOuterShape): boolean {
  return (
    shape === 'circle' ||
    shape === 'square' ||
    shape === 'rounded' ||
    shape === 'triangle' ||
    shape === 'diamond' ||
    shape === 'pentagon' ||
    shape === 'hexagon' ||
    shape === 'star'
  )
}

export type ContentType = 'letters' | 'shape' | 'svg' | 'lucide' | 'svg-markup' | 'image' | 'canva'

export type CanvaBusinessType =
  | 'recruitment-services'
  | 'dropshipping'
  | 'fraud-recovery-services'
  | 'investment-stock'

export type CanvaDesignType = 'vector' | 'abstract' | 'vector-art' | 'icon'

export type CanvaImageReference = 'none' | 'favicon' | 'favicon-inner' | 'logo-icon'

// ── Unified icon data ─────────────────────────────────────────────────────────

export interface IconConfig {
  // Which source to use
  sourceType: IconSourceType
  // 'shape' source
  shape: ShapeType
  primaryColor: string
  secondaryColor: string
  shapeSizeRatio: number
  /** Corner radius for square geo shapes (px at icon.size). */
  shapeBorderRadius?: number
  // 'lucide' source
  lucideIconName: string
  lucideStrokeWidth: number
  lucideSizeRatio: number
  // 'svg' source — full SVG markup
  svgMarkup: string
  svgMarkupSizeRatio: number
  svgMarkupUseOriginalColors: boolean
  svgMarkupSecondaryColor: string
  svgMarkupTertiaryColor: string
  svgMarkupColor4: string
  svgMarkupColor5: string
  // 'letters' source
  text: string
  textColor: string
  fontFamily: string
  fontWeight: string
  fontItalic: boolean
  fontUnderline: boolean
  fontSizeRatio: number
  /** Extra space between glyphs in px (at the icon's design size). */
  letterSpacing: number
  // 'image' source
  imageDataUrl: string
  imageSizeRatio: number
  /** When true, draw the image as-is. When false, remap imagePalette → imageColor1–5. */
  imageUseOriginalColors: boolean
  /** Up to 5 dominant colours scanned from the image. */
  imagePalette: string[]
  imageColor1: string
  imageColor2: string
  imageColor3: string
  imageColor4: string
  imageColor5: string
  // Container / background shape drawn behind the icon content
  containerEnabled: boolean
  containerShape: ShapeType
  containerType: 'color' | 'image' | 'svg'
  containerColor: string
  containerImageDataUrl: string
  containerSvgMarkup: string
  containerPadding: number
  containerBorderColor: string
  containerBorderWidth: number
  containerBorderRadius: number
  // For complex SVG shapes (map-pin/shield/badge) the border must be drawn along
  // the actual shape path, not the bounding-box square. When set, drawIcon uses
  // this SVG path string (viewBox 0 0 24 24) for the Path2D clip-and-double border.
  containerSvgBorderPath?: string
  // Content offset relative to the icon's bounding-box center
  offsetX: number
  offsetY: number
  // Shared
  size: number
  visible: boolean
  // Drop shadow (outer / around container)
  shadowEnabled: boolean
  shadowColor: string
  shadowBlur: number
  shadowSpread: number
  shadowOffsetX: number
  shadowOffsetY: number
  // Drop shadow on the inner content (text / shape / icon)
  contentShadowEnabled: boolean
  contentShadowInset: boolean
  contentShadowColor: string
  contentShadowBlur: number
  contentShadowSpread: number
  contentShadowOffsetX: number
  contentShadowOffsetY: number
  // Border / stroke on the inner content
  contentBorderColor: string
  contentBorderWidth: number
  /**
   * Editable paint-editor session kept alongside the flattened display image.
   * Outside paint: preview uses the raster image. Reopening paint restores this.
   */
  paintSession?: PaintSession | null
  /**
   * Per–source-type stash: type-specific fields + Inner paint overlay + linked
   * content vectors. Restored when switching sourceType back.
   */
  contentTypeStash?: Partial<Record<IconSourceType, ContentTypeStashEntry>>
}

// ── Logo ──────────────────────────────────────────────────────────────────────

export type LogoLayout = 'icon-left' | 'icon-right' | 'icon-top'

export interface LogoConfig {
  text: string
  /** When true, all variants share the same title text */
  textShared: boolean
  fontFamily: string
  fontSize: number
  fontWeight: string
  fontItalic: boolean
  fontUnderline: boolean
  textColor: string
  /** Extra space between title glyphs (px). */
  letterSpacing: number
  secondaryText: string
  /** When true, all variants share the same subtitle text */
  secondaryTextShared: boolean
  secondaryFontFamily: string
  secondaryFontSize: number
  secondaryFontWeight: string
  secondaryFontItalic: boolean
  secondaryFontUnderline: boolean
  secondaryTextColor: string
  /** Extra space between subtitle glyphs (px). */
  secondaryLetterSpacing: number
  backgroundColor: string
  transparentBg: boolean
  /**
   * Custom (unlinked) logo icon. Preserved while synced so unlinking restores it.
   */
  icon: IconConfig
  /**
   * Favicon-derived logo icon. Updated whenever the matching favicon changes
   * while `iconLinked` is true (paint, colors, objects, outer shape, …).
   */
  syncedIcon?: IconConfig | null
  /** When true, preview/export use `syncedIcon` / live favicon twin instead of `icon`. */
  iconLinked: boolean
  /** Frozen favicon-derived icon retained when an exact-name sync breaks. */
  syncedIconSnapshot?: IconConfig | null
  /** True while displaying syncedIconSnapshot instead of the original icon. */
  iconSyncBroken?: boolean
  /** Arrangement of icon relative to text */
  layout: LogoLayout
  /** Gap between title and subtitle text lines (px) */
  titleSubtitleGap: number
  gap: number
  padding: number
  // Drop shadow applied to the logo text (title + subtitle)
  textShadowEnabled: boolean
  textShadowColor: string
  textShadowBlur: number
  textShadowSpread: number
  textShadowOffsetX: number
  textShadowOffsetY: number
}

// ── Favicon ───────────────────────────────────────────────────────────────────

export interface FaviconContent {
  type: ContentType
  // letters
  text: string
  textColor: string
  fontFamily: string
  fontWeight: string
  fontItalic: boolean
  fontUnderline: boolean
  fontSizeRatio: number
  /** Extra space between glyphs in px (at the favicon's design size). */
  letterSpacing: number
  // shape
  shape: ShapeType
  shapeColor: string
  shapeSizeRatio: number
  /** Corner radius for square geo shapes (px at favicon design size 256). */
  shapeBorderRadius?: number
  // svg path (legacy)
  svgPath: string
  svgColor: string
  // lucide icon
  lucideIconName: string
  lucideColor: string
  lucideSizeRatio: number
  lucideStrokeWidth: number
  // full SVG markup
  svgMarkup: string
  svgMarkupSizeRatio: number
  svgMarkupUseOriginalColors: boolean
  svgMarkupSecondaryColor: string
  svgMarkupTertiaryColor: string
  svgMarkupColor4: string
  svgMarkupColor5: string
  // uploaded image
  imageDataUrl: string
  imageSizeRatio: number
  /** When true, draw the image as-is. When false, remap imagePalette → imageColor1–5. */
  imageUseOriginalColors: boolean
  /** Up to 5 dominant colours scanned from the image. */
  imagePalette: string[]
  imageColor1: string
  imageColor2: string
  imageColor3: string
  imageColor4: string
  imageColor5: string
  // canva prompt settings (no rendered inner content)
  canvaBusinessType: CanvaBusinessType
  canvaDesignType: CanvaDesignType
  canvaPrimaryColor: string
  /** Empty string = no secondary color. */
  canvaSecondaryColor: string
  canvaImageReference: CanvaImageReference
  // universal content offset (px, relative to center)
  offsetX: number
  offsetY: number
  // inner content drop-shadow
  contentShadowEnabled: boolean
  contentShadowInset: boolean
  contentShadowColor: string
  contentShadowBlur: number
  contentShadowSpread: number
  contentShadowOffsetX: number
  contentShadowOffsetY: number
  // border / stroke on the inner content
  contentBorderColor: string
  contentBorderWidth: number
}

export interface FaviconConfig {
  outerShape: FaviconOuterShape
  outerShapeImageDataUrl: string
  outerShapeSvgMarkup: string
  // Controls for the svg-markup outer shape
  outerShapeSvgSizeRatio: number
  outerShapeSvgUseOriginalColors: boolean
  outerShapeSvgColor: string
  outerShapeSvgSecondaryColor: string
  outerShapeSvgTertiaryColor: string
  outerShapeSvgColor4: string
  outerShapeSvgColor5: string
  outerShapeOffsetX: number
  outerShapeOffsetY: number
  backgroundColor: string
  borderColor: string
  borderWidth: number
  borderRadius: number
  content: FaviconContent
  size: number
  transparentBg: boolean
  // Drop shadow on the whole favicon
  shadowEnabled: boolean
  shadowInset: boolean
  shadowColor: string
  shadowBlur: number
  shadowSpread: number
  shadowOffsetX: number
  shadowOffsetY: number
  /**
   * Paint-editor content layer: keep the same outer-shadow inset/pad as the
   * container layer, but do not paint the outer drop shadow (avoids double shadow
   * while keeping Outer shape / Inner content aligned).
   */
  shadowReserveOnly?: boolean
  /**
   * Editable paint-editor session kept alongside the flattened display image.
   * Outside paint: preview uses the raster content image. Reopening paint restores this.
   */
  paintSession?: PaintSession | null
  /**
   * Per–content-type stash: type-specific fields + Inner paint overlay + linked
   * content vectors. Restored when switching content type back.
   */
  contentTypeStash?: Partial<Record<ContentType, ContentTypeStashEntry>>
}

/** Snapshot stored when switching Inner content / icon source type. */
export interface ContentTypeStashEntry {
  /** Type-specific outside fields (letters/shape/lucide/…). */
  fields: Record<string, unknown>
  /** Inner paint overlay PNG for this type. */
  contentOverlayPng?: string
  /** Vectors that belong to this type’s base (e.g. linkedOutsideText). */
  contentVectors?: PaintVector[]
}

/** One vector item from a paint session (lines, shapes, text, etc.). */
export type PaintLayerId = 'container' | 'content'

export interface PaintVector {
  id: string
  /** User-visible layer name. Base Inner/Outer layers are not renameable. */
  name?: string
  /** Independent object-layer visibility. */
  visible?: boolean
  /** Legacy object visibility field retained for older paint sessions. */
  editable?: boolean
  /** Parent nondestructive group. Children remain independently editable. */
  parentId?: string
  type: string
  pts: { x: number; y: number }[]
  startCap: string
  endCap: string
  dash: string
  thickness: number
  color: string
  fill?: boolean
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  shape?: string
  text?: string
  fontFamily?: string
  fontSize?: number
  weight?: number
  bold?: boolean
  italic?: boolean
  lineHeight?: number
  letterSpacing?: number
  shadow?: boolean
  shadowColor?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowSpread?: number
  rot?: number
  /** Horizontal mirror scale (default 1). Used for text flip at rot=0. */
  scaleX?: number
  /** Vertical mirror scale (default 1). Used for text flip at rot=0. */
  scaleY?: number
  drawnCurve?: boolean
  /** Raster stamp (library / pasted SVG icon) drawn in the pts bbox. */
  imageDataUrl?: string
  /** Origin used to show the correct Layers-panel icon. */
  stampSource?: 'library' | 'image'
  /** Original SVG retained for constant-width stroke rendering during resize. */
  sourceSvgMarkup?: string
  /** Canvas size at initial SVG placement. */
  sourceStampSize?: number
  /** Keep vector/shape stroke width constant while resizing. */
  keepStrokeOnResize?: boolean
  /** Persistent selection lifted from one base raster layer; hidden from Layers panel. */
  marqueeItem?: boolean
  /** Nondestructive brush/eraser strokes stored in shape/group-local coordinates. */
  paintStrokes?: {
    tool: 'brush' | 'eraser'
    pts: { x: number; y: number }[]
    size: number
    color: string
    tip: 'round' | 'square' | 'flat' | 'calligraphy' | 'spray'
  }[]
  /** Which paint raster layer this vector belongs to (z-order + visibility). */
  layer?: PaintLayerId
  /**
   * Text seeded from outside letters settings. When present on save, keep
   * content type as letters instead of flattening to an image.
   */
  linkedOutsideText?: boolean
  /**
   * Stamp/shape that stands in for live Inner content (position/size/color sync).
   */
  contentBound?: boolean
  /** Tight unwarped source rect in canvas space (TL + size). */
  reshapeSrc?: { x: number; y: number; w: number; h: number }
  /** Destination quad in canvas space: TL, TR, BR, BL. */
  reshapeQuad?: { x: number; y: number }[]
  /** Quad at reshape init — used for symmetric snap distances. */
  reshapeBaseQuad?: { x: number; y: number }[]
}

/** Outside (logo/favicon) letters settings passed into Paint for sync. */
export interface OutsideTextSettings {
  text: string
  textColor: string
  fontFamily: string
  fontWeight: string
  fontItalic: boolean
  fontUnderline?: boolean
  fontSizeRatio: number
  letterSpacing: number
  /** Inner content offset at design scale (favicon 256-px units). */
  offsetX?: number
  offsetY?: number
  /** Inner content shadow (same design-scale units as offset). */
  contentShadowEnabled?: boolean
  contentShadowColor?: string
  contentShadowBlur?: number
  contentShadowSpread?: number
  contentShadowOffsetX?: number
  contentShadowOffsetY?: number
}

/**
 * Outside Inner settings for any content type when opening Paint.
 * `letters` → linked text vector; `proxy` → contentBound stamp (move/resize/shadow).
 */
export interface OutsideContentSettings extends OutsideTextSettings {
  kind: 'letters' | 'proxy'
  /** Size ratio for non-letter Inner content (0–1+). Letters use fontSizeRatio. */
  sizeRatio?: number
  /** Primary fill for the active non-letter content type. */
  fillColor?: string
}

/**
 * Paint overlays above live Outer/Inner settings.
 * `containerPng` / `contentPng` are transparent paint overlays (brush/eraser/fill),
 * not baked copies of the live base. Outside preview redraws live settings then
 * composites these overlays + vectors on top.
 */
export interface PaintSession {
  version: 1
  resolution: number
  /** Outer-shape paint overlay (transparent PNG). */
  containerPng: string
  /** Inner-content paint overlay (transparent PNG). */
  contentPng: string
  vectors: PaintVector[]
  /** Whether Outer shape was an editable layer when saved. */
  hasContainer: boolean
  /** Visual stacking order, topmost first. */
  layerOrder?: PaintLayerId[]
  /** True when PNGs are overlays only (always set by current saves). */
  paintOverlaysOnly?: boolean
  /**
   * Transparent flatten of overlays + vectors (no live bases). Legacy single-plane
   * bake drawn on top of live Outer/Inner. Prefer layered decoration PNGs below.
   */
  decorationsPng?: string
  /**
   * Outer-layer overlays + vectors only. Drawn after live Outer, before Inner,
   * so Outer paint never covers Inner content.
   */
  containerDecorationsPng?: string
  /**
   * Inner-layer overlays + vectors only. Drawn after live Inner content.
   */
  contentDecorationsPng?: string
  /**
   * True when `decorationsPng` includes linkedOutsideText glyphs. Outside render
   * then skips live letters to avoid doubling. Older sessions omit this flag.
   */
  linkedTextInDecorations?: boolean
}

/**
 * Hints from Paint so outside Offset / Color / Size / Text can follow Save.
 * Values use design-scale units (favicon 256 / logo icon design) where noted.
 */
export interface PaintContentSync {
  /** Content center offset from canvas center, in design px (256-scale). */
  offsetX?: number
  offsetY?: number
  /** Linked letters fields (already design-scaled). */
  letters?: {
    text: string
    textColor: string
    fontFamily: string
    fontWeight: string
    fontItalic: boolean
    fontSizeRatio: number
    letterSpacing: number
  }
  /** Primary fill for the active content type. */
  fillColor?: string
  /** Size ratio for the active content type (0–1+). */
  sizeRatio?: number
  /** Inner content shadow (design 256-scale), from linked text / contentBound proxy. */
  contentShadowEnabled?: boolean
  contentShadowColor?: string
  contentShadowBlur?: number
  contentShadowSpread?: number
  contentShadowOffsetX?: number
  contentShadowOffsetY?: number
  /**
   * Outer shape / container fill from Paint (Fill tool on Outer).
   * Favicon → backgroundColor; logo icon → containerColor.
   */
  outerFillColor?: string
  /**
   * True when Outer paint overlay should be cleared after syncing outerFillColor
   * (full-ish recolor via Fill), so live settings own the color for logo sync.
   */
  clearOuterOverlay?: boolean
  /**
   * True when Inner Fill covered enough of the content that a live content
   * border would redraw an outline Paint already filled away.
   */
  clearContentBorder?: boolean
}

/** Payload returned when saving from the paint editor. */
export interface PaintSaveResult {
  compositePng: string
  containerPng: string
  contentPng: string
  vectors: PaintVector[]
  resolution: number
  hasContainer: boolean
  /** Visual stacking order, topmost first. */
  layerOrder: PaintLayerId[]
  /** Overlays + vectors only (no live bases), for outside preview/export. */
  decorationsPng?: string
  /** Outer-layer overlays + vectors only. */
  containerDecorationsPng?: string
  /** Inner-layer overlays + vectors only. */
  contentDecorationsPng?: string
  /** Outside settings sync hints (applied on Save). */
  contentSync?: PaintContentSync
  /** When true, linked Inner letters were baked into decorations (e.g. rotation). */
  linkedTextInDecorations?: boolean
}

/** Which logo / favicon variants receive a paint Save. */
export interface PaintSaveTargets {
  logoIds: string[]
  faviconIds: string[]
}

export interface PaintVariantOption {
  id: string
  label: string
}

// ── Version ───────────────────────────────────────────────────────────────────

export interface AssetVariant<T> {
  id: string
  /** Display label, e.g. "Dark", "Light" */
  label: string
  config: T
}

export interface Version {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  /** Up to 2 logo variants (e.g. dark bg + light bg) */
  logos: AssetVariant<LogoConfig>[]
  /** Up to 2 favicon variants */
  favicons: AssetVariant<FaviconConfig>[]
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_ICON_CONFIG: IconConfig = {
  sourceType: 'shape',
  shape: 'square',
  primaryColor: '#6366f1',
  secondaryColor: '#818cf8',
  shapeSizeRatio: 1.0,
  shapeBorderRadius: 0,
  lucideIconName: 'Layers',
  lucideStrokeWidth: 2,
  lucideSizeRatio: 1.0,
  svgMarkup: '',
  svgMarkupSizeRatio: 1.0,
  svgMarkupUseOriginalColors: false,
  svgMarkupSecondaryColor: '',
  svgMarkupTertiaryColor: '',
  svgMarkupColor4: '',
  svgMarkupColor5: '',
  text: 'A',
  textColor: '#ffffff',
  fontFamily: 'Inter',
  fontWeight: '700',
  fontItalic: false,
  fontUnderline: false,
  fontSizeRatio: 0.52,
  letterSpacing: 0,
  imageDataUrl: '',
  imageSizeRatio: 0.8,
  imageUseOriginalColors: true,
  imagePalette: [],
  imageColor1: '',
  imageColor2: '',
  imageColor3: '',
  imageColor4: '',
  imageColor5: '',
  offsetX: 0,
  offsetY: 0,
  size: 112,
  visible: true,
  containerEnabled: false,
  containerShape: 'square',
  containerType: 'color',
  containerColor: '#6366f1',
  containerImageDataUrl: '',
  containerSvgMarkup: '',
  containerPadding: 0.18,
  containerBorderColor: 'transparent',
  containerBorderWidth: 0,
  containerBorderRadius: 0,
  shadowEnabled: false,
  shadowColor: '#00000073',
  shadowBlur: 8,
  shadowSpread: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 4,
  contentShadowEnabled: false,
  contentShadowInset: false,
  contentShadowColor: '#00000080',
  contentShadowBlur: 8,
  contentShadowSpread: 0,
  contentShadowOffsetX: 0,
  contentShadowOffsetY: 3,
  contentBorderColor: 'transparent',
  contentBorderWidth: 0
}

export const DEFAULT_LOGO_CONFIG: LogoConfig = {
  text: 'MyApp',
  textShared: false,
  fontFamily: 'Inter',
  fontSize: 36,
  fontWeight: '700',
  fontItalic: false,
  fontUnderline: false,
  textColor: '#ffffff',
  letterSpacing: 0,
  secondaryText: 'v1.0',
  secondaryTextShared: false,
  secondaryFontFamily: 'Inter',
  secondaryFontSize: 18,
  secondaryFontWeight: '400',
  secondaryFontItalic: false,
  secondaryFontUnderline: false,
  secondaryTextColor: '#888898',
  secondaryLetterSpacing: 0,
  backgroundColor: '#0d0d10',
  transparentBg: true,
  icon: { ...DEFAULT_ICON_CONFIG },
  syncedIcon: null,
  iconLinked: true,
  syncedIconSnapshot: null,
  iconSyncBroken: false,
  layout: 'icon-left',
  titleSubtitleGap: 4,
  gap: 16,
  padding: 0,
  textShadowEnabled: false,
  textShadowColor: '#00000073',
  textShadowBlur: 6,
  textShadowSpread: 0,
  textShadowOffsetX: 0,
  textShadowOffsetY: 3
}

export const DEFAULT_FAVICON_CONFIG: FaviconConfig = {
  outerShape: 'square',
  outerShapeImageDataUrl: '',
  outerShapeSvgMarkup: '',
  outerShapeSvgSizeRatio: 1.0,
  outerShapeSvgUseOriginalColors: false,
  outerShapeSvgColor: '#ffffff',
  outerShapeSvgSecondaryColor: '',
  outerShapeSvgTertiaryColor: '',
  outerShapeSvgColor4: '',
  outerShapeSvgColor5: '',
  outerShapeOffsetX: 0,
  outerShapeOffsetY: 0,
  backgroundColor: '#6366f1',
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 40,
  size: 256,
  transparentBg: false,
  shadowEnabled: false,
  shadowInset: false,
  shadowColor: '#00000073',
  shadowBlur: 12,
  shadowSpread: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 4,
  content: {
    type: 'letters',
    text: 'M',
    textColor: '#ffffff',
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSizeRatio: 0.52,
    fontItalic: false,
    fontUnderline: false,
    letterSpacing: 0,
    shape: 'circle',
    shapeColor: '#ffffff',
    shapeSizeRatio: 0.5,
    shapeBorderRadius: 0,
    svgPath: '',
    svgColor: '#ffffff',
    lucideIconName: 'Layers',
    lucideColor: '#ffffff',
    lucideSizeRatio: 0.6,
    lucideStrokeWidth: 2,
      svgMarkup: '',
      svgMarkupSizeRatio: 0.7,
      svgMarkupUseOriginalColors: false,
      svgMarkupSecondaryColor: '',
      svgMarkupTertiaryColor: '',
      svgMarkupColor4: '',
      svgMarkupColor5: '',
      imageDataUrl: '',
      imageSizeRatio: 0.8,
      imageUseOriginalColors: true,
      imagePalette: [],
      imageColor1: '',
      imageColor2: '',
      imageColor3: '',
      imageColor4: '',
      imageColor5: '',
      canvaBusinessType: 'recruitment-services',
      canvaDesignType: 'icon',
      canvaPrimaryColor: '#6366f1',
      canvaSecondaryColor: '',
      canvaImageReference: 'none',
      offsetX: 0,
      offsetY: 0,
      contentShadowEnabled: false,
      contentShadowInset: false,
      contentShadowColor: '#00000080',
      contentShadowBlur: 8,
      contentShadowSpread: 0,
      contentShadowOffsetX: 0,
      contentShadowOffsetY: 3,
      contentBorderColor: 'transparent',
      contentBorderWidth: 0
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const FONT_FAMILY_GROUPS: { label: string; families: string[] }[] = [
  {
    label: 'Modern Sans-Serif',
    families: [
      'Inter', 'DM Sans', 'Manrope', 'Geist', 'Figtree', 'Outfit',
      'Plus Jakarta Sans', 'Space Grotesk', 'Rubik', 'Work Sans',
      'Quicksand', 'Mulish', 'Nunito Sans', 'Lexend', 'Karla', 'Cabin',
      'Exo 2', 'Comfortaa',
    ],
  },
  {
    label: 'Classic Sans-Serif',
    families: [
      'Poppins', 'Montserrat', 'Raleway', 'Josefin Sans', 'Barlow',
      'Lato', 'Open Sans', 'Nunito', 'Source Sans 3', 'Ubuntu',
    ],
  },
  {
    label: 'Serif',
    families: [
      'Playfair Display', 'Merriweather', 'Libre Baskerville',
      'Cormorant Garamond', 'Lora', 'EB Garamond', 'Bitter',
      'Roboto Slab', 'PT Serif', 'Crimson Text', 'Noto Serif', 'Spectral',
      'Arvo', 'Alegreya', 'Vollkorn', 'Cardo', 'Domine',
      'Libre Caslon Text', 'Tinos', 'Old Standard TT',
    ],
  },
  {
    label: 'Display & Stylistic',
    families: [
      'Bebas Neue', 'Oswald', 'Anton', 'Cinzel', 'Abril Fatface',
      'Fredoka', 'Russo One', 'Lilita One', 'Squada One',
      'Lobster', 'Pacifico', 'Righteous',
    ],
  },
  {
    label: 'Cursive & Script',
    families: [
      'Dancing Script', 'Great Vibes', 'Parisienne', 'Sacramento',
      'Alex Brush', 'Pinyon Script', 'Kaushan Script',
      'Satisfy', 'Caveat', 'Permanent Marker',
    ],
  },
  {
    label: 'Monospace',
    families: [
      'JetBrains Mono', 'Fira Code', 'Roboto Mono',
      'Inconsolata', 'Space Mono', 'Source Code Pro',
    ],
  },
  {
    label: 'System',
    families: ['Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'],
  },
]

/** Flat list used for validation / lookup (retains original usage sites). */
export const FONT_FAMILIES: string[] = FONT_FAMILY_GROUPS.flatMap((g) => g.families)

export const FONT_WEIGHTS = [
  { label: 'Thin (100)', value: '100' },
  { label: 'ExtraLight (200)', value: '200' },
  { label: 'Light (300)', value: '300' },
  { label: 'Regular (400)', value: '400' },
  { label: 'Medium (500)', value: '500' },
  { label: 'SemiBold (600)', value: '600' },
  { label: 'Bold (700)', value: '700' },
  { label: 'ExtraBold (800)', value: '800' },
  { label: 'Black (900)', value: '900' }
]

export const SHAPES: { label: string; value: ShapeType }[] = [
  { label: 'Circle', value: 'circle' },
  { label: 'Square', value: 'square' },
  { label: 'Triangle', value: 'triangle' },
  { label: 'Diamond', value: 'diamond' },
  { label: 'Pentagon', value: 'pentagon' },
  { label: 'Hexagon', value: 'hexagon' },
  { label: 'Star', value: 'star' },
  { label: 'None', value: 'none' }
]

/** @deprecated Prefer OUTER_SHAPE_CATEGORIES + FAVICON_SHAPE_OPTIONS */
export const FAVICON_OUTER_SHAPES: { label: string; value: FaviconOuterShape }[] = [
  { label: 'None', value: 'none' },
  ...FAVICON_SHAPE_OPTIONS,
  { label: 'Image', value: 'image' },
  { label: 'SVG', value: 'svg-markup' }
]
