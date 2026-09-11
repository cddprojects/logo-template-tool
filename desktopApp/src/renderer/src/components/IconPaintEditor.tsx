import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo
} from 'react'
import {
  Brush,
  Eraser,
  PaintBucket,
  Pipette,
  Minus,
  Square,
  Circle,
  PenTool,
  Undo2,
  Redo2,
  X,
  Check,
  Trash2,
  Layers,
  Image as ImageIcon,
  Upload,
  BoxSelect,
  Copy,
  ClipboardPaste,
  MousePointer2,
  Ban,
  Type as TypeIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  RotateCw,
  RotateCcw,
  FlipHorizontal2,
  FlipVertical2,
  Sparkles,
  GripVertical,
  Crop as CropIcon,
  Library,
  Pencil,
  ChevronDown,
  ChevronRight,
  Spline,
  Tags,
  Eye,
  EyeOff
} from 'lucide-react'
import { FONT_FAMILY_GROUPS, FONT_WEIGHTS } from '../types'
import type {
  PaintVector,
  PaintLayerId,
  OutsideTextSettings,
  OutsideContentSettings
} from '../types'
import { loadFont } from '../utils/fontLoader'
import {
  ColorPickerPopup,
  isGradientColor,
  firstSolidColor,
  TransparentFillModeContext,
  TransparentFillToggle
} from './Controls'
import { roundedRect } from '../utils/renderer'
import {
  removeImageBackground,
  applySvgColor,
  drawSvgOnCanvas,
  renderLucideToSvg
} from '../utils/iconUtils'
import { PreviewStage } from './PreviewStage'
import { IconPicker, PAINT_SVG_MIME, PAINT_LUCIDE_MIME } from './IconPicker'
import { DEFAULT_ICON_CONFIG } from '../types'
import type {
  IconConfig
} from '../types'
import { isIgTemplateFile } from '../utils/templateFile'
import {
  buildPaintContentSync,
  cropOpaqueToDataUrl,
  emptyOverlayPng,
  normalizeLinkedTextVectors,
  persistContentProxyVectors
} from '../utils/paintSettingsSync'
import {
  buildMatchSectionLabels,
  enrichImageProxyWithMatch,
  fillMarkedSectionsOnImageProxy,
  hydrateImageProxyColors,
  isInnerUploadedImageProxy,
  matchClickOnImageProxy,
  refreshStampFromMarks,
  setImageProxySlotColor,
  type MatchSectionLabel
} from '../utils/imageColorMatch'
import { bakeImageSoftAaBleed } from '../utils/imageRecolor'
import { reshapeIsApplied } from '../utils/paintReshape'
import {
  reuseCanvas,
  takeCanvas,
  releaseCanvas,
  reset2dState,
  ensureCanvas
} from '../utils/canvasPool'
import {
  punchMaskCanvases,
  punchMaskBits,
  seeThroughMaskCanvases,
  seeThroughMaskBits,
  clonePunchBitsMap,
  punchBitsEqual,
  clearAllHoles,
  pruneTinyHoleComponents,
  rewriteDisplayBits,
  syncHolesAfterGeomChange,
  syncHoleFlags,
  hasPunchCoverage,
  hasSeeThroughCoverage,
  subtractRegionFromMode,
  moveConnectedRegionToMode,
  clearObjectHoles,
  type HoleItem,
  type HoleFillMode
} from '../utils/paintHoles'
import {
  alphaBoundsFromCanvas,
  alphaOutsideEDT,
  applyCropHandleMove,
  applyMarqueeTransformToLine,
  applyOutsideContentToProxy,
  applyOutsideTextToLine,
  applyReshapeCornerSnap,
  applyStampColorKeepHoles,
  bakeCropBoundsFromCanvas,
  bakeMarqueeFloatCanvas,
  bakeObjectAppearanceToStamp,
  bboxEdgeAt,
  BRUSH_TIPS,
  BrushTipIcon,
  CAP_TYPES,
  CHECKER,
  clampCropPan,
  clearHolesOnShapeIdentityChange,
  cloneLines,
  collectTransformSubtree,
  composeCanvasRot,
  constrainDragDeltaAxis,
  contentRotatePinHit,
  convertPts,
  cropCursorForHandle,
  cropHandleAt,
  cssSolidRgb,
  DASH_TYPES,
  defaultCapSize,
  destOutLocalPunch,
  dilateBitMask,
  displayRectCorners,
  dist,
  DRAG,
  drawCanvasAtMarqueeTransform,
  drawCanvasRotatedAt,
  drawCropOverlay,
  drawRotatePinAt,
  ensureStampImage,
  ensureStampImageDecoded,
  findFillSeed,
  flattenLine,
  floatAxisBounds,
  floatDestPivot,
  floatRotationPivot,
  floatTransformBounds,
  floodFillConnected,
  floodOutsideEmpty,
  genId,
  hexAlpha,
  holeGeom,
  initReshapeOnLine,
  insertAfterSubtreeIndex,
  IRREG_SHAPES,
  isLiveInnerVector,
  isTransparentPaintColor,
  letterBakeStampToEditableText,
  LINE_TYPES,
  lineBorderColor,
  lineBorderRadius,
  lineBorderWidth,
  lineFromContentProxy,
  lineFromOutsideText,
  lineHasReshapeWarp,
  lineHitDist,
  lineNeedsDisplayTransform,
  linePts,
  lineReshapeable,
  LineSelect,
  localRectCornersFromPts,
  lockAspectEnd,
  lockAspectRatioEnd,
  mapObjDisplayPt,
  marqueeFloatCorners,
  marqueeFloatDestPivot,
  marqueeFloatDrawParams,
  marqueeFloatRotatePinHit,
  marqueeFloatRotatePinPoints,
  marqueeFloatSourceRect,
  marqueeFloatTransform,
  mid,
  NO_DRAG,
  normalizeHex,
  normalizeLayerOrder,
  normalizeRot,
  objCenter,
  objectHasFillHole,
  objectHasSeeThroughHole,
  objTopCenter,
  opticalTopLeftForText,
  PAINT_LAYER_MIME,
  paintObjectHit,
  paintRootOfLine,
  paintSlotStepsForRoots,
  pauseStampStrokeRelock,
  pixelColor,
  pointInLocalRect,
  pointInMarqueeFloat,
  pointInPoly,
  pointInRect,
  pointInRotatedRect,
  POLY_KIND_SET,
  POLY_SHAPES,
  punchLocalBox,
  punchObjectFromComposite,
  punchStampFromFilled,
  rasterizeRemainderAfterMarqueeCut,
  rebakeStrokeLockedStamp,
  rectCenter,
  rectCorners,
  rectRotatePinAnchor,
  rectRotatePinHit,
  rectRotatePinTip,
  refillHolePocket,
  refreshTextHoleMaskForNewGlyphs,
  regularPolyPts,
  renderGroup,
  renderLine,
  renderLineBase,
  renderLineBody,
  renderObjectTree,
  renderPunchSilhouette,
  resampleAlong,
  reshapeCornerAt,
  reshapeEdgeAt,
  restorePunchMasks,
  rewritePunchBitsFromLocal,
  rgbClose3,
  ROTATE_PIN_HIT_PAD,
  ROTATE_PIN_LEN,
  rotatePinAnchor,
  rotatePinHit,
  rotatePinTip,
  rotatePt,
  rotateReshapeFromSnapshot,
  rotationCenter,
  scalePaintLineAround,
  serializeHoleMaskPng,
  serializeSeeThroughMaskPng,
  setLocalPunchFromFilled,
  setMarqueeFloatPosition,
  ShapeMenu,
  shapeSupportsRadius,
  snapStraightLineEnd,
  stampBrushTip,
  stampImgCache,
  stampLocalRect,
  stampRenderDataUrl,
  stampStrokeLiveCache,
  stampStrokeRelockPaused,
  strokeBrushTip,
  strokeBrushTipOutline,
  subtractLocalPunchRegion,
  textFillHit,
  textInkBBox,
  textMetrics,
  textPanelStateFromLine,
  transformCanvasPixels,
  transformStampLineObj,
  translatePolyEdge,
  translateReshape,
  unmapObjDisplayPt,
  withAlpha,
  withZeroAlpha
} from './iconPaint/paintHelpers'
import type {
  BrushTip,
  CanvasXform,
  CapType,
  CropSession,
  DashType,
  HistoryEntry,
  IconPaintEditorProps,
  LineObj,
  LineType,
  ObjectPaintStroke,
  OuterFillSnap,
  Pt,
  ShapeKind,
  Snap,
  Tool,
  XformOpts
} from './iconPaint/paintHelpers'

export function IconPaintEditor({
  containerImage,
  contentImage,
  containerOverlayImage = null,
  contentOverlayImage = null,
  resolution = 512,
  innerDrawSize,
  paintOuterSize,
  title = 'Edit icon',
  hasContainer = true,
  initialVectors,
  initialPunchMasks,
  initialContentBakedInDecorations = false,
  initialLayerOrder,
  initialPaintShapeSize,
  outsideContentSettings = null,
  outsideTextSettings = null,
  syncOuterFillColor = true,
  outerBorderWidthPx = 0,
  outerBorderColor = null,
  outerShadowColor = null,
  outerFillColor = null,
  logoVariantOptions = [],
  faviconVariantOptions = [],
  initialSaveTargets,
  onSave,
  onClose,
  onOpenSettings
}: IconPaintEditorProps): JSX.Element {
  // Prefer structured outsideContentSettings; fall back to letters-only prop.
  const outsideContent: OutsideContentSettings | null = outsideContentSettings
    ?? (outsideTextSettings
      ? { ...outsideTextSettings, kind: 'letters' as const, sizeRatio: outsideTextSettings.fontSizeRatio }
      : null)
  const lettersOutside: OutsideTextSettings | null =
    outsideContent?.kind === 'letters' ? outsideContent : null
  const inheritedFillMode = React.useContext(TransparentFillModeContext)
  const showSaveTargets = logoVariantOptions.length > 0 || faviconVariantOptions.length > 0
  const [saveLogoIds, setSaveLogoIds] = useState<Set<string>>(
    () => new Set(initialSaveTargets?.logoIds ?? [])
  )
  const [saveFaviconIds, setSaveFaviconIds] = useState<Set<string>>(
    () => new Set(initialSaveTargets?.faviconIds ?? [])
  )
  /** When on, colour slots / remaps copy with paint; when off, each variant keeps its colours. */
  const [saveCopyColors, setSaveCopyColors] = useState(
    () => initialSaveTargets?.copyColors !== false
  )
  const [paletteIcon, setPaletteIcon] = useState<IconConfig>(() => ({
    ...DEFAULT_ICON_CONFIG,
    sourceType: 'lucide',
    lucideIconName: 'Layers',
    primaryColor: '#000000'
  }))
  // Off-DOM working buffers ONLY — never mounted in the stage. The stage shows
  // displayComposite (visibility-aware) + preview (handles/cursor). Mounting
  // source canvases in the DOM (even with display:none) under PreviewStage's
  // CSS transform caused unchecked base/object pixels to keep painting.
  /** Live Outer/Inner bases — rebaked from settings outside Paint. */
  const baseContainerCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const baseContentCanvasRef = useRef<HTMLCanvasElement | null>(null)
  /** Paint overlays — brush / eraser / fill write here only. */
  const containerCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const contentCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const displayCompositeRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const paintFrameRef = useRef<HTMLCanvasElement | null>(null)
  const slotCacheContentRef = useRef<HTMLCanvasElement | null>(null)
  const slotCacheContainerRef = useRef<HTMLCanvasElement | null>(null)
  const slotCacheReadyRef = useRef<{ content: boolean; container: boolean }>({
    content: false,
    container: false
  })
  /** Last Outer Fill click: fill / border / shadow — used on Save to sync live settings. */
  const lastOuterFillTargetRef = useRef<'fill' | 'border' | 'shadow' | null>(null)
  const lastOuterFillColorRef = useRef<string | null>(null)
  /** Every Outer fill this session (border then shadow must both survive). */
  const lastOuterFillColorsRef = useRef<{ fill?: string; border?: string; shadow?: string }>({})
  /** Fill-all on Outer: live fill + border + shadow should all take the paint colour. */
  const lastOuterFillAllRef = useRef(false)
  /** Brush / eraser / non-fill paint on Outer after a Fill — keep overlay on Save. */
  const preserveOuterOverlayRef = useRef(false)

  const [tool, setTool] = useState<Tool>('pointer')
  /** Armed Color 1–5 while Match is on (`null` = Match on but nothing armed). */
  const [matchSlot, setMatchSlot] = useState<number | null>(null)
  const matchSlotRef = useRef<number | null>(null)
  matchSlotRef.current = matchSlot
  /** Show 1–5 section labels on the canvas while Match is active. */
  const [matchLabelsVisible, setMatchLabelsVisible] = useState(true)
  const [matchLabels, setMatchLabels] = useState<MatchSectionLabel[]>([])
  const toolRef = useRef<Tool>('pointer')
  toolRef.current = tool
  const [brushTip, setBrushTip] = useState<BrushTip>('round')
  /** Eraser footprint — circle or square only (independent of brush tip). */
  const [eraserTip, setEraserTip] = useState<'round' | 'square'>('round')
  const [color, setColor] = useState('#000000ff')
  const [size, setSize] = useState(12)
  const [shapeFill, setShapeFill] = useState(false)
  /** Stroke / border colour for lines, polygons, and shapes (separate from fill colour). */
  const [borderColor, setBorderColor] = useState('#000000ff')
  const [borderRadius, setBorderRadius] = useState(0)
  const [borderPopupOpen, setBorderPopupOpen] = useState(false)
  const [borderPopupRect, setBorderPopupRect] = useState<DOMRect | null>(null)
  const borderSwatchRef = useRef<HTMLButtonElement>(null)
  /** After flood fill, also paint thin AA / leftover outline fringes (not thick designed borders). */
  const [fillCleanEdges, setFillCleanEdges] = useState(true)
  /** Recolor every non-transparent pixel on target layers (ignores click colour / flood region). */
  const [fillAllOpaque, setFillAllOpaque] = useState(false)
  /** When fill colour is fully transparent: hide this layer, or punch through layers below. */
  const [transparentFillMode, setTransparentFillMode] = useState<'see-through' | 'punch'>(
    () => inheritedFillMode?.mode ?? 'see-through'
  )
  const transparentFillModeRef = useRef(transparentFillMode)
  transparentFillModeRef.current = transparentFillMode
  const [hexText, setHexText] = useState('#000000ff')
  const [colorPopupOpen, setColorPopupOpen] = useState(false)
  const [colorPopupRect, setColorPopupRect] = useState<DOMRect | null>(null)
  const colorSwatchRef = useRef<HTMLButtonElement>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [layerOrder, setLayerOrder] = useState<PaintLayerId[]>(
    () => normalizeLayerOrder(initialLayerOrder)
  )
  const layerOrderRef = useRef(layerOrder)
  layerOrderRef.current = layerOrder
  const draggedLayerRef = useRef<string | null>(null)
  /** Scrollable Layers list — edge auto-scroll while pointer-reordering. */
  const layersPanelScrollRef = useRef<HTMLDivElement | null>(null)
  const layersDragScrollRafRef = useRef<number | null>(null)
  const layersDragScrollVelRef = useRef(0)
  const layersPointerPendingRef = useRef<{ key: string; x: number; y: number } | null>(null)
  const layersPointerLastClientRef = useRef({ x: 0, y: 0 })
  const layersPointerDetachRef = useRef<(() => void) | null>(null)
  const layersPointerMoveHandlerRef = useRef<(e: PointerEvent) => void>(() => {})
  const layersPointerUpHandlerRef = useRef<() => void>(() => {})
  type LayerDropPosition = 'before' | 'after' | 'inside'
  const [layerDropTarget, setLayerDropTarget] = useState<{
    key: string
    position: LayerDropPosition
  } | null>(null)
  const layerDropTargetRef = useRef(layerDropTarget)
  layerDropTargetRef.current = layerDropTarget
  const [layerPointerDragging, setLayerPointerDragging] = useState(false)
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set())
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null)
  const [layerNameDraft, setLayerNameDraft] = useState('')

  // Which layers are currently editable (brush / eraser / fill targets).
  // Vector tools (line, shape, text) live on a separate overlay and do not need these.
  const [editContainer, setEditContainer] = useState(!!hasContainer)
  const [editContent, setEditContent] = useState(true)
  /** True once the container canvas has any non-transparent pixels (or the icon has an outer shape). */
  const [containerUsable, setContainerUsable] = useState(!!hasContainer)
  const editContainerRef = useRef(editContainer)
  const editContentRef = useRef(editContent)
  const containerUsableRef = useRef(containerUsable)
  editContainerRef.current = editContainer
  editContentRef.current = editContent
  containerUsableRef.current = containerUsable

  // ── Editable vector lines ────────────────────────────────────────────────
  const [lines, setLines] = useState<LineObj[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Base layer selected in the panel for layer-scoped history. */
  const [selectedBaseLayer, setSelectedBaseLayer] = useState<PaintLayerId | null>(null)
  const selectedBaseLayerRef = useRef<PaintLayerId | null>(null)
  /** Layer-panel object selection; Ctrl/Cmd-click allows multiple for Group. */
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(() => new Set())
  const selectedLayerIdsRef = useRef(selectedLayerIds)
  selectedLayerIdsRef.current = selectedLayerIds
  const [lineType, setLineType] = useState<LineType>('straight')
  const [startCap, setStartCap] = useState<CapType>('none')
  const [endCap, setEndCap] = useState<CapType>('arrow')
  const [startCapSize, setStartCapSize] = useState(() => defaultCapSize(12))
  const [endCapSize, setEndCapSize] = useState(() => defaultCapSize(12))
  const [lineDash, setLineDash] = useState<DashType>('solid')
  const [linePointCount, setLinePointCount] = useState(4)
  /** Drawn (freehand): optional fixed adjustable-point count. Empty = auto. */
  const [drawnPointCount, setDrawnPointCount] = useState('')
  /** Drawn (freehand): when On and count is empty, sample by travel distance. */
  const [drawnDistanceMode, setDrawnDistanceMode] = useState(false)
  /** Drawn (freehand): connect adjustable points with a smooth curve. */
  const [drawnCurve, setDrawnCurve] = useState(false)

  // Text tool settings
  const [textValue, setTextValue] = useState('')
  const [fontFamily, setFontFamily] = useState('Inter')
  /** When on, copy outside letters settings into the active/linked text layer. */
  const [useOutsideText, setUseOutsideText] = useState(() => !!lettersOutside)
  const outsideTextRef = useRef(lettersOutside)
  outsideTextRef.current = lettersOutside
  const outsideContentRef = useRef(outsideContent)
  outsideContentRef.current = outsideContent
  const [fontSize, setFontSize] = useState(96)
  const [fontWeightV, setFontWeightV] = useState(700)
  const [underline, setUnderline] = useState(false)
  const [italic, setItalic] = useState(false)
  /** Line height multiplier (1.28 = default). */
  const [txtLineHeight, setTxtLineHeight] = useState(1.28)
  /** Letter spacing in px. */
  const [txtLetterSpacing, setTxtLetterSpacing] = useState(0)
  const [txtShadow, setTxtShadow] = useState(false)
  const [txtShadowColor, setTxtShadowColor] = useState('#000000b3')
  const [txtShadowBlur, setTxtShadowBlur] = useState(8)
  const [txtShadowOX, setTxtShadowOX] = useState(0)
  const [txtShadowOY, setTxtShadowOY] = useState(3)
  const [txtShadowSpread, setTxtShadowSpread] = useState(0)
  /** When set, text is edited via an on-canvas textarea (Paint-style). */
  const [textEditId, setTextEditId] = useState<string | null>(null)
  const textEditIdRef = useRef<string | null>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ w: 1, h: 1 })

  // Preset shapes
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect')
  const [polyKind, setPolyKind] = useState<ShapeKind | 'freepoly'>('rect')
  const [irregKind, setIrregKind] = useState<ShapeKind>('ellipse')
  const [freePolyN, setFreePolyN] = useState(5)
  /** Polygon-menu aspect lock (preset polygons + free poly). Defaults 1:1. */
  const [polyLockAspect, setPolyLockAspect] = useState(false)
  const [polyAspectW, setPolyAspectW] = useState(1)
  const [polyAspectH, setPolyAspectH] = useState(1)
  /** Irregular-menu aspect lock. Defaults 1:1. */
  const [irregLockAspect, setIrregLockAspect] = useState(false)
  const [irregAspectW, setIrregAspectW] = useState(1)
  const [irregAspectH, setIrregAspectH] = useState(1)
  const polyAspectRef = useRef({ lock: false, w: 1, h: 1 })
  const irregAspectRef = useRef({ lock: false, w: 1, h: 1 })
  polyAspectRef.current = { lock: polyLockAspect, w: polyAspectW, h: polyAspectH }
  irregAspectRef.current = { lock: irregLockAspect, w: irregAspectW, h: irregAspectH }
  const [openMenu, setOpenMenu] = useState<'poly' | 'irreg' | null>(null)
  const [shapeMenuRect, setShapeMenuRect] = useState<DOMRect | null>(null)
  const polyMenuBtnRef = useRef<HTMLButtonElement>(null)
  const irregMenuBtnRef = useRef<HTMLButtonElement>(null)
  /** Preserve shape/icon stroke width while its bounds are resized. */
  const [keepStrokeOnResize, setKeepStrokeOnResize] = useState(true)

  // Copy / paste (marquee raster selection + vector objects)
  const [hasMarquee, setHasMarquee] = useState(false)
  const [hasClip, setHasClip] = useState(false)
  const [clipLabel, setClipLabel] = useState('')
  /** coverage = adjust what the box covers · scale = resize/stretch the lifted pixels */
  const [marqueeMode, setMarqueeMode] = useState<'coverage' | 'scale'>('coverage')
  const imageFileInputRef = useRef<HTMLInputElement>(null)
  const marqueeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const marqueeStartRef = useRef<Pt | null>(null)
  const floatRef = useRef<{
    canvas: HTMLCanvasElement
    x: number
    y: number
    source?: HTMLCanvasElement
    /** Original marquee position, used to restore pixels when cancelling. */
    originX?: number
    originY?: number
    originW?: number
    originH?: number
    /** Finalize as a persistent pointer-selectable stamp instead of rasterizing it. */
    selectable?: boolean
    /** Top checked source layer, used to invalidate a temporary marquee if hidden. */
    sourceLayer?: PaintLayerId
    /** Marquee pixels retained separately so they return to their original canvases. */
    layerCanvases?: {
      layer: PaintLayerId
      canvas: HTMLCanvasElement
      source: HTMLCanvasElement
      baseSource: HTMLCanvasElement
    }[]
    /** Existing vector objects temporarily removed while the marquee transforms them. */
    vectorState?: {
      originalLines: LineObj[]
      selectedIds: string[]
      sourceRect: { x: number; y: number; w: number; h: number }
      sourcePivot: Pt
    }
    /** Rotation applied while the selection is lifted (scale mode). */
    rot?: number
    /** Mirror scale accumulated while lifted (±1 toggles on flip). */
    scaleX?: number
    scaleY?: number
    /** Partially overlapped vectors: punch this origin rect while the float is active. */
    partialVectorMask?: {
      rect: { x: number; y: number; w: number; h: number }
      ids: string[]
    }
  } | null>(null)
  const floatDragRef = useRef<{
    startPt: Pt
    startDp: Pt
    startFx: number
    startFy: number
    isMarquee: boolean
  } | null>(null)
  /** Corner drag: coverage resizes the marquee rect; scale resizes the float bitmap. */
  const floatResizeRef = useRef<{
    corner: 'nw' | 'ne' | 'sw' | 'se'
    start: { x: number; y: number; w: number; h: number }
    source: HTMLCanvasElement
  } | null>(null)
  const marqueeResizeRef = useRef<{
    corner: 'nw' | 'ne' | 'sw' | 'se'
    start: { x: number; y: number; w: number; h: number }
  } | null>(null)
  const floatRotateRef = useRef<{
    center: Pt
    startAng: number
    startRot: number
  } | null>(null)
  /** Partial vector punch-out while a float is active (before commit). */
  const partialVectorMaskRef = useRef<{
    rect: { x: number; y: number; w: number; h: number }
    ids: string[]
  } | null>(null)
  /** Hysteresis keeps a 50% resize snap engaged until the pointer moves clearly away. */
  const resizeSnapLockRef = useRef({ width: false, height: false })
  const rasterClipRef = useRef<HTMLCanvasElement | null>(null)
  const vectorClipRef = useRef<LineObj | null>(null)
  const clipKindRef = useRef<'raster' | 'vector' | null>(null)
  const clipActionsRef = useRef<{
    copy: () => void; cut: () => void; paste: () => void
    liftMarquee: () => void; commitFloat: () => void; discardFloat: () => void
    clearSel: () => void; clearRegion: () => void
  }>({
    copy: () => {},
    cut: () => {},
    paste: () => {},
    liftMarquee: () => {},
    commitFloat: () => {},
    discardFloat: () => {},
    clearSel: () => {},
    clearRegion: () => {}
  })

  const linesRef = useRef<LineObj[]>([])
  const selectedIdRef = useRef<string | null>(null)
  const reshapeInitRetryRef = useRef(0)
  const reshapeInitRetryIdRef = useRef<string | null>(null)
  const reshapeSnapGuidesRef = useRef<{
    vertical: number[]
    horizontal: number[]
    label: string | null
  } | null>(null)
  const lineDragRef = useRef<{
    kind: 'create' | 'draw' | 'handle' | 'move' | 'rotate' | 'reshapeCorner' | 'reshapeEdge' | 'bboxEdge' | 'cropHandle' | 'cropPan'
    id: string
    idx?: number
    grab?: Pt
    center?: Pt
    startAng?: number
    startRot?: number
    startRect?: { x: number; y: number; w: number; h: number }
    startCenter?: Pt
    snapshot?: LineObj[]
  } | null>(null)
  const cropSessionRef = useRef<CropSession | null>(null)
  const [cropping, setCropping] = useState(false)
  const [cropHoverCursor, setCropHoverCursor] = useState<string | null>(null)
  const applyStampCropRef = useRef<() => boolean>(() => true)
  const cancelStampCropRef = useRef<() => void>(() => {})
  const baseTransformRef = useRef<{
    kind: 'move' | 'resize' | 'rotate'
    source: HTMLCanvasElement
    baseSource?: HTMLCanvasElement
    punchStamps?: { id: string; pts: Pt[]; rot?: number }[]
    bounds: { x: number; y: number; w: number; h: number }
    grab?: Pt
    fixed?: Pt
    corner?: Corner
    center?: Pt
    startAng?: number
  } | null>(null)

  // Layer-scoped history. Each completed action stores its full before/after
  // snapshots, but restore applies only the tagged object/group/base layers.
  const historyRef = useRef<HistoryEntry[]>([])
  const lastSnapshotRef = useRef<Snap | null>(null)
  const redoOrderRef = useRef<number[]>([])

  // Interaction state
  const drawing = useRef(false)
  const startPt = useRef({ x: 0, y: 0 })
  const lastPt = useRef({ x: 0, y: 0 })
  const objectPaintStrokeRef = useRef<{ id: string; index: number } | null>(null)
  const polyPts = useRef<{ x: number; y: number }[]>([])
  /** When true, double-click finish should not pop — the second click was already skipped. */
  const polyDblClickSkippedRef = useRef(false)
  /** Active window-level pointer capture so drags continue outside the canvas. */
  const pointerDragCleanupRef = useRef<(() => void) | null>(null)

  const W = resolution
  const H = resolution
  const innerDraw = Math.max(16, innerDrawSize ?? W)
  /** Visible container on the paint canvas (shadow inset only — not Size % / content pad). */
  const containerDraw = Math.max(16, paintOuterSize ?? innerDraw)
  const displayNeedsResetRef = useRef(false)
  const paintDropLockRef = useRef(false)

  const ensureOffscreenCanvas = (ref: React.MutableRefObject<HTMLCanvasElement | null>) => {
    if (!ref.current) ref.current = document.createElement('canvas')
    if (ref.current.width !== W || ref.current.height !== H) {
      ref.current.width = W
      ref.current.height = H
    }
    return ref.current
  }
  const containerCtx = () => ensureOffscreenCanvas(containerCanvasRef).getContext('2d')
  const contentCtx = () => ensureOffscreenCanvas(contentCanvasRef).getContext('2d')
  const baseCanvas = (id: PaintLayerId): HTMLCanvasElement =>
    id === 'content'
      ? ensureOffscreenCanvas(baseContentCanvasRef)
      : ensureOffscreenCanvas(baseContainerCanvasRef)
  const layerIsEditable = (id: PaintLayerId): boolean =>
    id === 'content'
      ? editContentRef.current
      : editContainerRef.current && containerUsableRef.current
  /** Writable paint overlay for a base id. */
  const layerCanvas = (id: PaintLayerId): HTMLCanvasElement =>
    id === 'content'
      ? ensureOffscreenCanvas(contentCanvasRef)
      : ensureOffscreenCanvas(containerCanvasRef)
  /**
   * One paint stack slot: live base → live Inner vectors → overlay → session
   * vectors. Overlay sits on top of Inner letters/icons so brush cuts and Fill
   * are visible on the content (session drawings stay above the overlay).
   */
  const liveDirtyLayers = (): Set<PaintLayerId> | null => {
    const dirty = new Set<PaintLayerId>()
    const addTree = (root: LineObj) => {
      dirty.add(vectorLayerOf(root))
      for (const child of linesRef.current) {
        if (child.parentId === root.id) addTree(child)
      }
    }
    const dr = lineDragRef.current
    if (dr) {
      const l = linesRef.current.find((item) => item.id === dr.id)
      if (l) addTree(l)
    }
    if (baseTransformRef.current) dirty.add('content')
    const stroke = objectPaintStrokeRef.current
    if (stroke) {
      const l = linesRef.current.find((item) => item.id === stroke.id)
      if (l) dirty.add(vectorLayerOf(l))
    }
    if (drawing.current) {
      for (const layerId of layerOrderRef.current) {
        if (layerIsEditable(layerId)) dirty.add(layerId)
      }
    }
    return dirty.size ? dirty : null
  }
  const invalidatePaintCaches = () => {
    slotCacheReadyRef.current = { content: false, container: false }
    displayNeedsResetRef.current = true
  }
  /** While a marquee float is active, punch its lift origin out of every layer slot. */
  const activeFloatCutHole = (): { x: number; y: number; w: number; h: number } | null => {
    const f = floatRef.current
    if (!f || f.selectable || f.originX == null || f.originY == null) return null
    return {
      x: f.originX,
      y: f.originY,
      w: f.originW ?? f.canvas.width,
      h: f.originH ?? f.canvas.height
    }
  }
  const activePartialVectorMask = () => floatRef.current?.partialVectorMask ?? null
  const linesHaveMarqueeCutRects = () =>
    linesRef.current.some((l) => (l.marqueeCutRects?.length ?? 0) > 0)
  const paintStackSlot = (
    ctx: CanvasRenderingContext2D,
    id: PaintLayerId,
    opts?: { base?: boolean; overlay?: boolean; skipId?: string | null }
  ) => {
    const cutHole = activeFloatCutHole()
    if (cutHole) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, W, H)
      ctx.rect(cutHole.x, cutHole.y, cutHole.w, cutHole.h)
      ctx.clip('evenodd')
    }
    const skipId = opts?.skipId
    const skip = (l: LineObj) => !!(skipId && l.id === skipId && l.type === 'text')
    const vis = (l: LineObj) => isVectorVisible(l)
    const liveDirty = liveDirtyLayers()
    const partialMask = activePartialVectorMask()
    const useSlotCache =
      !!(liveDirty && !liveDirty.has(id)) &&
      !cutHole &&
      !partialMask &&
      !linesHaveMarqueeCutRects()
    const cacheSlot = id === 'content' ? slotCacheContentRef : slotCacheContainerRef

    // Paint order within a slot: below-base objects → base → overlay → above-base objects.
    // Object order inside each bucket matches the Layers panel (lines-array index).
    // Punch-through must only cut what is already below the punched object, so
    // after each punch we redraw strictly-higher steps in this slot.
    const roots = linesRef.current.filter((l) => !l.parentId && vectorLayerOf(l) === id)
    const steps = paintSlotStepsForRoots(roots, linesRef.current, opts)

    const paintObjectStep = (t: CanvasRenderingContext2D, l: LineObj) => {
      if (skip(l)) return
      const clipRects: { x: number; y: number; w: number; h: number }[] = [
        ...(l.marqueeCutRects ?? [])
      ]
      if (partialMask?.ids.includes(l.id)) clipRects.push(partialMask.rect)
      if (clipRects.length) {
        t.save()
        t.beginPath()
        t.rect(0, 0, W, H)
        for (const r of clipRects) t.rect(r.x, r.y, r.w, r.h)
        t.clip('evenodd')
        renderObjectTree(t, l, linesRef.current, vis)
        t.restore()
      } else {
        renderObjectTree(t, l, linesRef.current, vis)
      }
      if (vis(l)) {
        // Always dest-out see-through masks — even when punchThrough also cuts below.
        if (
          hasSeeThroughCoverage(l.id) ||
          (!l.punchThrough &&
            l.punchMask) ||
          (!l.punchThrough &&
            !l.punchEnclosedHole &&
            (seeThroughMaskCanvases.has(l.id) || seeThroughMaskBits.has(l.id)))
        ) {
          destOutLocalPunch(t, l, 'see-through')
        }
        // Free punchMask stamps / non-enclosed local see-through still on punch maps (legacy).
        if (
          !l.punchThrough &&
          !hasSeeThroughCoverage(l.id) &&
          (l.punchMask ||
            (!l.punchEnclosedHole && (punchMaskCanvases.has(l.id) || punchMaskBits.has(l.id))))
        ) {
          destOutLocalPunch(t, l, 'punch')
        }
      }
    }

    const paintStepsTo = (t: CanvasRenderingContext2D) => {
      for (const step of steps) {
        if (step.kind === 'base') t.drawImage(baseCanvas(id), 0, 0)
        else if (step.kind === 'overlay') t.drawImage(layerCanvas(id), 0, 0)
        else paintObjectStep(t, step.l)
      }
    }

    const redrawAbove = (target: CanvasRenderingContext2D, afterIndex: number) => {
      for (let j = afterIndex + 1; j < steps.length; j++) {
        const step = steps[j]
        if (step.kind === 'base') continue
        if (step.kind === 'overlay') {
          target.drawImage(layerCanvas(id), 0, 0)
          continue
        }
        paintObjectStep(target, step.l)
      }
    }

    const groupMayPunch = (group: LineObj): boolean => {
      for (const child of linesRef.current) {
        if (child.parentId !== group.id) continue
        if (child.type === 'group') {
          if (groupMayPunch(child)) return true
        } else if (child.punchThrough && vis(child)) {
          return true
        }
      }
      return false
    }

    const applyPunchThroughInOrder = (target: CanvasRenderingContext2D) => {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        if (step.kind !== 'object') continue
        const l = step.l
        if (skip(l) || !vis(l)) continue
        if (l.punchMask && !l.punchThrough) continue
        if (l.type === 'group') {
          if (!groupMayPunch(l)) continue
        } else if (!l.punchThrough) {
          continue
        }
        punchObjectFromComposite(target, l, linesRef.current, vis)
        redrawAbove(target, i)
      }
    }

    if (useSlotCache && slotCacheReadyRef.current[id]) {
      const cached = cacheSlot.current
      if (cached && cached.width === W && cached.height === H) {
        ctx.drawImage(cached, 0, 0)
        applyPunchThroughInOrder(ctx)
        return
      }
    }
    const isolateSeeThrough = linesRef.current.some(
      (l) =>
        vectorLayerOf(l) === id &&
        vis(l) &&
        (hasSeeThroughCoverage(l.id) ||
          (!l.punchThrough &&
            (!!l.punchMask ||
              !!l.punchEnclosedHole ||
              punchMaskCanvases.has(l.id) ||
              punchMaskBits.has(l.id) ||
              seeThroughMaskCanvases.has(l.id) ||
              seeThroughMaskBits.has(l.id))))
    )
    if (isolateSeeThrough || useSlotCache) {
      const tmp = useSlotCache ? ensureCanvas(cacheSlot, W, H) : takeCanvas(W, H)
      try {
        const t = tmp.getContext('2d')!
        if (useSlotCache) {
          reset2dState(t)
          t.clearRect(0, 0, W, H)
        }
        paintStepsTo(t)
        ctx.drawImage(tmp, 0, 0)
        if (useSlotCache) slotCacheReadyRef.current[id] = true
      } finally {
        if (!useSlotCache) releaseCanvas(tmp)
      }
    } else {
      paintStepsTo(ctx)
    }
    applyPunchThroughInOrder(ctx)
    if (cutHole) ctx.restore()
  }

  const overlayHasOpaque = (id: PaintLayerId): boolean => {
    const data = layerCanvas(id).getContext('2d')?.getImageData(0, 0, W, H).data
    if (!data) return false
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] > 8) return true
    }
    return false
  }

  const layerCompositeAlphaAt = (id: PaintLayerId, x: number, y: number): number => {
    const px = Math.max(0, Math.min(W - 1, Math.floor(x)))
    const py = Math.max(0, Math.min(H - 1, Math.floor(y)))
    const b = baseCanvas(id).getContext('2d')?.getImageData(px, py, 1, 1).data[3] ?? 0
    const o = layerCanvas(id).getContext('2d')?.getImageData(px, py, 1, 1).data[3] ?? 0
    return Math.round(o + (b * (255 - o)) / 255)
  }

  const vectorAlphaAt = (id: PaintLayerId, x: number, y: number): number => {
    const px = Math.max(0, Math.min(W - 1, Math.floor(x)))
    const py = Math.max(0, Math.min(H - 1, Math.floor(y)))
    let alpha = 0
    for (const root of linesRef.current) {
      if (root.parentId || vectorLayerOf(root) !== id) continue
      if (!isVectorVisible(root)) continue
      const probe = takeCanvas(3, 3)
      try {
        const pctx = probe.getContext('2d')!
        pctx.setTransform(1, 0, 0, 1, -px + 1, -py + 1)
        renderObjectTree(pctx, root, linesRef.current, isVectorVisible)
        alpha = Math.max(alpha, pctx.getImageData(1, 1, 1, 1).data[3] ?? 0)
      } finally {
        releaseCanvas(probe)
      }
      if (alpha > 8) return alpha
    }
    return alpha
  }

  /** True when a punch / see-through hole on `id` covers the canvas point. */
  const punchHoleAt = (id: PaintLayerId, x: number, y: number): boolean => {
    const px = Math.max(0, Math.min(W - 1, Math.floor(x)))
    const py = Math.max(0, Math.min(H - 1, Math.floor(y)))
    const p = py * W + px
    for (const l of linesRef.current) {
      if (vectorLayerOf(l) !== id) continue
      const punchBits = punchMaskBits.get(l.id)
      if (punchBits && punchBits.length === W * H && punchBits[p]) return true
      const stBits = seeThroughMaskBits.get(l.id)
      if (stBits && stBits.length === W * H && stBits[p]) return true
      if (!l.punchMask || l.pts.length < 2) continue
      const a = l.pts[0], b = l.pts[1]
      const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y)
      const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
      if (px >= x0 && px < x1 && py >= y0 && py < y1) return true
    }
    return false
  }

  /** Empty click inside a letter counter / object hole on this layer (not stage). */
  /** True when (x,y) sits in an empty enclosed counter of this object (e.g. bowl of "B"). */
  const pointInObjectEnclosedCounter = (item: LineObj, x: number, y: number): boolean => {
    if (item.punchMask || item.marqueeItem || item.type === 'group') return false
    if (item.type !== 'text' && item.type !== 'shape' && item.type !== 'stamp' && item.type !== 'poly') {
      return false
    }
    const px = Math.max(0, Math.min(W - 1, Math.floor(x)))
    const py = Math.max(0, Math.min(H - 1, Math.floor(y)))
    const probe = takeCanvas(W, H)
    try {
      const pctx = probe.getContext('2d')!
      renderLine(
        pctx,
        { ...item, shadow: false, punchThrough: false, color: '#000000' },
        { skipHole: true }
      )
      const gd = pctx.getImageData(0, 0, W, H).data
      if (gd[(py * W + px) * 4 + 3] >= 80) return false
      const ink = new Uint8Array(W * H)
      let any = false
      for (let p = 0; p < ink.length; p++) {
        if (gd[p * 4 + 3] <= 8) continue
        ink[p] = 1
        any = true
      }
      if (!any) return false
      const outside = floodOutsideEmpty(ink, W, H)
      return !outside[py * W + px]
    } finally {
      releaseCanvas(probe)
    }
  }

  /**
   * Transparent Fill on a letter counter: flood only that empty pocket and bind
   * it as punch/see-through — never wipe the whole glyph or Outer under it.
   */
  const fillEnclosedCounterAtPoint = (item: LineObj, canvasPoint: Pt, punch: boolean): boolean => {
    if (!pointInObjectEnclosedCounter(item, canvasPoint.x, canvasPoint.y)) return false
    const mode: HoleFillMode = punch ? 'punch' : 'see-through'
    const px = Math.max(0, Math.min(W - 1, Math.floor(canvasPoint.x)))
    const py = Math.max(0, Math.min(H - 1, Math.floor(canvasPoint.y)))
    const probe = takeCanvas(W, H)
    try {
      const pctx = probe.getContext('2d')!
      renderLine(
        pctx,
        { ...item, shadow: false, punchThrough: false, color: '#000000' },
        { skipHole: true }
      )
      const gd = pctx.getImageData(0, 0, W, H).data
      const ink = new Uint8Array(W * H)
      for (let p = 0; p < ink.length; p++) {
        if (gd[p * 4 + 3] > 8) ink[p] = 1
      }
      const outside = floodOutsideEmpty(ink, W, H)
      const region = floodFillConnected(W, H, px, py, (byteI) => {
        const p = (byteI / 4) | 0
        return !ink[p] && !outside[p]
      })
      if (!region.some((v) => v)) return false
      // Keep the full counter flood — eroding inset leaves Outer peeking as a
      // coloured ring between the stem and the punched hole after Save.
      const holeBits = region
      // Replace prior full-glyph silhouette for the mode being written only.
      const bitsMap = mode === 'punch' ? punchMaskBits : seeThroughMaskBits
      const canvasMap = mode === 'punch' ? punchMaskCanvases : seeThroughMaskCanvases
      const prevBits = bitsMap.get(item.id)
      if (prevBits && prevBits.length === W * H) {
        let glyph = 0
        let overlap = 0
        for (let p = 0; p < prevBits.length; p++) {
          if (gd[p * 4 + 3] >= 80) glyph++
          if (prevBits[p] && gd[p * 4 + 3] >= 80) overlap++
        }
        if (glyph > 0 && overlap >= glyph * 0.45) {
          canvasMap.delete(item.id)
          bitsMap.delete(item.id)
        }
      }
      setLocalPunchFromFilled(item, holeBits, W, H, { mode })
      return true
    } finally {
      releaseCanvas(probe)
    }
  }

  const pointInEnclosedObjectHole = (id: PaintLayerId, x: number, y: number): boolean => {
    for (const l of linesRef.current) {
      if (vectorLayerOf(l) !== id) continue
      if (pointInObjectEnclosedCounter(l, x, y)) return true
    }
    return false
  }

  /** Fill the topmost visible layer that already has ink at the click — never empty-flood Inner over Outer. */
  const floodFillTargetLayer = (x: number, y: number): PaintLayerId | null => {
    // Punch / see-through holes first — Outer ink showing through must not steal the fill.
    for (const id of layerOrderRef.current) {
      if (!layerIsEditable(id)) continue
      if (punchHoleAt(id, x, y)) return id
    }
    for (const id of layerOrderRef.current) {
      if (!layerIsEditable(id)) continue
      if (layerCompositeAlphaAt(id, x, y) > 8) return id
      if (vectorAlphaAt(id, x, y) > 8) return id
      // Letter counters before Outer under them wins the next iteration.
      if (pointInEnclosedObjectHole(id, x, y)) return id
    }
    const editable = layerOrderRef.current.filter(layerIsEditable)
    return editable[editable.length - 1] ?? null
  }

  // All checked layers (Outer + Inner). Used by eraser, fill, marquee, Remove BG, etc.
  const targetCtxs = (): CanvasRenderingContext2D[] => {
    return [...layerOrderRef.current].reverse()
      .filter(layerIsEditable)
      .map((id) => layerCanvas(id)?.getContext('2d') ?? null)
      .filter((ctx): ctx is CanvasRenderingContext2D => !!ctx)
  }

  const targetCanvases = (): HTMLCanvasElement[] => {
    return [...layerOrderRef.current].reverse()
      .filter(layerIsEditable)
      .map(layerCanvas)
      .filter((canvas): canvas is HTMLCanvasElement => !!canvas)
  }

  /**
   * Brush (and other “add paint” tools): topmost checked layer wins.
   * Stack when saving: Outer → paint-on-outer → Inner → paint-on-inner (+ session shapes).
   */
  const addPaintCtxs = (): CanvasRenderingContext2D[] => {
    const id = layerOrderRef.current.find(layerIsEditable)
    if (!id) return []
    const ctx = layerCanvas(id)?.getContext('2d')
    return ctx ? [ctx] : []
  }

  /** Layer new vectors / brush strokes are assigned to (topmost checked layer). */
  const activeAddLayer = (): 'container' | 'content' =>
    layerOrderRef.current.find(layerIsEditable) ?? 'content'

  const markOuterOverlayPreserved = () => {
    if (activeAddLayer() === 'container') preserveOuterOverlayRef.current = true
  }

  /**
   * Stamp target for floating images / paste commit.
   * The topmost checked layer receives committed images.
   */
  const topEditableCtx = (): CanvasRenderingContext2D | null => addPaintCtxs()[0] ?? null

  const vectorLayerOf = (l: LineObj): 'container' | 'content' =>
    l.layer === 'container' ? 'container' : 'content'

  const isVectorVisible = (l: LineObj): boolean => {
    // Marquee-derived objects have no panel row, so they follow their source
    // base layer. They must never become an invisible-to-the-panel render source.
    if (l.marqueeItem && !layerIsEditable(vectorLayerOf(l))) return false
    // Visibility is row-local: an unchecked group disables only the group,
    // never a checked child nested under it.
    return (l.visible ?? l.editable ?? true) !== false
  }

  const isPaintHitVisible = (l: LineObj): boolean =>
    !l.punchMask && isVectorVisible(l)

  const paintHitRank = (l: LineObj): number => {
    const root = paintRootOfLine(l, linesRef.current)
    const layerI = [...layerOrderRef.current].reverse().indexOf(vectorLayerOf(root))
    const above = root.belowBase ? 0 : 1
    const rootIndex = linesRef.current.findIndex((item) => item.id === root.id)
    return layerI * 100_000 + above * 10_000 + rootIndex
  }

  const topmostPaintHit = (pred: (l: LineObj) => boolean): LineObj | undefined =>
    [...linesRef.current]
      .sort((a, b) => paintHitRank(b) - paintHitRank(a))
      .find(pred)

  /** A checked ancestor group owns edits; otherwise the item edits itself. */
  const checkedGroupTarget = (l: LineObj): LineObj | null => {
    let parentId = l.parentId
    while (parentId) {
      const parent = linesRef.current.find((item) => item.id === parentId)
      if (!parent) return null
      if (parent.type === 'group' && isVectorVisible(parent)) return parent
      parentId = parent.parentId
    }
    return null
  }

  const addPaintTargetLabel = (): string | null => {
    const id = layerOrderRef.current.find(layerIsEditable)
    return id === 'content' ? 'Inner paint' : id === 'container' ? 'Outer paint' : null
  }

  const editLayersLabel = (): string =>
    [editContainer && containerUsable ? 'Outer paint' : null, editContent ? 'Inner paint' : null]
      .filter(Boolean)
      .join(' + ') || 'none'

  const snapshotOuterFill = (): OuterFillSnap => ({
    target: lastOuterFillTargetRef.current,
    color: lastOuterFillColorRef.current,
    colors: { ...lastOuterFillColorsRef.current },
    fillAll: lastOuterFillAllRef.current,
    preserveOverlay: preserveOuterOverlayRef.current
  })

  const applyOuterFillSnap = (snap: OuterFillSnap | undefined) => {
    if (!snap) {
      lastOuterFillTargetRef.current = null
      lastOuterFillColorRef.current = null
      lastOuterFillColorsRef.current = {}
      lastOuterFillAllRef.current = false
      preserveOuterOverlayRef.current = false
      return
    }
    lastOuterFillTargetRef.current = snap.target
    lastOuterFillColorRef.current = snap.color
    lastOuterFillColorsRef.current = { ...snap.colors }
    lastOuterFillAllRef.current = snap.fillAll
    preserveOuterOverlayRef.current = snap.preserveOverlay
  }

  const snapshotState = useCallback((): Snap | null => {
    const cc = containerCtx()
    const ct = contentCtx()
    const bcc = baseCanvas('container').getContext('2d')
    const bct = baseCanvas('content').getContext('2d')
    if (!cc || !ct || !bcc || !bct) return null
    for (const l of linesRef.current) {
      if (punchMaskCanvases.has(l.id) || seeThroughMaskCanvases.has(l.id)) {
        rewritePunchBitsFromLocal(l, W, H)
      }
    }
    return {
      container: cc.getImageData(0, 0, W, H),
      content: ct.getImageData(0, 0, W, H),
      baseContainer: bcc.getImageData(0, 0, W, H),
      baseContent: bct.getImageData(0, 0, W, H),
      lines: cloneLines(linesRef.current),
      layerOrder: [...layerOrderRef.current],
      punchBits: clonePunchBitsMap(),
      outerFill: snapshotOuterFill()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H])

  const imageDataChanged = (a: ImageData, b: ImageData): boolean => {
    if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return true
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return true
    return false
  }

  const syncHistFlags = () => {
    setCanUndo(historyRef.current.some((entry) => entry.applied))
    setCanRedo(redoOrderRef.current.some((idx) => {
      const entry = historyRef.current[idx]
      return !!entry && !entry.applied
    }))
  }

  const inferHistoryTags = (before: Snap, after: Snap): string[] => {
    const tags = new Set<string>()
    if (imageDataChanged(before.container, after.container)) tags.add('overlay:container')
    if (imageDataChanged(before.content, after.content)) tags.add('overlay:content')
    if (before.baseContainer && after.baseContainer && imageDataChanged(before.baseContainer, after.baseContainer)) {
      tags.add('bake:container')
    }
    if (before.baseContent && after.baseContent && imageDataChanged(before.baseContent, after.baseContent)) {
      tags.add('bake:content')
    }
    if (before.layerOrder.join('|') !== after.layerOrder.join('|')) {
      tags.add('overlay:container')
      tags.add('overlay:content')
      tags.add('bake:container')
      tags.add('bake:content')
    }
    const beforeById = new Map(before.lines.map((l) => [l.id, l]))
    const afterById = new Map(after.lines.map((l) => [l.id, l]))
    const ids = new Set([...beforeById.keys(), ...afterById.keys()])
    for (const id of ids) {
      const oldLine = beforeById.get(id)
      const newLine = afterById.get(id)
      if (JSON.stringify(oldLine) === JSON.stringify(newLine)) continue
      tags.add(`object:${id}`)
      const parentId = newLine?.parentId ?? oldLine?.parentId
      if (parentId) tags.add(`object:${parentId}`)
    }
    if (before.lines.map((l) => l.id).join('|') !== after.lines.map((l) => l.id).join('|')) {
      const beforeIndex = new Map(before.lines.map((l, index) => [l.id, index]))
      after.lines.forEach((l, index) => {
        if (beforeIndex.get(l.id) !== index) {
          tags.add(`object:${l.id}`)
          if (l.parentId) tags.add(`object:${l.parentId}`)
        }
      })
    }
    const bitIds = new Set([
      ...Object.keys(before.punchBits ?? {}),
      ...Object.keys(after.punchBits ?? {})
    ])
    for (const id of bitIds) {
      if (punchBitsEqual(before.punchBits?.[id], after.punchBits?.[id])) continue
      const objectId = id.startsWith('st:') ? id.slice(3) : id
      tags.add(`object:${objectId}`)
    }
    return [...tags]
  }

  const pushHistory = useCallback((extraTags: string[] = []) => {
    const after = snapshotState()
    const before = lastSnapshotRef.current
    if (!after) return
    if (!before) {
      lastSnapshotRef.current = after
      syncHistFlags()
      return
    }
    const tags = [...new Set([...inferHistoryTags(before, after), ...extraTags])]
    if (!tags.length) return
    // A new edit branches from the currently visible state.
    historyRef.current = historyRef.current.filter((entry) => entry.applied)
    redoOrderRef.current = []
    historyRef.current.push({ before, after, tags, applied: true })
    if (historyRef.current.length > 30) historyRef.current.shift()
    lastSnapshotRef.current = after
    syncHistFlags()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotState])

  // One init per paint open — avoid re-seeding vectors when deps tick (Strict Mode / innerDrawSize).
  const paintBasesLoadedRef = useRef(false)

  // Load live bases (read-only) + paint overlays (writable).
  useEffect(() => {
    if (paintBasesLoadedRef.current) return
    const baseCc = ensureOffscreenCanvas(baseContainerCanvasRef).getContext('2d')
    const baseCt = ensureOffscreenCanvas(baseContentCanvasRef).getContext('2d')
    const cc = containerCtx()
    const ct = contentCtx()
    if (!baseCc || !baseCt || !cc || !ct) return
    baseCc.clearRect(0, 0, W, H)
    baseCt.clearRect(0, 0, W, H)
    cc.clearRect(0, 0, W, H)
    ct.clearRect(0, 0, W, H)

    const loadInto = (ctx: CanvasRenderingContext2D, src: string | null): Promise<void> =>
      new Promise((resolve) => {
        if (!src) { resolve(); return }
        const img = new Image()
        img.onload = () => {
          const r = Math.min(W / img.width, H / img.height)
          const dw = img.width * r
          const dh = img.height * r
          ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
          resolve()
        }
        img.onerror = () => resolve()
        img.src = src
      })

    Promise.all([
      loadInto(baseCc, containerImage),
      loadInto(baseCt, contentImage),
      loadInto(cc, containerOverlayImage),
      loadInto(ct, contentOverlayImage)
    ]).then(async () => {
      const restoredOrder = normalizeLayerOrder(initialLayerOrder)
      layerOrderRef.current = restoredOrder
      setLayerOrder(restoredOrder)
      // Outer usable if the icon reports a container OR the live base has pixels.
      let usable = !!hasContainer
      if (!usable) {
        const sample = baseCc.getImageData(0, 0, W, H).data
        for (let i = 3; i < sample.length; i += 16) {
          if (sample[i] > 8) { usable = true; break }
        }
      }
      containerUsableRef.current = usable
      setContainerUsable(usable)
      lastOuterFillTargetRef.current = null
      lastOuterFillColorRef.current = null
      lastOuterFillColorsRef.current = {}
      lastOuterFillAllRef.current = false
      preserveOuterOverlayRef.current = false
      if (usable && hasContainer) {
        editContainerRef.current = true
        setEditContainer(true)
      }

      // Restore editable vectors from a previous paint session (if any).
      // Letters → linked text; other types → contentBound stamp proxy.
      const outside = outsideTextRef.current
      const outsideAll = outsideContentRef.current
      let restored: LineObj[] = []
      let seededProxy: LineObj | null = null

      const syncLinkedTextPanel = (linked: LineObj, linkOutside: boolean) => {
        setUseOutsideText(linkOutside)
        const panel = textPanelStateFromLine(linked)
        setTextValue(panel.textValue)
        setFontFamily(panel.fontFamily)
        setFontSize(panel.fontSize)
        setFontWeightV(panel.fontWeightV)
        setUnderline(panel.underline)
        setItalic(panel.italic)
        setTxtLetterSpacing(panel.letterSpacing)
        setColor(panel.color)
        setTxtShadow(panel.shadow)
        setTxtShadowColor(panel.shadowColor)
        setTxtShadowBlur(panel.shadowBlur)
        setTxtShadowOX(panel.shadowOX)
        setTxtShadowOY(panel.shadowOY)
        setTxtShadowSpread(panel.shadowSpread)
      }

      if (initialVectors && initialVectors.length) {
        // Keep contentProxySlot placeholders so live Inner rehydrates in the same
        // stack position. Drop any accidental contentBound rasters (sanitize should
        // already have converted them).
        restored = cloneLines(
          normalizeLinkedTextVectors(
            initialVectors.map((v) =>
              v.contentBound
                ? { ...v, contentBound: undefined, contentProxySlot: true, imageDataUrl: undefined }
                : v
            ),
            null
          ) as unknown as LineObj[]
        ).map((l) => ({
          ...l,
          visible: l.visible ?? l.editable ?? true
        }))
      } else if (outside && outsideAll?.kind !== 'proxy') {
        const seeded = lineFromOutsideText(outside, W, innerDraw)
        restored = [seeded]
        syncLinkedTextPanel(seeded, true)
        loadFont(seeded.fontFamily ?? 'Inter').then(() => {
          redrawLinesRef.current()
          drawHandles()
        })
      }

      // Non-letter Inner: lift centered bake into a movable/resizable contentBound stamp.
      // Skip only when Save baked Inner into decorations (see-through / punch / warp).
      // Rehydrate contentProxySlot in place so z-order / nesting survive Save → re-open.
      if (outsideAll?.kind === 'proxy' && !initialContentBakedInDecorations) {
        const crop = cropOpaqueToDataUrl(baseCt.canvas)
        if (crop) {
          const existing = restored.find(
            (l) =>
              (l.contentBound || l.contentProxySlot) &&
              (l.type === 'stamp' || l.type === 'shape')
          )
          if (existing) {
            const next = applyOutsideContentToProxy(existing, outsideAll, W, crop, innerDraw)
            restored = restored.map((l) => (l.id === next.id ? next : l))
            seededProxy = next
          } else {
            seededProxy = lineFromContentProxy(crop, outsideAll, W, innerDraw)
            restored = [...restored, seededProxy]
          }
          if (
            seededProxy &&
            (outsideAll.contentType === 'image' || !!outsideAll.imageSourceDataUrl)
          ) {
            // Same source + Color/marks resolve as outside preview (no region rebuild).
            seededProxy = await hydrateImageProxyColors(seededProxy, outsideAll)
            restored = restored.map((l) => (l.id === seededProxy!.id ? seededProxy! : l))
            if (seededProxy.imageDataUrl) {
              ensureStampImage(seededProxy.imageDataUrl, () => {
                redrawLinesRef.current()
                drawHandles()
              })
            }
          }
          // Live Inner settings stay outside — clear base so we don't double-draw.
          baseCt.clearRect(0, 0, W, H)
          setTxtShadow(!!seededProxy.shadow)
          setTxtShadowColor(seededProxy.shadowColor ?? '#000000b3')
          setTxtShadowBlur(seededProxy.shadowBlur ?? 8)
          setTxtShadowOX(seededProxy.shadowOffsetX ?? 0)
          setTxtShadowOY(seededProxy.shadowOffsetY ?? 3)
          setTxtShadowSpread(seededProxy.shadowSpread ?? 0)
          ensureStampImage(seededProxy.imageDataUrl || crop.dataUrl, () => {
            redrawLinesRef.current()
            drawHandles()
          })
        }
      } else if (outsideAll?.kind === 'proxy' && initialContentBakedInDecorations) {
        // Baked Inner owns the pixels — keep live base clear; drop leftover slots.
        baseCt.clearRect(0, 0, W, H)
        restored = restored.filter((l) => !l.contentProxySlot && !l.contentBound)
      }

      // Never auto-select on paint open — user picks what to edit.
      selectedIdRef.current = null
      setSelectedId(null)
      setSelectedLayerIds(new Set())

      if (initialVectors && initialVectors.length && outside && outsideAll?.kind !== 'proxy') {
        const linked = restored.find((l) => l.type === 'text' && l.linkedOutsideText)
        const linkOutside = !!(linked && outside)
        if (linkOutside && linked) {
          const next = applyOutsideTextToLine(linked, outside, W, innerDraw, {
            preservePosition: true,
            linkToOutside: true
          })
          restored = restored.map((l) => (l.id === next.id ? next : l))
          syncLinkedTextPanel(next, true)
          loadFont(next.fontFamily ?? 'Inter').then(() => {
            redrawLinesRef.current()
            drawHandles()
          })
        } else if (linked) {
          syncLinkedTextPanel(linked, false)
        }
      }

      const savedOuter = Math.max(1, initialPaintShapeSize ?? containerDraw)
      const reopenScale = containerDraw / savedOuter

      // Restore holes while vectors still match the saved outer size / hole PNGs.
      clearAllHoles()
      restored = await restorePunchMasks(restored, initialPunchMasks, W, H)

      if (Number.isFinite(reopenScale) && Math.abs(reopenScale - 1) > 0.001) {
        restored = restored.map((l) => {
          if (l.contentBound || l.linkedOutsideText) return l
          if ((l.layer ?? 'content') !== 'content') return l
          return scalePaintLineAround(l, W / 2, H / 2, reopenScale)
        })
        const overlay = document.createElement('canvas')
        overlay.width = W
        overlay.height = H
        overlay.getContext('2d')!.drawImage(ct.canvas, 0, 0)
        ct.clearRect(0, 0, W, H)
        ct.save()
        ct.translate(W / 2, H / 2)
        ct.scale(reopenScale, reopenScale)
        ct.translate(-W / 2, -H / 2)
        ct.drawImage(overlay, 0, 0)
        ct.restore()
        // Local hole canvases are object-UV; rewrite canvas-fixed bits for new geom.
        syncHolesAfterGeomChange(restored as HoleItem[], W, H, holeGeom, 'all')
      }
      linesRef.current = restored
      setLines(restored)

      historyRef.current = []
      redoOrderRef.current = []
      lastSnapshotRef.current = null
      redrawLinesRef.current()
      pushHistory()
      paintBasesLoadedRef.current = true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerImage, contentImage, containerOverlayImage, contentOverlayImage, hasContainer, initialVectors, initialPunchMasks, initialContentBakedInDecorations, initialLayerOrder, innerDrawSize, paintOuterSize, initialPaintShapeSize])

  const restoreTaggedSnapshot = (snap: Snap, tags: string[]) => {
    const cc = containerCtx()
    const ct = contentCtx()
    const bcc = baseCanvas('container').getContext('2d')
    const bct = baseCanvas('content').getContext('2d')
    if (!cc || !ct || !bcc || !bct) return
    if (tags.includes('overlay:container') || tags.includes('base:container')) {
      cc.putImageData(snap.container, 0, 0)
    }
    if (tags.includes('overlay:content') || tags.includes('base:content')) {
      ct.putImageData(snap.content, 0, 0)
    }
    if (tags.includes('bake:container') && snap.baseContainer) {
      bcc.putImageData(snap.baseContainer, 0, 0)
    }
    if (tags.includes('bake:content') && snap.baseContent) {
      bct.putImageData(snap.baseContent, 0, 0)
    }
    const layerTags = ['overlay:container', 'overlay:content', 'bake:container', 'bake:content', 'base:container', 'base:content']
    if (layerTags.some((tag) => tags.includes(tag))) {
      const restoredOrder = normalizeLayerOrder(snap.layerOrder)
      layerOrderRef.current = restoredOrder
      setLayerOrder(restoredOrder)
    }
    const ids = new Set(tags.filter((tag) => tag.startsWith('object:')).map((tag) => tag.slice(7)))
    const desiredById = new Map(snap.lines.filter((l) => ids.has(l.id)).map((l) => [l.id, cloneLines([l])[0]]))
    const restored = linesRef.current.filter((l) => !ids.has(l.id))
    // Insert affected items relative to the nearest unaffected item in the
    // target snapshot, preserving every unrelated item's current data/order.
    for (const desired of snap.lines) {
      if (!ids.has(desired.id)) continue
      const item = desiredById.get(desired.id)
      if (!item) continue
      const desiredIndex = snap.lines.findIndex((l) => l.id === desired.id)
      let insertAt = restored.length
      for (let i = desiredIndex + 1; i < snap.lines.length; i++) {
        const nextId = snap.lines[i].id
        const currentIndex = restored.findIndex((l) => l.id === nextId)
        if (currentIndex >= 0) { insertAt = currentIndex; break }
      }
      restored.splice(insertAt, 0, item)
    }
    linesRef.current = restored
    setLines(restored)
    for (const id of ids) {
      const bits = snap.punchBits?.[id]
      const stBits = snap.punchBits?.[`st:${id}`]
      punchMaskBits.delete(id)
      punchMaskCanvases.delete(id)
      seeThroughMaskBits.delete(id)
      seeThroughMaskCanvases.delete(id)
      const line = restored.find((l) => l.id === id)
      if (bits && bits.length) {
        punchMaskBits.set(id, bits.slice())
        if (line) setLocalPunchFromFilled(line, bits, W, H, { mode: 'punch', replace: true, skipOtherSubtract: true })
      }
      if (stBits && stBits.length) {
        seeThroughMaskBits.set(id, stBits.slice())
        if (line) {
          setLocalPunchFromFilled(line, stBits, W, H, {
            mode: 'see-through',
            replace: true,
            skipOtherSubtract: true
          })
        }
      }
      if (line) syncHoleFlags(line as HoleItem)
    }
    const restoredIds = new Set(restored.map((l) => l.id))
    setSelectedLayerIds((prev) => new Set([...prev].filter((id) => restoredIds.has(id))))
    // Undo Outer Fill must clear Save sync refs — pixels alone are not enough.
    applyOuterFillSnap(snap.outerFill)
    redrawLinesRef.current()
    drawHandles()
    lastSnapshotRef.current = snapshotState()
  }
  const dropFloating = () => {
    floatRef.current = null
    floatResizeRef.current = null
    floatDragRef.current = null
    floatRotateRef.current = null
    marqueeResizeRef.current = null
    marqueeRef.current = null
    marqueeStartRef.current = null
    partialVectorMaskRef.current = null
    setHasMarquee(false)
    const p = previewRef.current?.getContext('2d')
    if (p) p.clearRect(0, 0, W, H)
  }
  const cancelFloating = () => {
    const f = floatRef.current
    if (f?.layerCanvases?.length && f.originX != null && f.originY != null) {
      for (const item of f.layerCanvases) {
        const overlay = layerCanvas(item.layer).getContext('2d')
        if (overlay) overlay.drawImage(item.source, f.originX, f.originY)
        const base = baseCanvas(item.layer).getContext('2d')
        if (base) base.drawImage(item.baseSource, f.originX, f.originY)
      }
    }
    if (f?.vectorState) {
      const restored = cloneLines(f.vectorState.originalLines)
      linesRef.current = restored
      setLines(restored)
    }
    dropFloating()
    redrawLinesRef.current()
    drawHandles()
  }
  const shiftHeldRef = useRef(false)
  const undo = useCallback(() => {
    // Cancel an uncommitted marquee first, restoring pixels/objects to their
    // original layers instead of losing the lifted content.
    if (cropSessionRef.current) {
      cancelStampCropRef.current()
      return
    }
    if (floatRef.current || marqueeRef.current) {
      cancelFloating()
      return
    }
    let idx = -1
    for (let i = historyRef.current.length - 1; i >= 0; i--) {
      const entry = historyRef.current[i]
      if (entry.applied) { idx = i; break }
    }
    if (idx < 0) return
    dropFloating()
    const entry = historyRef.current[idx]
    restoreTaggedSnapshot(entry.before, entry.tags)
    entry.applied = false
    redoOrderRef.current.push(idx)
    syncHistFlags()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const redo = useCallback(() => {
    if (cropSessionRef.current) {
      cancelStampCropRef.current()
      return
    }
    let stackIndex = -1
    for (let i = redoOrderRef.current.length - 1; i >= 0; i--) {
      const idx = redoOrderRef.current[i]
      const entry = historyRef.current[idx]
      if (entry && !entry.applied) { stackIndex = i; break }
    }
    if (stackIndex < 0) return
    dropFloating()
    const [idx] = redoOrderRef.current.splice(stackIndex, 1)
    const entry = historyRef.current[idx]
    restoreTaggedSnapshot(entry.after, entry.tags)
    entry.applied = true
    syncHistFlags()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    syncHistFlags()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedBaseLayer])

  const clearAll = () => {
    if (textEditIdRef.current) endTextEditRef.current()
    if (cropSessionRef.current) cancelStampCropRef.current()
    dropFloating()

    const selectedObjectIds = new Set(
      [...selectedLayerIdsRef.current].filter((id) =>
        linesRef.current.some((item) => item.id === id && !item.marqueeItem)
      )
    )
    for (const id of [...selectedObjectIds]) {
      descendantIds(id).forEach((childId) => selectedObjectIds.add(childId))
    }
    const selectedBase = selectedBaseLayerRef.current
    const overlaysToClear = new Set<PaintLayerId>()
    if (selectedBase) overlaysToClear.add(selectedBase)
    else if (selectedObjectIds.size === 0) {
      for (const id of layerOrderRef.current) {
        if (layerIsEditable(id)) overlaysToClear.add(id)
      }
    }

    const shouldClearStrokes = (l: LineObj): boolean => {
      if (l.marqueeItem) return false
      if (selectedObjectIds.size) return selectedObjectIds.has(l.id)
      if (selectedBase) return vectorLayerOf(l) === selectedBase
      return overlaysToClear.has(vectorLayerOf(l))
    }

    let changed = false
    for (const id of overlaysToClear) {
      const ctx = layerCanvas(id).getContext('2d')
      if (!ctx) continue
      reset2dState(ctx)
      ctx.clearRect(0, 0, W, H)
      changed = true
    }

    const next = linesRef.current.map((l) => {
      if (!shouldClearStrokes(l) || !l.paintStrokes?.length) return l
      changed = true
      return { ...l, paintStrokes: undefined }
    })

    if (!changed) return

    linesRef.current = next
    commitLines(next)
    displayNeedsResetRef.current = true
    redrawLines()
    drawHandles()
    pushHistory()
  }

  const [bgRemoving, setBgRemoving] = useState(false)

  /** Rotate / flip the selected object(s), or the full canvas when nothing is selected. */
  const applyCanvasXform = (mode: CanvasXform) => {
    if (textEditIdRef.current) endTextEditRef.current()

    const isMarqueeFloat = (candidate: typeof floatRef.current) =>
      !!(candidate && (candidate.layerCanvases?.length || candidate.sourceLayer))

    if (marqueeRef.current && !floatRef.current) {
      clipActionsRef.current.liftMarquee()
    }

    const marqueeFloat = floatRef.current
    if (isMarqueeFloat(marqueeFloat)) {
      if (mode === 'flipH') marqueeFloat.scaleX = -(marqueeFloat.scaleX ?? 1)
      else if (mode === 'flipV') marqueeFloat.scaleY = -(marqueeFloat.scaleY ?? 1)
      else marqueeFloat.rot = normalizeRot(composeCanvasRot(marqueeFloat.rot ?? 0, mode))
      drawSelOverlay()
      pushHistory()
      return
    }

    if (floatRef.current) { floatRef.current = null; setHasMarquee(false) }
    if (marqueeRef.current) { marqueeRef.current = null; setHasMarquee(false) }

    const selId = selectedIdRef.current
    let transformIds: Set<string> | null = null
    let pivot: Pt | null = null

    if (selId) {
      const panelIds = [...selectedLayerIds].filter((id) => {
        const l = linesRef.current.find((item) => item.id === id)
        return !!l && !l.marqueeItem && isVectorVisible(l)
      })

      const hasSelectedAncestor = (l: LineObj): boolean => {
        let parentId = l.parentId
        while (parentId) {
          if (panelIds.includes(parentId)) return true
          parentId = linesRef.current.find((item) => item.id === parentId)?.parentId
        }
        return false
      }

      if (panelIds.length >= 2) {
        const roots = panelIds.filter((id) => {
          const l = linesRef.current.find((item) => item.id === id)
          return !!l && !hasSelectedAncestor(l)
        })
        transformIds = new Set<string>()
        for (const id of roots) {
          collectTransformSubtree(id, linesRef.current).forEach((tid) => transformIds!.add(tid))
        }
        const boxes = [...transformIds]
          .map((id) => linesRef.current.find((item) => item.id === id))
          .filter((l): l is LineObj => !!l)
          .map(boundsForLine)
        if (boxes.length) {
          const left = Math.min(...boxes.map((b) => b.x))
          const top = Math.min(...boxes.map((b) => b.y))
          const right = Math.max(...boxes.map((b) => b.x + b.w))
          const bottom = Math.max(...boxes.map((b) => b.y + b.h))
          pivot = { x: (left + right) / 2, y: (top + bottom) / 2 }
        }
      } else {
        const sel = linesRef.current.find((l) => l.id === selId)
        if (sel) {
          const target = checkedGroupTarget(sel) ?? sel
          transformIds = collectTransformSubtree(target.id, linesRef.current)
          if (transformIds.size > 1) {
            const boxes = [...transformIds]
              .map((id) => linesRef.current.find((item) => item.id === id))
              .filter((l): l is LineObj => !!l)
              .map(boundsForLine)
            if (boxes.length) {
              const left = Math.min(...boxes.map((b) => b.x))
              const top = Math.min(...boxes.map((b) => b.y))
              const right = Math.max(...boxes.map((b) => b.x + b.w))
              const bottom = Math.max(...boxes.map((b) => b.y + b.h))
              pivot = { x: (left + right) / 2, y: (top + bottom) / 2 }
            }
          } else {
            pivot = objCenter(target)
          }
        }
      }
    }

    if (transformIds && pivot) {
      const groupTransform = transformIds.size > 1
      const xformOpts: XformOpts = { canvasSpace: false, pivot, groupTransform }
      const next = linesRef.current.map((l) =>
        transformIds!.has(l.id) ? transformStampLineObj(l, mode, W, xformOpts) : l
      )
      syncGroupBounds(next)
      linesRef.current = next
      syncHolesAfterGeomChange(next as HoleItem[], W, H, holeGeom, transformIds)
      commitLines(next)
      redrawLines()
      drawHandles()
      pushHistory()
      return
    }

    const canvasPivot = { x: W / 2, y: H / 2 }
    const canvasOpts: XformOpts = { canvasSpace: true, groupTransform: true, pivot: canvasPivot }
    for (const id of layerOrderRef.current) {
      transformCanvasPixels(baseCanvas(id), mode)
      transformCanvasPixels(layerCanvas(id), mode)
    }
    const next = linesRef.current.map((l) => transformStampLineObj(l, mode, W, canvasOpts))
    linesRef.current = next
    syncHolesAfterGeomChange(next as HoleItem[], W, H, holeGeom, 'all')
    commitLines(next)
    redrawLines()
    clearPreview()
    pushHistory()
  }

  const drawDataUrlToCanvas = (canvas: HTMLCanvasElement, dataUrl: string): Promise<boolean> =>
    new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(true)
      }
      img.onerror = () => resolve(false)
      img.src = dataUrl
    })

  /** Remove background on the selected stamp, or checked layer composites. */
  const removeBgOnLayers = async () => {
    setBgRemoving(true)
    try {
      const selId = selectedIdRef.current
      const sel = selId ? linesRef.current.find((l) => l.id === selId) : null
      if (sel?.type === 'stamp' && sel.imageDataUrl) {
        const result = await removeImageBackground(sel.imageDataUrl)
        if (result.success && result.dataUrl) {
          sel.imageDataUrl = result.dataUrl
          sel.sourceSvgMarkup = undefined
          sel.sourceStampSize = undefined
          ensureStampImage(result.dataUrl)
          commitLines([...linesRef.current])
          redrawLines()
          drawHandles()
          pushHistory()
        }
        return
      }

      if (floatRef.current) {
        const result = await removeImageBackground(floatRef.current.canvas.toDataURL('image/png'))
        if (result.success && result.dataUrl) {
          await drawDataUrlToCanvas(floatRef.current.canvas, result.dataUrl)
          redrawLines()
          pushHistory()
        }
        return
      }

      const layerIds = [...layerOrderRef.current].reverse().filter(layerIsEditable)
      if (!layerIds.length) return

      let changed = false
      for (const id of layerIds) {
        const composite = document.createElement('canvas')
        composite.width = W
        composite.height = H
        const cctx = composite.getContext('2d')!
        cctx.drawImage(baseCanvas(id), 0, 0)
        cctx.drawImage(layerCanvas(id), 0, 0)
        const result = await removeImageBackground(composite.toDataURL('image/png'))
        if (!result.success || !result.dataUrl) continue
        const overlay = layerCanvas(id)
        const base = baseCanvas(id)
        base.getContext('2d')!.clearRect(0, 0, W, H)
        if (await drawDataUrlToCanvas(overlay, result.dataUrl)) changed = true
      }
      if (changed) {
        redrawLines()
        pushHistory()
      }
    } finally {
      setBgRemoving(false)
    }
  }

  const finishPolygonRef = useRef<(opts?: { dropLastPoint?: boolean }) => void>(() => {})

  const deleteSelectedRef = useRef<() => void>(() => {})
  const endTextEditRef = useRef<() => void>(() => {})
  const startTextEditRef = useRef<(id: string) => void>(() => {})
  const nudgeSelectedRef = useRef<(dx: number, dy: number) => void>(() => {})
  const nudgeEraserRef = useRef<(dx: number, dy: number) => void>(() => {})
  const saveCurrentCanvasesRef = useRef<() => void>(() => {})
  const canSaveRef = useRef(false)
  /** After arrow-nudge while erasing, ignore mouse motion until mouseup (tip stays keyboard-driven). */
  const eraserArrowLockedRef = useRef(false)
  const nudgePendingRef = useRef(false)
  const pushHistoryRef = useRef(pushHistory)
  pushHistoryRef.current = pushHistory

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = true
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 's') {
        e.preventDefault()
        e.stopPropagation()
        if (!e.repeat && canSaveRef.current) saveCurrentCanvasesRef.current()
        return
      }
      if ((e.ctrlKey || e.metaKey) && k === 'c' && !inField) { e.preventDefault(); clipActionsRef.current.copy(); return }
      if ((e.ctrlKey || e.metaKey) && k === 'x' && !inField) { e.preventDefault(); clipActionsRef.current.cut(); return }
      if ((e.ctrlKey || e.metaKey) && k === 'v' && !inField) {
        e.preventDefault()
        clipActionsRef.current.paste()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inField) {
        // While typing on-canvas text, let the caret handle Delete/Backspace.
        if (textEditIdRef.current) return
        if (floatRef.current) { e.preventDefault(); clipActionsRef.current.discardFloat(); return }
        if (marqueeRef.current) { e.preventDefault(); clipActionsRef.current.clearRegion(); return }
        if (selectedIdRef.current) { e.preventDefault(); deleteSelectedRef.current(); return }
      }
      if (
        !inField &&
        !textEditIdRef.current &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) {
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        // While mouse is held with the eraser, arrows move the tip for exact erasure.
        if (tool === 'eraser' && drawing.current) {
          e.preventDefault()
          nudgeEraserRef.current(dx, dy)
          return
        }
        const hasTarget = !!(floatRef.current || marqueeRef.current || selectedIdRef.current)
        if (hasTarget) {
          e.preventDefault()
          nudgeSelectedRef.current(dx, dy)
          nudgePendingRef.current = true
          return
        }
      }
      if (e.key === 'Enter' && cropSessionRef.current) {
        e.preventDefault()
        applyStampCropRef.current()
        return
      }
      if (e.key === 'Enter' && floatRef.current) { e.preventDefault(); clipActionsRef.current.commitFloat(); return }
      if (e.key === 'Enter' && marqueeRef.current) { e.preventDefault(); clipActionsRef.current.clearSel(); return }
      if (e.key === 'Escape') {
        if (cropSessionRef.current) {
          e.preventDefault()
          cancelStampCropRef.current()
          return
        }
        if (textEditIdRef.current) {
          e.preventDefault()
          endTextEditRef.current()
          return
        }
        if (floatRef.current) { clipActionsRef.current.discardFloat(); return }
        if (marqueeRef.current) { clipActionsRef.current.clearSel(); return }
        onClose(); return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        // Capture even when focus is in the Icons search field.
        if (e.repeat) return
        e.preventDefault()
        e.stopPropagation()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (e.repeat) return
        e.preventDefault()
        e.stopPropagation()
        redo()
        return
      }
      if ((e.key === 'Enter' || e.key === 'Escape') && tool === 'polygon' && polyPts.current.length) {
        finishPolygonRef.current()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = false
      if (
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        nudgePendingRef.current
      ) {
        nudgePendingRef.current = false
        pushHistoryRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKeyUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, onClose, tool])

  useEffect(() => {
    return () => {
      if (layersDragScrollRafRef.current != null) {
        cancelAnimationFrame(layersDragScrollRafRef.current)
        layersDragScrollRafRef.current = null
      }
      layersPointerDetachRef.current?.()
      layersPointerDetachRef.current = null
    }
  }, [])

  // Map a mouse event to working-resolution coordinates.
  const toCanvas = (e: React.MouseEvent): { x: number; y: number } => {
    const el = previewRef.current!
    const rect = el.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H
    }
  }
  const clampToCanvas = (pt: Pt): Pt => ({
    x: Math.max(0, Math.min(W, pt.x)),
    y: Math.max(0, Math.min(H, pt.y))
  })
  const clientToCanvas = (e: { clientX: number; clientY: number }): Pt => {
    const el = previewRef.current!
    const rect = el.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H
    }
  }
  const dropPtOnCanvas = (e: React.DragEvent): Pt | undefined => {
    const el = previewRef.current
    if (!el) return undefined
    const rect = el.getBoundingClientRect()
    if (
      e.clientX < rect.left || e.clientX > rect.right ||
      e.clientY < rect.top || e.clientY > rect.bottom
    ) {
      return undefined
    }
    return clientToCanvas(e)
  }

  const clearPreview = () => {
    const p = previewRef.current?.getContext('2d')
    if (p) p.clearRect(0, 0, W, H)
  }

  type AlignmentPoint = 'start' | 'center' | 'end'
  type AlignmentSnap = {
    dx: number
    dy: number
    x: boolean
    y: boolean
    xAt: AlignmentPoint | null
    yAt: AlignmentPoint | null
    /** Absolute guide positions (object or canvas). Prefer over xAt/yAt when set. */
    xGuide?: number | null
    yGuide?: number | null
    xLabel?: string | null
    yLabel?: string | null
  }

  /** ~4 CSS px — weak enough to nudge, easy to override with many objects. */
  const weakSnapThreshold = (): number => {
    const screenRect = previewRef.current?.getBoundingClientRect()
    const scale = screenRect?.width ? W / screenRect.width : 1
    return 4 * scale
  }

  type SnapGuide = {
    value: number
    at: AlignmentPoint | null
    label: string
  }

  /** Canvas edges/centre plus other visible object edges/centres (and optional sizes). */
  const collectSnapGuides = (excludeIds?: Set<string>) => {
    const xGuides: SnapGuide[] = [
      { value: 0, at: 'start', label: 'Left edge' },
      { value: W / 2, at: 'center', label: 'Center' },
      { value: W, at: 'end', label: 'Right edge' }
    ]
    const yGuides: SnapGuide[] = [
      { value: 0, at: 'start', label: 'Top edge' },
      { value: H / 2, at: 'center', label: 'Center' },
      { value: H, at: 'end', label: 'Bottom edge' }
    ]
    const widths: number[] = [W / 2]
    const heights: number[] = [H / 2]
    const exclude = excludeIds ?? new Set<string>()
    for (const other of linesRef.current) {
      if (exclude.has(other.id)) continue
      if (!isVectorVisible(other)) continue
      if (other.marqueeItem || other.punchMask) continue
      if (other.parentId && exclude.has(other.parentId)) continue
      const b = boundsForLine(other)
      if (!(b.w > 0) || !(b.h > 0)) continue
      xGuides.push(
        { value: b.x, at: null, label: 'Align' },
        { value: b.x + b.w / 2, at: null, label: 'Align' },
        { value: b.x + b.w, at: null, label: 'Align' }
      )
      yGuides.push(
        { value: b.y, at: null, label: 'Align' },
        { value: b.y + b.h / 2, at: null, label: 'Align' },
        { value: b.y + b.h, at: null, label: 'Align' }
      )
      widths.push(b.w)
      heights.push(b.h)
    }
    return { xGuides, yGuides, widths, heights }
  }

  /**
   * Weak snap: item edges/centre ↔ canvas + other objects.
   * Nearest hit within a tiny threshold wins so crowded canvases stay adjustable.
   */
  const snapRectToGuides = (
    item: { x: number; y: number; w: number; h: number },
    excludeIds?: Set<string>
  ): AlignmentSnap => {
    const threshold = weakSnapThreshold()
    const { xGuides, yGuides } = collectSnapGuides(excludeIds)
    const xEdges = [item.x, item.x + item.w / 2, item.x + item.w]
    const yEdges = [item.y, item.y + item.h / 2, item.y + item.h]
    type Cand = { delta: number; at: AlignmentPoint | null; guide: number; label: string }
    const xCandidates: Cand[] = []
    const yCandidates: Cand[] = []
    for (const g of xGuides) {
      for (const edge of xEdges) {
        xCandidates.push({
          delta: g.value - edge,
          at: g.at,
          guide: g.value,
          label: g.label
        })
      }
    }
    for (const g of yGuides) {
      for (const edge of yEdges) {
        yCandidates.push({
          delta: g.value - edge,
          at: g.at,
          guide: g.value,
          label: g.label
        })
      }
    }
    const xMatch = xCandidates
      .filter((c) => Math.abs(c.delta) <= threshold)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]
    const yMatch = yCandidates
      .filter((c) => Math.abs(c.delta) <= threshold)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]
    return {
      dx: xMatch?.delta ?? 0,
      dy: yMatch?.delta ?? 0,
      x: !!xMatch,
      y: !!yMatch,
      xAt: xMatch?.at ?? null,
      yAt: yMatch?.at ?? null,
      xGuide: xMatch?.guide ?? null,
      yGuide: yMatch?.guide ?? null,
      xLabel: xMatch?.label ?? null,
      yLabel: yMatch?.label ?? null
    }
  }

  /** @deprecated name kept for call-site clarity — now includes object guides. */
  const snapRectToCanvas = (
    item: { x: number; y: number; w: number; h: number },
    excludeIds?: Set<string>
  ): AlignmentSnap => snapRectToGuides(item, excludeIds)

  const boundsForLine = (l: LineObj): { x: number; y: number; w: number; h: number } => {
    const points = flattenLine(l).map((pt) => mapObjDisplayPt(pt, l))
    const xs = points.map((pt) => pt.x)
    const ys = points.map((pt) => pt.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }

  /** Keep every group box tightly fitted to its children, deepest groups first. */
  const syncGroupBounds = (items = linesRef.current): void => {
    const depthOf = (line: LineObj): number => {
      let depth = 0
      let parentId = line.parentId
      const seen = new Set<string>()
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId)
        depth++
        parentId = items.find((item) => item.id === parentId)?.parentId
      }
      return depth
    }
    const groups = items
      .filter((line) => line.type === 'group')
      .sort((a, b) => depthOf(b) - depthOf(a))
    for (const group of groups) {
      const children = items.filter((line) => line.parentId === group.id)
      if (!children.length) continue
      const boxes = children.map(boundsForLine)
      const left = Math.min(...boxes.map((box) => box.x))
      const top = Math.min(...boxes.map((box) => box.y))
      const right = Math.max(...boxes.map((box) => box.x + box.w))
      const bottom = Math.max(...boxes.map((box) => box.y + box.h))
      group.pts = [{ x: left, y: top }, { x: right, y: bottom }]
      group.rot = 0
    }
  }

  const descendantIds = (groupId: string, items = linesRef.current): Set<string> => {
    const ids = new Set<string>()
    let changed = true
    while (changed) {
      changed = false
      for (const item of items) {
        if (item.parentId === groupId || (item.parentId && ids.has(item.parentId))) {
          if (!ids.has(item.id)) {
            ids.add(item.id)
            changed = true
          }
        }
      }
    }
    return ids
  }

  /** Object layers that receive brush/eraser directly (not base overlays). */
  const selectedPaintShape = (): LineObj | null => {
    const selected = linesRef.current.find((item) => item.id === selectedIdRef.current)
    if (!selected) return null
    const l = checkedGroupTarget(selected) ?? selected
    return (l.type === 'shape' || l.type === 'stamp' || l.type === 'group') && isVectorVisible(l) ? l : null
  }

  const selectedObjectOwnsRasterTools = (): boolean => {
    const selected = linesRef.current.find((item) => item.id === selectedIdRef.current)
    if (!selected || !isVectorVisible(selected)) return false
    const l = checkedGroupTarget(selected) ?? selected
    return l.type === 'shape' || l.type === 'stamp' || l.type === 'group' ||
      l.type === 'poly' || l.type === 'text'
  }

  const shapeLocalPaintPoint = (l: LineObj, canvasPt: Pt): Pt => {
    const local = rotatePt(canvasPt, objCenter(l), -(l.rot ?? 0))
    const a = l.pts[0], b = l.pts[1]
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    const w = Math.max(1, Math.abs(b.x - a.x)), h = Math.max(1, Math.abs(b.y - a.y))
    return { x: (local.x - x) / w, y: (local.y - y) / h }
  }

  type EraserPointSnap = { pt: Pt; xGuide: number | null; yGuide: number | null; angle: number | null }
  const snapEraserPoint = (raw: Pt): EraserPointSnap => {
    if (shiftHeldRef.current && drawing.current) {
      const dx = raw.x - startPt.current.x, dy = raw.y - startPt.current.y
      const distance = Math.hypot(dx, dy)
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
      return {
        pt: { x: startPt.current.x + Math.cos(angle) * distance, y: startPt.current.y + Math.sin(angle) * distance },
        xGuide: null,
        yGuide: null,
        angle
      }
    }

    const screenRect = previewRef.current?.getBoundingClientRect()
    const threshold = 6 * (screenRect?.width ? W / screenRect.width : 1)
    const xs = [0, W / 2, W]
    const ys = [0, H / 2, H]
    for (const l of linesRef.current) {
      if (!isVectorVisible(l)) continue
      const b = boundsForLine(l)
      xs.push(b.x, b.x + b.w / 2, b.x + b.w)
      ys.push(b.y, b.y + b.h / 2, b.y + b.h)
    }
    const nearest = (value: number, candidates: number[]): number | null => {
      const sorted = candidates
        .map((candidate) => ({ candidate, delta: Math.abs(candidate - value) }))
        .filter(({ delta }) => delta <= threshold)
        .sort((a, b) => a.delta - b.delta)
      return sorted[0]?.candidate ?? null
    }
    const xGuide = nearest(raw.x, xs)
    const yGuide = nearest(raw.y, ys)
    return {
      pt: { x: xGuide ?? raw.x, y: yGuide ?? raw.y },
      xGuide,
      yGuide,
      angle: null
    }
  }

  const drawEraserSnapGuides = (snap: EraserPointSnap) => {
    if (snap.xGuide == null && snap.yGuide == null && snap.angle == null) return
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    const rect = previewRef.current?.getBoundingClientRect()
    const scale = rect?.width ? W / rect.width : 1
    p.save()
    p.strokeStyle = '#ec4899'
    p.fillStyle = '#ec4899'
    p.lineWidth = Math.max(1, 1.25 * scale)
    p.setLineDash([5 * scale, 4 * scale])
    if (snap.xGuide != null) {
      p.beginPath(); p.moveTo(snap.xGuide, 0); p.lineTo(snap.xGuide, H); p.stroke()
    }
    if (snap.yGuide != null) {
      p.beginPath(); p.moveTo(0, snap.yGuide); p.lineTo(W, snap.yGuide); p.stroke()
    }
    if (snap.angle != null) {
      p.beginPath()
      p.moveTo(startPt.current.x, startPt.current.y)
      p.lineTo(snap.pt.x, snap.pt.y)
      p.stroke()
      p.setLineDash([])
      p.font = `600 ${11 * scale}px Inter, sans-serif`
      p.fillText(
        `${Math.round((snap.angle * 180) / Math.PI)}°`,
        snap.pt.x + 8 * scale,
        snap.pt.y - 8 * scale
      )
    }
    p.restore()
  }

  /** Magenta H/V guides while a 2-point straight line snaps to an axis. */
  const drawStraightLineSnapGuides = (origin: Pt, end: Pt, axis: 'h' | 'v') => {
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    const rect = previewRef.current?.getBoundingClientRect()
    const scale = rect?.width ? W / rect.width : 1
    const mx = (origin.x + end.x) / 2
    const my = (origin.y + end.y) / 2
    p.save()
    p.strokeStyle = '#ec4899'
    p.fillStyle = '#ec4899'
    p.lineWidth = Math.max(1, 1.25 * scale)
    p.setLineDash([5 * scale, 4 * scale])
    if (axis === 'h') {
      p.beginPath()
      p.moveTo(0, origin.y)
      p.lineTo(W, origin.y)
      p.stroke()
    } else {
      p.beginPath()
      p.moveTo(origin.x, 0)
      p.lineTo(origin.x, H)
      p.stroke()
    }
    p.setLineDash([])
    p.beginPath()
    p.moveTo(origin.x, origin.y)
    p.lineTo(end.x, end.y)
    p.lineWidth = Math.max(1.5, 2 * scale)
    p.stroke()
    p.font = `600 ${11 * scale}px Inter, sans-serif`
    p.textAlign = 'left'
    p.textBaseline = 'bottom'
    p.fillText(axis === 'h' ? 'Horizontal' : 'Vertical', mx + 8 * scale, my - 6 * scale)
    p.restore()
  }

  /** Purple guides while dragging a reshape corner onto a snap target. */
  const drawReshapeSnapGuides = () => {
    const guides = reshapeSnapGuidesRef.current
    if (!guides || (!guides.vertical.length && !guides.horizontal.length)) return
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    const rect = previewRef.current?.getBoundingClientRect()
    const scale = rect?.width ? W / rect.width : 1
    p.save()
    p.strokeStyle = '#a855f7'
    p.fillStyle = '#a855f7'
    p.lineWidth = Math.max(1, 1.25 * scale)
    p.setLineDash([5 * scale, 4 * scale])
    for (const gx of guides.vertical) {
      p.beginPath()
      p.moveTo(gx, 0)
      p.lineTo(gx, H)
      p.stroke()
    }
    for (const gy of guides.horizontal) {
      p.beginPath()
      p.moveTo(0, gy)
      p.lineTo(W, gy)
      p.stroke()
    }
    p.setLineDash([])
    if (guides.label) {
      p.font = `600 ${11 * scale}px Inter, sans-serif`
      p.textAlign = 'left'
      p.textBaseline = 'top'
      const lx = guides.vertical[0] ?? 8 * scale
      const ly = guides.horizontal[0] ?? 8 * scale
      p.fillText(guides.label, lx + 6 * scale, ly + 6 * scale)
    }
    p.restore()
  }

  /** Magenta smart guides shown while a dragged item is aligned. */
  const drawAlignmentGuides = (snap: AlignmentSnap) => {
    if (!snap.x && !snap.y) return
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    const rect = previewRef.current?.getBoundingClientRect()
    const scale = rect?.width ? W / rect.width : 1
    const cx = W / 2
    const cy = H / 2
    p.save()
    p.strokeStyle = '#ec4899'
    p.fillStyle = '#ec4899'
    p.lineWidth = Math.max(1, 1.25 * scale)
    p.setLineDash([5 * scale, 4 * scale])
    if (snap.x) {
      const gx = snap.xGuide ?? (
        snap.xAt === 'start' ? 1 * scale : snap.xAt === 'end' ? W - 1 * scale : cx
      )
      p.beginPath()
      p.moveTo(gx, 0)
      p.lineTo(gx, H)
      p.stroke()
    }
    if (snap.y) {
      const gy = snap.yGuide ?? (
        snap.yAt === 'start' ? 1 * scale : snap.yAt === 'end' ? H - 1 * scale : cy
      )
      p.beginPath()
      p.moveTo(0, gy)
      p.lineTo(W, gy)
      p.stroke()
    }
    p.setLineDash([])
    p.font = `600 ${11 * scale}px Inter, sans-serif`
    const xLabel = snap.xLabel ?? (
      snap.xAt === 'center' ? 'Center'
        : snap.xAt === 'start' ? 'Left edge'
          : snap.xAt === 'end' ? 'Right edge'
            : null
    )
    const yLabel = snap.yLabel ?? (
      snap.yAt === 'center' ? 'Center'
        : snap.yAt === 'start' ? 'Top edge'
          : snap.yAt === 'end' ? 'Bottom edge'
            : null
    )
    if (snap.x && xLabel) {
      const gx = snap.xGuide ?? (
        snap.xAt === 'start' ? 1 * scale : snap.xAt === 'end' ? W - 1 * scale : cx
      )
      p.textAlign = gx < W / 2 ? 'left' : 'right'
      p.textBaseline = 'top'
      p.fillText(xLabel, gx < W / 2 ? gx + 7 * scale : gx - 7 * scale, 7 * scale)
    }
    if (snap.y && yLabel && yLabel !== xLabel) {
      const gy = snap.yGuide ?? (
        snap.yAt === 'start' ? 1 * scale : snap.yAt === 'end' ? H - 1 * scale : cy
      )
      p.textAlign = 'left'
      p.textBaseline = gy < H / 2 ? 'top' : 'bottom'
      p.fillText(yLabel, 7 * scale, gy < H / 2 ? gy + 7 * scale : gy - 7 * scale)
    } else if (snap.y && yLabel && !snap.x) {
      const gy = snap.yGuide ?? (
        snap.yAt === 'start' ? 1 * scale : snap.yAt === 'end' ? H - 1 * scale : cy
      )
      p.textAlign = 'left'
      p.textBaseline = gy < H / 2 ? 'top' : 'bottom'
      p.fillText(yLabel, 7 * scale, gy < H / 2 ? gy + 7 * scale : gy - 7 * scale)
    }
    if ((snap.xAt === 'center' || snap.yAt === 'center') && (snap.xGuide == null || snap.xGuide === cx) && (snap.yGuide == null || snap.yGuide === cy)) {
      p.beginPath()
      p.arc(cx, cy, 3.5 * scale, 0, Math.PI * 2)
      p.fill()
    }
    p.restore()
  }

  // Outline showing the eraser tip footprint at the cursor.
  const drawEraserCursor = (pt: { x: number; y: number }) => {
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    clearPreview()
    p.save()
    p.lineWidth = 3
    p.strokeStyle = 'rgba(0,0,0,0.55)'
    strokeBrushTipOutline(p, eraserTip, pt.x, pt.y, size)
    p.stroke()
    p.lineWidth = 1.5
    p.strokeStyle = 'rgba(255,255,255,0.98)'
    strokeBrushTipOutline(p, eraserTip, pt.x, pt.y, size)
    p.stroke()
    p.restore()
  }

  // ── Vector line helpers ────────────────────────────────────────────────────
  /** Sole viewport painter. Only checked base rasters + visible object layers. */
  const redrawLines = useCallback(() => {
    const displayEl = displayCompositeRef.current
    if (!displayEl) return
    if (!liveDirtyLayers()) {
      slotCacheReadyRef.current = { content: false, container: false }
    }

    const skipId = textEditIdRef.current
    const showContent = !!editContentRef.current
    const showContainer = !!(editContainerRef.current && containerUsableRef.current)

    const frame = reuseCanvas(paintFrameRef, W, H)
    const frameCtx = frame.getContext('2d')!

    for (const item of linesRef.current) {
      if (item.type === 'stamp' && item.imageDataUrl && (isVectorVisible(item) || item.punchMask || item.punchThrough)) {
        const a = item.pts[0], b = item.pts[1]
        const width = a && b ? Math.max(1, Math.abs(b.x - a.x)) : 1
        const height = a && b ? Math.max(1, Math.abs(b.y - a.y)) : 1
        const url = stampRenderDataUrl(item, width, height)
        const cached = url ? stampImgCache.get(url) : undefined
        if (url && !(cached && cached.complete && cached.naturalWidth > 0)) {
          ensureStampImage(url, () => redrawLinesRef.current())
        }
      }
    }

    for (const id of [...layerOrderRef.current].reverse()) {
      const baseVisible = id === 'content' ? showContent : showContainer
      if (baseVisible) {
        paintStackSlot(frameCtx, id, { skipId })
      } else {
        paintStackSlot(frameCtx, id, { base: false, overlay: false, skipId })
      }
    }

    if (displayNeedsResetRef.current) {
      displayEl.width = W
      displayEl.height = H
      displayNeedsResetRef.current = false
    } else {
      if (displayEl.width !== W) displayEl.width = W
      if (displayEl.height !== H) displayEl.height = H
    }
    const display = displayEl.getContext('2d')
    if (display) {
      display.clearRect(0, 0, W, H)
      display.drawImage(frame, 0, 0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, editContent, editContainer, containerUsable, layerOrder])
  const redrawLinesRef = useRef(redrawLines)
  redrawLinesRef.current = redrawLines

  // Screen position of the rotate pin (a small handle above the object's top edge).
  const rotatePinAt = (l: LineObj): Pt => rotatePinTip(l)

  const drawRotatePin = (p: CanvasRenderingContext2D, l: LineObj) => {
    const anchor = rotatePinAnchor(l)
    const pin = rotatePinTip(l)
    p.save()
    p.strokeStyle = '#10b981'
    p.lineWidth = 2
    p.setLineDash([])
    p.beginPath(); p.moveTo(anchor.x, anchor.y); p.lineTo(pin.x, pin.y); p.stroke()
    p.fillStyle = '#ffffff'
    p.beginPath(); p.arc(pin.x, pin.y, 7, 0, Math.PI * 2); p.fill(); p.stroke()
    p.restore()
  }

  const startRotateDrag = (obj: LineObj, pt: Pt) => {
    const center = rotationCenter(obj)
    lineDragRef.current = {
      kind: 'rotate',
      id: obj.id,
      center,
      startAng: Math.atan2(pt.y - center.y, pt.x - center.x),
      startRot: obj.rot ?? 0,
      ...(obj.type === 'group' || obj.reshapeQuad?.length === 4
        ? { snapshot: cloneLines(linesRef.current) }
        : {})
    }
  }

  /** Live angle readout while rotating. Common 15° angles use a magenta snap guide. */
  const drawRotationGuide = (l: LineObj, snapped: boolean, rotationOverride?: number) => {
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    const rect = previewRef.current?.getBoundingClientRect()
    const scale = rect?.width ? W / rect.width : 1
    const c = rotationCenter(l)
    const rot = rotationOverride ?? l.rot ?? 0
    const radius = l.reshapeQuad?.length === 4
      ? Math.max(34 * scale, dist(c, rotatePinAnchor(l)) + 12 * scale)
      : Math.max(34 * scale, dist(c, objTopCenter(l)) + 12 * scale)
    const start = -Math.PI / 2
    const end = start + rot
    const reference = { x: c.x, y: c.y - radius }
    const direction = rotatePt(reference, c, rot)
    const color = snapped ? '#ec4899' : '#22d3ee'
    const degrees = ((rot * 180 / Math.PI) % 360 + 360) % 360
    const rounded = Math.round(degrees * 10) / 10
    const label = `${rounded}°`

    p.save()
    p.strokeStyle = color
    p.fillStyle = color
    p.lineWidth = Math.max(1, 1.5 * scale)
    p.setLineDash([5 * scale, 4 * scale])
    p.beginPath()
    p.moveTo(c.x, c.y)
    p.lineTo(reference.x, reference.y)
    p.moveTo(c.x, c.y)
    p.lineTo(direction.x, direction.y)
    p.stroke()
    p.setLineDash([])
    if (Math.abs(rot) > 0.002) {
      p.beginPath()
      p.arc(c.x, c.y, radius * 0.62, start, end, rot < 0)
      p.stroke()
    }
    p.beginPath()
    p.arc(c.x, c.y, 3.5 * scale, 0, Math.PI * 2)
    p.fill()

    p.font = `600 ${12 * scale}px Inter, sans-serif`
    const tw = p.measureText(label).width
    const padX = 6 * scale
    const padY = 4 * scale
    const lx = direction.x + 10 * scale
    const ly = direction.y - 10 * scale
    p.fillStyle = 'rgba(15, 23, 42, 0.92)'
    roundedRect(p, lx - padX, ly - 12 * scale - padY, tw + padX * 2, 16 * scale + padY * 2, 5 * scale)
    p.fill()
    p.fillStyle = '#ffffff'
    p.textAlign = 'left'
    p.textBaseline = 'alphabetic'
    p.fillText(label, lx, ly)
    p.restore()
  }

  const alphaBounds = (canvas: HTMLCanvasElement | null): { x: number; y: number; w: number; h: number } | null =>
    alphaBoundsFromCanvas(canvas)

  const drawReshapeHandles = (p: CanvasRenderingContext2D, l: LineObj) => {
    const quad = l.reshapeQuad
    if (!quad || quad.length !== 4) return false
    p.save()
    p.strokeStyle = '#a855f7'
    p.lineWidth = 2
    p.setLineDash([6, 4])
    p.beginPath()
    p.moveTo(quad[0].x, quad[0].y)
    for (let i = 1; i < quad.length; i++) p.lineTo(quad[i].x, quad[i].y)
    p.closePath()
    p.stroke()
    p.setLineDash([])
    p.fillStyle = '#ffffff'
    p.strokeStyle = '#a855f7'
    p.lineWidth = 2.5
    for (const corner of quad) {
      p.beginPath()
      p.arc(corner.x, corner.y, 7, 0, Math.PI * 2)
      p.fill()
      p.stroke()
    }
    p.fillStyle = '#ffffff'
    p.strokeStyle = '#c084fc'
    for (let i = 0; i < 4; i++) {
      const a = quad[i]
      const b = quad[(i + 1) % 4]
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      p.beginPath()
      p.rect(mx - 5, my - 5, 10, 10)
      p.fill()
      p.stroke()
    }
    p.restore()
    return true
  }

  const ensureReshapeInit = (id: string): LineObj | null => {
    const l = linesRef.current.find((x) => x.id === id)
    if (!l || !lineReshapeable(l)) return null
    if (l.reshapeQuad?.length === 4) {
      if (!l.reshapeBaseQuad?.length) {
        const patched = { ...l, reshapeBaseQuad: l.reshapeQuad.map((p) => ({ ...p })) }
        linesRef.current = linesRef.current.map((x) => (x.id === id ? patched : x))
        commitLines([...linesRef.current])
        return patched
      }
      return l
    }
    const next = initReshapeOnLine(l, W, H)
    if (!next.reshapeQuad?.length || !next.reshapeSrc) {
      scheduleReshapeInitRetry(id)
      return null
    }
    linesRef.current = linesRef.current.map((x) => (x.id === id ? next : x))
    commitLines([...linesRef.current])
    reshapeInitRetryRef.current = 0
    reshapeInitRetryIdRef.current = null
    return next
  }

  const scheduleReshapeInitRetry = (id: string) => {
    if (reshapeInitRetryIdRef.current !== id) {
      reshapeInitRetryIdRef.current = id
      reshapeInitRetryRef.current = 0
    }
    if (reshapeInitRetryRef.current >= 20) return
    reshapeInitRetryRef.current += 1
    window.requestAnimationFrame(() => {
      if (toolRef.current !== 'reshape') return
      const target = linesRef.current.find((x) => x.id === id)
      if (!target || target.reshapeQuad?.length === 4) return
      const inited = ensureReshapeInit(id)
      if (inited) {
        redrawLines()
        drawHandles()
      }
    })
  }

  const activateReshapeForTarget = (target: LineObj) => {
    selectedIdRef.current = target.id
    setSelectedId(target.id)
    setSelectedLayerIds(new Set([target.id]))
    setTool('reshape')
    const inited = ensureReshapeInit(target.id)
    if (!inited) scheduleReshapeInitRetry(target.id)
    redrawLines()
    drawHandles()
  }

  const reshapeTargetLine = (): LineObj | null => {
    for (const layerId of selectedLayerIdsRef.current) {
      const layer = linesRef.current.find((x) => x.id === layerId)
      if (layer && lineReshapeable(layer) && isVectorVisible(layer)) return layer
    }
    const sel = linesRef.current.find((x) => x.id === selectedIdRef.current)
    if (sel && lineReshapeable(sel) && isVectorVisible(sel)) return sel
    return null
  }

  const drawContentHandles = (p: CanvasRenderingContext2D): boolean => {
    if (selectedBaseLayerRef.current !== 'content' || !editContentRef.current) return false
    const bounds = alphaBounds(contentCanvasRef.current)
    if (!bounds) return false
    const corners = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y + bounds.h }
    ]
    p.save()
    p.strokeStyle = '#3b82f6'
    p.lineWidth = 2
    p.setLineDash([6, 4])
    p.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h)
    p.setLineDash([])
    p.fillStyle = '#ffffff'
    for (const corner of corners) {
      p.beginPath()
      p.arc(corner.x, corner.y, 7, 0, Math.PI * 2)
      p.fill()
      p.stroke()
    }
    const anchor = { x: bounds.x + bounds.w / 2, y: bounds.y }
    const pin = { x: anchor.x, y: anchor.y - ROTATE_PIN_LEN }
    p.strokeStyle = '#10b981'
    p.beginPath()
    p.moveTo(anchor.x, anchor.y)
    p.lineTo(pin.x, pin.y)
    p.stroke()
    p.beginPath()
    p.arc(pin.x, pin.y, 7, 0, Math.PI * 2)
    p.fill()
    p.stroke()
    p.restore()
    return true
  }

  const drawHandles = useCallback(() => {
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    p.clearRect(0, 0, W, H)
    const activeTool = toolRef.current
    let l =
      activeTool === 'reshape'
        ? reshapeTargetLine()
        : linesRef.current.find((x) => x.id === selectedIdRef.current) ?? null
    if (!l && drawContentHandles(p)) return
    // Never leave handles (or any preview pixels) for a hidden object layer.
    if (!l || !isVectorVisible(l)) return
    const cropSession = cropSessionRef.current
    if (cropSession && l.id === cropSession.id && l.type === 'stamp') {
      drawCropOverlay(p, l, cropSession)
      return
    }
    if (activeTool === 'reshape' && lineReshapeable(l)) {
      if (!l.reshapeQuad?.length) l = ensureReshapeInit(l.id) ?? l
    }
    if (activeTool === 'reshape' || l.reshapeQuad?.length === 4) {
      if (drawReshapeHandles(p, l)) {
        drawRotatePin(p, l)
        return
      }
      if (activeTool === 'reshape') return
    }
    if (l.type === 'text') {
      const b = textInkBBox(l)
      const corners = [
        { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }
      ].map((pt) => mapObjDisplayPt(pt, l))
      p.save()
      p.strokeStyle = '#3b82f6'
      p.lineWidth = 2
      p.setLineDash([6, 4])
      p.beginPath()
      p.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < corners.length; i++) p.lineTo(corners[i].x, corners[i].y)
      p.closePath(); p.stroke()
      p.restore()
      p.save()
      p.fillStyle = '#ffffff'
      p.strokeStyle = '#3b82f6'
      p.lineWidth = 2.5
      p.beginPath(); p.arc(corners[0].x, corners[0].y, 7, 0, Math.PI * 2); p.fill(); p.stroke()
      p.restore()
      drawRotatePin(p, l)
      return
    }
    for (let i = 0; i < l.pts.length; i++) {
      const isEnd = i === 0 || i === l.pts.length - 1
      const pt = mapObjDisplayPt(l.pts[i], l)
      p.save()
      p.fillStyle = '#ffffff'
      p.strokeStyle = isEnd ? '#3b82f6' : '#f59e0b'
      p.lineWidth = 2.5
      if (isEnd) {
        p.beginPath(); p.arc(pt.x, pt.y, 7, 0, Math.PI * 2); p.fill(); p.stroke()
      } else {
        p.beginPath(); p.rect(pt.x - 6, pt.y - 6, 12, 12); p.fill(); p.stroke()
      }
      p.restore()
    }
    if (
      l.pts.length === 2 &&
      (l.type === 'shape' || l.type === 'stamp' || l.type === 'group') &&
      !l.reshapeQuad?.length
    ) {
      const corners = displayRectCorners(l)
      p.save()
      p.fillStyle = '#ffffff'
      p.strokeStyle = '#22d3ee'
      p.lineWidth = 2
      for (let i = 0; i < 4; i++) {
        const a = corners[i]
        const b = corners[(i + 1) % 4]
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        p.beginPath()
        p.rect(mx - 5, my - 5, 10, 10)
        p.fill()
        p.stroke()
      }
      p.restore()
    }
    drawRotatePin(p, l)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, tool])

  const paintViewRafRef = useRef(0)
  const paintViewHandlesRef = useRef(false)
  const paintViewAfterRef = useRef<(() => void) | null>(null)
  const cancelPaintView = () => {
    if (paintViewRafRef.current) {
      cancelAnimationFrame(paintViewRafRef.current)
      paintViewRafRef.current = 0
    }
    paintViewHandlesRef.current = false
    paintViewAfterRef.current = null
  }
  const schedulePaintView = (handles = false, after?: () => void) => {
    if (handles) paintViewHandlesRef.current = true
    if (after) paintViewAfterRef.current = after
    if (paintViewRafRef.current) return
    paintViewRafRef.current = requestAnimationFrame(() => {
      paintViewRafRef.current = 0
      const showHandles = paintViewHandlesRef.current
      const afterFn = paintViewAfterRef.current
      paintViewHandlesRef.current = false
      paintViewAfterRef.current = null
      redrawLines()
      if (floatRef.current || marqueeRef.current) drawSelOverlay()
      else if (showHandles) drawHandles()
      afterFn?.()
    })
  }

  const commitLines = useCallback((arr: LineObj[]) => {
    const normalized = normalizeLinkedTextVectors(
      arr as unknown as PaintVector[],
      selectedIdRef.current
    ) as unknown as LineObj[]
    linesRef.current = normalized
    slotCacheReadyRef.current = { content: false, container: false }
    setLines(normalized)
  }, [])

  // Load the active text font and redraw once it's ready (metrics change).
  useEffect(() => {
    loadFont(fontFamily).then(() => { redrawLines(); drawHandles() })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily])

  useEffect(() => {
    if (tool !== 'reshape') return
    const target = reshapeTargetLine()
    if (!target) return
    if (target.reshapeQuad?.length === 4) {
      drawHandles()
      return
    }
    const inited = ensureReshapeInit(target.id)
    if (inited) {
      redrawLines()
      drawHandles()
    } else {
      scheduleReshapeInitRetry(target.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedId, selectedLayerIds])

  const selectLine = (l: LineObj, preservePanelSelection = false) => {
    const editTarget =
      toolRef.current === 'reshape' ? l : (checkedGroupTarget(l) ?? l)
    selectedIdRef.current = editTarget.id
    setSelectedId(editTarget.id)
    if (!preservePanelSelection) setSelectedLayerIds(new Set([l.id]))
    if (activePartialVectorMask() || linesHaveMarqueeCutRects()) invalidatePaintCaches()
    // Keep lineType a valid Line kind (poly/shape/stamp/text are chosen via their tools).
    if (l.type !== 'poly' && l.type !== 'shape' && l.type !== 'stamp' && l.type !== 'text' && l.type !== 'group') setLineType(l.type)
    if (l.type === 'polyline' || l.type === 'free') setLinePointCount(l.pts.length)
    setStartCap(l.startCap)
    setEndCap(l.endCap)
    {
      const tw = lineBorderWidth(l) || l.thickness
      setStartCapSize(l.startCapSize ?? defaultCapSize(tw))
      setEndCapSize(l.endCapSize ?? defaultCapSize(tw))
    }
    setLineDash(l.dash)
    setSize(lineBorderWidth(l) || l.thickness)
    setColor(l.color)
    setHexText(isGradientColor(l.color) ? firstSolidColor(l.color) : l.color)
    setBorderColor(lineBorderColor(l))
    setBorderRadius(lineBorderRadius(l))
    setKeepStrokeOnResize(l.keepStrokeOnResize ?? true)
    if (l.type === 'poly' || l.type === 'shape') setShapeFill(!!l.fill)
    if (l.type === 'shape' && l.shape) setShapeKind(l.shape)
    if (l.type === 'drawn') setDrawnCurve(!!l.drawnCurve)
    if (l.type === 'text' || l.contentBound) {
      if (l.type === 'text') {
        setTextValue(l.text ?? '')
        setFontFamily(l.fontFamily ?? 'Inter')
        setFontSize(l.fontSize ?? 48)
        setFontWeightV(l.weight ?? 400)
        setUnderline(!!l.underline)
        setItalic(!!l.italic)
        setTxtLineHeight(l.lineHeight ?? 1.28)
        setTxtLetterSpacing(l.letterSpacing ?? 0)
      }
      setTxtShadow(!!l.shadow)
      setTxtShadowColor(l.shadowColor ?? '#000000b3')
      setTxtShadowBlur(l.shadowBlur ?? 8)
      setTxtShadowOX(l.shadowOffsetX ?? 0)
      setTxtShadowOY(l.shadowOffsetY ?? 3)
      setTxtShadowSpread(l.shadowSpread ?? 0)
    }
  }

  const updateSelectedLive = (patch: Partial<LineObj> | ((l: LineObj) => Partial<LineObj>)) => {
    const id = selectedIdRef.current
    if (!id) return
    const selected = linesRef.current.find((l) => l.id === id)
    const targetId = selected ? (checkedGroupTarget(selected)?.id ?? id) : id
    const multiIds =
      selectedLayerIds.size > 1
        ? new Set(
            [...selectedLayerIds].filter((layerId) =>
              linesRef.current.some((l) => l.id === layerId && l.type !== 'group')
            )
          )
        : null
    const applyIds = multiIds?.size ? multiIds : new Set([targetId])
    const next = linesRef.current.map((l) =>
      applyIds.has(l.id)
        ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) }
        : l
    )
    commitLines(next)
    redrawLines()
    drawHandles()
  }
  const updateSelected = (patch: Partial<LineObj> | ((l: LineObj) => Partial<LineObj>)) => {
    if (!selectedIdRef.current) return
    updateSelectedLive(patch)
    pushHistory()
  }

  const deleteSelected = () => {
    const id = selectedIdRef.current
    if (!id) return
    if (cropSessionRef.current) {
      const cropObj = linesRef.current.find((item) => item.id === cropSessionRef.current?.id)
      if (cropObj) cropObj.transformOrigin = undefined
      cropSessionRef.current = null
      setCropping(false)
      setCropHoverCursor(null)
    }
    const selected = linesRef.current.find((l) => l.id === id)
    // Linked letters stay — they are the live Inner text. contentBound proxies
    // may be deleted (a fresh proxy is re-seeded next time Paint opens).
    if (selected?.linkedOutsideText) return
    const deleteIds = new Set([
      id,
      ...(selected?.type === 'group'
        ? linesRef.current.filter((l) => l.parentId === id).map((l) => l.id)
        : [])
    ])
    if (textEditIdRef.current === id) {
      textEditIdRef.current = null
      setTextEditId(null)
    }
    const remaining = linesRef.current.filter((l) => !deleteIds.has(l.id))
    syncGroupBounds(remaining)
    commitLines(remaining)
    selectedIdRef.current = null
    setSelectedId(null)
    setSelectedLayerIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    redrawLines()
    clearPreview()
    pushHistory()
  }
  deleteSelectedRef.current = deleteSelected

  const endTextEdit = () => {
    const id = textEditIdRef.current
    if (!id) return
    const raw = textAreaRef.current?.value ?? textValue
    const next = raw.replace(/\s+$/g, '')
    textEditIdRef.current = null
    setTextEditId(null)
    const l = linesRef.current.find((x) => x.id === id)
    if (!l || l.type !== 'text') {
      redrawLines(); drawHandles()
      return
    }
    if (!next.trim()) {
      linesRef.current = linesRef.current.filter((x) => x.id !== id)
      if (selectedIdRef.current === id) {
        selectedIdRef.current = null
        setSelectedId(null)
      }
      commitLines(linesRef.current)
      setTextValue('')
    } else {
      l.text = next
      setTextValue(next)
      refreshTextHoleMaskForNewGlyphs(l, W, H)
      commitLines([...linesRef.current])
      pushHistory()
      // Done typing — switch to pointer so the next click won't place another text.
      setTool('pointer')
    }
    redrawLines(); drawHandles()
  }

  const startTextEdit = (id: string) => {
    let l = linesRef.current.find((x) => x.id === id)
    // Sectional letter Fill bakes a stamp — convert back so the string is editable
    // (multi-colour sections become the vector's single colour).
    if (l && l.type === 'stamp' && (l.linkedOutsideText || !!(l.text?.trim()))) {
      const converted = letterBakeStampToEditableText(l, W, H)
      if (converted.type === 'text') {
        const next = linesRef.current.map((item) => (item.id === id ? converted : item))
        commitLines(next)
        l = converted
        pushHistory()
      }
    }
    if (!l || l.type !== 'text') return
    textEditIdRef.current = id
    setTextEditId(id)
    setTextValue(l.text ?? '')
    selectLine(l)
    redrawLines(); drawHandles()
    requestAnimationFrame(() => {
      const el = textAreaRef.current
      if (!el) return
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    })
  }

  endTextEditRef.current = endTextEdit
  startTextEditRef.current = startTextEdit

  // Track canvas stage layout size so the on-canvas text editor can be positioned.
  // Use offsetWidth/Height (ignore CSS zoom transform from PreviewStage).
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const sync = () => {
      setStageSize({ w: el.offsetWidth || 1, h: el.offsetHeight || 1 })
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Handle hit-test in screen space (handles are drawn rotated around the centre).
  const handleIndexAt = (l: LineObj, pt: Pt): number => {
    const c = objCenter(l)
    const rot = l.rot ?? 0
    for (let i = 0; i < l.pts.length; i++) if (dist(rotatePt(l.pts[i], c, rot), pt) <= 12) return i
    return -1
  }

  const setLineEndAndControls = (l: LineObj, end: Pt) => {
    const a = l.pts[0]
    if (l.type === 'straight') l.pts = [a, end]
    else if (l.type === 'curved') l.pts = [a, mid(a, end), end]
    else if (l.type === 'polyline' || l.type === 'free') l.pts = linePts(a, end, l.pts.length)
  }

  const paintContentFromSnapshot = (
    source: HTMLCanvasElement,
    sourceBounds: { x: number; y: number; w: number; h: number },
    targetBounds: { x: number; y: number; w: number; h: number },
    dest?: HTMLCanvasElement
  ) => {
    const canvas = dest ?? ensureOffscreenCanvas(contentCanvasRef)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      source,
      sourceBounds.x, sourceBounds.y, sourceBounds.w, sourceBounds.h,
      targetBounds.x, targetBounds.y, targetBounds.w, targetBounds.h
    )
  }

  const mapPunchStampsToBounds = (
    stamps: { id: string; pts: Pt[]; rot?: number }[] | undefined,
    sourceBounds: { x: number; y: number; w: number; h: number },
    targetBounds: { x: number; y: number; w: number; h: number }
  ) => {
    if (!stamps?.length) return
    const sx = targetBounds.w / Math.max(1, sourceBounds.w)
    const sy = targetBounds.h / Math.max(1, sourceBounds.h)
    for (const snap of stamps) {
      const l = linesRef.current.find((item) => item.id === snap.id)
      if (!l) continue
      l.pts = snap.pts.map((p) => ({
        x: targetBounds.x + (p.x - sourceBounds.x) * sx,
        y: targetBounds.y + (p.y - sourceBounds.y) * sy
      }))
    }
  }

  const snapshotContentPunchStamps = () =>
    linesRef.current
      .filter((l) => l.punchMask && vectorLayerOf(l) === 'content')
      .map((l) => ({ id: l.id, pts: l.pts.map((p) => ({ ...p })), rot: l.rot }))

  const beginContentTransform = (pt: Pt): boolean => {
    if (selectedBaseLayerRef.current !== 'content' || !editContentRef.current) return false
    const canvas = contentCanvasRef.current
    const bounds = alphaBounds(canvas)
    if (!canvas || !bounds) return false
    const corners: { corner: Corner; point: Pt; fixed: Pt }[] = [
      { corner: 'nw', point: { x: bounds.x, y: bounds.y }, fixed: { x: bounds.x + bounds.w, y: bounds.y + bounds.h } },
      { corner: 'ne', point: { x: bounds.x + bounds.w, y: bounds.y }, fixed: { x: bounds.x, y: bounds.y + bounds.h } },
      { corner: 'se', point: { x: bounds.x + bounds.w, y: bounds.y + bounds.h }, fixed: { x: bounds.x, y: bounds.y } },
      { corner: 'sw', point: { x: bounds.x, y: bounds.y + bounds.h }, fixed: { x: bounds.x + bounds.w, y: bounds.y } }
    ]
    const source = cloneCanvas(canvas)
    const baseSource = cloneCanvas(baseCanvas('content'))
    const punchStamps = snapshotContentPunchStamps()
    if (contentRotatePinHit(bounds, pt)) {
      const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
      baseTransformRef.current = {
        kind: 'rotate',
        source,
        baseSource,
        punchStamps,
        bounds,
        center,
        startAng: Math.atan2(pt.y - center.y, pt.x - center.x)
      }
      return true
    }
    const handle = corners.find((item) => dist(item.point, pt) <= 12)
    if (handle) {
      baseTransformRef.current = {
        kind: 'resize',
        source,
        baseSource,
        punchStamps,
        bounds,
        fixed: handle.fixed,
        corner: handle.corner
      }
      return true
    }
    if (
      pt.x >= bounds.x && pt.x <= bounds.x + bounds.w &&
      pt.y >= bounds.y && pt.y <= bounds.y + bounds.h
    ) {
      baseTransformRef.current = {
        kind: 'move',
        source,
        baseSource,
        punchStamps,
        bounds,
        grab: pt
      }
      return true
    }
    return false
  }

  const lineDown = (pt: Pt) => {
    // Finish on-canvas text editing when interacting elsewhere.
    if (textEditIdRef.current) {
      const editing = linesRef.current.find((l) => l.id === textEditIdRef.current)
      if (editing?.type === 'text') {
        const q = unmapObjDisplayPt(pt, editing)
        const onText = pointInPoly(flattenLine(editing), q)
        const onHandle = handleIndexAt(editing, pt) >= 0 || rotatePinHit(editing, pt)
        if (onText && !onHandle) return // keep caret in the textarea
        endTextEditRef.current()
        // Corner / pin: fall through so rotate/move can start on this click.
        // Click outside: stop here — do not place a new text on the same click.
        if (!onHandle) return
      } else {
        endTextEditRef.current()
        return
      }
    }
    if (tool === 'pointer') {
      const cropSession = cropSessionRef.current
      if (cropSession) {
        const cropObj = linesRef.current.find((item) => item.id === cropSession.id)
        if (cropObj && cropObj.type === 'stamp' && isVectorVisible(cropObj)) {
          const cropHi = cropHandleAt(cropObj, cropSession, pt)
          if (cropHi >= 0) {
            lineDragRef.current = {
              kind: 'cropHandle',
              id: cropSession.id,
              idx: cropHi,
              startRect: { x: cropSession.x, y: cropSession.y, w: cropSession.w, h: cropSession.h }
            }
            return
          }
          const local = unmapObjDisplayPt(pt, cropObj)
          if (
            pointInLocalRect(cropSession.x, cropSession.y, cropSession.w, cropSession.h, local) ||
            pointInLocalRect(cropSession.imgX, cropSession.imgY, cropSession.imgW, cropSession.imgH, local)
          ) {
            lineDragRef.current = {
              kind: 'cropPan',
              id: cropSession.id,
              grab: local,
              startRect: {
                x: cropSession.imgX,
                y: cropSession.imgY,
                w: cropSession.imgW,
                h: cropSession.imgH
              }
            }
            return
          }
        }
        applyStampCropRef.current()
        // If the bitmap is still decoding, stay in crop mode on this click.
        if (cropSessionRef.current) return
      }
      if (beginContentTransform(pt)) return
      // 1. Dragging the rotate pin or a handle of the selected object.
      const sel = linesRef.current.find((l) => l.id === selectedIdRef.current)
      if (sel && isVectorVisible(sel)) {
        if (rotatePinHit(sel, pt)) {
          startRotateDrag(sel, pt)
          return
        }
        if (sel.reshapeQuad?.length === 4) {
          const ci = reshapeCornerAt(sel, pt)
          if (ci >= 0) {
            lineDragRef.current = {
              kind: 'reshapeCorner',
              id: sel.id,
              idx: ci,
              snapshot: cloneLines(linesRef.current)
            }
            return
          }
          const ei = reshapeEdgeAt(sel, pt)
          if (ei >= 0) {
            lineDragRef.current = {
              kind: 'reshapeEdge',
              id: sel.id,
              idx: ei,
              grab: pt,
              snapshot: cloneLines(linesRef.current)
            }
            return
          }
        } else {
          const hi = handleIndexAt(sel, pt)
          if (hi >= 0) {
            resizeSnapLockRef.current = { width: false, height: false }
            const snapshotResize =
              sel.pts.length === 2 &&
              (sel.type === 'shape' || sel.type === 'stamp' || sel.type === 'group')
            pauseStampStrokeRelock(sel)
            for (const child of linesRef.current) {
              if (child.parentId === sel.id) pauseStampStrokeRelock(child)
            }
            lineDragRef.current = {
              kind: 'handle',
              id: sel.id,
              idx: hi,
              ...(snapshotResize
                ? {
                    startRect: boundsForLine(sel),
                    startCenter: objCenter(sel),
                    startRot: sel.rot ?? 0,
                    snapshot: cloneLines(linesRef.current)
                  }
                : {})
            }
            return
          }
          const ei = bboxEdgeAt(sel, pt)
          if (ei >= 0) {
            pauseStampStrokeRelock(sel)
            for (const child of linesRef.current) {
              if (child.parentId === sel.id) pauseStampStrokeRelock(child)
            }
            lineDragRef.current = {
              kind: 'bboxEdge',
              id: sel.id,
              idx: ei,
              grab: pt,
              startCenter: objCenter(sel),
              startRot: sel.rot ?? 0,
              snapshot: cloneLines(linesRef.current)
            }
            return
          }
        }
      }

      // 2. Selecting / moving an existing visible object (topmost in paint order first).
      const hit = topmostPaintHit((l) => {
        if (!isPaintHitVisible(l)) return false
        if (l.reshapeQuad?.length === 4) return pointInPoly(l.reshapeQuad, pt)
        const q = unmapObjDisplayPt(pt, l)
        return l.type === 'text'
          ? pointInPoly(flattenLine(l), q)
          : lineHitDist(l, q) <= Math.max(8, l.thickness) ||
            (l.type === 'poly' && l.fill && pointInPoly(l.pts, q)) ||
            (l.type === 'shape' && pointInRect(l.pts[0], l.pts[1], q)) ||
            ((l.type === 'stamp' || l.type === 'group') && l.pts.length >= 2 && pointInRect(l.pts[0], l.pts[1], q))
      })
      if (hit) {
        if (sel && sel.id !== hit.id && isVectorVisible(sel) && rotatePinHit(sel, pt)) {
          startRotateDrag(sel, pt)
          return
        }
        selectLine(hit)
        lineDragRef.current = { kind: 'move', id: selectedIdRef.current ?? hit.id, grab: pt }
        redrawLines(); drawHandles()
        return
      }

      // Empty Pointer click deselects canvas + layer panel.
      if (sel && isVectorVisible(sel) && rotatePinHit(sel, pt)) {
        startRotateDrag(sel, pt)
        return
      }
      lineDragRef.current = null
      selectedIdRef.current = null
      setSelectedId(null)
      setSelectedLayerIds(new Set())
      redrawLines(); drawHandles()
      return
    }
    if (tool === 'reshape') {
      let sel = reshapeTargetLine()
      if (sel) sel = ensureReshapeInit(sel.id) ?? linesRef.current.find((l) => l.id === sel!.id) ?? null
      if (sel && sel.reshapeQuad?.length === 4) {
        selectedIdRef.current = sel.id
        setSelectedId(sel.id)
        setSelectedLayerIds(new Set([sel.id]))
        if (rotatePinHit(sel, pt)) {
          startRotateDrag(sel, pt)
          return
        }
        const ci = reshapeCornerAt(sel, pt)
        if (ci >= 0) {
          lineDragRef.current = {
            kind: 'reshapeCorner',
            id: sel.id,
            idx: ci,
            snapshot: cloneLines(linesRef.current)
          }
          return
        }
        const ei = reshapeEdgeAt(sel, pt)
        if (ei >= 0) {
          lineDragRef.current = {
            kind: 'reshapeEdge',
            id: sel.id,
            idx: ei,
            grab: pt,
            snapshot: cloneLines(linesRef.current)
          }
          return
        }
        if (pointInPoly(sel.reshapeQuad, pt)) {
          lineDragRef.current = { kind: 'move', id: sel.id, grab: pt }
          return
        }
      }
      const hit = topmostPaintHit((l) => {
        if (!isPaintHitVisible(l) || !lineReshapeable(l)) return false
        if (l.reshapeQuad?.length === 4) return pointInPoly(l.reshapeQuad, pt)
        const q = unmapObjDisplayPt(pt, l)
        return l.type === 'text'
          ? pointInPoly(flattenLine(l), q)
          : (l.type === 'stamp' || l.type === 'shape') && l.pts.length >= 2 && pointInRect(l.pts[0], l.pts[1], q)
      })
      if (hit) {
        selectLine(hit)
        const ready = ensureReshapeInit(hit.id) ?? linesRef.current.find((l) => l.id === hit.id)
        if (ready?.reshapeQuad?.length === 4 && pointInPoly(ready.reshapeQuad, pt)) {
          lineDragRef.current = { kind: 'move', id: ready.id, grab: pt }
        } else if (ready && !ready.reshapeQuad?.length) {
          scheduleReshapeInitRetry(hit.id)
        }
        redrawLines(); drawHandles()
        return
      }
      lineDragRef.current = null
      selectedIdRef.current = null
      setSelectedId(null)
      setSelectedLayerIds(new Set())
      redrawLines(); drawHandles()
      return
    }
    // Text: place a new text object and edit it on the canvas.
    if (tool === 'text') {
      if (useOutsideText && outsideTextRef.current) {
        const existingLinked = linesRef.current.some(
          (l) => l.type === 'text' && l.linkedOutsideText
        )
        const nl = lineFromOutsideText(outsideTextRef.current, W, innerDraw)
        if (existingLinked) {
          nl.linkedOutsideText = undefined
          nl.pts = nl.pts.map((p) => ({ x: p.x + 16, y: p.y + 16 }))
          nl.name = `Text ${linesRef.current.filter((l) => l.type === 'text').length + 1}`
        }
        // Keep optical center (linked letters); click only starts edit.
        linesRef.current = [...linesRef.current, nl]
        commitLines([...linesRef.current])
        selectLine(nl)
        loadFont(nl.fontFamily ?? 'Inter').then(() => {
          redrawLines()
          drawHandles()
        })
        startTextEditRef.current(nl.id)
        return
      }
      const id = genId()
      const nl: LineObj = {
        id, type: 'text', pts: [pt], startCap: 'none', endCap: 'none', dash: 'solid',
        thickness: size, color,
        text: '', fontFamily, fontSize, weight: fontWeightV, bold: fontWeightV >= 700, italic, underline,
        lineHeight: txtLineHeight, letterSpacing: txtLetterSpacing,
        shadow: txtShadow, shadowColor: txtShadowColor, shadowBlur: txtShadowBlur,
        shadowOffsetX: txtShadowOX, shadowOffsetY: txtShadowOY, shadowSpread: txtShadowSpread,
        layer: activeAddLayer()
      }
      // Place so typical glyph ink is canvas-centered (not the em / textarea box).
      nl.pts = [opticalTopLeftForText({ ...nl, text: 'H' }, W / 2, H / 2)]
      linesRef.current = [...linesRef.current, nl]
      commitLines([...linesRef.current])
      selectLine(nl)
      loadFont(fontFamily).then(() => { redrawLines(); drawHandles() })
      startTextEditRef.current(id)
      return
    }
    // 3. Creating a new object (assigned to the active add layer — Inner preferred when both on).
    const id = genId()
    const layer = activeAddLayer()
    let nl: LineObj
    if (tool === 'shape') {
      nl = {
        id, type: 'shape', shape: shapeKind, pts: [pt, { ...pt }], startCap: 'none', endCap: 'none',
        dash: lineDash, thickness: size, color, fill: shapeFill,
        borderColor, borderWidth: size, borderRadius, keepStrokeOnResize, layer,
        punchThrough: shapeFill && transparentFillPunch()
      }
    } else if (tool === 'freepoly') {
      const n = Math.max(3, Math.min(60, freePolyN))
      nl = {
        id, type: 'poly', pts: regularPolyPts(pt, pt, n), startCap: 'none', endCap: 'none',
        dash: lineDash, thickness: size, color, fill: shapeFill,
        borderColor, borderWidth: size, borderRadius, keepStrokeOnResize, layer,
        punchThrough: shapeFill && transparentFillPunch()
      }
    } else {
      let pts: Pt[]
      const n = Math.max(2, Math.min(40, linePointCount))
      if (lineType === 'drawn') pts = [pt]
      else if (lineType === 'straight') pts = [pt, { ...pt }]
      else if (lineType === 'curved') pts = [pt, { ...pt }, { ...pt }]
      else pts = linePts(pt, pt, n) // polyline / free
      nl = {
        id, type: lineType, pts, startCap, endCap, dash: lineDash, thickness: size, color,
        borderColor: color, borderWidth: size, borderRadius, layer,
        ...(startCap !== 'none' ? { startCapSize } : {}),
        ...(endCap !== 'none' ? { endCapSize } : {}),
        ...(lineType === 'drawn' ? { drawnCurve } : {})
      }
    }
    linesRef.current = [...linesRef.current, nl]
    selectedIdRef.current = id
    setSelectedId(id)
    lineDragRef.current = { kind: (tool === 'line' && lineType === 'drawn') ? 'draw' : 'create', id, grab: pt }
    redrawLines()
  }

  const lineMove = (pt: Pt) => {
    const baseTransform = baseTransformRef.current
    if (baseTransform) {
      if (baseTransform.kind === 'move' && baseTransform.grab) {
        const dx = pt.x - baseTransform.grab.x
        const dy = pt.y - baseTransform.grab.y
        const next = {
          x: baseTransform.bounds.x + dx,
          y: baseTransform.bounds.y + dy,
          w: baseTransform.bounds.w,
          h: baseTransform.bounds.h
        }
        paintContentFromSnapshot(baseTransform.source, baseTransform.bounds, next)
        if (baseTransform.baseSource) {
          paintContentFromSnapshot(
            baseTransform.baseSource,
            baseTransform.bounds,
            next,
            baseCanvas('content')
          )
        }
        mapPunchStampsToBounds(baseTransform.punchStamps, baseTransform.bounds, next)
      } else if (baseTransform.kind === 'resize' && baseTransform.fixed) {
        const end = shiftHeldRef.current
          ? lockAspectRatioEnd(
              baseTransform.fixed,
              pt,
              baseTransform.bounds.w / Math.max(1, baseTransform.bounds.h)
            )
          : pt
        const next = {
          x: Math.min(baseTransform.fixed.x, end.x),
          y: Math.min(baseTransform.fixed.y, end.y),
          w: Math.max(1, Math.abs(end.x - baseTransform.fixed.x)),
          h: Math.max(1, Math.abs(end.y - baseTransform.fixed.y))
        }
        paintContentFromSnapshot(baseTransform.source, baseTransform.bounds, next)
        if (baseTransform.baseSource) {
          paintContentFromSnapshot(
            baseTransform.baseSource,
            baseTransform.bounds,
            next,
            baseCanvas('content')
          )
        }
        mapPunchStampsToBounds(baseTransform.punchStamps, baseTransform.bounds, next)
      } else if (
        baseTransform.kind === 'rotate' &&
        baseTransform.center &&
        baseTransform.startAng != null
      ) {
        const angle = Math.atan2(pt.y - baseTransform.center.y, pt.x - baseTransform.center.x)
        const raw = angle - baseTransform.startAng
        const step = Math.PI / 12
        const nearest = Math.round(raw / step) * step
        const delta = Math.abs(Math.atan2(Math.sin(raw - nearest), Math.cos(raw - nearest))) <= (3 * Math.PI / 180)
          ? nearest
          : raw
        const drawRotated = (src: HTMLCanvasElement, dest: HTMLCanvasElement) => {
          const ctx = dest.getContext('2d')!
          ctx.clearRect(0, 0, W, H)
          ctx.save()
          ctx.imageSmoothingEnabled = false
          ctx.translate(baseTransform.center!.x, baseTransform.center!.y)
          ctx.rotate(delta)
          ctx.translate(-baseTransform.center!.x, -baseTransform.center!.y)
          ctx.drawImage(src, 0, 0)
          ctx.restore()
        }
        drawRotated(baseTransform.source, ensureOffscreenCanvas(contentCanvasRef))
        if (baseTransform.baseSource) {
          drawRotated(baseTransform.baseSource, baseCanvas('content'))
        }
        for (const snap of baseTransform.punchStamps ?? []) {
          const l = linesRef.current.find((item) => item.id === snap.id)
          if (!l) continue
          l.pts = snap.pts.map((p) => rotatePt(p, baseTransform.center!, delta))
          l.rot = (snap.rot ?? 0) + delta
        }
      }
      schedulePaintView(true)
      return
    }
    const dr = lineDragRef.current
    if (!dr) return
    const l = linesRef.current.find((x) => x.id === dr.id)
    if (!l) return
    if (dr.kind === 'cropHandle' || dr.kind === 'cropPan') {
      const cs = cropSessionRef.current
      if (!cs || cs.id !== l.id) return
      const local = unmapObjDisplayPt(pt, l)
      if (dr.kind === 'cropHandle' && dr.startRect && dr.idx != null) {
        applyCropHandleMove(cs, dr.idx, local, dr.startRect, shiftHeldRef.current)
        drawHandles()
        return
      }
      if (dr.kind === 'cropPan' && dr.grab && dr.startRect) {
        cs.imgX = dr.startRect.x + (local.x - dr.grab.x)
        cs.imgY = dr.startRect.y + (local.y - dr.grab.y)
        clampCropPan(cs)
        l.pts = [
          { x: cs.imgX, y: cs.imgY },
          { x: cs.imgX + cs.imgW, y: cs.imgY + cs.imgH }
        ]
        schedulePaintView(true)
        return
      }
      return
    }
    if (dr.kind === 'draw') {
      const last = l.pts[l.pts.length - 1]
      // Fixed adjustable-point count overrides sampling: capture densely, resample on up.
      // Distance mode (On): place points at a travel-distance interval.
      // Default (Off): original behaviour — add a point on every small mouse move.
      const nFilled = drawnPointCount.trim() !== '' && Number(drawnPointCount) >= 2
      const minDist = nFilled || !drawnDistanceMode
        ? 2
        : Math.max(8, size * 1.2)
      if (dist(last, pt) >= minDist) l.pts.push(pt)
    } else if (dr.kind === 'create') {
      const origin = dr.grab ?? l.pts[0]
      let end = pt
      const polyFamily =
        l.type === 'poly' ||
        (l.type === 'shape' && !!l.shape && POLY_KIND_SET.has(l.shape))
      const irregFamily =
        l.type === 'shape' && !!l.shape && !POLY_KIND_SET.has(l.shape)
      const polyAsp = polyAspectRef.current
      const irregAsp = irregAspectRef.current
      if (polyFamily && (polyAsp.lock || shiftHeldRef.current)) {
        const aw = Math.max(0.01, polyAsp.w || 1)
        const ah = Math.max(0.01, polyAsp.h || 1)
        end = lockAspectRatioEnd(origin, pt, aw / ah)
      } else if (irregFamily && (irregAsp.lock || shiftHeldRef.current)) {
        const aw = Math.max(0.01, irregAsp.w || 1)
        const ah = Math.max(0.01, irregAsp.h || 1)
        end = lockAspectRatioEnd(origin, pt, aw / ah)
      } else if (shiftHeldRef.current && l.type === 'stamp') {
        end = lockAspectEnd(origin, pt)
      }
      if (l.type === 'shape' || l.type === 'stamp') l.pts = [origin, end]
      else if (l.type === 'poly') l.pts = regularPolyPts(origin, end, l.pts.length)
      else if (l.type === 'straight') {
        const screenRect = previewRef.current?.getBoundingClientRect()
        const scale = screenRect?.width ? W / screenRect.width : 1
        const snapped = snapStraightLineEnd(origin, pt, 8 * scale, shiftHeldRef.current)
        setLineEndAndControls(l, snapped.pt)
        if (snapped.axis) {
          schedulePaintView(true, () =>
            drawStraightLineSnapGuides(origin, snapped.pt, snapped.axis!)
          )
          return
        }
      } else setLineEndAndControls(l, pt)
    } else if (dr.kind === 'handle') {
      const resizeSnapshot = dr.snapshot
      const sourceLine = resizeSnapshot?.find((item) => item.id === l.id)
      const snapshotResize = !!(
        sourceLine &&
        sourceLine.pts.length === 2 &&
        (l.type === 'shape' || l.type === 'stamp' || l.type === 'group')
      )
      if (snapshotResize && sourceLine && resizeSnapshot) {
        l.pts = sourceLine.pts.map((point) => ({ ...point }))
        l.rot = sourceLine.rot
        l.thickness = sourceLine.thickness
        l.borderWidth = sourceLine.borderWidth
        l.fontSize = sourceLine.fontSize
        if (l.type === 'group') {
          const descendants = descendantIds(l.id, resizeSnapshot)
          for (const current of linesRef.current) {
            if (!descendants.has(current.id)) continue
            const source = resizeSnapshot.find((item) => item.id === current.id)
            if (!source) continue
            current.pts = source.pts.map((point) => ({ ...point }))
            current.rot = source.rot
            current.thickness = source.thickness
            current.borderWidth = source.borderWidth
            current.fontSize = source.fontSize
            current.paintStrokes = source.paintStrokes
              ? structuredClone(source.paintStrokes)
              : source.paintStrokes
          }
        }
      }
      // Convert against the drag-start frame. Using the live changing centre
      // causes repeated Shift-resize moves to compound and collapse the box.
      let local = rotatePt(
        pt,
        dr.startCenter ?? objCenter(l),
        -(dr.startRot ?? l.rot ?? 0)
      )
      const idx = dr.idx!
      const fixed = l.pts.length === 2 ? l.pts[1 - idx] : null
      const before = l.pts.length === 2
        ? {
            x: Math.min(l.pts[0].x, l.pts[1].x),
            y: Math.min(l.pts[0].y, l.pts[1].y),
            w: Math.abs(l.pts[1].x - l.pts[0].x),
            h: Math.abs(l.pts[1].y - l.pts[0].y)
          }
        : null
      let resizeCorner: Corner | null = null
      if (fixed && !(l.rot ?? 0) && (l.type === 'shape' || l.type === 'stamp')) {
        resizeCorner = `${local.y < fixed.y ? 'n' : 's'}${local.x < fixed.x ? 'w' : 'e'}` as Corner
      }
      // Preset shapes / stamps use 2 bbox corners — aspect lock or Shift constrains the box.
      if (fixed) {
        if (l.type === 'group' && shiftHeldRef.current && dr.startRect) {
          local = lockAspectRatioEnd(fixed, local, dr.startRect.w / Math.max(1, dr.startRect.h))
        } else if (l.type === 'shape' && l.shape) {
          const polyFamily = POLY_KIND_SET.has(l.shape)
          const asp = polyFamily ? polyAspectRef.current : irregAspectRef.current
          if (asp.lock || shiftHeldRef.current) {
            const aw = Math.max(0.01, asp.w || 1)
            const ah = Math.max(0.01, asp.h || 1)
            local = lockAspectRatioEnd(fixed, local, aw / ah)
          }
        } else if (shiftHeldRef.current && l.type === 'stamp') {
          local = lockAspectEnd(fixed, local)
        } else if (l.type === 'straight') {
          const screenRect = previewRef.current?.getBoundingClientRect()
          const scale = screenRect?.width ? W / screenRect.width : 1
          const snapped = snapStraightLineEnd(fixed, local, 8 * scale, shiftHeldRef.current)
          local = snapped.pt
          if (snapped.axis) {
            l.pts[idx] = local
            syncGroupBounds()
            schedulePaintView(true, () =>
              drawStraightLineSnapGuides(fixed, local, snapped.axis!)
            )
            return
          }
        }
      }
      const groupBefore = l.type === 'group' && l.pts.length >= 2
        ? {
            x: Math.min(l.pts[0].x, l.pts[1].x),
            y: Math.min(l.pts[0].y, l.pts[1].y),
            w: Math.max(1, Math.abs(l.pts[1].x - l.pts[0].x)),
            h: Math.max(1, Math.abs(l.pts[1].y - l.pts[0].y))
          }
        : null
      l.pts[idx] = local
      if (groupBefore) {
        const gx = Math.min(l.pts[0].x, l.pts[1].x)
        const gy = Math.min(l.pts[0].y, l.pts[1].y)
        const gw = Math.max(1, Math.abs(l.pts[1].x - l.pts[0].x))
        const gh = Math.max(1, Math.abs(l.pts[1].y - l.pts[0].y))
        const descendants = descendantIds(l.id)
        for (const child of linesRef.current) {
          if (!descendants.has(child.id)) continue
          child.pts = child.pts.map((p) => ({
            x: gx + ((p.x - groupBefore.x) / groupBefore.w) * gw,
            y: gy + ((p.y - groupBefore.y) / groupBefore.h) * gh
          }))
          const strokeScale = Math.min(gw / groupBefore.w, gh / groupBefore.h)
          if (child.type === 'text') {
            child.fontSize = Math.max(1, (child.fontSize ?? 48) * strokeScale)
          }
          if (child.keepStrokeOnResize === false) {
            child.thickness *= strokeScale
            if (child.borderWidth != null) child.borderWidth *= strokeScale
          }
        }
        syncGroupBounds()
      }
      // Unrotated box items: weak edge/size snap to canvas + other objects.
      if (
        fixed &&
        before &&
        !(l.rot ?? 0) &&
        (l.type === 'shape' || l.type === 'stamp')
      ) {
        const exclude = new Set<string>([l.id, ...descendantIds(l.id)])
        let corner: Corner = resizeCorner ??
          `${local.y < fixed.y ? 'n' : 's'}${local.x < fixed.x ? 'w' : 'e'}` as Corner
        const magnetic = snapResizePointToCanvasEdges(local, corner, exclude)
        local = magnetic
        corner = `${local.y < fixed.y ? 'n' : 's'}${local.x < fixed.x ? 'w' : 'e'}` as Corner
        l.pts[idx] = local
        let box = {
          x: Math.min(local.x, fixed.x),
          y: Math.min(local.y, fixed.y),
          w: Math.abs(local.x - fixed.x),
          h: Math.abs(local.y - fixed.y)
        }
        const lockAspect = !!(
          (l.type === 'shape' && l.shape && (
            (POLY_KIND_SET.has(l.shape) ? polyAspectRef.current : irregAspectRef.current).lock ||
            shiftHeldRef.current
          )) ||
          (l.type === 'stamp' && shiftHeldRef.current)
        )
        const matched = snapResizeMatchOtherSizes(box, corner, before, lockAspect, exclude)
        box = matched.rect
        l.pts = [
          { x: box.x, y: box.y },
          { x: box.x + box.w, y: box.y + box.h }
        ]
        if (l.type === 'shape' && l.keepStrokeOnResize === false) {
          const strokeScale = Math.min(
            Math.max(1, box.w) / Math.max(1, before.w),
            Math.max(1, box.h) / Math.max(1, before.h)
          )
          l.thickness *= strokeScale
          if (l.borderWidth != null) l.borderWidth *= strokeScale
        }
        syncGroupBounds()
        const halfW = Math.abs(box.w - W / 2) < 0.5
        const halfH = Math.abs(box.h - H / 2) < 0.5
        const edgeGuide = resizeEdgeGuide(box, corner)
        const guide: AlignmentSnap = {
          dx: 0,
          dy: 0,
          x: matched.align.x || edgeGuide.x,
          y: matched.align.y || edgeGuide.y,
          xAt: edgeGuide.xAt,
          yAt: edgeGuide.yAt,
          xGuide: matched.align.xGuide ?? (edgeGuide.x
            ? (edgeGuide.xAt === 'start' ? 0 : edgeGuide.xAt === 'end' ? W : null)
            : null),
          yGuide: matched.align.yGuide ?? (edgeGuide.y
            ? (edgeGuide.yAt === 'start' ? 0 : edgeGuide.yAt === 'end' ? H : null)
            : null),
          xLabel: matched.align.xLabel ?? (edgeGuide.xAt === 'start' ? 'Left edge' : edgeGuide.xAt === 'end' ? 'Right edge' : null),
          yLabel: matched.align.yLabel ?? (edgeGuide.yAt === 'start' ? 'Top edge' : edgeGuide.yAt === 'end' ? 'Bottom edge' : null)
        }
        schedulePaintView(true, () => {
          drawAlignmentGuides(guide)
          drawHalfSizeGuides(box, { width: halfW, height: halfH })
        })
        return
      }
      if (before && l.type === 'shape' && l.keepStrokeOnResize === false) {
        const afterW = Math.max(1, Math.abs(l.pts[1].x - l.pts[0].x))
        const afterH = Math.max(1, Math.abs(l.pts[1].y - l.pts[0].y))
        const strokeScale = Math.min(
          afterW / Math.max(1, before.w),
          afterH / Math.max(1, before.h)
        )
        l.thickness *= strokeScale
        if (l.borderWidth != null) l.borderWidth *= strokeScale
      }
      syncGroupBounds()
    } else if (dr.kind === 'reshapeCorner') {
      if (!l.reshapeQuad || dr.idx == null) return
      let nx = pt.x
      let ny = pt.y
      let shiftAxis: 'x' | 'y' | null = null
      if (shiftHeldRef.current && dr.snapshot) {
        const source = dr.snapshot.find((item) => item.id === l.id)
        const origin = source?.reshapeQuad?.[dr.idx]
        if (origin) {
          if (Math.abs(pt.x - origin.x) >= Math.abs(pt.y - origin.y)) {
            ny = origin.y
            shiftAxis = 'x'
          } else {
            nx = origin.x
            shiftAxis = 'y'
          }
        }
      }
      const base = l.reshapeBaseQuad ?? l.reshapeQuad
      const screenRect = previewRef.current?.getBoundingClientRect()
      const scale = screenRect?.width ? W / screenRect.width : 1
      const snapped = applyReshapeCornerSnap(
        { x: nx, y: ny },
        dr.idx,
        l.reshapeQuad,
        base,
        6 * scale,
        shiftAxis
      )
      l.reshapeQuad[dr.idx] = snapped.pt
      reshapeSnapGuidesRef.current =
        snapped.verticalGuides.length || snapped.horizontalGuides.length
          ? {
              vertical: snapped.verticalGuides,
              horizontal: snapped.horizontalGuides,
              label: snapped.label
            }
          : null
      schedulePaintView(true, () => drawReshapeSnapGuides())
      return
    } else if (dr.kind === 'reshapeEdge') {
      if (!l.reshapeQuad || dr.idx == null || !dr.grab) return
      const d = constrainDragDeltaAxis(
        { x: pt.x - dr.grab.x, y: pt.y - dr.grab.y },
        shiftHeldRef.current
      )
      const source = dr.snapshot?.find((item) => item.id === l.id)
      if (!source?.reshapeQuad) return
      const i = dr.idx
      const j = (i + 1) % 4
      l.reshapeQuad = source.reshapeQuad.map((p) => ({ ...p }))
      l.reshapeBaseQuad = source.reshapeBaseQuad?.map((p) => ({ ...p }))
      l.reshapeQuad[i] = { x: l.reshapeQuad[i].x + d.x, y: l.reshapeQuad[i].y + d.y }
      l.reshapeQuad[j] = { x: l.reshapeQuad[j].x + d.x, y: l.reshapeQuad[j].y + d.y }
      if (l.reshapeBaseQuad) {
        l.reshapeBaseQuad[i] = { x: l.reshapeBaseQuad[i].x + d.x, y: l.reshapeBaseQuad[i].y + d.y }
        l.reshapeBaseQuad[j] = { x: l.reshapeBaseQuad[j].x + d.x, y: l.reshapeBaseQuad[j].y + d.y }
      }
      schedulePaintView(true)
      return
    } else if (dr.kind === 'bboxEdge') {
      if (dr.idx == null || !dr.grab) return
      const source = dr.snapshot?.find((item) => item.id === l.id)
      if (!source || source.pts.length !== 2) return
      const center = dr.startCenter ?? objCenter(l)
      const rot = dr.startRot ?? l.rot ?? 0
      const localPt = rotatePt(pt, center, -rot)
      const localGrab = rotatePt(dr.grab, center, -rot)
      let dx = localPt.x - localGrab.x
      let dy = localPt.y - localGrab.y
      // Default: move edge perpendicular (resize). Shift: slide along the edge only.
      if (shiftHeldRef.current) {
        if (dr.idx === 0 || dr.idx === 2) dy = 0
        else dx = 0
      } else {
        if (dr.idx === 0 || dr.idx === 2) dx = 0
        else dy = 0
      }
      const corners = localRectCornersFromPts(source.pts)
      const moved = translatePolyEdge(corners, dr.idx, dx, dy)
      l.pts = [moved[0], moved[2]]
      l.rot = source.rot
      l.thickness = source.thickness
      l.borderWidth = source.borderWidth
      l.fontSize = source.fontSize
      if (l.type === 'group') {
        const groupBefore = {
          x: Math.min(source.pts[0].x, source.pts[1].x),
          y: Math.min(source.pts[0].y, source.pts[1].y),
          w: Math.max(1, Math.abs(source.pts[1].x - source.pts[0].x)),
          h: Math.max(1, Math.abs(source.pts[1].y - source.pts[0].y))
        }
        const gx = Math.min(l.pts[0].x, l.pts[1].x)
        const gy = Math.min(l.pts[0].y, l.pts[1].y)
        const gw = Math.max(1, Math.abs(l.pts[1].x - l.pts[0].x))
        const gh = Math.max(1, Math.abs(l.pts[1].y - l.pts[0].y))
        const descendants = descendantIds(l.id, dr.snapshot)
        for (const child of linesRef.current) {
          if (!descendants.has(child.id)) continue
          const childSource = dr.snapshot!.find((item) => item.id === child.id)
          if (!childSource) continue
          child.pts = childSource.pts.map((p) => ({
            x: gx + ((p.x - groupBefore.x) / groupBefore.w) * gw,
            y: gy + ((p.y - groupBefore.y) / groupBefore.h) * gh
          }))
          child.rot = childSource.rot
          child.thickness = childSource.thickness
          child.borderWidth = childSource.borderWidth
          child.fontSize = childSource.fontSize
          child.paintStrokes = childSource.paintStrokes
            ? structuredClone(childSource.paintStrokes)
            : childSource.paintStrokes
        }
        syncGroupBounds()
      }
      schedulePaintView(true)
      return
    } else if (dr.kind === 'move') {
      const d = { x: pt.x - dr.grab!.x, y: pt.y - dr.grab!.y }
      l.pts = l.pts.map((p) => ({ x: p.x + d.x, y: p.y + d.y }))
      translateReshape(l, d.x, d.y)
      if (l.type === 'group') {
        const descendants = descendantIds(l.id)
        for (const child of linesRef.current) {
          if (descendants.has(child.id)) {
            child.pts = child.pts.map((p) => ({ x: p.x + d.x, y: p.y + d.y }))
            translateReshape(child, d.x, d.y)
          }
        }
      }
      const exclude = new Set<string>([l.id, ...descendantIds(l.id)])
      {
        let parentId = l.parentId
        const seen = new Set<string>()
        while (parentId && !seen.has(parentId)) {
          seen.add(parentId)
          exclude.add(parentId)
          parentId = linesRef.current.find((item) => item.id === parentId)?.parentId
        }
      }
      const snap = snapRectToGuides(boundsForLine(l), exclude)
      if (snap.x || snap.y) {
        l.pts = l.pts.map((p) => ({ x: p.x + snap.dx, y: p.y + snap.dy }))
        translateReshape(l, snap.dx, snap.dy)
        if (l.type === 'group') {
          const descendants = descendantIds(l.id)
          for (const child of linesRef.current) {
            if (descendants.has(child.id)) {
              child.pts = child.pts.map((p) => ({ x: p.x + snap.dx, y: p.y + snap.dy }))
              translateReshape(child, snap.dx, snap.dy)
            }
          }
        }
      }
      syncGroupBounds()
      // While snapped, retain the virtual grab point on that axis so slow,
      // continued cursor movement accumulates and can cleanly break the magnet.
      dr.grab = {
        x: snap.x ? dr.grab!.x : pt.x,
        y: snap.y ? dr.grab!.y : pt.y
      }
      schedulePaintView(true, () => drawAlignmentGuides(snap))
      return
    } else if (dr.kind === 'rotate') {
      const c = dr.center!
      const ang = Math.atan2(pt.y - c.y, pt.x - c.x)
      const rawRot = (dr.startRot ?? 0) + (ang - (dr.startAng ?? 0))
      const snapStep = Math.PI / 12 // 15°
      const nearest = Math.round(rawRot / snapStep) * snapStep
      const difference = Math.atan2(Math.sin(rawRot - nearest), Math.cos(rawRot - nearest))
      const snapped = Math.abs(difference) <= (3 * Math.PI / 180)
      const nextRot = snapped ? nearest : rawRot
      if (l.type === 'group' && dr.snapshot) {
        const snapshot = dr.snapshot
        const sourceGroup = snapshot.find((item) => item.id === l.id)
        if (!sourceGroup) return
        const delta = nextRot - (dr.startRot ?? 0)
        const ids = descendantIds(l.id, snapshot)
        for (const current of linesRef.current) {
          if (!ids.has(current.id) || current.type === 'group') continue
          const source = snapshot.find((item) => item.id === current.id)
          if (!source) continue
          const pivot = rotationCenter(source)
          const nextPivot = rotatePt(pivot, c, delta)
          const dx = nextPivot.x - pivot.x
          const dy = nextPivot.y - pivot.y
          current.pts = source.pts.map((point) => ({ x: point.x + dx, y: point.y + dy }))
          if (source.reshapeQuad?.length === 4) {
            rotateReshapeFromSnapshot(current, source, c, delta)
            translateReshape(current, dx, dy)
            current.rot = source.rot ?? 0
          } else {
            current.rot = (source.rot ?? 0) + delta
          }
        }
        syncGroupBounds()
        const rotatedGroupIds = new Set([l.id, ...ids])
        for (const current of linesRef.current) {
          if (current.type !== 'group' || !rotatedGroupIds.has(current.id)) continue
          const source = snapshot.find((item) => item.id === current.id)
          if (!source?.paintStrokes?.length || source.pts.length < 2 || current.pts.length < 2) continue
          const sx = Math.min(source.pts[0].x, source.pts[1].x)
          const sy = Math.min(source.pts[0].y, source.pts[1].y)
          const sw = Math.max(1, Math.abs(source.pts[1].x - source.pts[0].x))
          const sh = Math.max(1, Math.abs(source.pts[1].y - source.pts[0].y))
          const nx = Math.min(current.pts[0].x, current.pts[1].x)
          const ny = Math.min(current.pts[0].y, current.pts[1].y)
          const nw = Math.max(1, Math.abs(current.pts[1].x - current.pts[0].x))
          const nh = Math.max(1, Math.abs(current.pts[1].y - current.pts[0].y))
          current.paintStrokes = source.paintStrokes.map((stroke) => ({
            ...stroke,
            pts: stroke.pts.map((point) => {
              const rotated = rotatePt({ x: sx + point.x * sw, y: sy + point.y * sh }, c, delta)
              return { x: (rotated.x - nx) / nw, y: (rotated.y - ny) / nh }
            })
          }))
        }
      } else {
        const source = dr.snapshot?.find((item) => item.id === l.id)
        const delta = nextRot - (dr.startRot ?? 0)
        if (source?.reshapeQuad?.length === 4) {
          // Rotation is baked into the warp quad — do not also bump l.rot or the
          // unwarped source is rotated twice and the reshape looks wrong.
          rotateReshapeFromSnapshot(l, source, c, delta)
          l.rot = source.rot ?? 0
        } else {
          l.rot = nextRot
          if (source) rotateReshapeFromSnapshot(l, source, c, delta)
        }
        syncGroupBounds()
      }
      const guideSource = dr.snapshot?.find((item) => item.id === l.id)
      schedulePaintView(true, () => {
        drawRotationGuide(
          l,
          snapped,
          guideSource?.reshapeQuad?.length === 4 || l.type === 'group' ? nextRot : undefined
        )
      })
      return
    }
    schedulePaintView(true)
  }

  const lineUp = (pt: Pt) => {
    cancelPaintView()
    if (baseTransformRef.current) {
      baseTransformRef.current = null
      redrawLines()
      drawHandles()
      pushHistory(['overlay:content'])
      return
    }
    const dr = lineDragRef.current
    lineDragRef.current = null
    reshapeSnapGuidesRef.current = null
    resizeSnapLockRef.current = { width: false, height: false }
    if (!dr) return
    if (dr.kind === 'cropHandle' || dr.kind === 'cropPan') {
      redrawLines()
      drawHandles()
      return
    }
    const l = linesRef.current.find((x) => x.id === dr.id)
    // Discard accidental zero-size creations.
    if (l && (dr.kind === 'create' || dr.kind === 'draw')) {
      const tooSmall = (l.type === 'poly' || l.type === 'shape')
        ? (dr.grab ? dist(dr.grab, pt) < 4 : true)
        : dist(flattenLine(l)[0], flattenLine(l)[flattenLine(l).length - 1]) < 3
      if (tooSmall && !(dr.kind === 'draw' && l.pts.length > 4)) {
        linesRef.current = linesRef.current.filter((x) => x.id !== dr.id)
        selectedIdRef.current = null
        setSelectedId(null)
        commitLines(linesRef.current)
        redrawLines(); clearPreview()
        return
      }
    }
    // Drawn freehand: always keep the final cursor position, then optionally
    // resample to a fixed adjustable-point count (overrides distance/default).
    if (l && dr.kind === 'draw' && l.type === 'drawn') {
      const last = l.pts[l.pts.length - 1]
      if (!last || dist(last, pt) > 0.5) l.pts.push(pt)
      const n = Number(drawnPointCount)
      if (drawnPointCount.trim() !== '' && n >= 2) {
        l.pts = resampleAlong(l.pts, Math.max(2, Math.min(200, Math.round(n))))
      }
    }
    syncGroupBounds()
    if (l && dr.kind === 'handle' && (l.reshapeQuad || l.reshapeSrc)) {
      l.reshapeQuad = undefined
      l.reshapeSrc = undefined
      l.reshapeBaseQuad = undefined
    }
    // Geometry settled — rewrite derived display bits so holes track the object.
    if (
      dr.kind === 'move' ||
      dr.kind === 'rotate' ||
      dr.kind === 'bboxEdge' ||
      dr.kind === 'reshapeCorner' ||
      dr.kind === 'reshapeEdge' ||
      dr.kind === 'handle'
    ) {
      const ids =
        dr.kind === 'move' || dr.kind === 'rotate' || dr.kind === 'bboxEdge'
          ? linesRef.current
              .filter((item) => item.id === dr.id || item.parentId === dr.id)
              .map((item) => item.id)
          : [dr.id]
      syncHolesAfterGeomChange(linesRef.current as HoleItem[], W, H, holeGeom, ids)
    }
    // Library stamps: rebake stroke-locked raster once after box resize (live drag
    // only scaled the previous bitmap to avoid per-frame stroke jumps).
    if (dr.kind === 'handle' || dr.kind === 'bboxEdge') {
      const pausedIds = [...stampStrokeRelockPaused]
      const toBake = pausedIds
        .map((id) => linesRef.current.find((item) => item.id === id))
        .filter((item): item is LineObj => !!item && item.type === 'stamp')
      if (toBake.length) {
        // Stay paused until bake finishes so redraw does not kick off SVG churn.
        void Promise.all(toBake.map((item) => rebakeStrokeLockedStamp(item))).then(() => {
          for (const id of pausedIds) stampStrokeRelockPaused.delete(id)
          commitLines([...linesRef.current])
          redrawLinesRef.current()
          drawHandles()
        })
      } else {
        stampStrokeRelockPaused.clear()
      }
    } else {
      stampStrokeRelockPaused.clear()
    }
    commitLines([...linesRef.current])
    redrawLines(); drawHandles()
    pushHistory()
  }

  /** Continue a vector drag after mousedown on an HTML overlay (above the textarea). */
  const beginWindowDrag = () => {
    startPointerDragCapture()
  }

  const stopPointerDragCapture = () => {
    pointerDragCleanupRef.current?.()
    pointerDragCleanupRef.current = null
  }

  /**
   * Track mousemove/mouseup on window so drawing keeps following the cursor when
   * it leaves the canvas (and so mouseup outside the canvas still finishes the stroke).
   */
  const startPointerDragCapture = () => {
    stopPointerDragCapture()
    const onWinMove = (ev: MouseEvent) => {
      shiftHeldRef.current = ev.shiftKey
      handlePointerMoveRef.current(clientToCanvas(ev))
    }
    const onWinUp = (ev: MouseEvent) => {
      shiftHeldRef.current = ev.shiftKey
      stopPointerDragCapture()
      handlePointerUpRef.current(clientToCanvas(ev))
    }
    window.addEventListener('mousemove', onWinMove)
    window.addEventListener('mouseup', onWinUp)
    pointerDragCleanupRef.current = () => {
      window.removeEventListener('mousemove', onWinMove)
      window.removeEventListener('mouseup', onWinUp)
    }
  }

  const handlePointerMoveRef = useRef<(pt: Pt) => void>(() => {})
  const handlePointerUpRef = useRef<(pt: Pt) => void>(() => {})

  // Reset transient preview / polygon state whenever the tool changes.
  // Leaving Select finalizes temporary marquee pixels back onto their source layers.
  const prevToolRef = useRef(tool)
  useEffect(() => {
    const prev = prevToolRef.current
    prevToolRef.current = tool
    stopPointerDragCapture()
    baseTransformRef.current = null
    if (prev === 'select' && tool !== 'select') {
      if (!floatRef.current && marqueeRef.current) {
        clipActionsRef.current.liftMarquee()
      }
      if (floatRef.current) clipActionsRef.current.commitFloat()
      marqueeRef.current = null
      marqueeStartRef.current = null
      setHasMarquee(false)
    }
    if (textEditIdRef.current) endTextEditRef.current()
    clearPreview()
    polyPts.current = []
    polyDblClickSkippedRef.current = false
    lineDragRef.current = null
    objectPaintStrokeRef.current = null
    drawing.current = false
    if (cropSessionRef.current && tool !== 'pointer' && tool !== 'reshape') {
      applyStampCropRef.current()
    }
    if (
      tool !== 'line' && tool !== 'freepoly' && tool !== 'pointer' &&
      tool !== 'text' && tool !== 'brush' && tool !== 'eraser' && tool !== 'fill' &&
      tool !== 'reshape'
    ) {
      selectedIdRef.current = null
      setSelectedId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  useEffect(() => {
    const cs = cropSessionRef.current
    if (cs && cs.id !== selectedId) applyStampCropRef.current()
  }, [selectedId])

  useEffect(() => () => stopPointerDragCapture(), [])

  // Keep the line overlay + handles in sync with line/selection/tool state.
  useEffect(() => {
    const sel = linesRef.current.find((l) => l.id === selectedIdRef.current)
    if (sel && !isVectorVisible(sel)) {
      selectedIdRef.current = null
      setSelectedId(null)
      setSelectedLayerIds((prev) => {
        const next = new Set(prev)
        for (const id of prev) {
          const item = linesRef.current.find((l) => l.id === id)
          if (!item || !isVectorVisible(item)) next.delete(id)
        }
        return next
      })
      clearPreview()
    }
    redrawLines()
    if (floatRef.current || marqueeRef.current) drawSelOverlay()
    else if (tool === 'pointer' || tool === 'reshape') drawHandles()
    else clearPreview()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, selectedId, selectedLayerIds, selectedBaseLayer, tool])

  // Fingerprint of every visibility checkbox. Remounting the display canvas on
  // change defeats Chromium's transformed-layer bitmap cache (stale frames after
  // uncheck). When nothing is visible, CSS-hide the canvas so the checkerboard
  // always shows through even if a GPU texture lags one frame.
  const layerVisibilitySig = useMemo(() => {
    const bases = `${editContent ? 1 : 0}:${editContainer && containerUsable ? 1 : 0}`
    const objects = lines
      .map((l) => `${l.id}:${(l.visible ?? l.editable ?? true) === false ? 0 : 1}:${l.parentId ?? ''}:${l.marqueeItem ? 1 : 0}`)
      .join('|')
    return `${bases}::${objects}`
  }, [editContent, editContainer, containerUsable, lines])
  const anythingLayerVisible = useMemo(() => {
    if (editContent || (editContainer && containerUsable)) return true
    return lines.some((l) =>
      !l.marqueeItem && (l.visible ?? l.editable ?? true) !== false
    )
  }, [editContent, editContainer, containerUsable, lines])

  // Keep object overlays refreshed when base-layer editability changes.
  useEffect(() => {
    const containerVisible = editContainer && containerUsable
    // A lifted marquee temporarily owns pixels removed from every checked
    // source canvas. Finalize it before hiding either source so toggling a
    // layer can never permanently discard those pixels.
    if (
      floatRef.current &&
      (
        (!editContent && floatRef.current.sourceLayer === 'content') ||
        (!containerVisible && floatRef.current.sourceLayer === 'container')
      )
    ) {
      clipActionsRef.current.commitFloat()
    }
    const sel = linesRef.current.find((l) => l.id === selectedIdRef.current)
    if (sel && !isVectorVisible(sel)) {
      selectedIdRef.current = null
      setSelectedId(null)
    }
    clearPreview()
    if (floatRef.current || marqueeRef.current) drawSelOverlay()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editContainer, editContent, containerUsable])

  // Paint after the display canvas remounts on a visibility change (new ref).
  useLayoutEffect(() => {
    clearPreview()
    redrawLinesRef.current()
    if (floatRef.current || marqueeRef.current) drawSelOverlay()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerVisibilitySig])

  const strokeStyleFor = (ctx: CanvasRenderingContext2D) => {
    const c = pixelColor(color)
    ctx.lineWidth = size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = c
    ctx.fillStyle = c
  }

  // Flattened composite (eyedropper + save snapshot).
  // Order: live base → live Inner vectors → overlay → session vectors.
  const compositeCanvas = (): HTMLCanvasElement => {
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const x = c.getContext('2d')!
    for (const id of [...layerOrderRef.current].reverse()) {
      if (layerIsEditable(id)) paintStackSlot(x, id)
      else paintStackSlot(x, id, { base: false, overlay: false })
    }
    return c
  }

  /**
   * Overlays + vectors only (no live bases) for outside preview/export.
   * Skip linkedOutsideText / contentBound — those stay as live Inner settings
   * outside so size/offset/shadow/text edits update without re-opening Paint.
   * When `layer` is set, only that paint stack is included.
   * `baseFilter` limits which content/container roots are drawn (Apply Edit split).
   */
  const decorationsCanvas = (
    layer?: PaintLayerId,
    includeLinkedText = false,
    includeContentBound = false,
    /** Bake live Inner base under overlay so see-through holes reveal Outer outside Paint. */
    includeContentBase = false,
    baseFilter: 'all' | 'above' | 'below' = 'all'
  ): HTMLCanvasElement => {
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const x = c.getContext('2d')!
    const show = (l: LineObj) =>
      (includeContentBound || (!l.contentBound && !l.contentProxySlot)) &&
      // Letter-bake stamps keep linkedOutsideText for TE→BO sync, but they are
      // already rasterized paint results — always include them when baking content
      // (otherwise Save skips the stamp, empties decorations, and live white returns).
      (includeLinkedText ||
        !l.linkedOutsideText ||
        (includeContentBound && l.type === 'stamp')) &&
      (l.visible ?? l.editable ?? true) !== false
    const ids = layer
      ? [layer]
      : [...layerOrderRef.current].reverse()
    for (const id of ids) {
      const roots = linesRef.current.filter((l) => !l.parentId && vectorLayerOf(l) === id)
      const indexOf = (l: LineObj) => linesRef.current.findIndex((item) => item.id === l.id)
      const belowRoots = roots.filter((l) => l.belowBase).sort((a, b) => indexOf(a) - indexOf(b))
      const aboveRoots = roots.filter((l) => !l.belowBase).sort((a, b) => indexOf(a) - indexOf(b))
      type DecorStep = { kind: 'object'; l: LineObj }
      const paintObjectStep = (t: CanvasRenderingContext2D, l: LineObj) => {
        renderObjectTree(t, l, linesRef.current, show)
        // Always dest-out see-through masks — even when punchThrough also cuts below.
        if (show(l)) {
          if (
            hasSeeThroughCoverage(l.id) ||
            (!l.punchThrough && l.punchMask) ||
            (!l.punchThrough &&
              !l.punchEnclosedHole &&
              (seeThroughMaskCanvases.has(l.id) || seeThroughMaskBits.has(l.id)))
          ) {
            destOutLocalPunch(t, l, 'see-through')
          }
          if (
            !l.punchThrough &&
            !hasSeeThroughCoverage(l.id) &&
            (l.punchMask ||
              (!l.punchEnclosedHole && (punchMaskCanvases.has(l.id) || punchMaskBits.has(l.id))))
          ) {
            destOutLocalPunch(t, l, 'punch')
          }
        }
      }
      const allSteps = (items: LineObj[]): DecorStep[] => items.map((l) => ({ kind: 'object' as const, l }))
      const includeBelow = baseFilter === 'all' || baseFilter === 'below'
      const includeAbove = baseFilter === 'all' || baseFilter === 'above'
      const includeOverlay = baseFilter === 'all' || baseFilter === 'above'
      const belowSteps = includeBelow ? allSteps(belowRoots) : []
      const aboveSteps = includeAbove ? allSteps(aboveRoots) : []
      const tmp = takeCanvas(W, H)
      try {
        const t = tmp.getContext('2d')!
        for (const step of belowSteps) paintObjectStep(t, step.l)
        if (includeContentBase && includeOverlay && id === 'content') {
          t.drawImage(baseCanvas(id), 0, 0)
        }
        if (includeOverlay) {
          t.drawImage(layerCanvas(id), 0, 0)
        }
        for (const step of aboveSteps) paintObjectStep(t, step.l)
        x.drawImage(tmp, 0, 0)
      } finally {
        releaseCanvas(tmp)
      }
      const punchSteps = [...belowSteps, ...aboveSteps]
      for (let i = 0; i < punchSteps.length; i++) {
        const l = punchSteps[i].l
        if (!show(l)) continue
        if (l.punchMask && !l.punchThrough) continue
        if (l.type !== 'group' && !l.punchThrough) continue
        punchObjectFromComposite(x, l, linesRef.current, show)
        for (let j = i + 1; j < punchSteps.length; j++) {
          paintObjectStep(x, punchSteps[j].l)
        }
      }
    }
    return c
  }

  // ── Flood fill (single layer) ────────────────────────────────────────────────
  // Session vector items (lines/shapes/text drawn this session) act as walls so
  // fill stops at their strokes/fills instead of flooding the whole background.
  // Optional edge-clean pass fills thin anti-aliased / leftover outline fringes
  // next to the filled region, but skips thick opaque borders (designed on purpose).
  const fillStampPixels = (item: LineObj, canvasPoint: Pt): LineObj | null => {
    if (item.type !== 'stamp' || !item.imageDataUrl || item.pts.length < 2) return null
    const a = item.pts[0], b = item.pts[1]
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    const displayW = Math.max(1, Math.abs(b.x - a.x))
    const displayH = Math.max(1, Math.abs(b.y - a.y))
    const localPoint = rotatePt(canvasPoint, objCenter(item), -(item.rot ?? 0))
    if (
      localPoint.x < x || localPoint.y < y ||
      localPoint.x > x + displayW || localPoint.y > y + displayH
    ) return null

    const image = ensureStampImage(item.imageDataUrl)
    if (!image) return null
    // Edit at the stamp's native pixel grid — never rescale through display size
    // (that softens edges; the next Fill then hardens AA and grows the silhouette).
    const width = Math.max(1, image.naturalWidth || image.width)
    const height = Math.max(1, image.naturalHeight || image.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(image, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    const px = Math.max(0, Math.min(width - 1, Math.floor(((localPoint.x - x) / displayW) * width)))
    const py = Math.max(0, Math.min(height - 1, Math.floor(((localPoint.y - y) / displayH) * height)))
    const clickedIndex = (py * width + px) * 4
    const tr = data[clickedIndex], tg = data[clickedIndex + 1]
    const tb = data[clickedIndex + 2], ta = data[clickedIndex + 3]
    const fill = pixelColor(color)
    const fr = parseInt(fill.slice(1, 3), 16)
    const fg = parseInt(fill.slice(3, 5), 16)
    const fb = parseInt(fill.slice(5, 7), 16)
    const fa = parseInt(fill.slice(7, 9) || 'ff', 16)
    let changed = false

    if (ta > 8) {
      // Connected section only — unconnected same-colour islands stay until clicked.
      const region = floodFillConnected(width, height, px, py, (i) => {
        if (data[i + 3] <= 8) return false
        return Math.abs(data[i] - tr) + Math.abs(data[i + 1] - tg) + Math.abs(data[i + 2] - tb) <= 40
      })
      let opaqueN = 0
      let filledN = 0
      for (let p = 0; p < width * height; p++) {
        const i = p * 4
        if (data[i + 3] <= 8) continue
        opaqueN++
        if (!region[p]) continue
        filledN++
        const srcA = data[i + 3]
        data[i] = fr
        data[i + 1] = fg
        data[i + 2] = fb
        // Preserve coverage alpha — do not promote fringe to opaque (expands shape).
        data[i + 3] = Math.round((srcA * fa) / 255)
        changed = true
      }
      if (!changed) return null
      ctx.putImageData(imageData, 0, 0)
      const imageDataUrl = canvas.toDataURL('image/png')
      ensureStampImage(imageDataUrl, () => redrawLinesRef.current())
      // Near-complete stamp recolour may sync live fillColor; partial fills must
      // keep islands and bake the raster on Save (do not set proxy.color to fill).
      const nearComplete = opaqueN > 0 && filledN / opaqueN >= 0.95
      const keepMarks = !!item.colorMarkPng
      return {
        ...item,
        imageDataUrl,
        ...(nearComplete && !keepMarks ? { color: fill } : {}),
        // Keep contentBound + marks for Save sync; bake only when no Match map.
        // Do not overwrite imageSourceDataUrl with remapped display (double-remap outside).
        rasterEdited: keepMarks ? !!item.rasterEdited : true,
        imageUseOriginalColors: keepMarks ? false : item.imageUseOriginalColors,
        sourceSvgMarkup: undefined,
        sourceStampSize: undefined,
        keepStrokeOnResize: undefined
      }
    } else {
      // Transparent padding / counters: do not paint the stamp.
      return null
    }
  }

  /**
   * Flood-fill one connected region of a stamp/shape/text, stopping at brush/
   * eraser cuts on the object and at overlay paint that crosses it.
   */
  const fillObjectRespectingCuts = (item: LineObj, canvasPoint: Pt): LineObj | null => {
    if (item.type !== 'stamp' && item.type !== 'shape' && item.type !== 'poly' && item.type !== 'text') {
      return null
    }
    const canvas = takeCanvas(W, H)
    const interiorCanvas = takeCanvas(W, H)
    try {
      const ctx = canvas.getContext('2d')!
      const interiorCtx = interiorCanvas.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      interiorCtx.imageSmoothingEnabled = false
      renderLine(interiorCtx, { ...item, paintStrokes: undefined, shadow: false }, { skipHole: true })
      renderLine(ctx, { ...item, shadow: false }, { skipHole: true })
      const obj = ctx.getImageData(0, 0, W, H)
      const od = obj.data
      const interior = interiorCtx.getImageData(0, 0, W, H).data
      const clickX = Math.max(0, Math.min(W - 1, Math.floor(canvasPoint.x)))
      const clickY = Math.max(0, Math.min(H - 1, Math.floor(canvasPoint.y)))
      const clickI = (clickY * W + clickX) * 4
      // Soft fringe may receive the click, but flood must use a solid-ink
      // threshold so AA does not bridge separated islands (i-dot vs stem).
      const inkHitT = item.type === 'text' ? 28 : 80
      const inkT = item.type === 'text' ? 140 : 80
      // Counters (empty space inside "b") are not glyph ink. Do not spiral onto
      // the letter and punch the character instead of the hole.
      if (interior[clickI + 3] < inkHitT && od[clickI + 3] < inkHitT) return null
      const overlay = layerCanvas(vectorLayerOf(item)).getContext('2d')?.getImageData(0, 0, W, H)
      const ov = overlay?.data
      const rgbCut = (i: number) =>
        Math.abs(interior[i] - od[i]) +
        Math.abs(interior[i + 1] - od[i + 1]) +
        Math.abs(interior[i + 2] - od[i + 2]) > 48
      const isCut = (i: number) => {
        if (ov && ov[i + 3] > 8) return true
        const ia = interior[i + 3]
        const fa = od[i + 3]
        if (ia > 2 && fa <= 2) return true
        if (ia > 2 && fa > 2 && rgbCut(i)) return true
        return false
      }
      const seed = findFillSeed(W, H, canvasPoint.x, canvasPoint.y, (x, y) => {
        const i = (y * W + x) * 4
        return interior[i + 3] >= inkT && !isCut(i)
      })
      if (!seed) return null
      const seedI = (seed.y * W + seed.x) * 4
      const tr = interior[seedI], tg = interior[seedI + 1], tb = interior[seedI + 2]
      // Text: solid-ink islands only (threshold above). Soft AA fringe is added
      // in the growth pass so it cannot bridge the gap under an "i" tittle.
      // Other types keep colour matching.
      const region = floodFillConnected(W, H, seed.x, seed.y, (i) => {
        if (interior[i + 3] < inkT) return false
        if (isCut(i)) return false
        if (item.type === 'text') return true
        return Math.abs(interior[i] - tr) + Math.abs(interior[i + 1] - tg) + Math.abs(interior[i + 2] - tb) <= 48
      })
      // Solid recolour on text: grow into soft AA so fringe does not remain.
      // One ring only — never iterative — so growth cannot bridge island gaps.
      // Shapes/poly/stamps must NOT grow — that expands the silhouette.
      // Transparent punch/see-through: never grow (enlarges holes / fringe lines).
      if (!isTransparentPaintColor(color) && item.type === 'text') {
        const dirs4: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
        const grow = new Uint8Array(region.length)
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const p = y * W + x
            if (region[p]) continue
            const i = p * 4
            const a = interior[i + 3]
            if (a <= 8 || a >= inkT) continue
            if (isCut(i)) continue
            let adj = false
            for (const [dx, dy] of dirs4) {
              const nx = x + dx, ny = y + dy
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
              if (region[ny * W + nx]) { adj = true; break }
            }
            if (adj) grow[p] = 1
          }
        }
        for (let p = 0; p < grow.length; p++) {
          if (grow[p]) region[p] = 1
        }
      }
      // Text solid fill: harden AA to full cover so recolour does not leave
      // fringe that compounds on every Fill.
      const fill = pixelColor(color)
      const fr = parseInt(fill.slice(1, 3), 16)
      const fg = parseInt(fill.slice(3, 5), 16)
      const fb = parseInt(fill.slice(5, 7), 16)
      const fa = parseInt(fill.slice(7, 9) || 'ff', 16)
      let flooded = 0
      let opaque = 0
      let wallHits = 0
      let uncoveredSolid = 0
      for (let p = 0; p < W * H; p++) {
        const i = p * 4
        if (interior[i + 3] > 2) {
          opaque++
          if (isCut(i)) wallHits++
        }
        if (
          item.type === 'text' &&
          interior[i + 3] >= inkT &&
          !isCut(i) &&
          !region[p]
        ) {
          uncoveredSolid++
        }
        if (!region[p]) continue
        od[i] = fr
        od[i + 1] = fg
        od[i + 2] = fb
        if (item.type === 'text' && !isTransparentPaintColor(color)) {
          // Flatten soft edges to solid so repeated fills do not stack fringe.
          od[i + 3] = fa
        } else if (!isTransparentPaintColor(color)) {
          // Preserve coverage — promoting fringe to opaque expands the silhouette.
          const srcA = interior[i + 3]
          od[i + 3] = Math.round((srcA * fa) / 255)
        } else {
          od[i + 3] = interior[i + 3] >= 180 ? fa : Math.round((interior[i + 3] * fa) / 255)
        }
        flooded++
      }
      if (!flooded) return null
      const punch = transparentFillPunch()
      const transparent = isTransparentPaintColor(color)
      const nearlyWhole = wallHits === 0 && opaque > 0 && flooded >= opaque * 0.98

      if (transparent && punch) {
        const clickP = Math.max(0, Math.min(W * H - 1, Math.floor(canvasPoint.y) * W + Math.floor(canvasPoint.x)))
        const px = clickP % W
        const py = (clickP / W) | 0
        const punchBits = punchMaskBits.get(item.id)
        const stBits = seeThroughMaskBits.get(item.id)
        // Already punch under click — do not merge/grow.
        if (punchBits && punchBits.length === W * H && punchBits[clickP]) {
          syncHoleFlags(item as HoleItem)
          return {
            ...item,
            punchThrough: hasPunchCoverage(item.id),
            punchEnclosedHole: !!item.punchEnclosedHole
          }
        }
        // Click on existing see-through hole → move that connected region to punch.
        if (stBits && stBits.length === W * H && stBits[clickP]) {
          const holeRegion = floodFillConnected(W, H, px, py, (byteI) => !!stBits[(byteI / 4) | 0])
          moveConnectedRegionToMode(item as HoleItem, holeRegion, 'punch', W, H, holeGeom)
          return {
            ...item,
            punchThrough: hasPunchCoverage(item.id),
            punchEnclosedHole: !!item.punchEnclosedHole || hasSeeThroughCoverage(item.id)
          }
        }
        setLocalPunchFromFilled(item, region, W, H, { mode: 'punch' })
        if (nearlyWhole) {
          return {
            ...item,
            punchThrough: hasPunchCoverage(item.id),
            punchEnclosedHole: false,
            ...(item.type === 'shape' || item.type === 'poly' ? { fill: true as const } : {}),
            ...(item.type === 'text' || item.type === 'stamp' ? {} : { borderColor: item.borderColor })
          }
        }
        return {
          ...item,
          punchThrough: hasPunchCoverage(item.id),
          punchEnclosedHole: false
        }
      }

      if (transparent && !punch) {
        const clickP = Math.max(0, Math.min(W * H - 1, Math.floor(canvasPoint.y) * W + Math.floor(canvasPoint.x)))
        const px = clickP % W
        const py = (clickP / W) | 0
        const punchBits = punchMaskBits.get(item.id)
        const stBits = seeThroughMaskBits.get(item.id)
        // Click on existing punch hole → move that connected region to see-through.
        if (punchBits && punchBits.length === W * H && punchBits[clickP]) {
          const holeRegion = floodFillConnected(W, H, px, py, (byteI) => !!punchBits[(byteI / 4) | 0])
          moveConnectedRegionToMode(item as HoleItem, holeRegion, 'see-through', W, H, holeGeom)
          return {
            ...item,
            punchThrough: hasPunchCoverage(item.id),
            punchEnclosedHole: true,
            ...(item.type === 'shape' || item.type === 'poly' ? { fill: true as const } : {})
          }
        }
        // Already see-through under click — do not grow.
        if (stBits && stBits.length === W * H && stBits[clickP]) {
          syncHoleFlags(item as HoleItem)
          return {
            ...item,
            punchThrough: hasPunchCoverage(item.id),
            punchEnclosedHole: true,
            ...(item.type === 'shape' || item.type === 'poly' ? { fill: true as const } : {})
          }
        }
        setLocalPunchFromFilled(item, region, W, H, { mode: 'see-through' })
        if (nearlyWhole && item.type !== 'stamp' && !hasPunchCoverage(item.id)) {
          // Whole-glyph see-through: keep live colour; flags from coverage.
          return {
            ...item,
            punchThrough: false,
            punchEnclosedHole: false,
            ...(item.type === 'shape' || item.type === 'poly' ? { fill: true as const } : {})
          }
        }
        return {
          ...item,
          punchThrough: hasPunchCoverage(item.id),
          punchEnclosedHole: !!item.punchEnclosedHole || hasSeeThroughCoverage(item.id),
          ...(item.type === 'shape' || item.type === 'poly' ? { fill: true as const } : {}),
          ...(item.type === 'stamp' || item.type === 'text' ? {} : { borderColor: item.borderColor })
        }
      }

      let keepPunch = false
      if (!transparent) {
        const hadHole =
          item.punchThrough ||
          hasPunchCoverage(item.id) ||
          hasSeeThroughCoverage(item.id)
        const stillPunched = hadHole && subtractLocalPunchRegion(item, region, W, H)
        keepPunch = punch || stillPunched
        // Whole remaining solid ink → keep editable vector (one colour).
        // Any other solid island left (i-dot vs stem, or another letter) → bake
        // so only the flooded section changes colour.
        if (item.type === 'text') {
          const wholeGlyph = uncoveredSolid === 0
          if (wholeGlyph) {
            return {
              ...item,
              color: firstSolidColor(color),
              punchThrough: hasPunchCoverage(item.id),
              punchEnclosedHole: keepPunch ? item.punchEnclosedHole : false
            }
          }
          // Fall through to sectional stamp bake below.
        } else if ((item.type === 'shape' || item.type === 'poly') && !item.paintStrokes?.length) {
          // Shapes/polys stay vector on solid Fill — baking expands and blurs edges
          // on every repeat, and re-rasterises untouched ST sections.
          return {
            ...item,
            color: firstSolidColor(color),
            fill: true,
            punchThrough: hasPunchCoverage(item.id),
            punchEnclosedHole: keepPunch ? item.punchEnclosedHole : false
          }
        }
      }

      ctx.putImageData(obj, 0, 0)
      const bounds = bakeCropBoundsFromCanvas(item, canvas)
      if (!bounds) {
        return {
          ...item,
          color: firstSolidColor(color),
          punchThrough: hasPunchCoverage(item.id)
        }
      }
      const cropped = takeCanvas(Math.max(1, Math.round(bounds.w)), Math.max(1, Math.round(bounds.h)))
      try {
        const cctx = cropped.getContext('2d')!
        cctx.imageSmoothingEnabled = false
        cctx.drawImage(
          canvas,
          bounds.x, bounds.y, bounds.w, bounds.h,
          0, 0, cropped.width, cropped.height
        )
        const imageDataUrl = cropped.toDataURL('image/png')
        ensureStampImage(imageDataUrl, () => redrawLinesRef.current())
        const bakeXform = lineNeedsDisplayTransform(item)
        const converted: LineObj = {
          ...item,
          type: 'stamp',
          pts: [
            { x: bounds.x, y: bounds.y },
            { x: bounds.x + bounds.w, y: bounds.y + bounds.h }
          ],
          rot: bakeXform ? 0 : item.rot,
          scaleX: bakeXform ? 1 : item.scaleX,
          scaleY: bakeXform ? 1 : item.scaleY,
          imageDataUrl,
          stampSource: item.stampSource ?? 'image',
          paintStrokes: undefined,
          sourceSvgMarkup: undefined,
          sourceStampSize: undefined,
          keepStrokeOnResize: undefined,
          // Keep link + glyph string so double-click can restore editable text.
          linkedOutsideText: item.linkedOutsideText,
          text: item.text,
          // Baked pixels own colour/alpha (including see-through holes).
          color: transparent ? fill : firstSolidColor(color),
          punchThrough: keepPunch,
          punchEnclosedHole: keepPunch ? item.punchEnclosedHole : false
        }
        if (bakeXform && (punchMaskCanvases.has(item.id) || seeThroughMaskCanvases.has(item.id))) {
          rewritePunchBitsFromLocal(item, W, H)
          const punchBits = punchMaskBits.get(item.id)
          const stBits = seeThroughMaskBits.get(item.id)
          punchMaskCanvases.delete(item.id)
          seeThroughMaskCanvases.delete(item.id)
          if (punchBits) {
            setLocalPunchFromFilled(converted, punchBits, W, H, {
              mode: 'punch',
              replace: true,
              skipOtherSubtract: true
            })
          }
          if (stBits) {
            setLocalPunchFromFilled(converted, stBits, W, H, {
              mode: 'see-through',
              replace: true,
              skipOtherSubtract: true
            })
          }
        }
        return converted
      } finally {
        releaseCanvas(cropped)
      }
    } finally {
      releaseCanvas(canvas)
      releaseCanvas(interiorCanvas)
    }
  }

  /** Click lands inside this object's punch / see-through hole mask. */
  const objectPunchHoleAt = (item: LineObj, canvasPoint: Pt): boolean => {
    const checkBits = (bits: Uint8Array | undefined): boolean => {
      if (!bits || bits.length !== W * H) return false
      const px = Math.max(0, Math.min(W - 1, Math.floor(canvasPoint.x)))
      const py = Math.max(0, Math.min(H - 1, Math.floor(canvasPoint.y)))
      if (bits[py * W + px]) return true
      for (let r = 1; r <= 3; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
            const nx = px + dx
            const ny = py + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            if (bits[ny * W + nx]) return true
          }
        }
      }
      return false
    }
    return checkBits(punchMaskBits.get(item.id)) || checkBits(seeThroughMaskBits.get(item.id))
  }

  /** True when this object (or a group child) actually has fillable ink at the point. */
  const objectOwnsFillClick = (item: LineObj, canvasPoint: Pt): boolean => {
    const l = checkedGroupTarget(item) ?? item
    if (l.type === 'group') {
      return descendantIds(l.id).some((id) => {
        const child = linesRef.current.find((c) => c.id === id)
        return !!child && child.type !== 'group' && objectOwnsFillClick(child, canvasPoint)
      })
    }
    if (objectPunchHoleAt(l, canvasPoint)) return true
    // Letter counters (empty bowls) belong to the text object for transparent Fill.
    if (pointInObjectEnclosedCounter(l, canvasPoint.x, canvasPoint.y)) return true
    if (l.type === 'text') return textFillHit(l, canvasPoint, W, H) != null
    if (l.type === 'stamp' || l.type === 'shape' || l.type === 'poly') {
      return paintObjectHit(l, canvasPoint, W, H) != null
    }
    if (l.type === 'shape' && l.pts.length >= 2) {
      const local = rotatePt(canvasPoint, objCenter(l), -(l.rot ?? 0))
      return pointInRect(l.pts[0], l.pts[1], local)
    }
    if (l.type === 'poly') return pointInPoly(flattenLine(l), canvasPoint)
    return false
  }

  const addPunchFromConnectedShadow = (
    item: LineObj,
    canvasPoint: Pt,
    punchThrough: boolean
  ) => {
    const withS = takeCanvas(W, H)
    const noS = takeCanvas(W, H)
    try {
      const withCtx = withS.getContext('2d')!
      const noCtx = noS.getContext('2d')!
      renderLineBase(withCtx, { ...item, punchThrough: false })
      renderLineBase(noCtx, { ...item, shadow: false, punchThrough: false })
      const a = withS.getImageData(0, 0, W, H).data
      const b = noS.getImageData(0, 0, W, H).data
      const shadowPx = new Uint8Array(W * H)
      for (let p = 0; p < W * H; p++) {
        if (a[p * 4 + 3] > 12 && b[p * 4 + 3] <= 12) shadowPx[p] = 1
      }
      const seed = findFillSeed(W, H, canvasPoint.x, canvasPoint.y, (x, y) => !!shadowPx[y * W + x])
      if (!seed) return
      const region = floodFillConnected(W, H, seed.x, seed.y, (i) => !!shadowPx[(i / 4) | 0])
      addPunchStampFromMask(region, vectorLayerOf(item), punchThrough)
    } finally {
      releaseCanvas(withS)
      releaseCanvas(noS)
    }
  }

  const fillSelectedObjectLayer = (canvasPoint: Pt): boolean => {
    // Fill follows the clicked object even when it was not selected beforehand.
    // Include shape/poly (not only stamp/text) — otherwise Fill falls through to
    // layer floodFill, which creates free punch stamps / Outer sync (looks like Punch).
    // Do not skip live Inner when the overlay has paint: object-local see-through
    // must still win over layer flood.
    const clicked = topmostPaintHit((item) => {
      if (item.punchMask || !isPaintHitVisible(item)) return false
      if (
        item.type !== 'stamp' &&
        item.type !== 'text' &&
        item.type !== 'shape' &&
        item.type !== 'poly'
      ) {
        return false
      }
      return objectOwnsFillClick(item, canvasPoint)
    })
    const selectedExisting = linesRef.current.find((item) => item.id === selectedIdRef.current)
    const selectedHit =
      selectedExisting &&
      isPaintHitVisible(selectedExisting) &&
      objectOwnsFillClick(selectedExisting, canvasPoint)
    const selected = clicked ?? (selectedHit ? selectedExisting : undefined)
    if (!selected || !isPaintHitVisible(selected)) return false
    const target = checkedGroupTarget(selected) ?? selected
    // Always fill the clicked object. Multi-select only expands when the click
    // landed on one of the selected ids — otherwise punched-hole fills on an
    // unselected shape silently no-op.
    const targetIds =
      target.type === 'group'
        ? descendantIds(target.id)
        : selectedLayerIds.size > 1 && selectedLayerIds.has(target.id)
          ? new Set(
              [...selectedLayerIds].filter((layerId) =>
                linesRef.current.some((item) => item.id === layerId && item.type !== 'group')
              )
            )
          : new Set([target.id])
    const fillColor = pixelColor(color)
    const punch = transparentFillPunch()
    const transparent = isTransparentPaintColor(color)
    const imageUrls: string[] = []
    let changed = false
    let textFillKind: 'glyph' | 'shadow' | null = null
    const shadowPunches: LineObj[] = []
    // Solid hole refills must also drop overlapping free punchMask stamps —
    // otherwise Save re-exports them as punchMasks and Outer looks white (page).
    const solidHoleClears: { region: Uint8Array; layer: PaintLayerId }[] = []

    const next = linesRef.current.map((item): LineObj => {
      if (!targetIds.has(item.id) || item.type === 'group') return item
      const hit = paintObjectHit(item, canvasPoint, W, H)
      if (punchMaskCanvases.has(item.id) || seeThroughMaskCanvases.has(item.id)) {
        rewritePunchBitsFromLocal(item, W, H)
      }
      const inPunchHole = objectPunchHoleAt(item, canvasPoint)
      if (hit === 'shadow') {
        textFillKind = 'shadow'
        changed = true
        if (transparent) {
          shadowPunches.push(item)
          return item
        }
        return { ...item, shadow: true, shadowColor: fillColor }
      }

      // Transparent Fill: prefer a sectional flood (one glyph / connected region).
      // Whole-object transparentObjectPatch is for colour-picker / mode toggle.
      if (
        transparent &&
        (item.type === 'stamp' || item.type === 'text' || item.type === 'shape' || item.type === 'poly')
      ) {
        // Already punched: Punch Fill must not enlarge; See-through moves that pocket.
        // Check before counter flood — flood would merge/grow the existing hole.
        if (punch && inPunchHole) {
          const stBits = seeThroughMaskBits.get(item.id)
          const px = Math.max(0, Math.min(W - 1, Math.floor(canvasPoint.x)))
          const py = Math.max(0, Math.min(H - 1, Math.floor(canvasPoint.y)))
          // Click on see-through → promote that connected region to punch.
          if (stBits && stBits.length === W * H && stBits[py * W + px]) {
            const holeRegion = floodFillConnected(W, H, px, py, (byteI) => !!stBits[(byteI / 4) | 0])
            moveConnectedRegionToMode(item as HoleItem, holeRegion, 'punch', W, H, holeGeom)
          }
          changed = true
          if (item.type === 'text') textFillKind = 'glyph'
          return {
            ...item,
            punchThrough: hasPunchCoverage(item.id),
            punchEnclosedHole: !!item.punchEnclosedHole || hasSeeThroughCoverage(item.id)
          }
        }
        if (!punch && inPunchHole) {
          const punchBits = punchMaskBits.get(item.id)
          const px = Math.max(0, Math.min(W - 1, Math.floor(canvasPoint.x)))
          const py = Math.max(0, Math.min(H - 1, Math.floor(canvasPoint.y)))
          if (punchBits && punchBits.length === W * H && punchBits[py * W + px]) {
            const holeRegion = floodFillConnected(W, H, px, py, (byteI) => !!punchBits[(byteI / 4) | 0])
            moveConnectedRegionToMode(item as HoleItem, holeRegion, 'see-through', W, H, holeGeom)
          }
          changed = true
          if (item.type === 'text') textFillKind = 'glyph'
          return {
            ...item,
            punchThrough: hasPunchCoverage(item.id),
            punchEnclosedHole: true,
            ...(item.type === 'shape' || item.type === 'poly' ? { fill: true } : {})
          }
        }
        // Letter / shape counters first — never treat Outer-through-counter as a
        // whole-glyph wipe or an Outer flood (looks like Punch in Paint).
        if (fillEnclosedCounterAtPoint(item, canvasPoint, punch)) {
          changed = true
          if (item.type === 'text') textFillKind = 'glyph'
          return {
            ...item,
            punchThrough: hasPunchCoverage(item.id),
            punchEnclosedHole: true
          }
        }
        // Empty letter counters are not glyph ink — leave for layer floodFill
        // only when counter attach above failed.
        if (item.type === 'text' && hit !== 'fill' && hit !== 'shadow' && !inPunchHole) return item
        const sectional = fillObjectRespectingCuts(item, canvasPoint)
        if (sectional) {
          if (sectional.imageDataUrl) imageUrls.push(sectional.imageDataUrl)
          changed = true
          if (item.type === 'text') textFillKind = 'glyph'
          // Glyph-ink transparent fill: keep as local hole (see-through) or stack
          // punch — never flip the live colour to transparent (hides whole text).
          return {
            ...sectional,
            color: isTransparentPaintColor(sectional.color ?? '')
              ? item.color
              : sectional.color,
            punchThrough: hasPunchCoverage(item.id),
            punchEnclosedHole: !!sectional.punchEnclosedHole
          }
        }
        // Text with no sectional hit (e.g. counter) — do not whole-object punch.
        if (item.type === 'text') return item
        // Already has punch / see-through pockets: never promote a single-section
        // click into whole-shape transparent (common on punched characters).
        if (
          objectHasFillHole(item) ||
          hasPunchCoverage(item.id) ||
          hasSeeThroughCoverage(item.id) ||
          !!item.punchEnclosedHole
        ) {
          return item
        }
        // Shape / stamp / poly with no prior hole: whole-object see-through or punch.
        changed = true
        const patch = transparentObjectPatch(item, fillColor)
        return { ...item, ...patch }
      }

      // Solid Fill into an existing punch / see-through hole: close that pocket
      // and restore/recolour ink — never Outer flood, never expand the silhouette.
      if (!transparent && (inPunchHole || hasPunchCoverage(item.id) || hasSeeThroughCoverage(item.id))) {
        const punchBits = punchMaskBits.get(item.id)
        const stBits = seeThroughMaskBits.get(item.id)
        const seed = findFillSeed(W, H, canvasPoint.x, canvasPoint.y, (x, y) => {
          const p = y * W + x
          return !!(punchBits?.[p] || stBits?.[p])
        })
        if (!seed && !inPunchHole) {
          // Has holes elsewhere but click is on solid ink — fall through to normal fill.
        } else if (seed || inPunchHole) {
        const sx = seed?.x ?? Math.max(0, Math.min(W - 1, Math.floor(canvasPoint.x)))
        const sy = seed?.y ?? Math.max(0, Math.min(H - 1, Math.floor(canvasPoint.y)))
        const sp = sy * W + sx
        const mode: HoleFillMode =
          punchBits && punchBits.length === W * H && punchBits[sp]
            ? 'punch'
            : stBits && stBits.length === W * H && stBits[sp]
              ? 'see-through'
              : punchBits
                ? 'punch'
                : 'see-through'
        const sourceBits = mode === 'punch' ? punchBits : stBits
        let holeRegion: Uint8Array | null = null
        if (sourceBits && sourceBits.length === W * H) {
          holeRegion = floodFillConnected(W, H, sx, sy, (byteI) => !!sourceBits[(byteI / 4) | 0])
          if (!holeRegion.some((v) => v)) holeRegion = null
        }
        if (holeRegion) {
          // Clear only this mode's pocket. Tiny punch rim only (not ST) so leftover
          // punch rings die without eating adjacent see-through sections.
          if (mode === 'punch') {
            const rim = dilateBitMask(holeRegion, W, H, 1)
            subtractRegionFromMode(item as HoleItem, rim, 'punch', W, H, holeGeom)
          } else {
            subtractRegionFromMode(item as HoleItem, holeRegion, 'see-through', W, H, holeGeom)
          }
          syncHoleFlags(item as HoleItem)

          // Paint the pocket (restored ink or empty counter) without growing bounds.
          // Other ST/punch pockets keep their masks so Fill cannot bleed into them.
          const refilled = refillHolePocket(item, holeRegion, fillColor, W, H)
          if (refilled.imageDataUrl) imageUrls.push(refilled.imageDataUrl)
          solidHoleClears.push({ region: holeRegion, layer: vectorLayerOf(item) })
          changed = true
          if (item.type === 'text') textFillKind = 'glyph'
          return refilled
        }
        }
      }

      if (item.type === 'stamp') {
        // Only edit native stamp pixels — never re-rasterize via fillObjectRespectingCuts
        // (that redraws every section with AA and grows edges on repeat Fill).
        const filled = fillStampPixels(item, canvasPoint)
        if (!filled) return item
        if (filled.imageDataUrl) imageUrls.push(filled.imageDataUrl)
        changed = true
        return { ...filled, punchThrough: hasPunchCoverage(item.id) }
      }
      if (item.type === 'text') {
        const sectional = fillObjectRespectingCuts(item, canvasPoint)
        if (sectional) {
          if (sectional.imageDataUrl) imageUrls.push(sectional.imageDataUrl)
          changed = true
          return { ...sectional, punchThrough: hasPunchCoverage(item.id) }
        }
        if (hit !== 'fill') return item
        textFillKind = 'glyph'
        changed = true
        return { ...item, color: fillColor, punchThrough: hasPunchCoverage(item.id) }
      }
      if (item.type === 'shape' || item.type === 'poly') {
        // Solid Fill on vectors: colour only — never bake to stamp.
        if (!transparent && !item.paintStrokes?.length) {
          changed = true
          return {
            ...item,
            color: fillColor,
            fill: true,
            punchThrough: hasPunchCoverage(item.id),
            punchEnclosedHole:
              hasPunchCoverage(item.id) || hasSeeThroughCoverage(item.id)
                ? item.punchEnclosedHole
                : false
          }
        }
        const filled = fillObjectRespectingCuts(item, canvasPoint)
        if (filled) {
          if (filled.imageDataUrl) imageUrls.push(filled.imageDataUrl)
          changed = true
          return { ...filled, punchThrough: hasPunchCoverage(item.id) }
        }
        changed = true
        return { ...item, color: fillColor, fill: true, punchThrough: hasPunchCoverage(item.id) }
      }
      return { ...item, color: fillColor, borderColor: fillColor, punchThrough: hasPunchCoverage(item.id) }
    })

    if (!changed) return false
    commitLines(next)
    // Solid Fill into a PH/ST pocket: remove overlapping free punchMask stamps so
    // Save cannot destination-out Outer to the page (reads as Outer → white).
    for (const { region, layer } of solidHoleClears) {
      clearPunchHolesOverlapping(region, layer)
    }
    // See-through on a punched hole: also demote free punch-mask stamps under the
    // click so leftover stack-cuts do not keep looking like Punch.
    if (transparent && !punch) {
      demotePunchThroughAtPoint(canvasPoint, { commit: false })
    }
    for (const item of shadowPunches) addPunchFromConnectedShadow(item, canvasPoint, punch)
    if (textFillKind === 'shadow' && !transparent) {
      setTxtShadow(true)
      setTxtShadowColor(fillColor)
    } else if (textFillKind === 'glyph' && !transparent) {
      setColor(fillColor)
      setHexText(fillColor)
    }
    for (const url of imageUrls) ensureStampImage(url, () => redrawLinesRef.current())
    redrawLines()
    drawHandles()
    pushHistory()
    return true
  }

  /**
   * See-through Fill on a punch hole: keep the hole mask but clear punchThrough
   * so layers below (Outer) stay visible instead of cutting to the page.
   * Only runs when the click is inside a hole — not on remaining opaque ink.
   */
  const demotePunchThroughAtPoint = (
    canvasPoint: Pt,
    opts?: { commit?: boolean }
  ): boolean => {
    const px = Math.max(0, Math.min(W - 1, Math.floor(canvasPoint.x)))
    const py = Math.max(0, Math.min(H - 1, Math.floor(canvasPoint.y)))
    const holeAt = (bits: Uint8Array | undefined, x: number, y: number) => {
      if (!bits || bits.length !== W * H) return false
      const p = y * W + x
      if (bits[p]) return true
      // Soft / eroded hole edges: accept a nearby punched pixel.
      for (let r = 1; r <= 3; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            if (bits[ny * W + nx]) return true
          }
        }
      }
      return false
    }
    let changed = false
    const next = linesRef.current.map((l) => {
      if (!l.punchThrough && !l.punchEnclosedHole && !hasPunchCoverage(l.id) && !hasSeeThroughCoverage(l.id)) {
        return l
      }
      const punchBits = punchMaskBits.get(l.id)
      let hit = holeAt(punchBits, px, py)
      // Free punch-mask stamps are entirely hole operators.
      if (!hit && l.punchMask && l.pts.length >= 2) {
        const a = l.pts[0], b = l.pts[1]
        const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y)
        const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
        hit = px >= x0 - 2 && px <= x1 + 2 && py >= y0 - 2 && py <= y1 + 2
      }
      if (!hit) return l
      changed = true
      if (punchBits && punchBits.length === W * H) {
        const holeRegion = floodFillConnected(W, H, px, py, (byteI) => !!punchBits[(byteI / 4) | 0])
        if (holeRegion.some((v) => v)) {
          moveConnectedRegionToMode(l as HoleItem, holeRegion, 'see-through', W, H, holeGeom)
        }
      } else if (
        !l.punchMask &&
        !l.punchEnclosedHole &&
        !hasPunchCoverage(l.id) &&
        !hasSeeThroughCoverage(l.id)
      ) {
        ensureObjectPunchSilhouette(l)
        const bits = punchMaskBits.get(l.id)
        if (bits) {
          moveConnectedRegionToMode(l as HoleItem, bits, 'see-through', W, H, holeGeom)
        }
      }
      return {
        ...l,
        punchThrough: hasPunchCoverage(l.id),
        punchEnclosedHole:
          hasPunchCoverage(l.id) || hasSeeThroughCoverage(l.id)
            ? !!l.punchEnclosedHole
            : false,
        ...(l.type === 'shape' || l.type === 'poly' ? { fill: true as const } : {})
      }
    })
    if (!changed) return false
    linesRef.current = next
    commitLines(next)
    if (opts?.commit !== false) {
      redrawLines()
      pushHistory()
    }
    return true
  }

  const cssPaintColor = (hex: string): string => {
    const s = firstSolidColor(hex)
    return s.startsWith('#') && s.length >= 7 ? s.slice(0, 7) : s
  }

  const recordOuterFill = (kind: 'fill' | 'border' | 'shadow', hex: string) => {
    // Transparent Outer Fill is a hole (see-through / punch) — never promote its
    // RGB to live backgroundColor / containerColor on Save.
    if (isTransparentPaintColor(hex)) return
    const css = cssPaintColor(hex)
    lastOuterFillTargetRef.current = kind
    lastOuterFillColorRef.current = css
    lastOuterFillColorsRef.current = { ...lastOuterFillColorsRef.current, [kind]: css }
    lastOuterFillAllRef.current = false
    // This Fill itself is synced to live colour — later brush work must set the flag.
    preserveOuterOverlayRef.current = false
  }

  const transparentFillPunch = () =>
    isTransparentPaintColor(color) && transparentFillModeRef.current === 'punch'

  /**
   * Build a full-object punch silhouette so Punch hole works when the user sets
   * transparent colour via the picker (not only via Fill → click).
   *
   * Prefer painting into the object-local UV canvas (unrotated). destOutLocalPunch
   * and rewriteDisplayBits then apply rot/scale — so opacity→0 + PH after rotate
   * cuts the rotated silhouette, not an axis-aligned AABB.
   */
  const ensureObjectPunchSilhouette = (item: LineObj) => {
    if (item.punchMask || item.type === 'group') return
    const mode: HoleFillMode =
      transparentFillModeRef.current === 'punch' || item.punchThrough ? 'punch' : 'see-through'
    const box = punchLocalBox(item)
    // Reshape warps display space — keep the display-flood path for those.
    if (box && !lineHasReshapeWarp(item)) {
      const cw = Math.max(1, Math.round(box.w))
      const ch = Math.max(1, Math.round(box.h))
      const canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
      const pctx = canvas.getContext('2d')!
      pctx.imageSmoothingEnabled = false
      pctx.translate(-box.x, -box.y)
      const draft: LineObj = {
        ...item,
        // Local UV only — rot/scale applied later when punching / rewriting bits.
        rot: 0,
        scaleX: 1,
        scaleY: 1,
        transformOrigin: undefined,
        punchThrough: false,
        shadow: false,
        color: '#000000',
        borderColor: '#000000',
        fill: item.type === 'shape' || item.type === 'poly' ? true : item.fill
      }
      renderLineBody(pctx, draft)
      const data = pctx.getImageData(0, 0, cw, ch).data
      let n = 0
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 8) n++
      }
      if (n > 0) {
        const other: HoleFillMode = mode === 'punch' ? 'see-through' : 'punch'
        const canvasMap = mode === 'punch' ? punchMaskCanvases : seeThroughMaskCanvases
        const otherCanvas = mode === 'punch' ? seeThroughMaskCanvases : punchMaskCanvases
        const otherBits = mode === 'punch' ? seeThroughMaskBits : punchMaskBits
        otherCanvas.delete(item.id)
        otherBits.delete(item.id)
        canvasMap.set(item.id, canvas)
        rewriteDisplayBits(item as HoleItem, W, H, holeGeom, mode)
        syncHoleFlags(item as HoleItem)
        return
      }
    }
    const probe = takeCanvas(W, H)
    try {
      const pctx = probe.getContext('2d')!
      pctx.imageSmoothingEnabled = false
      const draft: LineObj = {
        ...item,
        punchThrough: false,
        shadow: false,
        color: '#000000',
        borderColor: '#000000',
        fill: item.type === 'shape' || item.type === 'poly' ? true : item.fill
      }
      // Display-space flood must include rot/scale (renderText alone does not).
      renderLineBase(pctx, draft)
      const data = pctx.getImageData(0, 0, W, H).data
      const filled = new Uint8Array(W * H)
      let n = 0
      for (let p = 0; p < filled.length; p++) {
        if (data[p * 4 + 3] <= 8) continue
        filled[p] = 1
        n++
      }
      if (n > 0) setLocalPunchFromFilled(item, filled, W, H, { mode, replace: true })
    } finally {
      releaseCanvas(probe)
    }
  }

  const clearObjectPunchMasks = (item: LineObj) => {
    clearObjectHoles(item as HoleItem)
  }

  /**
   * Apply colour / opacity to a selected object while keeping punch & see-through
   * pockets empty. Transparent (0%) still uses transparentObjectPatch (hole mode).
   */
  const applySelectedObjectColor = (item: LineObj, nextColor: string): Partial<LineObj> => {
    if (isTransparentPaintColor(nextColor)) {
      return transparentObjectPatch(item, nextColor)
    }
    if (item.type === 'stamp' && item.imageDataUrl) {
      return applyStampColorKeepHoles(item, nextColor)
    }
    return {
      color: nextColor,
      ...(item.type === 'poly' || item.type === 'shape' ? {} : { borderColor: nextColor }),
      punchThrough: hasPunchCoverage(item.id),
      punchEnclosedHole:
        hasPunchCoverage(item.id) || hasSeeThroughCoverage(item.id)
          ? item.punchEnclosedHole
          : false
    }
  }

  /**
   * Patch for select-object colour / Fill-on-object when alpha is 0.
   * See-through: transparent colour (vectors) or local silhouette hole (stamps).
   * Punch: transparent + punchThrough + silhouette for every object type.
   */
  const transparentObjectPatch = (
    item: LineObj,
    nextColor: string
  ): Partial<LineObj> => {
    const transparent = isTransparentPaintColor(nextColor)
    const punch = transparent && transparentFillModeRef.current === 'punch'
    if (!transparent) {
      // Non-transparent: keep existing hole masks (opacity / recolour).
      return applySelectedObjectColor(item, nextColor)
    }
    // Stamps are rasters — transparent colour alone does not hide them. Always
    // build a silhouette hole; See-through keeps it local, Punch cuts below.
    if (item.type === 'stamp' || punch) {
      ensureObjectPunchSilhouette(item)
      return {
        color: nextColor,
        ...(item.type === 'poly' || item.type === 'shape'
          ? { fill: true }
          : item.type === 'stamp'
            ? {}
            : { borderColor: nextColor }),
        punchThrough: punch
      }
    }
    // Vector see-through: hide the fill; drop any prior punch silhouette.
    clearObjectPunchMasks(item)
    return {
      color: nextColor,
      ...(item.type === 'poly' || item.type === 'shape'
        ? { fill: true }
        : { borderColor: nextColor }),
      punchThrough: false
    }
  }

  const applyTransparentFillMode = (mode: 'see-through' | 'punch') => {
    setTransparentFillMode(mode)
    transparentFillModeRef.current = mode
    inheritedFillMode?.setMode(mode)
    // Re-apply to the selected object when it is already transparent / punched so
    // toggling See-through ↔ Punch hole updates without re-picking the colour.
    const id = selectedIdRef.current
    if (!id) return
    const selected = linesRef.current.find((l) => l.id === id)
    if (!selected || selected.punchMask) return
    const target = checkedGroupTarget(selected) ?? selected
    if (target.type === 'group') return
    const objColor = pixelColor(target.color || color)
    const hasHole =
      !!target.punchThrough ||
      hasPunchCoverage(target.id) ||
      hasSeeThroughCoverage(target.id) ||
      isTransparentPaintColor(objColor)
    if (!isTransparentPaintColor(color) && !hasHole) return
    const nextColor = isTransparentPaintColor(color) ? pixelColor(color) : withZeroAlpha(objColor)
    if (!isTransparentPaintColor(color)) {
      setColor(nextColor)
      setHexText(nextColor)
    }
    updateSelectedLive((l) => transparentObjectPatch(l, nextColor))
    pushHistory()
  }

  const addPunchStampFromMask = (filled: Uint8Array, layerId: PaintLayerId, punchThrough: boolean) => {
    const nl = punchStampFromFilled(filled, layerId, W, H)
    if (!nl) return
    nl.punchThrough = punchThrough
    const next = [...linesRef.current, nl]
    linesRef.current = next
    commitLines(next)
  }

  /**
   * Solid Fill over a transparent / punched region must remove overlapping hole
   * stamps and clear punchThrough silhouettes — otherwise dest-out keeps punching
   * the new colour away (in Paint and again on Save outside).
   */
  const clearPunchHolesOverlapping = (
    filled: Uint8Array,
    layerId: PaintLayerId,
    opts?: { clearAllOnLayer?: boolean }
  ) => {
    let changed = false
    const next: LineObj[] = []
    for (const l of linesRef.current) {
      if (vectorLayerOf(l) !== layerId) {
        next.push(l)
        continue
      }

      const punchBits = punchMaskBits.get(l.id)
      const stBits = seeThroughMaskBits.get(l.id)
      const bits =
        punchBits && stBits && punchBits.length === stBits.length
          ? (() => {
              const u = punchBits.slice()
              for (let i = 0; i < u.length; i++) if (stBits[i]) u[i] = 1
              return u
            })()
          : punchBits ?? stBits
      let overlap = 0
      let stampN = 0
      if (bits && bits.length === filled.length) {
        for (let p = 0; p < bits.length; p++) {
          if (!bits[p]) continue
          stampN++
          if (filled[p]) overlap++
        }
      } else if ((l.punchMask || l.punchThrough) && l.pts.length >= 2) {
        const a = l.pts[0], b = l.pts[1]
        const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x)))
        const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y)))
        const x1 = Math.min(W, Math.ceil(Math.max(a.x, b.x)))
        const y1 = Math.min(H, Math.ceil(Math.max(a.y, b.y)))
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            stampN++
            if (filled[y * W + x]) overlap++
          }
        }
      }

      const overlapsFill = opts?.clearAllOnLayer || (stampN > 0 && overlap / stampN >= 0.12)
      const isHoleOp =
        !!l.punchMask ||
        !!l.punchThrough ||
        hasPunchCoverage(l.id) ||
        hasSeeThroughCoverage(l.id)

      if (!isHoleOp || !overlapsFill) {
        next.push(l)
        continue
      }

      changed = true
      // Subtract overlapping region from both modes when possible; else clear all.
      if (opts?.clearAllOnLayer || !bits) {
        clearObjectHoles(l as HoleItem)
      } else {
        subtractLocalPunchRegion(l, filled, W, H)
      }
      // Dedicated punch-mask stamps go away entirely.
      if (l.punchMask) continue
      next.push({
        ...l,
        punchThrough: hasPunchCoverage(l.id),
        punchEnclosedHole: hasPunchCoverage(l.id) || hasSeeThroughCoverage(l.id) ? l.punchEnclosedHole : false
      })
    }
    if (!changed) return
    linesRef.current = next
    commitLines(next)
  }

  /** Union of punch / see-through hole bits on a layer (for refilling empty holes). */
  const punchCoverageOnLayer = (layerId: PaintLayerId): Uint8Array | null => {
    const cover = new Uint8Array(W * H)
    let any = false
    for (const l of linesRef.current) {
      if (vectorLayerOf(l) !== layerId) continue
      for (const bits of [punchMaskBits.get(l.id), seeThroughMaskBits.get(l.id)]) {
        if (!bits || bits.length !== W * H) continue
        for (let p = 0; p < bits.length; p++) {
          if (!bits[p]) continue
          cover[p] = 1
          any = true
        }
      }
      if (!l.punchMask || l.pts.length < 2) continue
      const a = l.pts[0], b = l.pts[1]
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x)))
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y)))
      const x1 = Math.min(W, Math.ceil(Math.max(a.x, b.x)))
      const y1 = Math.min(H, Math.ceil(Math.max(a.y, b.y)))
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          cover[y * W + x] = 1
          any = true
        }
      }
    }
    return any ? cover : null
  }

  /** Bind an enclosed transparent hole to the object whose ink rings it, so it moves with that object. */
  const attachHoleToEnclosingObject = (filled: Uint8Array, punchThrough: boolean): boolean => {
    let sx = 0, sy = 0, n = 0
    for (let p = 0; p < filled.length; p++) {
      if (!filled[p]) continue
      sx += p % W
      sy += (p / W) | 0
      n++
    }
    if (!n) return false
    const cx = sx / n
    const cy = sy / n
    const candidates = linesRef.current
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (item.punchMask || item.marqueeItem || item.type === 'group') return false
        if (item.type !== 'stamp' && item.type !== 'shape' && item.type !== 'poly' && item.type !== 'text') {
          return false
        }
        if (!isVectorVisible(item)) return false
        const box = punchLocalBox(item)
        if (!box) return false
        const local = unmapObjDisplayPt({ x: cx, y: cy }, item)
        return (
          local.x >= box.x &&
          local.y >= box.y &&
          local.x <= box.x + box.w &&
          local.y <= box.y + box.h
        )
      })
      // Score ties favour lower paint-order objects (earlier in the array).
      .sort((a, b) => a.index - b.index)
    if (!candidates.length) return false

    // Prefer the object whose silhouette actually rings the hole (not merely the
    // topmost bbox that contains the centroid — that wrongly binds to a higher
    // overlapping object when a lower letter was punched).
    let owner: LineObj | null = null
    let bestScore = -Infinity
    const dirs4: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    for (const { item } of candidates) {
      const probe = takeCanvas(W, H)
      try {
        const pctx = probe.getContext('2d')!
        renderLine(pctx, { ...item, shadow: false, punchThrough: false })
        const gd = pctx.getImageData(0, 0, W, H).data
        let emptyOn = 0
        let inkOn = 0
        let borderTouch = 0
        for (let p = 0; p < filled.length; p++) {
          if (!filled[p]) continue
          const a = gd[p * 4 + 3]
          if (a >= 80) inkOn++
          else emptyOn++
          const x = p % W
          const y = (p / W) | 0
          for (const [dx, dy] of dirs4) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const np = ny * W + nx
            if (filled[np]) continue
            if (gd[np * 4 + 3] >= 80) {
              borderTouch++
              break
            }
          }
        }
        // Strong enclosure: hole is empty on this object and touches its ink.
        const score = emptyOn * 2 + borderTouch * 3 - inkOn * 8
        if (score > bestScore) {
          bestScore = score
          owner = item
        }
      } finally {
        releaseCanvas(probe)
      }
    }
    // Fallback: lowest candidate in paint order whose bbox contains the hole.
    if (!owner || bestScore < 4) return false

    // Keep the stored hole flush with the counter (no erode inset — that left
    // Outer colour as a ring along the hole edge after Save).
    let holeBits = filled
    if (!holeBits.some((v) => v)) return false

    // Enclosed counter fill must not keep a prior whole-glyph silhouette
    // (transparent Punch on the whole letter) — that makes every hole look like
    // a full see-through wipe after Save.
    const mode: HoleFillMode = punchThrough ? 'punch' : 'see-through'
    const bitsMap = mode === 'punch' ? punchMaskBits : seeThroughMaskBits
    const canvasMap = mode === 'punch' ? punchMaskCanvases : seeThroughMaskCanvases
    const prevBits = bitsMap.get(owner.id)
    if (prevBits && prevBits.length === W * H) {
      const probe = takeCanvas(W, H)
      try {
        const pctx = probe.getContext('2d')!
        renderLineBase(pctx, {
          ...owner,
          shadow: false,
          punchThrough: false,
          color: owner.type === 'text' ? '#000000' : owner.color
        })
        const gd = pctx.getImageData(0, 0, W, H).data
        let glyph = 0
        let overlap = 0
        for (let p = 0; p < prevBits.length; p++) {
          if (gd[p * 4 + 3] >= 80) glyph++
          if (prevBits[p] && gd[p * 4 + 3] >= 80) overlap++
        }
        const looksLikeFullGlyph = glyph > 0 && overlap >= glyph * 0.45
        if (looksLikeFullGlyph) {
          canvasMap.delete(owner.id)
          bitsMap.delete(owner.id)
        }
      } finally {
        releaseCanvas(probe)
      }
    }

    setLocalPunchFromFilled(owner, holeBits, W, H, { mode })
    const next = linesRef.current.map((l) =>
      l.id === owner!.id
        ? {
            ...l,
            punchThrough: hasPunchCoverage(owner!.id),
            punchEnclosedHole: true
          }
        : l
    )
    linesRef.current = next
    commitLines(next)
    return true
  }

  const applyTransparentFlood = (
    filled: Uint8Array,
    layerId: PaintLayerId,
    _overlay: HTMLCanvasElement,
    encloseInObject = false
  ) => {
    if (!isTransparentPaintColor(color)) return
    // Honour See-through vs Punch — never force punch just because the hole is enclosed.
    const punch = transparentFillPunch()
    // Punch Fill on an existing hole must not re-flood and enlarge it.
    if (punch) {
      let sx = 0, sy = 0, n = 0
      for (let p = 0; p < filled.length; p++) {
        if (!filled[p]) continue
        sx += p % W
        sy += (p / W) | 0
        n++
      }
      if (n > 0) {
        const cx = sx / n
        const cy = sy / n
        const onExisting = linesRef.current.some(
          (l) =>
            vectorLayerOf(l) === layerId &&
            objectPunchHoleAt(l, { x: cx, y: cy })
        )
        if (onExisting) return
      }
    }
    // Prefer binding true enclosed holes to the object (selected or not).
    if (encloseInObject && attachHoleToEnclosingObject(filled, punch)) return
    // See-through on content: bind to an enclosing object when the flood is a
    // hole (not a whole-object wipe) so we don't spawn free punchMask stamps
    // that look like Punch and disappear after Save.
    if (!punch && layerId !== 'container' && attachHoleToEnclosingObject(filled, punch)) {
      return
    }
    addPunchStampFromMask(filled, layerId, punch)
  }

  const punchFilledFromBase = (
    underlay: HTMLCanvasElement | null | undefined,
    filled: Uint8Array
  ) => {
    if (!underlay) return
    const bctx = underlay.getContext('2d')
    if (!bctx) return
    const punch = bctx.getImageData(0, 0, W, H)
    const pd = punch.data
    for (let p = 0; p < filled.length; p++) {
      if (!filled[p]) continue
      const i = p * 4
      pd[i] = 0
      pd[i + 1] = 0
      pd[i + 2] = 0
      pd[i + 3] = 0
    }
    bctx.putImageData(punch, 0, 0)
  }

  /** Outer fill: rewrite the baked base to the new colour (do not punch through). */
  const recolorFilledBase = (
    underlay: HTMLCanvasElement | null | undefined,
    filled: Uint8Array,
    fr: number,
    fg: number,
    fb: number,
    fa: number,
    composite: Uint8ClampedArray
  ) => {
    if (!underlay) return
    const bctx = underlay.getContext('2d')
    if (!bctx) return
    const base = bctx.getImageData(0, 0, W, H)
    const bd = base.data
    for (let p = 0; p < filled.length; p++) {
      if (!filled[p]) continue
      const i = p * 4
      const srcA = composite[i + 3]
      if (srcA <= 8) {
        // Restore punched / see-through holes so live bake matches the new fill.
        bd[i] = fr
        bd[i + 1] = fg
        bd[i + 2] = fb
        bd[i + 3] = fa
        continue
      }
      const outA = srcA >= 170 ? fa : Math.max(12, Math.round((srcA * fa) / 255))
      bd[i] = fr
      bd[i + 1] = fg
      bd[i + 2] = fb
      bd[i + 3] = outA
    }
    bctx.putImageData(base, 0, 0)
  }

  const recolorAllOpaque = (
    ctx: CanvasRenderingContext2D,
    underlay?: HTMLCanvasElement | null,
    layerId?: PaintLayerId
  ) => {
    const fill = pixelColor(color)
    const fr = parseInt(fill.slice(1, 3), 16)
    const fg = parseInt(fill.slice(3, 5), 16)
    const fb = parseInt(fill.slice(5, 7), 16)
    const fa = parseInt(fill.slice(7, 9) || 'ff', 16)
    const sample = document.createElement('canvas')
    sample.width = W
    sample.height = H
    const sampleCtx = sample.getContext('2d')!
    if (underlay) sampleCtx.drawImage(underlay, 0, 0)
    sampleCtx.drawImage(ctx.canvas, 0, 0)
    const data = sampleCtx.getImageData(0, 0, W, H).data
    const out = ctx.getImageData(0, 0, W, H)
    const od = out.data
    const punched = new Uint8Array(W * H)
    for (let p = 0; p < W * H; p++) {
      const i = p * 4
      const srcA = data[i + 3]
      if (srcA <= 8) continue
      od[i] = fr
      od[i + 1] = fg
      od[i + 2] = fb
      od[i + 3] = srcA >= 180 ? fa : Math.round((srcA * fa) / 255)
      punched[p] = 1
    }
    ctx.putImageData(out, 0, 0)
    if (isTransparentPaintColor(color)) {
      applyTransparentFlood(punched, layerId ?? 'content', ctx.canvas)
      return
    }
    punchFilledFromBase(underlay, punched)
    if (layerId) clearPunchHolesOverlapping(punched, layerId, { clearAllOnLayer: layerId === 'container' })
    if (layerId === 'container') {
      const css = cssPaintColor(fill)
      lastOuterFillTargetRef.current = 'fill'
      lastOuterFillColorRef.current = css
      lastOuterFillColorsRef.current = { fill: css, border: css, shadow: css }
      lastOuterFillAllRef.current = true
      preserveOuterOverlayRef.current = false
    }
  }

  /**
   * Classify an Outer-layer click as solid fill, border ring, or shadow fringe.
   * Uses the visible composite (base + overlay). A border sitting on a drop
   * shadow is "outside" (low alpha), not empty canvas — do not treat that as fill.
   */
  const classifyOuterFillTarget = (
    data: Uint8ClampedArray,
    sx: number,
    sy: number,
    edt: Float32Array
  ): 'fill' | 'border' | 'shadow' => {
    const px = Math.max(0, Math.min(W - 1, Math.floor(sx)))
    const py = Math.max(0, Math.min(H - 1, Math.floor(sy)))
    const i0 = (py * W + px) * 4
    const a0 = data[i0 + 3]
    if (a0 <= 8) return 'fill'
    if (a0 < 150) return 'shadow'

    const borderPx = Math.max(0, outerBorderWidthPx || 0)
    const d = edt[py * W + px]
    if (borderPx > 0 && d <= borderPx + 0.75) return 'border'

    const alphaAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return 0
      return data[(y * W + x) * 4 + 3]
    }
    const clickR = data[i0], clickG = data[i0 + 1], clickB = data[i0 + 2]
    const matchesClick = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false
      const i = (y * W + x) * 4
      if (data[i + 3] < 150) return false
      return (
        Math.abs(data[i] - clickR) +
        Math.abs(data[i + 1] - clickG) +
        Math.abs(data[i + 2] - clickB)
      ) <= 48
    }

    const dirs = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [1, -1], [-1, 1], [1, 1]
    ] as const
    let dOut = 99
    let outDx = 0
    let outDy = 0
    for (const [dx, dy] of dirs) {
      for (let s = 1; s <= 48; s++) {
        if (alphaAt(px + dx * s, py + dy * s) < 150) {
          if (s < dOut) {
            dOut = s
            outDx = dx
            outDy = dy
          }
          break
        }
      }
    }

    const countMatch = (dx: number, dy: number) => {
      let n = 0
      for (let s = 1; s <= 40; s++) {
        if (!matchesClick(px + dx * s, py + dy * s)) break
        n++
      }
      return n
    }
    const matchThickness = 1 + countMatch(outDx, outDy) + countMatch(-outDx, -outDy)

    let differentInterior = false
    if (outDx !== 0 || outDy !== 0) {
      const ix = -outDx
      const iy = -outDy
      for (let s = 1; s <= 40; s++) {
        const x = px + ix * s
        const y = py + iy * s
        if (x < 0 || y < 0 || x >= W || y >= H) break
        if (matchesClick(x, y)) continue
        const i = (y * W + x) * 4
        if (data[i + 3] >= 210) {
          const dist =
            Math.abs(data[i] - clickR) +
            Math.abs(data[i + 1] - clickG) +
            Math.abs(data[i + 2] - clickB)
          if (dist > 48) differentInterior = true
          break
        }
        if (data[i + 3] < 150) break
      }
    }

    if (borderPx <= 0 && differentInterior && matchThickness <= 40 && dOut <= matchThickness + 1) {
      return 'border'
    }
    if (borderPx <= 0 && !differentInterior && matchThickness <= 10 && dOut <= 4) {
      return 'border'
    }
    return 'fill'
  }

  /**
   * Flood-fill the paint overlay. Matching uses live base + overlay appearance
   * so clicks on the visible icon work; writes go only into the overlay.
   */
  const floodFill = (
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    underlay?: HTMLCanvasElement | null,
    layerId?: PaintLayerId
  ) => {
    // Sample/match against what the user sees: live base + live Inner + overlay.
    // Overlay sits on Inner, so brush cuts are part of the visible colour.
    const sampleCanvas = document.createElement('canvas')
    sampleCanvas.width = W
    sampleCanvas.height = H
    const sampleCtx = sampleCanvas.getContext('2d')!
    if (underlay) sampleCtx.drawImage(underlay, 0, 0)
    if (layerId) {
      for (const root of linesRef.current) {
        if (root.parentId || root.marqueeItem) continue
        if (vectorLayerOf(root) !== layerId || !isLiveInnerVector(root)) continue
        renderObjectTree(sampleCtx, root, linesRef.current, isVectorVisible)
      }
      // Punch-through holes must read as empty in the sample — otherwise Fill
      // "hits" the still-drawn glyph body under the hole and only paints overlay
      // beneath the vector (no visible change).
      for (const l of linesRef.current) {
        if (l.parentId || l.marqueeItem) continue
        if (vectorLayerOf(l) !== layerId) continue
        if (!l.punchThrough && !hasPunchCoverage(l.id) && !hasSeeThroughCoverage(l.id)) continue
        if (l.punchMask) continue
        if (l.punchThrough || hasPunchCoverage(l.id)) {
          punchObjectFromComposite(sampleCtx, l, linesRef.current, isVectorVisible)
        } else {
          destOutLocalPunch(sampleCtx, l, 'see-through')
        }
      }
    }
    const under = sampleCtx.getImageData(0, 0, W, H).data
    sampleCtx.drawImage(ctx.canvas, 0, 0)
    const data = sampleCtx.getImageData(0, 0, W, H).data
    const overlayPix = ctx.getImageData(0, 0, W, H).data
    let px = Math.floor(sx), py = Math.floor(sy)
    if (px < 0 || py < 0 || px >= W || py >= H) return

    // Session drawings are walls. Live Inner letters/icons are fillable content.
    // Punch-through objects must not wall over their own holes — otherwise Fill
    // cannot refill see-through / punch regions.
    const wallCanvas = document.createElement('canvas')
    wallCanvas.width = W
    wallCanvas.height = H
    const wallCtx = wallCanvas.getContext('2d')!
    for (const root of linesRef.current) {
      if (root.parentId || root.marqueeItem) continue
      if (isLiveInnerVector(root)) continue
      renderObjectTree(wallCtx, root, linesRef.current, isPaintHitVisible)
    }
    for (const l of linesRef.current) {
      if (l.parentId || l.marqueeItem) continue
      if (layerId && vectorLayerOf(l) !== layerId) continue
      if (!l.punchThrough && !hasPunchCoverage(l.id) && !hasSeeThroughCoverage(l.id)) continue
      if (l.punchMask) continue
      if (l.punchThrough || hasPunchCoverage(l.id)) {
        punchObjectFromComposite(wallCtx, l, linesRef.current, isVectorVisible)
      } else {
        destOutLocalPunch(wallCtx, l, 'see-through')
      }
    }
    const wall = wallCtx.getImageData(0, 0, W, H).data
    const holeCoverEarly = layerId ? punchCoverageOnLayer(layerId) : null
    const isWall = (i: number) => {
      if (wall[i + 3] <= 20) return false
      const p = (i / 4) | 0
      // Pixels inside an existing punch/see-through hole stay fillable.
      if (holeCoverEarly && holeCoverEarly[p]) return false
      return true
    }

    const clickOnWall = isWall((Math.floor(sy) * W + Math.floor(sx)) * 4)
    const clickI = (Math.floor(sy) * W + Math.floor(sx)) * 4
    const clickIsEmpty = under[clickI + 3] <= 8 && overlayPix[clickI + 3] <= 8 && !clickOnWall
    const seed = clickIsEmpty
      ? { x: Math.floor(sx), y: Math.floor(sy) }
      : findFillSeed(W, H, px, py, (x, y) => {
        const i = (y * W + x) * 4
        if (isWall(i)) return false
        // A click on an object must not hop onto Outer underlay behind it.
        if (clickOnWall && layerId === 'container') return false
        return under[i + 3] > 8 && overlayPix[i + 3] <= 8
      }) ?? (!clickOnWall ? { x: px, y: py } : null)
    if (!seed) return
    px = seed.x
    py = seed.y
    const idx = (py * W + px) * 4
    const seedOnOverlay = overlayPix[idx + 3] > 8
    const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3]
    const fill = pixelColor(color)
    const fr = parseInt(fill.slice(1, 3), 16)
    const fg = parseInt(fill.slice(3, 5), 16)
    const fb = parseInt(fill.slice(5, 7), 16)
    const fa = parseInt(fill.slice(7, 9) || 'ff', 16)

    // Empty / near-empty canvas must never join a flood. Outer-shape shadows are
    // a soft alpha ramp; RGB+alpha tolerance otherwise walks that ramp into the
    // transparent background and paints the whole stage.
    const EMPTY_A = 8
    const clickedEmpty = ta <= EMPTY_A
    let enclosedHole = false
    /** When set, empty flood is limited to a punch/see-through hole (may touch stage). */
    let holeConstraint: Uint8Array | null = null
    if (clickedEmpty) {
      const ink = new Uint8Array(W * H)
      for (let p = 0; p < W * H; p++) {
        if (data[p * 4 + 3] > EMPTY_A || isWall(p * 4)) ink[p] = 1
      }
      const outside = floodOutsideEmpty(ink, W, H)
      const cover = holeCoverEarly ?? (layerId ? punchCoverageOnLayer(layerId) : null)
      const clickInPunchHole = !!(cover && cover[py * W + px])
      if (outside[py * W + px] && !clickInPunchHole) {
        // Truly outside the icon silhouette — never flood the empty stage.
        // Exception: empty pixels that sit next to opaque ink (soft fringe of a
        // punched hole whose mask was already cleared) — treat as refillable.
        let nearInk = false
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]] as const) {
          const nx = px + dx, ny = py + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          if (data[(ny * W + nx) * 4 + 3] > EMPTY_A) { nearInk = true; break }
        }
        if (!nearInk) return
        // Build a soft hole constraint: empty pixels that are outside-connected
        // but within a few px of ink (typical punched interior).
        const soft = new Uint8Array(W * H)
        for (let p = 0; p < W * H; p++) {
          if (!outside[p] || data[p * 4 + 3] > EMPTY_A) continue
          const x = p % W
          const y = (p / W) | 0
          let adj = false
          for (let dy = -3; dy <= 3 && !adj; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              const ax = x + dx, ay = y + dy
              if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue
              if (data[(ay * W + ax) * 4 + 3] > EMPTY_A) { adj = true; break }
            }
          }
          if (adj) soft[p] = 1
        }
        if (!soft[py * W + px]) return
        holeConstraint = soft
      } else if (clickInPunchHole) {
        holeConstraint = cover
      } else if (isTransparentPaintColor(color)) {
        enclosedHole = true
      }
    }

    const tol = 32
    // Same / near-same colour — nothing to do (also prevents an infinite loop if
    // painted pixels would still match the target within tolerance).
    // Transparent see-through / punch must still run on soft shadows (low alpha
    // is within 32 of fa=0 and would otherwise be treated as a no-op).
    if (
      !isTransparentPaintColor(color) &&
      Math.abs(fr - tr) <= tol &&
      Math.abs(fg - tg) <= tol &&
      Math.abs(fb - tb) <= tol &&
      Math.abs(fa - ta) <= tol
    ) return

    const rgbDist = (i: number, r: number, g: number, b: number) =>
      Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b)

    const filled = new Uint8Array(W * H)
    let outerKind: 'fill' | 'border' | 'shadow' | null = null

    // Outer fill stays interior-only. Border and shadow are one flood when they
    // share a colour (same as a normal fill), so curved strokes + matching glow
    // recolour together instead of a Manhattan ring that misses the curve.
    const clickOnPaintObject = linesRef.current.some(
      (item) =>
        !item.punchMask &&
        isPaintHitVisible(item) &&
        objectOwnsFillClick(item, { x: sx, y: sy })
    )
    if (layerId === 'container' && !clickedEmpty && !clickOnWall && !clickOnPaintObject) {
      const edt = alphaOutsideEDT(data, W, H, 185)
      outerKind = classifyOuterFillTarget(data, sx, sy, edt)
      const borderPx = Math.max(0, outerBorderWidthPx || 0)

      const unpremul = (i: number): [number, number, number] | null => {
        const a = data[i + 3]
        if (a <= EMPTY_A) return null
        let r = data[i], g = data[i + 1], b = data[i + 2]
        if (a < 250 && Math.max(r, g, b) <= a + 1) {
          const s = 255 / a
          r = Math.min(255, r * s)
          g = Math.min(255, g * s)
          b = Math.min(255, b * s)
        }
        return [r, g, b]
      }

      const clickRgb = unpremul(idx) ?? [tr, tg, tb]

      const sampleBand = (pred: (p: number) => boolean): [number, number, number] | null => {
        let r = 0, g = 0, b = 0, n = 0
        const step = Math.max(1, Math.floor(W / 96))
        for (let y = 0; y < H; y += step) {
          for (let x = 0; x < W; x += step) {
            const p = y * W + x
            if (!pred(p)) continue
            const rgb = unpremul(p * 4)
            if (!rgb) continue
            r += rgb[0]; g += rgb[1]; b += rgb[2]
            n++
          }
        }
        return n > 4 ? [r / n, g / n, b / n] : null
      }

      const liveBorder = cssSolidRgb(outerBorderColor)
      const liveShadow = cssSolidRgb(outerShadowColor)
      const liveFill = cssSolidRgb(outerFillColor)
      const bakedBorder = sampleBand((p) => {
        const a = data[p * 4 + 3]
        return a >= 180 && edt[p] > 0.35 && edt[p] <= Math.max(borderPx, 14) + 1
      })
      const bakedShadow = sampleBand((p) => {
        const a = data[p * 4 + 3]
        return a > 16 && a < 140
      })

      let maxEdt = 0
      let coreP = 0
      for (let p = 0; p < W * H; p++) {
        if (data[p * 4 + 3] >= 200 && edt[p] > maxEdt) {
          maxEdt = edt[p]
          coreP = p
        }
      }
      const interiorRgb =
        unpremul(coreP * 4) ??
        liveFill ??
        sampleBand((p) => data[p * 4 + 3] >= 200 && edt[p] > Math.max(borderPx, 8) + 4)

      const clickMatchesLiveBorder = !!(liveBorder && rgbClose3(clickRgb, liveBorder, 56))
      const clickMatchesLiveShadow = !!(liveShadow && rgbClose3(clickRgb, liveShadow, 56))
      const sameRimColor = !!(
        (liveBorder && liveShadow && rgbClose3(liveBorder, liveShadow, 56)) ||
        (bakedBorder && bakedShadow && rgbClose3(bakedBorder, bakedShadow, 72)) ||
        (clickMatchesLiveBorder && clickMatchesLiveShadow) ||
        (outerKind === 'border' && clickMatchesLiveShadow) ||
        (outerKind === 'shadow' && clickMatchesLiveBorder)
      )

      // Interior vs rim (border / shadow), not click vs interior — a fill
      // click matches the interior, so that older test hid the colour split.
      const fillDiffersFromRim = !!(
        interiorRgb && (
          (liveBorder && !rgbClose3(interiorRgb, liveBorder, 52)) ||
          (bakedBorder && !rgbClose3(interiorRgb, bakedBorder, 64)) ||
          (liveShadow && !rgbClose3(interiorRgb, liveShadow, 56)) ||
          (bakedShadow && !rgbClose3(interiorRgb, bakedShadow, 80))
        )
      )

      // When fill colour ≠ rim colour, the stroke's max EDT is the true border
      // thickness. A too-small passed width treated most of the stroke as
      // interior and only recolored the outer glow.
      let rimW = Math.max(borderPx, 1)
      if (fillDiffersFromRim && interiorRgb) {
        let measured = 0
        for (let p = 0; p < W * H; p++) {
          const a = data[p * 4 + 3]
          if (a < 185) continue
          const rgb = unpremul(p * 4)
          if (!rgb || rgbClose3(rgb, interiorRgb, 40)) continue
          if (edt[p] > measured) measured = edt[p]
        }
        if (measured > rimW) rimW = measured
      }

      const isSolidInterior = (p: number) => {
        const a = data[p * 4 + 3]
        if (a < 185) return false
        const rgb = unpremul(p * 4)
        if (fillDiffersFromRim && interiorRgb && rgb) {
          return rgbClose3(rgb, interiorRgb, 40)
        }
        return edt[p] > rimW + 0.5
      }

      const rimMatchesClick = (i: number) => {
        const rgb = unpremul(i)
        if (!rgb) return false
        if (rgbClose3(rgb, clickRgb, 64)) return true
        const maxc = Math.max(rgb[0], rgb[1], rgb[2])
        const minc = Math.min(rgb[0], rgb[1], rgb[2])
        const clickMax = Math.max(clickRgb[0], clickRgb[1], clickRgb[2])
        const clickMin = Math.min(clickRgb[0], clickRgb[1], clickRgb[2])
        if (clickMax - clickMin <= 55 && maxc - minc <= 55 && Math.abs(clickMax - maxc) <= 90) {
          return true
        }
        return false
      }

      const growNonInterior = (passes: number) => {
        const dirs8: [number, number][] = [
          [-1, 0], [1, 0], [0, -1], [0, 1],
          [-1, -1], [1, -1], [-1, 1], [1, 1]
        ]
        for (let pass = 0; pass < passes; pass++) {
          const extra: number[] = []
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const p = y * W + x
              if (filled[p] || isSolidInterior(p)) continue
              if (data[p * 4 + 3] <= 4) continue
              let adj = false
              for (const [dx, dy] of dirs8) {
                const nx = x + dx, ny = y + dy
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
                if (filled[ny * W + nx]) { adj = true; break }
              }
              if (adj) extra.push(p)
            }
          }
          if (!extra.length) break
          for (const p of extra) filled[p] = 1
        }
      }

      if (outerKind === 'fill') {
        const rimCutoff = borderPx > 0 ? rimW + 0.75 : 0
        const isOuterFillRegion = (p: number) => {
          const a = data[p * 4 + 3]
          if (a <= 8) {
            // Solid Outer recolor: also cover punched / see-through holes that sit
            // inside the silhouette (high EDT = interior, not the empty stage).
            if (!isTransparentPaintColor(color) && edt[p] > Math.max(rimCutoff, 1) + 0.5) {
              return true
            }
            return false
          }
          if (borderPx > 0 && edt[p] <= rimCutoff) return false
          if (a < 100 && edt[p] > 8) return false
          if (fillDiffersFromRim && a < 150) {
            const rgb = unpremul(p * 4)
            if (rgb && liveShadow && rgbClose3(rgb, liveShadow, 72)) return false
            if (rgb && bakedShadow && rgbClose3(rgb, bakedShadow, 88)) return false
          }
          return true
        }

        const dirs8: [number, number][] = [
          [-1, 0], [1, 0], [0, -1], [0, 1],
          [-1, -1], [1, -1], [-1, 1], [1, 1]
        ]

        // Geometry flood — entire connected interior silhouette including rounded
        // corner AA, not just pixels that still match the pre-fill colour.
        const stack: number[] = [px, py]
        while (stack.length >= 2) {
          const y = stack.pop()!
          const x = stack.pop()!
          if (x < 0 || y < 0 || x >= W || y >= H) continue
          const p = y * W + x
          if (filled[p] || !isOuterFillRegion(p)) continue
          filled[p] = 1
          for (const [dx, dy] of dirs8) stack.push(x + dx, y + dy)
        }

        // Outermost rounded-corner AA ring (no border): geometry flood can stop one
        // pixel short of the silhouette edge when EDT treats fringe as outside.
        if (borderPx <= 0) {
          for (let pass = 0; pass < 4; pass++) {
            const extra: number[] = []
            for (let y = 0; y < H; y++) {
              for (let x = 0; x < W; x++) {
                const p = y * W + x
                if (filled[p]) continue
                const a = data[p * 4 + 3]
                if (a <= 8 || edt[p] > 2.5) continue
                let adj = false
                for (const [dx, dy] of dirs8) {
                  const nx = x + dx, ny = y + dy
                  if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
                  if (filled[ny * W + nx]) { adj = true; break }
                }
                if (adj) extra.push(p)
              }
            }
            if (!extra.length) break
            for (const p of extra) filled[p] = 1
          }
        }

        recordOuterFill('fill', fill)
      } else if (
        sameRimColor ||
        (isTransparentPaintColor(color) && (outerKind === 'border' || outerKind === 'shadow'))
      ) {
        // Same-colour rim, or a transparent punch/see-through on the border or
        // shadow — include the stroke and its drop-shadow glow together.
        for (let p = 0; p < W * H; p++) {
          if (isSolidInterior(p)) continue
          if (data[p * 4 + 3] > 4) filled[p] = 1
        }
        growNonInterior(3)
        recordOuterFill('border', fill)
        recordOuterFill('shadow', fill)
      } else {
        const dirs8: [number, number][] = [
          [-1, 0], [1, 0], [0, -1], [0, 1],
          [-1, -1], [1, -1], [-1, 1], [1, 1]
        ]
        const stack: number[] = [px, py]
        while (stack.length >= 2) {
          const y = stack.pop()!
          const x = stack.pop()!
          if (x < 0 || y < 0 || x >= W || y >= H) continue
          const p = y * W + x
          if (filled[p]) continue
          if (isSolidInterior(p)) continue
          if (!rimMatchesClick(p * 4)) continue
          filled[p] = 1
          for (const [dx, dy] of dirs8) stack.push(x + dx, y + dy)
        }
        for (let p = 0; p < W * H; p++) {
          if (filled[p] || isSolidInterior(p)) continue
          if (rimMatchesClick(p * 4)) filled[p] = 1
        }
        growNonInterior(2)

        let sawBorder = false
        let sawShadow = false
        for (let p = 0; p < W * H; p++) {
          if (!filled[p]) continue
          if (data[p * 4 + 3] < 150) sawShadow = true
          else sawBorder = true
        }
        if (sawBorder) recordOuterFill('border', fill)
        if (sawShadow) recordOuterFill('shadow', fill)
        if (!sawBorder && !sawShadow) recordOuterFill(outerKind, fill)
      }

      const out = ctx.getImageData(0, 0, W, H)
      const od = out.data
      const solidOuterFill = outerKind === 'fill' && !isTransparentPaintColor(color)
      for (let p = 0; p < filled.length; p++) {
        if (!filled[p]) continue
        const i = p * 4
        const srcA = data[i + 3]
        if (srcA <= EMPTY_A) {
          // Refill punched / see-through holes with a solid Outer colour.
          if (!solidOuterFill) continue
          od[i] = fr
          od[i + 1] = fg
          od[i + 2] = fb
          od[i + 3] = fa
          continue
        }
        const outA = solidOuterFill
          ? (srcA >= 170 ? fa : Math.max(12, Math.round((srcA * fa) / 255)))
          : srcA < 150
            ? Math.round((srcA * fa) / 255)
            : srcA >= 12
              ? fa
              : Math.max(od[i + 3], Math.round((srcA * fa) / 255))
        od[i] = fr
        od[i + 1] = fg
        od[i + 2] = fb
        od[i + 3] = outA
      }
      ctx.putImageData(out, 0, 0)
      if (isTransparentPaintColor(color)) {
        applyTransparentFlood(filled, layerId ?? 'content', ctx.canvas)
      } else if (solidOuterFill) {
        recolorFilledBase(underlay, filled, fr, fg, fb, fa, data)
        clearPunchHolesOverlapping(filled, layerId ?? 'content', { clearAllOnLayer: true })
      } else {
        punchFilledFromBase(underlay, filled)
        clearPunchHolesOverlapping(filled, layerId ?? 'content')
      }
      return
    }

    const paintAt = (i: number, p: number) => {
      filled[p] = 1
    }

    // Must check `filled` — after painting, a near-target fill colour can still
    // satisfy the colour match and re-enqueue forever (app hang).
    const matchXY = (x: number, y: number): boolean => {
      const p = y * W + x
      if (filled[p]) return false
      const i = p * 4
      if (isWall(i)) return false
      if (!seedOnOverlay && overlayPix[i + 3] > 8) return false
      const a = data[i + 3]
      if (clickedEmpty) {
        if (a > EMPTY_A) return false
        if (holeConstraint && !holeConstraint[p]) return false
        return true
      }
      if (a <= EMPTY_A) return false
      // Relative alpha band: a large outer shadow is a continuous ramp from
      // ~opaque down to empty. Absolute ±32 on alpha walks that ramp into the
      // transparent stage. Stay within ~35% of the clicked alpha instead.
      const aTol = Math.max(18, Math.round(ta * 0.35))
      if (Math.abs(a - ta) > aTol) return false
      return (
        Math.abs(data[i] - tr) <= tol &&
        Math.abs(data[i + 1] - tg) <= tol &&
        Math.abs(data[i + 2] - tb) <= tol
      )
    }

    const stack: number[] = [px, py]
    // Safety: never visit more than the canvas pixel count.
    let painted = 0
    const maxPaint = W * H
    while (stack.length >= 2 && painted < maxPaint) {
      const y = stack.pop()!
      const x = stack.pop()!
      if (x < 0 || y < 0 || x >= W || y >= H || !matchXY(x, y)) continue

      let ny = y
      while (ny > 0 && matchXY(x, ny - 1)) ny--

      let spanLeft = false
      let spanRight = false
      for (; ny < H && matchXY(x, ny); ny++) {
        paintAt((ny * W + x) * 4, ny * W + x)
        painted++
        if (x > 0) {
          if (matchXY(x - 1, ny)) {
            if (!spanLeft) { stack.push(x - 1, ny); spanLeft = true }
          } else spanLeft = false
        }
        if (x < W - 1) {
          if (matchXY(x + 1, ny)) {
            if (!spanRight) { stack.push(x + 1, ny); spanRight = true }
          } else spanRight = false
        }
      }
    }

    // Recolor of existing pixels (border / shadow / fill): also absorb AA and
    // white-bake fringes so they are not left peeking beside the new colour.
    if (fillCleanEdges && clickedEmpty && !enclosedHole) {
      // Pass 2–3: absorb anti-aliased fringes and thin leftover outline rings
      // next to the filled area. Thick opaque bands of a different color stay.
      const fringeTol = 110
      const opaqueA = 210
      const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

      const isThinLeftoverOutline = (x: number, y: number, i: number): boolean => {
        if (data[i + 3] < opaqueA) return false
        if (rgbDist(i, fr, fg, fb) <= 24) return false
        if (rgbDist(i, tr, tg, tb) <= fringeTol) return false // handled as fringe
        // Must sit against the filled region
        let toward: [number, number] | null = null
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          if (filled[ny * W + nx]) { toward = [dx, dy]; break }
        }
        if (!toward) return false
        // Measure how thick this same-colour band is walking away from the fill
        const ox = -toward[0], oy = -toward[1]
        const br = data[i], bg0 = data[i + 1], bb = data[i + 2]
        let thickness = 1
        for (let s = 1; s <= 5; s++) {
          const nx = x + ox * s, ny = y + oy * s
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) break
          const ni = (ny * W + nx) * 4
          const same =
            Math.abs(data[ni] - br) + Math.abs(data[ni + 1] - bg0) + Math.abs(data[ni + 2] - bb) <= 48 &&
            data[ni + 3] >= opaqueA * 0.65
          if (!same) break
          thickness++
        }
        // Thin rings (1–2px) are leftover outlines; thicker = designed border
        return thickness <= 2
      }

      const isFringe = (x: number, y: number, i: number): boolean => {
        if (isWall(i)) return false
        const a = data[i + 3]
        if (!clickedEmpty && a <= EMPTY_A) return false
        if (clickedEmpty && a > EMPTY_A) return false
        const dRgb = rgbDist(i, tr, tg, tb)
        const dFill = rgbDist(i, fr, fg, fb)
        const aTol = Math.max(18, Math.round(ta * 0.35))
        // Solid neighbouring region of a different colour (fill vs border) stays.
        if (!clickedEmpty && a >= opaqueA && dRgb > 48 && dFill > 40) return false
        // AA fringe of the clicked colour only — not the rest of a shadow ramp
        // and never empty canvas around an outer-shape shadow.
        if (dRgb <= fringeTol && Math.abs(a - ta) <= aTol) return true
        if (isThinLeftoverOutline(x, y, i)) return true
        if (!clickedEmpty) {
          // Leftover white from baking the shape over a light backdrop.
          const r = data[i], g = data[i + 1], b = data[i + 2]
          const maxc = Math.max(r, g, b)
          const minc = Math.min(r, g, b)
          if (maxc >= 200 && maxc - minc <= 90) return true
          // Soft AA of the clicked band — not a neighbouring shadow ramp.
          if (a < 220 && dRgb <= 140 && Math.abs(a - ta) <= aTol) return true
        }
        return false
      }

      for (let pass = 0; pass < 3; pass++) {
        const queue: number[] = []
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const p = y * W + x
            if (filled[p]) continue
            let adj = false
            for (const [dx, dy] of dirs) {
              const nx = x + dx, ny = y + dy
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
              if (filled[ny * W + nx]) { adj = true; break }
            }
            if (!adj) continue
            const i = p * 4
            if (isFringe(x, y, i)) queue.push(p)
          }
        }
        if (!queue.length) break
        for (const p of queue) paintAt(p * 4, p)
      }

      // Thin session outlines that contain the click: match fill colour so the
      // vector stroke doesn't remain a different-coloured ring. Thicker strokes
      // (≥ 4px) are treated as designed borders and left alone.
      const click = { x: px, y: py }
      let vectorChanged = false
      for (const l of linesRef.current) {
        if (l.type !== 'poly' && l.type !== 'shape') continue
        if ((lineBorderWidth(l) || 1) >= 4) continue
        const inside = l.type === 'poly'
          ? pointInPoly(l.pts, click)
          : pointInRect(l.pts[0], l.pts[1], click)
        if (!inside) continue
        if (l.color !== fill) {
          l.color = fill
          vectorChanged = true
        }
      }
      if (vectorChanged) {
        commitLines([...linesRef.current])
        redrawLines()
        drawHandles()
      }
    } else if (!clickedEmpty) {
      // Absorb leftover white bake / AA of the clicked band only — do not walk
      // into a neighbouring fill, border, or shadow region.
      const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
      const aTol = Math.max(18, Math.round(ta * 0.35))
      for (let pass = 0; pass < 2; pass++) {
        const queue: number[] = []
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const p = y * W + x
            if (filled[p]) continue
            let adj = false
            for (const [dx, dy] of dirs) {
              const nx = x + dx, ny = y + dy
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
              if (filled[ny * W + nx]) { adj = true; break }
            }
            if (!adj) continue
            const i = p * 4
            if (isWall(i)) continue
            const a = data[i + 3]
            if (a <= EMPTY_A) continue
            const dRgb = rgbDist(i, tr, tg, tb)
            const dFill = rgbDist(i, fr, fg, fb)
            if (a >= 210 && dRgb > 48 && dFill > 40) continue
            const r = data[i], g = data[i + 1], b = data[i + 2]
            const maxc = Math.max(r, g, b)
            const minc = Math.min(r, g, b)
            const towardWhite = maxc >= 200 && maxc - minc <= 90
            const sameBand = dRgb <= 110 && Math.abs(a - ta) <= aTol
            if (towardWhite || sameBand) queue.push(p)
          }
        }
        if (!queue.length) break
        for (const p of queue) paintAt(p * 4, p)
      }
    }

    // Grow fill 1px into soft / near-edge underlay pixels so live-base outlines
    // cannot peek through when the overlay is scaled outside Paint.
    // Skip for enclosed letter counters — growing into glyph AA leaves vertical
    // fringe strips when the hole is later dest-outed through the stack.
    if (clickedEmpty && !enclosedHole) {
      const grow: number[] = []
      const dirs4: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const p = y * W + x
          if (!filled[p]) continue
          for (const [dx, dy] of dirs4) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const np = ny * W + nx
            if (filled[np]) continue
            const i = np * 4
            if (isWall(i)) continue
            const a = data[i + 3]
            if (a < 10) continue
            const dRgb = rgbDist(i, tr, tg, tb)
            const nearFill = rgbDist(i, fr, fg, fb) <= 40
            if (a < 220 || dRgb <= 110 || nearFill) grow.push(np)
          }
        }
      }
      for (const p of grow) {
        if (!filled[p]) paintAt(p * 4, p)
      }
    }

    // Commit: merge a clean fill-colour silhouette into the overlay (do not
    // wipe earlier overlay paint). Solid bake pixels get full cover so original
    // RGB (including white AA) cannot show through; soft shadow keeps its alpha.
    // Enclosed letter counters only need a vector punch — never bake into overlay.
    if (enclosedHole && isTransparentPaintColor(color)) {
      applyTransparentFlood(filled, layerId ?? 'content', ctx.canvas, true)
      return
    }
    const out = ctx.getImageData(0, 0, W, H)
    const od = out.data
    for (let p = 0; p < filled.length; p++) {
      if (!filled[p]) continue
      const i = p * 4
      const srcA = data[i + 3]
      if (srcA <= EMPTY_A && !clickedEmpty) continue
      const outA = clickedEmpty
        ? fa
        : outerKind === 'shadow'
          ? Math.round((srcA * fa) / 255)
          : srcA >= 16
            ? fa
            : Math.max(od[i + 3], Math.round((srcA * fa) / 255))
      od[i] = fr
      od[i + 1] = fg
      od[i + 2] = fb
      od[i + 3] = outA
    }
    ctx.putImageData(out, 0, 0)
    if (isTransparentPaintColor(color)) {
      applyTransparentFlood(filled, layerId ?? 'content', ctx.canvas, enclosedHole)
    } else if (!clickedEmpty) {
      punchFilledFromBase(underlay, filled)
      clearPunchHolesOverlapping(filled, layerId ?? 'content')
    } else {
      // Filling a transparent / punched hole with a solid colour — restore bake
      // pixels too so Save/live Outer is not left clear under the overlay.
      if (underlay) recolorFilledBase(underlay, filled, fr, fg, fb, fa, data)
      // Prefer recolouring the punched object itself; overlay under a restored
      // glyph is invisible once punchThrough is cleared.
      let rebound = false
      if (layerId) {
        const next = linesRef.current.map((item): LineObj => {
          if (vectorLayerOf(item) !== layerId || item.punchMask) return item
          const punchBits = punchMaskBits.get(item.id)
          const stBits = seeThroughMaskBits.get(item.id)
          const bits =
            punchBits && stBits && punchBits.length === stBits.length
              ? (() => {
                  const u = punchBits.slice()
                  for (let i = 0; i < u.length; i++) if (stBits[i]) u[i] = 1
                  return u
                })()
              : punchBits ?? stBits
          if (!bits || bits.length !== filled.length) return item
          let overlap = 0
          let seed: Pt | null = null
          for (let p = 0; p < filled.length; p++) {
            if (!filled[p] || !bits[p]) continue
            overlap++
            if (!seed) seed = { x: p % W, y: (p / W) | 0 }
          }
          if (overlap < 4 || !seed) return item
          const sectional = fillObjectRespectingCuts(item, seed)
          if (!sectional) return item
          rebound = true
          if (sectional.imageDataUrl) ensureStampImage(sectional.imageDataUrl, () => redrawLinesRef.current())
          return sectional
        })
        if (rebound) {
          linesRef.current = next
          commitLines(next)
        }
      }
      clearPunchHolesOverlapping(filled, layerId ?? 'content')
      if (layerId === 'container' && !isTransparentPaintColor(color)) {
        // Keep the hole fill on the overlay; don't treat this as a full Outer sync wipe.
        preserveOuterOverlayRef.current = true
      }
    }
  }

  const eyedrop = (sx: number, sy: number) => {
    const ctx = compositeCanvas().getContext('2d')!
    const d = ctx.getImageData(Math.floor(sx), Math.floor(sy), 1, 1).data
    const hex =
      '#' +
      [d[0], d[1], d[2], d[3]].map((v) => v.toString(16).padStart(2, '0')).join('')
    setColor(hex)
    setHexText(hex)
  }

  const finishPolygon = (opts?: { dropLastPoint?: boolean }) => {
    const pts = polyPts.current
    // Double-click finish: drop the vertex from the second click if it was added.
    if (opts?.dropLastPoint && pts.length > 0) pts.pop()
    polyDblClickSkippedRef.current = false
    if (pts.length < 2) { polyPts.current = []; clearPreview(); return }
    // Create an editable vector polygon (so it can be re-selected/edited) rather
    // than rasterizing it straight onto the layers.
    const nl: LineObj = {
      id: genId(),
      type: 'poly',
      pts: pts.map((p) => ({ ...p })),
      startCap: 'none',
      endCap: 'none',
      dash: lineDash,
      thickness: size,
      color,
      fill: shapeFill,
      borderColor,
      borderWidth: size,
      borderRadius,
      keepStrokeOnResize,
      layer: activeAddLayer(),
      punchThrough: shapeFill && transparentFillPunch()
    }
    linesRef.current = [...linesRef.current, nl]
    polyPts.current = []
    clearPreview()
    selectLine(nl)
    commitLines([...linesRef.current])
    redrawLines(); drawHandles()
    pushHistory()
  }
  finishPolygonRef.current = finishPolygon

  const drawPolyPreview = (cur?: { x: number; y: number }) => {
    const p = previewRef.current!.getContext('2d')!
    clearPreview()
    const pts = polyPts.current
    if (!pts.length) return
    strokeStyleFor(p)
    p.beginPath()
    p.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y)
    if (cur) p.lineTo(cur.x, cur.y)
    p.stroke()
    p.fillStyle = '#ffffff'
    for (const pt of pts) { p.beginPath(); p.arc(pt.x, pt.y, 3, 0, Math.PI * 2); p.fill() }
  }

  // ── Copy / paste ─────────────────────────────────────────────────────────────
  const CORNER_HIT = 10
  type Corner = 'nw' | 'ne' | 'sw' | 'se'
  const snapResizePointToCanvasEdges = (pt: Pt, _corner: Corner, excludeIds?: Set<string>): Pt => {
    const threshold = weakSnapThreshold()
    const { xGuides, yGuides } = collectSnapGuides(excludeIds)
    const xHit = xGuides
      .map((g) => ({ value: g.value, dist: Math.abs(pt.x - g.value) }))
      .filter((c) => c.dist <= threshold)
      .sort((a, b) => a.dist - b.dist)[0]
    const yHit = yGuides
      .map((g) => ({ value: g.value, dist: Math.abs(pt.y - g.value) }))
      .filter((c) => c.dist <= threshold)
      .sort((a, b) => a.dist - b.dist)[0]
    return {
      x: xHit ? xHit.value : pt.x,
      y: yHit ? yHit.value : pt.y
    }
  }
  const resizeEdgeGuide = (
    rect: { x: number; y: number; w: number; h: number },
    corner: Corner
  ): AlignmentSnap => {
    const west = corner === 'nw' || corner === 'sw'
    const north = corner === 'nw' || corner === 'ne'
    const xAt: AlignmentPoint | null = west
      ? (Math.abs(rect.x) < 0.75 ? 'start' : null)
      : (Math.abs(rect.x + rect.w - W) < 0.75 ? 'end' : null)
    const yAt: AlignmentPoint | null = north
      ? (Math.abs(rect.y) < 0.75 ? 'start' : null)
      : (Math.abs(rect.y + rect.h - H) < 0.75 ? 'end' : null)
    return { dx: 0, dy: 0, x: !!xAt, y: !!yAt, xAt, yAt }
  }
  const cornersOf = (x: number, y: number, w: number, h: number) => ({
    nw: { x, y },
    ne: { x: x + w, y },
    sw: { x, y: y + h },
    se: { x: x + w, y: y + h }
  } as const)
  const hitCorner = (x: number, y: number, w: number, h: number, pt: Pt): Corner | null => {
    const c = cornersOf(x, y, w, h)
    for (const k of ['nw', 'ne', 'sw', 'se'] as const) {
      if (dist(pt, c[k]) <= CORNER_HIT) return k
    }
    return null
  }
  const hitRectCorner = (
    x: number,
    y: number,
    w: number,
    h: number,
    pt: Pt,
    rot = 0,
    pivot?: Pt
  ): Corner | null => {
    const center = pivot ?? rectCenter(x, y, w, h)
    const c = cornersOf(x, y, w, h)
    for (const k of ['nw', 'ne', 'sw', 'se'] as const) {
      const cornerPt = rot ? rotatePt(c[k], center, rot) : c[k]
      if (dist(pt, cornerPt) <= CORNER_HIT) return k
    }
    return null
  }
  const resizeRect = (
    corner: Corner,
    start: { x: number; y: number; w: number; h: number },
    pt: Pt,
    lockAspect = false
  ): { x: number; y: number; w: number; h: number } => {
    if (lockAspect && start.w >= 4 && start.h >= 4) {
      const aspect = start.w / start.h
      let fixedX: number
      let fixedY: number
      if (corner === 'se') { fixedX = start.x; fixedY = start.y }
      else if (corner === 'sw') { fixedX = start.x + start.w; fixedY = start.y }
      else if (corner === 'ne') { fixedX = start.x; fixedY = start.y + start.h }
      else { fixedX = start.x + start.w; fixedY = start.y + start.h }

      let w = Math.abs(pt.x - fixedX)
      let h = Math.abs(pt.y - fixedY)
      if (w / aspect > h) h = w / aspect
      else w = h * aspect

      // Keep the resized box inside the canvas. The opposite corner remains fixed.
      const growsRight = corner === 'se' || corner === 'ne'
      const growsDown = corner === 'se' || corner === 'sw'
      const maxW = Math.max(0, growsRight ? W - fixedX : fixedX)
      const maxH = Math.max(0, growsDown ? H - fixedY : fixedY)
      const fit = Math.min(1, maxW / Math.max(1, w), maxH / Math.max(1, h))
      w *= fit
      h *= fit
      // Keep a 4px minimum where space permits without ever crossing an edge.
      const minW = Math.min(4, maxW, maxH * aspect)
      w = Math.max(minW, w)
      h = w / aspect

      if (corner === 'se') return { x: fixedX, y: fixedY, w, h }
      if (corner === 'sw') return { x: fixedX - w, y: fixedY, w, h }
      if (corner === 'ne') return { x: fixedX, y: fixedY - h, w, h }
      return { x: fixedX - w, y: fixedY - h, w, h }
    }

    // The dragged corner may touch, but never pass, a canvas edge.
    const bounded = {
      x: Math.max(0, Math.min(W, pt.x)),
      y: Math.max(0, Math.min(H, pt.y))
    }
    let x = start.x, y = start.y, w = start.w, h = start.h
    if (corner === 'nw') { w = start.x + start.w - bounded.x; h = start.y + start.h - bounded.y; x = bounded.x; y = bounded.y }
    else if (corner === 'ne') { w = bounded.x - start.x; h = start.y + start.h - bounded.y; y = bounded.y }
    else if (corner === 'sw') { w = start.x + start.w - bounded.x; h = bounded.y - start.y; x = bounded.x }
    else { w = bounded.x - start.x; h = bounded.y - start.y }
    if (w < 4) { if (corner === 'nw' || corner === 'sw') x = start.x + start.w - 4; w = 4 }
    if (h < 4) { if (corner === 'nw' || corner === 'ne') y = start.y + start.h - 4; h = 4 }
    return { x, y, w, h }
  }

  type HalfSizeSnap = {
    rect: { x: number; y: number; w: number; h: number }
    width: boolean
    height: boolean
  }
  /** Snap resized selections near 50% of the canvas width or height (weak + short hysteresis). */
  const snapResizeToHalfCanvas = (
    rect: { x: number; y: number; w: number; h: number },
    corner: Corner,
    start: { x: number; y: number; w: number; h: number },
    lockAspect: boolean
  ): HalfSizeSnap => {
    const screenRect = previewRef.current?.getBoundingClientRect()
    const scale = screenRect?.width ? W / screenRect.width : 1
    // Weak engage; short release so the magnet does not fight nearby object snaps.
    const threshold = 5 * scale
    const releaseThreshold = 12 * scale
    const targetW = W / 2
    const targetH = H / 2
    const widthNear = Math.abs(rect.w - targetW) <= (
      resizeSnapLockRef.current.width ? releaseThreshold : threshold
    )
    const heightNear = Math.abs(rect.h - targetH) <= (
      resizeSnapLockRef.current.height ? releaseThreshold : threshold
    )
    const fixedX = corner === 'se' || corner === 'ne' ? start.x : start.x + start.w
    const fixedY = corner === 'se' || corner === 'sw' ? start.y : start.y + start.h
    const place = (w: number, h: number) => ({
      x: corner === 'nw' || corner === 'sw' ? fixedX - w : fixedX,
      y: corner === 'nw' || corner === 'ne' ? fixedY - h : fixedY,
      w,
      h
    })
    const fits = (r: { x: number; y: number; w: number; h: number }) =>
      r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H

    if (lockAspect && start.w > 0 && start.h > 0) {
      const aspect = start.w / start.h
      const options: { rect: typeof rect; width: boolean; height: boolean; error: number }[] = []
      if (widthNear) {
        const candidate = place(targetW, targetW / aspect)
        if (fits(candidate)) options.push({
          rect: candidate,
          width: true,
          height: Math.abs(candidate.h - targetH) < 0.5,
          error: Math.abs(rect.w - targetW)
        })
      }
      if (heightNear) {
        const candidate = place(targetH * aspect, targetH)
        if (fits(candidate)) options.push({
          rect: candidate,
          width: Math.abs(candidate.w - targetW) < 0.5,
          height: true,
          error: Math.abs(rect.h - targetH)
        })
      }
      if (options.length) {
        options.sort((a, b) => a.error - b.error)
        resizeSnapLockRef.current.width = options[0].width
        resizeSnapLockRef.current.height = options[0].height
        return options[0]
      }
      resizeSnapLockRef.current = { width: false, height: false }
      return { rect, width: false, height: false }
    }

    let next = rect
    let width = false
    let height = false
    if (widthNear) {
      const candidate = place(targetW, next.h)
      if (fits(candidate)) { next = candidate; width = true }
    }
    if (heightNear) {
      const candidate = place(next.w, targetH)
      if (fits(candidate)) { next = candidate; height = true }
    }
    resizeSnapLockRef.current = { width, height }
    return { rect: next, width, height }
  }

  /**
   * Weak size match to other objects' width/height (and keep half-canvas if closer).
   * Fixed opposite corner; easy to override (~4px).
   */
  const snapResizeMatchOtherSizes = (
    rect: { x: number; y: number; w: number; h: number },
    corner: Corner,
    start: { x: number; y: number; w: number; h: number },
    lockAspect: boolean,
    excludeIds?: Set<string>
  ): { rect: typeof rect; width: boolean; height: boolean; align: AlignmentSnap } => {
    const threshold = weakSnapThreshold()
    const { widths, heights } = collectSnapGuides(excludeIds)
    const fixedX = corner === 'se' || corner === 'ne' ? start.x : start.x + start.w
    const fixedY = corner === 'se' || corner === 'sw' ? start.y : start.y + start.h
    const place = (w: number, h: number) => ({
      x: corner === 'nw' || corner === 'sw' ? fixedX - w : fixedX,
      y: corner === 'nw' || corner === 'ne' ? fixedY - h : fixedY,
      w: Math.max(4, w),
      h: Math.max(4, h)
    })
    let next = rect
    let width = false
    let height = false
    let xGuide: number | null = null
    let yGuide: number | null = null
    let xLabel: string | null = null
    let yLabel: string | null = null

    if (lockAspect && start.w > 0 && start.h > 0) {
      const aspect = start.w / start.h
      type Opt = { rect: typeof rect; error: number; width: boolean; height: boolean; xG: number | null; yG: number | null }
      const options: Opt[] = []
      for (const tw of widths) {
        if (Math.abs(rect.w - tw) > threshold) continue
        const candidate = place(tw, tw / aspect)
        options.push({
          rect: candidate,
          error: Math.abs(rect.w - tw),
          width: true,
          height: Math.abs(candidate.h - H / 2) < 0.5 || heights.some((th) => Math.abs(candidate.h - th) < 0.5),
          xG: fixedX + (corner === 'nw' || corner === 'sw' ? -tw : tw),
          yG: null
        })
      }
      for (const th of heights) {
        if (Math.abs(rect.h - th) > threshold) continue
        const candidate = place(th * aspect, th)
        options.push({
          rect: candidate,
          error: Math.abs(rect.h - th),
          width: Math.abs(candidate.w - W / 2) < 0.5 || widths.some((tw) => Math.abs(candidate.w - tw) < 0.5),
          height: true,
          xG: null,
          yG: fixedY + (corner === 'nw' || corner === 'ne' ? -th : th)
        })
      }
      if (options.length) {
        options.sort((a, b) => a.error - b.error)
        const best = options[0]
        next = best.rect
        width = best.width
        height = best.height
        xGuide = best.xG
        yGuide = best.yG
        xLabel = best.width ? 'Match width' : null
        yLabel = best.height ? 'Match height' : null
      }
    } else {
      const wHit = widths
        .map((tw) => ({ tw, dist: Math.abs(rect.w - tw) }))
        .filter((c) => c.dist <= threshold)
        .sort((a, b) => a.dist - b.dist)[0]
      const hHit = heights
        .map((th) => ({ th, dist: Math.abs(rect.h - th) }))
        .filter((c) => c.dist <= threshold)
        .sort((a, b) => a.dist - b.dist)[0]
      if (wHit) {
        next = place(wHit.tw, next.h)
        width = true
        xGuide = next.x + (corner === 'nw' || corner === 'sw' ? 0 : next.w)
        xLabel = Math.abs(wHit.tw - W / 2) < 0.5 ? '50% width' : 'Match width'
      }
      if (hHit) {
        next = place(next.w, hHit.th)
        height = true
        yGuide = next.y + (corner === 'nw' || corner === 'ne' ? 0 : next.h)
        yLabel = Math.abs(hHit.th - H / 2) < 0.5 ? '50% height' : 'Match height'
      }
    }

    // Edge-touch snap on free sides (after size), still weak.
    const { xGuides, yGuides } = collectSnapGuides(excludeIds)
    const west = corner === 'nw' || corner === 'sw'
    const north = corner === 'nw' || corner === 'ne'
    const freeX = west ? next.x : next.x + next.w
    const freeY = north ? next.y : next.y + next.h
    const xEdge = xGuides
      .map((g) => ({ g, dist: Math.abs(freeX - g.value) }))
      .filter((c) => c.dist <= threshold)
      .sort((a, b) => a.dist - b.dist)[0]
    const yEdge = yGuides
      .map((g) => ({ g, dist: Math.abs(freeY - g.value) }))
      .filter((c) => c.dist <= threshold)
      .sort((a, b) => a.dist - b.dist)[0]
    if (xEdge) {
      if (west) {
        const right = next.x + next.w
        next = { ...next, x: xEdge.g.value, w: Math.max(4, right - xEdge.g.value) }
      } else {
        next = { ...next, w: Math.max(4, xEdge.g.value - next.x) }
      }
      xGuide = xEdge.g.value
      xLabel = xEdge.g.label
    }
    if (yEdge) {
      if (north) {
        const bottom = next.y + next.h
        next = { ...next, y: yEdge.g.value, h: Math.max(4, bottom - yEdge.g.value) }
      } else {
        next = { ...next, h: Math.max(4, yEdge.g.value - next.y) }
      }
      yGuide = yEdge.g.value
      yLabel = yEdge.g.label
    }

    return {
      rect: next,
      width,
      height,
      align: {
        dx: 0,
        dy: 0,
        x: xGuide != null,
        y: yGuide != null,
        xAt: null,
        yAt: null,
        xGuide,
        yGuide,
        xLabel,
        yLabel
      }
    }
  }

  const drawHalfSizeGuides = (
    rect: { x: number; y: number; w: number; h: number },
    snap: Pick<HalfSizeSnap, 'width' | 'height'>
  ) => {
    if (!snap.width && !snap.height) return
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    const screenRect = previewRef.current?.getBoundingClientRect()
    const scale = screenRect?.width ? W / screenRect.width : 1
    p.save()
    p.strokeStyle = '#ec4899'
    p.fillStyle = '#ec4899'
    p.lineWidth = Math.max(1, 1.25 * scale)
    p.setLineDash([5 * scale, 4 * scale])
    p.font = `600 ${11 * scale}px Inter, sans-serif`
    if (snap.width) {
      p.beginPath()
      p.moveTo(rect.x, 0)
      p.lineTo(rect.x, H)
      p.moveTo(rect.x + rect.w, 0)
      p.lineTo(rect.x + rect.w, H)
      p.stroke()
      p.textAlign = 'center'
      p.textBaseline = 'top'
      p.fillText('50% width', rect.x + rect.w / 2, 7 * scale)
    }
    if (snap.height) {
      p.beginPath()
      p.moveTo(0, rect.y)
      p.lineTo(W, rect.y)
      p.moveTo(0, rect.y + rect.h)
      p.lineTo(W, rect.y + rect.h)
      p.stroke()
      p.textAlign = 'left'
      p.textBaseline = 'middle'
      p.fillText('50% height', 7 * scale, rect.y + rect.h / 2)
    }
    p.restore()
  }

  const scaleFloatTo = (
    f: {
      canvas: HTMLCanvasElement
      x: number
      y: number
      source?: HTMLCanvasElement
      selectable?: boolean
      sourceLayer?: PaintLayerId
      layerCanvases?: {
        layer: PaintLayerId
        canvas: HTMLCanvasElement
        source: HTMLCanvasElement
        baseSource: HTMLCanvasElement
      }[]
      vectorState?: {
        originalLines: LineObj[]
        selectedIds: string[]
        sourceRect: { x: number; y: number; w: number; h: number }
        sourcePivot?: Pt
      }
    },
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    const nw = Math.max(4, Math.round(w))
    const nh = Math.max(4, Math.round(h))
    if (!f.source) f.source = cloneCanvas(f.canvas)
    const src = f.source
    const canvas = document.createElement('canvas')
    canvas.width = nw
    canvas.height = nh
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, 0, 0, nw, nh)
    f.canvas = canvas
    if (f.layerCanvases) {
      for (const item of f.layerCanvases) {
        const scaleCrop = (src: HTMLCanvasElement) => {
          const scaled = document.createElement('canvas')
          scaled.width = nw
          scaled.height = nh
          const scaledCtx = scaled.getContext('2d')!
          scaledCtx.imageSmoothingEnabled = true
          scaledCtx.imageSmoothingQuality = 'high'
          scaledCtx.drawImage(src, 0, 0, nw, nh)
          return scaled
        }
        const scaledOverlay = scaleCrop(item.source)
        const scaledBase = scaleCrop(item.baseSource)
        item.source = cloneCanvas(scaledOverlay)
        item.baseSource = cloneCanvas(scaledBase)
        const combined = document.createElement('canvas')
        combined.width = nw
        combined.height = nh
        const combinedCtx = combined.getContext('2d')!
        combinedCtx.drawImage(scaledBase, 0, 0)
        combinedCtx.drawImage(scaledOverlay, 0, 0)
        item.canvas = combined
      }
    }
    f.x = Math.max(0, Math.min(W - nw, Math.round(x)))
    f.y = Math.max(0, Math.min(H - nh, Math.round(y)))
  }

  const bakeFloatRotation = (f: NonNullable<typeof floatRef.current>) => {
    const rot = f.rot ?? 0
    if (Math.abs(rot) < 0.001) return
    const w = f.canvas.width
    const h = f.canvas.height
    const pivot = floatRotationPivot(f)
    const corners = rectCorners(f.x, f.y, w, h, rot, pivot)
    let left = W, top = H, right = -1, bottom = -1
    for (const p of corners) {
      left = Math.min(left, p.x)
      top = Math.min(top, p.y)
      right = Math.max(right, p.x)
      bottom = Math.max(bottom, p.y)
    }
    const newW = Math.max(1, Math.ceil(right - left))
    const newH = Math.max(1, Math.ceil(bottom - top))
    const bakeCanvas = (src: HTMLCanvasElement, sw = w, sh = h): HTMLCanvasElement => {
      const out = document.createElement('canvas')
      out.width = newW
      out.height = newH
      const ctx = out.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.save()
      ctx.translate(-left, -top)
      drawCanvasRotatedAt(ctx, src, f.x, f.y, sw, sh, pivot, rot)
      ctx.restore()
      return out
    }
    f.canvas = bakeCanvas(f.canvas)
    f.source = cloneCanvas(f.canvas)
    if (f.layerCanvases) {
      for (const item of f.layerCanvases) {
        item.source = bakeCanvas(item.source, item.source.width, item.source.height)
        item.baseSource = bakeCanvas(item.baseSource, item.baseSource.width, item.baseSource.height)
        const combined = document.createElement('canvas')
        combined.width = item.source.width
        combined.height = item.source.height
        const combinedCtx = combined.getContext('2d')!
        combinedCtx.drawImage(item.baseSource, 0, 0)
        combinedCtx.drawImage(item.source, 0, 0)
        item.canvas = combined
      }
    }
    f.x = Math.round(left)
    f.y = Math.round(top)
    f.rot = 0
  }

  const drawRectRotatePin = (
    p: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    rot = 0,
    pivot?: Pt
  ) => {
    const anchor = rectRotatePinAnchor(x, y, w, h, rot, pivot)
    const pin = rectRotatePinTip(x, y, w, h, rot, pivot)
    p.save()
    p.strokeStyle = '#10b981'
    p.lineWidth = 2
    p.setLineDash([])
    p.beginPath()
    p.moveTo(anchor.x, anchor.y)
    p.lineTo(pin.x, pin.y)
    p.stroke()
    p.fillStyle = '#ffffff'
    p.strokeStyle = '#10b981'
    p.beginPath()
    p.arc(pin.x, pin.y, 7, 0, Math.PI * 2)
    p.fill()
    p.stroke()
    p.restore()
  }

  const drawFloatRotationGuide = (center: Pt, rot: number, snapped: boolean) => {
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    const rect = previewRef.current?.getBoundingClientRect()
    const scale = rect?.width ? W / rect.width : 1
    const radius = 34 * scale
    const start = -Math.PI / 2
    const end = start + rot
    const reference = { x: center.x, y: center.y - radius }
    const direction = rotatePt(reference, center, rot)
    const color = snapped ? '#ec4899' : '#22d3ee'
    const degrees = ((rot * 180 / Math.PI) % 360 + 360) % 360
    const rounded = Math.round(degrees * 10) / 10
    const label = `${rounded}°`
    p.save()
    p.strokeStyle = color
    p.fillStyle = color
    p.lineWidth = Math.max(1, 1.5 * scale)
    p.setLineDash([5 * scale, 4 * scale])
    p.beginPath()
    p.moveTo(center.x, center.y)
    p.lineTo(reference.x, reference.y)
    p.moveTo(center.x, center.y)
    p.lineTo(direction.x, direction.y)
    p.stroke()
    p.setLineDash([])
    if (Math.abs(rot) > 0.002) {
      p.beginPath()
      p.arc(center.x, center.y, radius * 0.62, start, end, rot < 0)
      p.stroke()
    }
    p.beginPath()
    p.arc(center.x, center.y, 3.5 * scale, 0, Math.PI * 2)
    p.fill()
    p.font = `600 ${12 * scale}px Inter, sans-serif`
    const tw = p.measureText(label).width
    const padX = 6 * scale
    const padY = 4 * scale
    const lx = direction.x + 10 * scale
    const ly = direction.y - 10 * scale
    p.fillStyle = 'rgba(15, 23, 42, 0.92)'
    roundedRect(p, lx - padX, ly - 12 * scale - padY, tw + padX * 2, 16 * scale + padY * 2, 5 * scale)
    p.fill()
    p.fillStyle = '#ffffff'
    p.textAlign = 'left'
    p.textBaseline = 'alphabetic'
    p.fillText(label, lx, ly)
    p.restore()
  }

  const drawSelOverlay = () => {
    const p = previewRef.current?.getContext('2d')
    if (!p) return
    p.clearRect(0, 0, W, H)
    const box = (
      x: number,
      y: number,
      w: number,
      h: number,
      scaled: boolean,
      rot = 0,
      image?: HTMLCanvasElement,
      pivot?: Pt
    ) => {
      const color = scaled ? '#f59e0b' : '#3b82f6'
      const corners = rectCorners(x, y, w, h, rot, pivot)
      if (image) {
        const px = pivot ?? rectCenter(x, y, w, h)
        drawCanvasRotatedAt(p, image, x, y, w, h, px, rot)
      }
      p.save()
      p.lineWidth = 1.5
      p.setLineDash([6, 4])
      p.strokeStyle = 'rgba(0,0,0,0.55)'
      p.beginPath()
      p.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < corners.length; i++) p.lineTo(corners[i].x, corners[i].y)
      p.closePath()
      p.stroke()
      p.strokeStyle = color
      p.lineDashOffset = 3
      p.stroke()
      p.restore()
      p.save()
      p.fillStyle = '#ffffff'
      p.strokeStyle = color
      p.lineWidth = 2
      p.setLineDash([])
      for (const corner of corners) {
        p.beginPath()
        p.arc(corner.x, corner.y, 5, 0, Math.PI * 2)
        p.fill()
        p.stroke()
      }
      p.restore()
      drawRectRotatePin(p, x, y, w, h, rot, pivot)
    }
    const f = floatRef.current
    if (f) {
      const w = f.canvas.width
      const h = f.canvas.height
      const isMarquee = !!(f.layerCanvases?.length || f.sourceLayer)
      if (isMarquee) {
        const { sr, sc, dp, rot, sx, sy } = marqueeFloatDrawParams(f)
        const corners = marqueeFloatCorners(f)
        const color = '#f59e0b'
        drawCanvasAtMarqueeTransform(p, f.canvas, sr, sc, dp, rot, sx, sy)
        p.save()
        p.lineWidth = 1.5
        p.setLineDash([6, 4])
        p.strokeStyle = 'rgba(0,0,0,0.55)'
        p.beginPath()
        p.moveTo(corners[0].x, corners[0].y)
        for (let i = 1; i < corners.length; i++) p.lineTo(corners[i].x, corners[i].y)
        p.closePath()
        p.stroke()
        p.strokeStyle = color
        p.lineDashOffset = 3
        p.stroke()
        p.restore()
        p.save()
        p.fillStyle = '#ffffff'
        p.strokeStyle = color
        p.lineWidth = 2
        p.setLineDash([])
        for (const corner of corners) {
          p.beginPath()
          p.arc(corner.x, corner.y, 5, 0, Math.PI * 2)
          p.fill()
          p.stroke()
        }
        p.restore()
        const { anchor: pinAnchor, tip: pinTip } = marqueeFloatRotatePinPoints(f)
        drawRotatePinAt(p, pinAnchor, pinTip)
        return
      }
      const pivot = floatRotationPivot(f)
      box(f.x, f.y, w, h, true, f.rot ?? 0, f.canvas, pivot)
      return
    }
    const m = marqueeRef.current
    if (m) box(m.x, m.y, m.w, m.h, false)
  }

  nudgeSelectedRef.current = (dx, dy) => {
    const crop = cropSessionRef.current
    if (crop) {
      const l = linesRef.current.find((item) => item.id === crop.id)
      if (l && l.type === 'stamp') {
        crop.imgX += dx
        crop.imgY += dy
        clampCropPan(crop)
        l.pts = [
          { x: crop.imgX, y: crop.imgY },
          { x: crop.imgX + crop.imgW, y: crop.imgY + crop.imgH }
        ]
        redrawLines()
        drawHandles()
        return
      }
    }
    const f = floatRef.current
    if (f) {
      const dp = marqueeFloatDestPivot(f)
      setMarqueeFloatPosition(f, { x: dp.x + dx, y: dp.y + dy })
      drawSelOverlay()
      return
    }
    const m = marqueeRef.current
    if (m && !selectedIdRef.current) {
      if (!floatRef.current) liftMarquee()
      const lifted = floatRef.current
      if (lifted) {
        const dp = marqueeFloatDestPivot(lifted)
        setMarqueeFloatPosition(lifted, { x: dp.x + dx, y: dp.y + dy })
        drawSelOverlay()
        return
      }
      m.x += dx
      m.y += dy
      drawSelOverlay()
      return
    }
    if (!selectedIdRef.current) return
    updateSelectedLive((l) => ({
      pts: l.pts.map((p) => ({ x: p.x + dx, y: p.y + dy }))
    }))
    const id = selectedIdRef.current
    syncHolesAfterGeomChange(
      linesRef.current as HoleItem[],
      W,
      H,
      holeGeom,
      linesRef.current
        .filter((item) => item.id === id || item.parentId === id)
        .map((item) => item.id)
    )
  }

  nudgeEraserRef.current = (dx, dy) => {
    if (!drawing.current) return
    const from = lastPt.current
    const to = {
      x: Math.max(0, Math.min(W, from.x + dx)),
      y: Math.max(0, Math.min(H, from.y + dy))
    }
    if (to.x === from.x && to.y === from.y) {
      drawEraserCursor(to)
      return
    }
    const c = pixelColor(color)
    const activeObjectStroke = objectPaintStrokeRef.current
    if (activeObjectStroke) {
      const l = linesRef.current.find((item) => item.id === activeObjectStroke.id)
      const stroke = l?.paintStrokes?.[activeObjectStroke.index]
      if (l && stroke) {
        stroke.pts.push(shapeLocalPaintPoint(l, to))
        redrawLines()
      }
    } else {
      for (const ctx of targetCtxs()) {
        strokeBrushTip(ctx, eraserTip, from.x, from.y, to.x, to.y, size, c, true)
      }
      redrawLines()
    }
    lastPt.current = to
    eraserArrowLockedRef.current = true
    drawEraserCursor(to)
  }

  // Composite of ALL currently-checked editable layers — used for marquee copy/lift.
  const compositeTargets = (): HTMLCanvasElement => {
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const x = c.getContext('2d')!
    for (const canvas of targetCanvases()) x.drawImage(canvas, 0, 0)
    return c
  }

  /** Visible layer stack crop — includes punch-through, vectors, and overlay order. */
  const cropPaintStackLayer = (
    layer: PaintLayerId,
    x: number,
    y: number,
    w: number,
    h: number
  ): HTMLCanvasElement => {
    const full = document.createElement('canvas')
    full.width = W
    full.height = H
    paintStackSlot(full.getContext('2d')!, layer, { skipId: textEditIdRef.current })
    const cropped = document.createElement('canvas')
    cropped.width = w
    cropped.height = h
    cropped.getContext('2d')!.drawImage(full, x, y, w, h, 0, 0, w, h)
    return cropped
  }

  const cropVisibleMarqueeComposite = (
    x: number,
    y: number,
    w: number,
    h: number,
    layers: PaintLayerId[]
  ): HTMLCanvasElement => {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    for (const layer of layers) {
      ctx.drawImage(cropPaintStackLayer(layer, x, y, w, h), 0, 0)
    }
    return canvas
  }

  /** Fit a multi-object marquee to the exact visible bounds of touched selected layers. */
  const fitMarqueeToSelectedLayers = (
    marquee: { x: number; y: number; w: number; h: number }
  ): boolean => {
    const selectedIds = new Set(
      [...selectedLayerIds].filter((id) => {
        const l = linesRef.current.find((item) => item.id === id)
        return !!l && !l.marqueeItem && isVectorVisible(l)
      })
    )
    if (selectedIds.size < 2) return false

    const hasSelectedAncestor = (l: LineObj): boolean => {
      let parentId = l.parentId
      while (parentId) {
        if (selectedIds.has(parentId)) return true
        parentId = linesRef.current.find((item) => item.id === parentId)?.parentId
      }
      return false
    }
    const intersects = (b: { x: number; y: number; w: number; h: number }): boolean =>
      b.x + b.w >= marquee.x && b.x <= marquee.x + marquee.w &&
      b.y + b.h >= marquee.y && b.y <= marquee.y + marquee.h
    const touched = linesRef.current.filter((l) =>
      selectedIds.has(l.id) && !hasSelectedAncestor(l) && intersects(boundsForLine(l))
    )
    if (!touched.length) return false

    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    for (const l of touched) {
      if (l.type === 'group') renderGroup(ctx, l, linesRef.current, isVectorVisible)
      else renderLine(ctx, l)
    }
    const data = ctx.getImageData(0, 0, W, H).data
    let left = W, top = H, right = -1, bottom = -1
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] === 0) continue
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
    if (right < left || bottom < top) return false
    marquee.x = left
    marquee.y = top
    marquee.w = right - left + 1
    marquee.h = bottom - top + 1
    return true
  }

  const cloneCanvas = (src: HTMLCanvasElement): HTMLCanvasElement => {
    const c = document.createElement('canvas')
    c.width = src.width; c.height = src.height
    c.getContext('2d')!.drawImage(src, 0, 0)
    return c
  }

  const rasterizeLayerCanvasesFloat = (
    f: NonNullable<typeof floatRef.current>
  ) => {
    if (!f.layerCanvases?.length) return
    const { sr, sc, dp, rot, sx, sy } = marqueeFloatDrawParams(f)
    const drawAt = (
      dest: CanvasRenderingContext2D,
      src: HTMLCanvasElement
    ) => {
      drawCanvasAtMarqueeTransform(dest, src, sr, sc, dp, rot, sx, sy)
    }
    for (const item of f.layerCanvases) {
      const overlayCtx = layerCanvas(item.layer)?.getContext('2d')
      if (overlayCtx) drawAt(overlayCtx, item.source)
      const baseCtx = baseCanvas(item.layer)?.getContext('2d')
      if (baseCtx) drawAt(baseCtx, item.baseSource)
    }
  }

  /** Clear only the lift origin — never wipe the destination before stamping. */
  const clearFloatOriginAreas = (f: NonNullable<typeof floatRef.current>) => {
    if (f.originX == null || f.originY == null) return
    const r = {
      x: f.originX,
      y: f.originY,
      w: f.originW ?? f.canvas.width,
      h: f.originH ?? f.canvas.height
    }
    const layerIds = f.layerCanvases?.length
      ? f.layerCanvases.map((item) => item.layer)
      : [...layerOrderRef.current].reverse().filter(layerIsEditable)
    for (const id of layerIds) {
      layerCanvas(id)?.getContext('2d')?.clearRect(r.x, r.y, r.w, r.h)
      baseCanvas(id)?.getContext('2d')?.clearRect(r.x, r.y, r.w, r.h)
    }
  }

  const applyPermanentMarqueeCuts = (
    mask: { rect: { x: number; y: number; w: number; h: number }; ids: string[] }
  ) => {
    const idSet = new Set(mask.ids)
    const rootIds: string[] = []
    for (const id of mask.ids) {
      let line = linesRef.current.find((l) => l.id === id)
      if (!line) continue
      while (line.parentId && idSet.has(line.parentId)) {
        line = linesRef.current.find((l) => l.id === line!.parentId)!
      }
      if (!rootIds.includes(line.id)) rootIds.push(line.id)
    }

    let next = [...linesRef.current]
    const added: LineObj[] = []
    for (const rootId of rootIds) {
      const line = next.find((l) => l.id === rootId)
      if (!line) continue
      const result = rasterizeRemainderAfterMarqueeCut(W, H, line, mask.rect, next, isVectorVisible)
      next = result.lines
      added.push(...result.added)
    }
    next = [...next, ...added]
    linesRef.current = next
    commitLines(next)
  }

  const addMarqueeItemFromFloat = (f: NonNullable<typeof floatRef.current>) => {
    const { canvas: baked, bounds } = bakeMarqueeFloatCanvas(f)
    const dataUrl = baked.toDataURL('image/png')
    ensureStampImage(dataUrl)
    const nl: LineObj = {
      id: genId(),
      type: 'stamp',
      pts: [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.w, y: bounds.y + bounds.h }
      ],
      startCap: 'none',
      endCap: 'none',
      dash: 'solid',
      thickness: 0,
      color: '#000000ff',
      imageDataUrl: dataUrl,
      stampSource: 'image',
      rot: 0,
      name: 'Marquee cut',
      layer: f.sourceLayer ?? activeAddLayer()
    }
    linesRef.current = [...linesRef.current, nl]
    commitLines(linesRef.current)
    return nl
  }

  const restoreTransformedMarqueeVectors = (
    f: NonNullable<typeof floatRef.current>,
    rotOverride?: number
  ) => {
    const state = f.vectorState
    if (!state) return
    const snapshot = state.originalLines
    const { sx, sy } = marqueeFloatTransform(f)
    const rot = rotOverride ?? f.rot ?? 0
    const sc = state.sourcePivot
    const dp = floatDestPivot(f, state.sourceRect)
    const selected = new Set(state.selectedIds)
    const next = cloneLines(linesRef.current)

    const transformId = (id: string) => {
      const source = snapshot.find((item) => item.id === id)
      if (!source) return
      const transformed = applyMarqueeTransformToLine(source, sc, dp, sx, sy, rot)
      const idx = next.findIndex((item) => item.id === id)
      if (idx >= 0) next[idx] = transformed
      else next.push(transformed)
    }

    for (const id of selected) {
      const source = snapshot.find((item) => item.id === id)
      if (!source) continue
      if (source.parentId && selected.has(source.parentId)) continue

      if (source.type === 'group') {
        for (const childId of descendantIds(id, snapshot)) {
          if (!selected.has(childId)) continue
          const child = snapshot.find((item) => item.id === childId)
          if (!child || child.type === 'group') continue
          transformId(childId)
        }
      } else {
        transformId(id)
      }
    }

    linesRef.current = next
    syncGroupBounds(next)
    commitLines(next)
  }

  const commitFloat = () => {
    const f = floatRef.current
    if (!f) return
    if (f.selectable) {
      if (Math.abs(f.rot ?? 0) > 0.001) bakeFloatRotation(f)
      const dataUrl = f.canvas.toDataURL('image/png')
      ensureStampImage(dataUrl)
      const nl: LineObj = {
        id: genId(),
        type: 'stamp',
        pts: [
          { x: f.x, y: f.y },
          { x: f.x + f.canvas.width, y: f.y + f.canvas.height }
        ],
        startCap: 'none',
        endCap: 'none',
        dash: 'solid',
        thickness: 0,
        color: '#000000ff',
        imageDataUrl: dataUrl,
        stampSource: 'image',
        rot: 0,
        marqueeItem: !!f.sourceLayer,
        layer: f.sourceLayer ?? activeAddLayer()
      }
      floatRef.current = null
      marqueeRef.current = null
      setHasMarquee(false)
      linesRef.current = [...linesRef.current, nl]
      commitLines(linesRef.current)
      selectLine(nl)
      // Finalized marquee content is now a normal object. Pointer mode is the
      // only mode allowed to manipulate normal objects.
      if (tool !== 'pointer') setTool('pointer')
      redrawLines()
      drawHandles()
      pushHistory()
      return
    }
    const savedRot = f.rot ?? 0
    restoreTransformedMarqueeVectors(f, savedRot)
    clearFloatOriginAreas(f)
    const liftedVectors = f.vectorState?.selectedIds.length ?? 0
    const hasPartial = !!(f.partialVectorMask?.ids.length)
    if (liftedVectors) rasterizeLayerCanvasesFloat(f)
    if (hasPartial || !liftedVectors) {
      if (hasPartial) applyPermanentMarqueeCuts(f.partialVectorMask!)
      const nl = addMarqueeItemFromFloat(f)
      selectLine(nl)
    }
    partialVectorMaskRef.current = null
    invalidatePaintCaches()
    floatRef.current = null
    setHasMarquee(false)
    drawSelOverlay()
    redrawLines()
    pushHistory()
  }

  // Lift marquee pixels into a floating selection (clears them from editable layers).
  const liftMarquee = () => {
    const m = marqueeRef.current
    if (!m || m.w < 3 || m.h < 3) { marqueeRef.current = null; setHasMarquee(false); drawSelOverlay(); return }
    partialVectorMaskRef.current = null
    const x = Math.round(m.x), y = Math.round(m.y), w = Math.round(m.w), h = Math.round(m.h)
    const activeLayers = [...layerOrderRef.current].reverse().filter(layerIsEditable)
    const layerCanvases = activeLayers.map((layer) => {
      const overlayOnly = document.createElement('canvas')
      overlayOnly.width = w
      overlayOnly.height = h
      const overlayCanvas = layerCanvas(layer)
      if (overlayCanvas) {
        overlayOnly.getContext('2d')!.drawImage(overlayCanvas, x, y, w, h, 0, 0, w, h)
      }
      const baseOnly = document.createElement('canvas')
      baseOnly.width = w
      baseOnly.height = h
      const base = baseCanvas(layer)
      if (base) baseOnly.getContext('2d')!.drawImage(base, x, y, w, h, 0, 0, w, h)
      const cropped = document.createElement('canvas')
      cropped.width = w
      cropped.height = h
      const cropCtx = cropped.getContext('2d')!
      cropCtx.drawImage(baseOnly, 0, 0)
      cropCtx.drawImage(overlayOnly, 0, 0)
      return {
        layer,
        canvas: cropped,
        source: cloneCanvas(overlayOnly),
        baseSource: cloneCanvas(baseOnly)
      }
    })
    // Visible stack (punch-through + vectors) for float preview and stamp baking.
    const canvas = cropVisibleMarqueeComposite(x, y, w, h, activeLayers)

    // Only remove vector objects fully contained in the marquee. Partial overlap
    // stays on the canvas (raster pixels in the box are still lifted).
    const intersectsMarquee = (line: LineObj) => {
      const b = boundsForLine(line)
      return b.x + b.w >= x && b.x <= x + w && b.y + b.h >= y && b.y <= y + h
    }
    const fullyInsideMarquee = (line: LineObj) => {
      const b = boundsForLine(line)
      return (
        b.x >= x &&
        b.y >= y &&
        b.x + b.w <= x + w &&
        b.y + b.h <= y + h
      )
    }
    const liftRoots = linesRef.current.filter(
      (line) => !line.parentId && isVectorVisible(line) && fullyInsideMarquee(line)
    )
    const previewRoots = linesRef.current.filter(
      (line) => !line.parentId && isVectorVisible(line) && intersectsMarquee(line)
    )
    const selectedIds = new Set<string>()
    const includeSubtree = (id: string) => {
      if (selectedIds.has(id)) return
      selectedIds.add(id)
      for (const child of linesRef.current) {
        if (child.parentId === id) includeSubtree(child.id)
      }
    }
    for (const root of liftRoots) includeSubtree(root.id)
    const partialRoots = previewRoots.filter((line) => !fullyInsideMarquee(line))
    const partialMaskIds = new Set<string>()
    const includePartialSubtree = (id: string) => {
      if (partialMaskIds.has(id)) return
      partialMaskIds.add(id)
      for (const child of linesRef.current) {
        if (child.parentId === id) includePartialSubtree(child.id)
      }
    }
    for (const root of partialRoots) includePartialSubtree(root.id)
    const sourcePivot = rectCenter(x, y, w, h)
    const vectorState = selectedIds.size
      ? {
          originalLines: cloneLines(linesRef.current),
          selectedIds: [...selectedIds],
          sourceRect: { x, y, w, h },
          sourcePivot
        }
      : undefined
    // canvas already includes vectors + punch-through from paintStackSlot.
    // Empty marquee: do not create an invisible selectable item.
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, w, h).data
    let hasPixels = false
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) { hasPixels = true; break }
    }
    if (!hasPixels) {
      drawSelOverlay()
      return
    }
    invalidatePaintCaches()
    for (const layer of activeLayers) {
      layerCanvas(layer).getContext('2d')?.clearRect(x, y, w, h)
      baseCanvas(layer).getContext('2d')?.clearRect(x, y, w, h)
    }
    if (selectedIds.size) {
      linesRef.current = linesRef.current.filter((line) => !selectedIds.has(line.id))
    }
    const source = cloneCanvas(canvas)
    floatRef.current = {
      canvas,
      x,
      y,
      source,
      originX: x,
      originY: y,
      originW: w,
      originH: h,
      selectable: false,
      sourceLayer: layerOrderRef.current.find(layerIsEditable),
      layerCanvases,
      vectorState,
      partialVectorMask: partialMaskIds.size
        ? { rect: { x, y, w, h }, ids: [...partialMaskIds] }
        : undefined,
      rot: 0
    }
    marqueeRef.current = null
    setHasMarquee(true)
    redrawLines()
    drawSelOverlay()
  }

  // Stamp a floating selection back onto the layers and turn it into a coverage marquee
  // (pixels stay on the canvas so expanding the box can cover more of the image).
  const floatToCoverageMarquee = () => {
    const f = floatRef.current
    if (!f) return
    const savedRot = f.rot ?? 0
    const flipSx = f.scaleX ?? 1
    const flipSy = f.scaleY ?? 1
    const needsBounds = Math.abs(savedRot) > 0.001 || flipSx !== 1 || flipSy !== 1
    const coverageBounds = needsBounds
      ? floatTransformBounds(f)
      : { x: f.x, y: f.y, w: f.canvas.width, h: f.canvas.height }
    restoreTransformedMarqueeVectors(f, savedRot)
    clearFloatOriginAreas(f)
    const liftedVectors = f.vectorState?.selectedIds.length ?? 0
    if (liftedVectors) rasterizeLayerCanvasesFloat(f)
    const hasPartial = !!(f.partialVectorMask?.ids.length)
    if (hasPartial) applyPermanentMarqueeCuts(f.partialVectorMask!)
    if (hasPartial || !liftedVectors) {
      const ctx = topEditableCtx()
      if (ctx) {
        const { sr, sc, dp, rot, sx, sy } = marqueeFloatDrawParams(f)
        drawCanvasAtMarqueeTransform(ctx, f.canvas, sr, sc, dp, rot, sx, sy)
      }
    }
    partialVectorMaskRef.current = null
    invalidatePaintCaches()
    marqueeRef.current = {
      x: coverageBounds.x,
      y: coverageBounds.y,
      w: coverageBounds.w,
      h: coverageBounds.h
    }
    floatRef.current = null
    setHasMarquee(true)
    redrawLines()
    pushHistory()
    drawSelOverlay()
  }

  const applyMarqueeMode = (mode: 'coverage' | 'scale') => {
    if (mode === marqueeMode) return
    if (mode === 'scale') {
      if (!floatRef.current && marqueeRef.current) liftMarquee()
    } else {
      if (floatRef.current) floatToCoverageMarquee()
    }
    setMarqueeMode(mode)
  }

  /**
   * Place an external raster as a stamp object on the top editable layer
   * (same as SVG upload — appears in the Layers panel immediately).
   */
  const placeExternalImage = (dataUrl: string, at?: Pt) => {
    const img = new Image()
    img.onload = () => {
      const maxW = W * 0.85
      const maxH = H * 0.85
      const scale = Math.min(1, maxW / Math.max(1, img.width), maxH / Math.max(1, img.height))
      const dw = Math.max(4, Math.round(img.width * scale))
      const dh = Math.max(4, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = dw
      canvas.height = dh
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, dw, dh)
      placeStampFromCanvas(canvas, at, 'image')
    }
    img.onerror = () => {}
    img.src = dataUrl
  }

  /** Rasterize an SVG (tinted with the current paint colour) and place it as a selectable stamp. */
  const placeSvgMarkup = async (
    svgMarkup: string,
    at?: Pt,
    source: 'library' | 'image' = 'image'
  ) => {
    let svg = svgMarkup.trim()
    if (!svg.includes('<svg')) return
    const paintColor = firstSolidColor(color)
    svg = applySvgColor(svg, paintColor)
    // Display size stays modest; rasterize near full Outer/content size so the
    // stamp stays crisp under paint-canvas CSS scale and when resized (not a
    // lag tradeoff — one SVG decode on place is cheap).
    const displayPx = Math.max(16, Math.round(containerDraw * 0.35))
    const rasterPx = Math.min(W, Math.max(displayPx, Math.round(containerDraw)))
    const canvas = document.createElement('canvas')
    canvas.width = rasterPx
    canvas.height = rasterPx
    const ctx = canvas.getContext('2d')!
    await drawSvgOnCanvas(ctx, svg, 0, 0, rasterPx, rasterPx)
    placeStampFromCanvas(canvas, at, source, svg, displayPx)
  }

  /** Place a raster stamp as a pointer-selectable vector (library icons, custom SVG). */
  const placeStampFromCanvas = (
    canvas: HTMLCanvasElement,
    at?: Pt,
    source: 'library' | 'image' = 'image',
    sourceSvgMarkup?: string,
    /** On-canvas box size when the raster is higher-res than the intended stamp. */
    displaySize?: number
  ) => {
    // Drop any uncommitted float so it doesn't fight the new stamp.
    if (floatRef.current) {
      floatRef.current = null
      setHasMarquee(false)
      const p = previewRef.current?.getContext('2d')
      if (p) p.clearRect(0, 0, W, H)
    }
    const aspect = canvas.height > 0 ? canvas.width / canvas.height : 1
    const dw = Math.max(4, displaySize ?? canvas.width)
    const dh = Math.max(4, displaySize != null ? Math.round(displaySize / aspect) : canvas.height)
    const dataUrl = canvas.toDataURL('image/png')
    const id = genId()
    const placedImg = ensureStampImage(dataUrl)
    if (placedImg) stampStrokeLiveCache.set(id, placedImg)
    const x = at ? Math.round(at.x - dw / 2) : Math.round((W - dw) / 2)
    const y = at ? Math.round(at.y - dh / 2) : Math.round((H - dh) / 2)
    const nl: LineObj = {
      id,
      type: 'stamp',
      pts: [{ x, y }, { x: x + dw, y: y + dh }],
      startCap: 'none',
      endCap: 'none',
      dash: 'solid',
      thickness: 0,
      color: firstSolidColor(color),
      imageDataUrl: dataUrl,
      stampSource: source,
      sourceSvgMarkup,
      sourceStampSize: sourceSvgMarkup ? Math.min(dw, dh) : undefined,
      keepStrokeOnResize: sourceSvgMarkup ? keepStrokeOnResize : undefined,
      visible: true,
      layer: activeAddLayer()
    }
    linesRef.current = [...linesRef.current, nl]
    commitLines(linesRef.current)
    selectLine(nl)
    setTool('pointer')
    redrawLines()
    drawHandles()
    pushHistory()
    // Leave icon-search focus so Ctrl+Z goes to paint undo, not the text field.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  const placeSvgMarkupRef = useRef(placeSvgMarkup)
  placeSvgMarkupRef.current = placeSvgMarkup

  const isSvgDropFile = (file: File): boolean =>
    file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)

  const isRasterDropFile = (file: File): boolean => {
    if (isSvgDropFile(file)) return false
    if (file.type.startsWith('image/')) return true
    return /\.(png|jpe?g|gif|webp|bmp|ico|avif|tiff?)$/i.test(file.name)
  }

  const paintDropAcceptsDrag = (e: React.DragEvent): boolean => {
    const types = [...e.dataTransfer.types]
    if (types.includes(PAINT_LAYER_MIME)) return false
    if (
      types.includes(PAINT_SVG_MIME) ||
      types.includes(PAINT_LUCIDE_MIME) ||
      types.includes('text/plain')
    ) {
      return true
    }
    return types.includes('Files')
  }

  const handlePaintDragOver = (e: React.DragEvent) => {
    if (!paintDropAcceptsDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleStageDrop = async (e: React.DragEvent) => {
    if (!paintDropAcceptsDrag(e)) return
    // Stop immediately — nested canvas + row handlers both listen, and awaiting
    // before stopPropagation lets the same drop place the icon twice.
    e.preventDefault()
    e.stopPropagation()
    if (paintDropLockRef.current) return
    paintDropLockRef.current = true

    const file = e.dataTransfer.files?.[0]
    if (file && isIgTemplateFile(file)) {
      paintDropLockRef.current = false
      return
    }

    const pt = dropPtOnCanvas(e)
    try {
    const svgData = e.dataTransfer.getData(PAINT_SVG_MIME) || e.dataTransfer.getData('text/plain')
    if (svgData && svgData.includes('<svg')) {
      const fromLibrary = e.dataTransfer.types.includes(PAINT_SVG_MIME) ||
        e.dataTransfer.types.includes(PAINT_LUCIDE_MIME)
      await placeSvgMarkup(svgData, pt, fromLibrary ? 'library' : 'image')
    } else {
      const lucideRaw = e.dataTransfer.getData(PAINT_LUCIDE_MIME)
      if (lucideRaw) {
        try {
          const parsed = JSON.parse(lucideRaw) as { name?: string; strokeWidth?: number }
          if (parsed.name) {
            const markup = await renderLucideToSvg(parsed.name, 'currentColor', parsed.strokeWidth ?? 2)
            if (markup) await placeSvgMarkup(markup, pt, 'library')
          }
        } catch {
          /* ignore bad payload */
        }
      } else if (file) {
        if (isSvgDropFile(file)) {
          try {
            const text = await file.text()
            if (text.includes('<svg')) await placeSvgMarkup(text, pt, 'image')
          } catch {
            /* ignore */
          }
        } else if (isRasterDropFile(file)) {
          try {
            const url = await readBlobAsDataUrl(file)
            placeExternalImage(url, pt)
          } catch {
            /* ignore */
          }
        }
      }
    }
    } finally {
      paintDropLockRef.current = false
    }
  }

  const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result)
        else reject(new Error('Failed to read image'))
      }
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
      reader.readAsDataURL(blob)
    })

  /** Try to paste an image from the OS clipboard. Returns true if one was placed. */
  const pasteSystemImage = async (): Promise<boolean> => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'))
          if (!imgType) continue
          const blob = await item.getType(imgType)
          const dataUrl = await readBlobAsDataUrl(blob)
          placeExternalImage(dataUrl)
          return true
        }
      }
    } catch {
      // Permission denied or empty — fall through to internal clipboard.
    }
    return false
  }

  const placeExternalImageRef = useRef(placeExternalImage)
  placeExternalImageRef.current = placeExternalImage

  const pasteRaster = () => {
    const clip = rasterClipRef.current
    if (!clip) return
    if (floatRef.current) commitFloat()
    const x = Math.round((W - clip.width) / 2) + 12
    const y = Math.round((H - clip.height) / 2) + 12
    const canvas = cloneCanvas(clip)
    floatRef.current = { canvas, x, y, source: cloneCanvas(clip), selectable: true }
    marqueeRef.current = null
    setHasMarquee(true)
    setMarqueeMode('scale')
    if (tool !== 'select') setTool('select')
    drawSelOverlay()
  }

  const copyVector = (cut: boolean): boolean => {
    const l = linesRef.current.find((x) => x.id === selectedIdRef.current)
    if (!l) return false
    vectorClipRef.current = cloneLines([l])[0]
    clipKindRef.current = 'vector'
    setHasClip(true)
    setClipLabel(
      l.type === 'shape' ? 'Shape'
        : l.type === 'poly' ? 'Polygon'
          : l.type === 'text' ? 'Text'
            : l.type === 'stamp' ? 'Icon'
              : 'Line'
    )
    if (cut) deleteSelectedRef.current()
    return true
  }

  const pasteVector = () => {
    const c = vectorClipRef.current
    if (!c) return
    const wasLinked = c.type === 'text' && !!c.linkedOutsideText
    const nl: LineObj = {
      ...c,
      id: genId(),
      pts: c.pts.map((p) => ({ x: p.x + 16, y: p.y + 16 })),
      layer: c.layer ?? activeAddLayer(),
      // Pasted copies are never linked — keep the original linked layer intact.
      linkedOutsideText: undefined,
      contentBound: undefined,
      name: c.type === 'text' ? (wasLinked ? `Text ${linesRef.current.filter((l) => l.type === 'text').length + 1}` : 'Text') : c.name
    }
    if (nl.type === 'stamp' && nl.imageDataUrl) ensureStampImage(nl.imageDataUrl)
    linesRef.current = [...linesRef.current, nl]
    selectLine(nl)
    if (tool !== 'pointer') {
      if (nl.type === 'text' && tool !== 'text') setTool('pointer')
      else if (nl.type === 'stamp') setTool('pointer')
      else if (nl.type === 'poly' && tool !== 'freepoly') setTool('freepoly')
      else if (nl.type === 'shape' && tool !== 'shape') setTool('pointer')
      else if (nl.type !== 'poly' && nl.type !== 'shape' && nl.type !== 'text' && tool !== 'line') setTool('line')
    }
    commitLines([...linesRef.current])
    redrawLines(); drawHandles()
    pushHistory()
  }

  // Copy whatever is currently in edit mode: a floating raster selection,
  // an unlifted marquee region, or a selected vector object.
  const doCopy = () => {
    if (floatRef.current) {
      rasterClipRef.current = cloneCanvas(floatRef.current.canvas)
      clipKindRef.current = 'raster'
      setHasClip(true)
      setClipLabel('Region')
      return
    }
    const m = marqueeRef.current
    if (m && m.w >= 3 && m.h >= 3) {
      const x = Math.round(m.x), y = Math.round(m.y), w = Math.round(m.w), h = Math.round(m.h)
      const layers = [...layerOrderRef.current].reverse().filter(layerIsEditable)
      const canvas = cropVisibleMarqueeComposite(x, y, w, h, layers)
      rasterClipRef.current = canvas
      clipKindRef.current = 'raster'
      setHasClip(true)
      setClipLabel('Region')
      return
    }
    if (selectedIdRef.current) copyVector(false)
  }
  const doCut = () => {
    if (floatRef.current) { doCopy(); floatRef.current = null; setHasMarquee(false); drawSelOverlay(); pushHistory(); return }
    const m = marqueeRef.current
    if (m && m.w >= 3 && m.h >= 3) {
      doCopy()
      for (const ctx of targetCtxs()) ctx.clearRect(Math.round(m.x), Math.round(m.y), Math.round(m.w), Math.round(m.h))
      marqueeRef.current = null
      setHasMarquee(false)
      drawSelOverlay()
      redrawLines()
      pushHistory()
      return
    }
    if (selectedIdRef.current) copyVector(true)
  }
  const doPaste = () => {
    void (async () => {
      if (await pasteSystemImage()) return
      if (clipKindRef.current === 'vector') pasteVector()
      else if (clipKindRef.current === 'raster') pasteRaster()
    })()
  }

  const onExternalImageFile = (file: File | null | undefined) => {
    if (!file) return
    if (isSvgDropFile(file)) {
      void file
        .text()
        .then((text) => {
          if (text.includes('<svg')) void placeSvgMarkup(text, undefined, 'image')
        })
        .catch(() => {})
      return
    }
    if (!isRasterDropFile(file)) return
    void readBlobAsDataUrl(file).then(placeExternalImage).catch(() => {})
  }

  clipActionsRef.current = {
    copy: doCopy,
    cut: doCut,
    paste: doPaste,
    liftMarquee,
    commitFloat,
    // Escape/cancel restores a lifted marquee to its original source layers.
    discardFloat: cancelFloating,
    clearSel: () => {
      partialVectorMaskRef.current = null
      marqueeRef.current = null
      setHasMarquee(false)
      drawSelOverlay()
      redrawLines()
    },
    clearRegion: () => {
      const m = marqueeRef.current
      if (!m) return
      for (const ctx of targetCtxs()) ctx.clearRect(Math.round(m.x), Math.round(m.y), Math.round(m.w), Math.round(m.h))
      marqueeRef.current = null
      setHasMarquee(false)
      drawSelOverlay()
      redrawLines()
      pushHistory()
    }
  }

  // OS paste (Edit menu / some hosts) — prefer image files from clipboardData.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      const items = e.clipboardData?.items
      if (!items?.length) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (!item.type.startsWith('image/')) continue
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) return
        void readBlobAsDataUrl(file)
          .then((url) => placeExternalImageRef.current(url))
          .catch(() => {})
        return
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  // ── Pointer handlers ─────────────────────────────────────────────────────────
  const handlePointerMove = (pt: Pt) => {
    const cropSession = cropSessionRef.current
    if (cropSession && !lineDragRef.current) {
      const cropObj = linesRef.current.find((item) => item.id === cropSession.id)
      let next: string | null = null
      if (cropObj && cropObj.type === 'stamp') {
        const hi = cropHandleAt(cropObj, cropSession, pt)
        if (hi >= 0) next = cropCursorForHandle(hi, cropObj.rot ?? 0)
        else {
          const q = unmapObjDisplayPt(pt, cropObj)
          if (
            pointInLocalRect(cropSession.x, cropSession.y, cropSession.w, cropSession.h, q) ||
            pointInLocalRect(cropSession.imgX, cropSession.imgY, cropSession.imgW, cropSession.imgH, q)
          ) {
            next = 'move'
          }
        }
      }
      setCropHoverCursor((prev) => (prev === next ? prev : next))
    }
    if (tool === 'line' || tool === 'freepoly' || tool === 'pointer' || tool === 'shape' || tool === 'text' || tool === 'reshape') { lineMove(pt); return }

    if (tool === 'select') {
      const lockAspect = shiftHeldRef.current
      const f = floatRef.current
      // Coverage: resize the marquee rectangle (what it covers)
      const mr = marqueeResizeRef.current
      if (mr && marqueeRef.current) {
        const magneticPt = snapResizePointToCanvasEdges(pt, mr.corner)
        const next = resizeRect(mr.corner, mr.start, magneticPt, lockAspect)
        const half = snapResizeToHalfCanvas(next, mr.corner, mr.start, lockAspect)
        const matched = snapResizeMatchOtherSizes(half.rect, mr.corner, mr.start, lockAspect)
        marqueeRef.current = matched.rect
        drawSelOverlay()
        drawAlignmentGuides({
          ...matched.align,
          x: matched.align.x || half.width,
          y: matched.align.y || half.height,
          xLabel: matched.align.xLabel ?? (half.width ? '50% width' : null),
          yLabel: matched.align.yLabel ?? (half.height ? '50% height' : null)
        })
        drawHalfSizeGuides(matched.rect, {
          width: half.width || Math.abs(matched.rect.w - W / 2) < 0.5,
          height: half.height || Math.abs(matched.rect.h - H / 2) < 0.5
        })
        return
      }
      // Scale: resize the floating bitmap
      const fr = floatRotateRef.current
      if (fr && f) {
        const ang = Math.atan2(pt.y - fr.center.y, pt.x - fr.center.x)
        const rawRot = fr.startRot + (ang - fr.startAng)
        const snapStep = Math.PI / 12
        const nearest = Math.round(rawRot / snapStep) * snapStep
        const difference = Math.atan2(Math.sin(rawRot - nearest), Math.cos(rawRot - nearest))
        const snapped = Math.abs(difference) <= (3 * Math.PI / 180)
        f.rot = snapped ? nearest : rawRot
        drawSelOverlay()
        drawFloatRotationGuide(fr.center, f.rot ?? 0, snapped)
        return
      }
      const rz = floatResizeRef.current
      if (rz && f) {
        const magneticPt = snapResizePointToCanvasEdges(pt, rz.corner)
        const next = resizeRect(rz.corner, rz.start, magneticPt, lockAspect)
        const half = snapResizeToHalfCanvas(next, rz.corner, rz.start, lockAspect)
        const matched = snapResizeMatchOtherSizes(half.rect, rz.corner, rz.start, lockAspect)
        const rect = matched.rect
        scaleFloatTo(f, rect.x, rect.y, rect.w, rect.h)
        drawSelOverlay()
        const edgeGuide = resizeEdgeGuide(
          { x: f.x, y: f.y, w: f.canvas.width, h: f.canvas.height },
          rz.corner
        )
        drawAlignmentGuides({
          dx: 0,
          dy: 0,
          x: matched.align.x || edgeGuide.x || half.width,
          y: matched.align.y || edgeGuide.y || half.height,
          xAt: edgeGuide.xAt,
          yAt: edgeGuide.yAt,
          xGuide: matched.align.xGuide,
          yGuide: matched.align.yGuide,
          xLabel: matched.align.xLabel ?? (half.width ? '50% width' : null),
          yLabel: matched.align.yLabel ?? (half.height ? '50% height' : null)
        })
        drawHalfSizeGuides(
          { x: f.x, y: f.y, w: f.canvas.width, h: f.canvas.height },
          {
            width: half.width || Math.abs(rect.w - W / 2) < 0.5,
            height: half.height || Math.abs(rect.h - H / 2) < 0.5
          }
        )
        return
      }
      const g = floatDragRef.current
      if (g && f) {
        const dx = pt.x - g.startPt.x
        const dy = pt.y - g.startPt.y
        if (g.isMarquee) {
          setMarqueeFloatPosition(f, { x: g.startDp.x + dx, y: g.startDp.y + dy })
        } else {
          f.x = g.startFx + dx
          f.y = g.startFy + dy
        }
        const rot = f.rot ?? 0
        const flipSx = f.scaleX ?? 1
        const flipSy = f.scaleY ?? 1
        const hasLiveTransform = Math.abs(rot) > 0.001 || flipSx !== 1 || flipSy !== 1
        if (!hasLiveTransform) {
          let snap
          if (g.isMarquee) {
            snap = snapRectToCanvas(floatTransformBounds(f))
            const dp = marqueeFloatDestPivot(f)
            setMarqueeFloatPosition(f, { x: dp.x + snap.dx, y: dp.y + snap.dy })
          } else {
            snap = snapRectToCanvas(floatAxisBounds(f))
            f.x += snap.dx
            f.y += snap.dy
          }
          drawAlignmentGuides(snap)
        }
        drawSelOverlay()
        return
      }
      const s = marqueeStartRef.current
      if (s) {
        const end = clampToCanvas(pt)
        marqueeRef.current = {
          x: Math.min(s.x, end.x),
          y: Math.min(s.y, end.y),
          w: Math.abs(end.x - s.x),
          h: Math.abs(end.y - s.y)
        }
        drawSelOverlay()
      }
      return
    }

    // Eraser: erase on editable layers while dragging, always show the tip footprint.
    if (tool === 'eraser') {
      const snap = snapEraserPoint(pt)
      const activeObjectStroke = objectPaintStrokeRef.current
      if (drawing.current && activeObjectStroke) {
        const l = linesRef.current.find((item) => item.id === activeObjectStroke.id)
        const stroke = l?.paintStrokes?.[activeObjectStroke.index]
        if (l && stroke) {
          stroke.pts.push(shapeLocalPaintPoint(l, snap.pt))
          lastPt.current = snap.pt
          schedulePaintView(false, () => {
            drawEraserCursor(snap.pt)
            drawEraserSnapGuides(snap)
          })
        }
        drawEraserCursor(snap.pt)
        drawEraserSnapGuides(snap)
        return
      }
      if (drawing.current) {
        // Arrows took over this stroke — keep tip at last keyboard position.
        if (eraserArrowLockedRef.current) {
          drawEraserCursor(lastPt.current)
          return
        }
        const c = pixelColor(color)
        for (const ctx of targetCtxs()) {
          strokeBrushTip(
            ctx, eraserTip,
            lastPt.current.x, lastPt.current.y,
            snap.pt.x, snap.pt.y,
            size, c, true
          )
        }
        if (targetCtxs().some((ctx) => ctx.canvas === layerCanvas('container'))) {
          preserveOuterOverlayRef.current = true
        }
        lastPt.current = snap.pt
        schedulePaintView(false, () => {
          drawEraserCursor(snap.pt)
          drawEraserSnapGuides(snap)
        })
      }
      drawEraserCursor(snap.pt)
      drawEraserSnapGuides(snap)
      return
    }

    if (tool === 'polygon' && polyPts.current.length) { drawPolyPreview(pt); return }
    if (!drawing.current) return

    if (tool === 'brush') {
      const activeObjectStroke = objectPaintStrokeRef.current
      if (activeObjectStroke) {
        const l = linesRef.current.find((item) => item.id === activeObjectStroke.id)
        const stroke = l?.paintStrokes?.[activeObjectStroke.index]
        if (l && stroke) {
          stroke.pts.push(shapeLocalPaintPoint(l, pt))
          schedulePaintView()
        }
        lastPt.current = pt
        return
      }
      const c = pixelColor(color)
      for (const ctx of addPaintCtxs()) {
        strokeBrushTip(ctx, brushTip, lastPt.current.x, lastPt.current.y, pt.x, pt.y, size, c, false)
      }
      markOuterOverlayPreserved()
      lastPt.current = pt
      schedulePaintView()
    }
  }

  const handlePointerUp = (pt: Pt) => {
    cancelPaintView()
    if (tool === 'line' || tool === 'freepoly' || tool === 'pointer' || tool === 'shape' || tool === 'text' || tool === 'reshape') { lineUp(pt); return }
    if (tool === 'select') {
      if (floatRotateRef.current) {
        floatRotateRef.current = null
        const mf = floatRef.current
        const isMarquee = !!(mf && (mf.layerCanvases?.length || mf.sourceLayer))
        if (!isMarquee) redrawLines()
        drawSelOverlay()
        return
      }
      if (marqueeResizeRef.current) {
        marqueeResizeRef.current = null
        resizeSnapLockRef.current = { width: false, height: false }
        drawSelOverlay()
        return
      }
      if (floatResizeRef.current) {
        floatResizeRef.current = null
        resizeSnapLockRef.current = { width: false, height: false }
        redrawLines()
        drawSelOverlay()
        return
      }
      if (floatDragRef.current) {
        const wasMarquee = floatDragRef.current.isMarquee
        floatDragRef.current = null
        if (!wasMarquee) redrawLines()
        drawSelOverlay()
        return
      }
      if (marqueeStartRef.current) {
        marqueeStartRef.current = null
        const m = marqueeRef.current
        if (m && (m.w < 3 || m.h < 3)) {
          marqueeRef.current = null
          setHasMarquee(false)
          drawSelOverlay()
        } else if (m) {
          fitMarqueeToSelectedLayers(m)
          // Keep as coverage marquee (pixels stay on the layers until lift)
          setHasMarquee(true)
          setMarqueeMode('coverage')
          drawSelOverlay()
        }
      }
      return
    }
    if (!drawing.current) return
    if (tool === 'brush' || tool === 'eraser') {
      drawing.current = false
      eraserArrowLockedRef.current = false
      if (objectPaintStrokeRef.current) {
        objectPaintStrokeRef.current = null
        commitLines([...linesRef.current])
      }
      redrawLines()
      if (tool === 'eraser') drawEraserCursor(pt)
      pushHistory()
    }
  }

  handlePointerMoveRef.current = handlePointerMove
  handlePointerUpRef.current = handlePointerUp

  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    shiftHeldRef.current = e.shiftKey
    // Prevent PreviewStage's outside-canvas handler from starting the same drag twice.
    e.stopPropagation()
    if (openMenu) {
      setOpenMenu(null)
      setShapeMenuRect(null)
    }
    const pt = toCanvas(e)
    if (tool === 'eyedropper') { eyedrop(pt.x, pt.y); return }
    if (tool === 'line' || tool === 'freepoly' || tool === 'pointer' || tool === 'shape' || tool === 'text' || tool === 'reshape') {
      lineDown(pt)
      if (lineDragRef.current || baseTransformRef.current) startPointerDragCapture()
      return
    }
    if (tool === 'select') {
      const f = floatRef.current
      const m = marqueeRef.current

      // Floating selection (scale mode)
      if (f) {
        const isMarquee = !!(f.layerCanvases?.length || f.sourceLayer)
        const rot = f.rot ?? 0
        const sr = isMarquee ? marqueeFloatSourceRect(f) : null
        const pivot = isMarquee
          ? marqueeFloatDestPivot(f)
          : f.vectorState
            ? floatDestPivot(f, f.vectorState.sourceRect)
            : floatRotationPivot(f)
        const pinHit = isMarquee
          ? marqueeFloatRotatePinHit(f, pt)
          : rectRotatePinHit(f.x, f.y, f.canvas.width, f.canvas.height, pt, rot, pivot)
        if (pinHit) {
          floatRotateRef.current = {
            center: pivot,
            startAng: Math.atan2(pt.y - pivot.y, pt.x - pivot.x),
            startRot: rot
          }
          startPointerDragCapture()
          return
        }
        const corner = isMarquee && sr
          ? hitRectCorner(sr.x, sr.y, sr.w, sr.h, pt, rot, pivot)
          : hitRectCorner(f.x, f.y, f.canvas.width, f.canvas.height, pt, rot, pivot)
        if (corner) {
          if (Math.abs(rot) > 0.001) bakeFloatRotation(f)
          if (marqueeMode === 'coverage') {
            // Switch conceptually shouldn't have float in coverage, but be safe:
            floatToCoverageMarquee()
            const nm = marqueeRef.current!
            marqueeResizeRef.current = { corner, start: { x: nm.x, y: nm.y, w: nm.w, h: nm.h } }
            resizeSnapLockRef.current = { width: false, height: false }
            startPointerDragCapture()
            return
          }
          const source = f.source ?? cloneCanvas(f.canvas)
          f.source = source
          floatResizeRef.current = {
            corner,
            start: { x: f.x, y: f.y, w: f.canvas.width, h: f.canvas.height },
            source
          }
          resizeSnapLockRef.current = { width: false, height: false }
          startPointerDragCapture()
          return
        }
        const inside = isMarquee
          ? pointInMarqueeFloat(f, pt)
          : pointInRotatedRect(f.x, f.y, f.canvas.width, f.canvas.height, pt, rot, pivot)
        if (inside) {
          const isMarquee = !!(f.layerCanvases?.length || f.sourceLayer)
          floatDragRef.current = {
            startPt: pt,
            startDp: marqueeFloatDestPivot(f),
            startFx: f.x,
            startFy: f.y,
            isMarquee
          }
          startPointerDragCapture()
          return
        }
        if (f.selectable) {
          commitFloat()
        } else if (isMarquee) {
          // Keep the lifted selection active — refresh overlay only, no commit.
          drawSelOverlay()
          return
        } else {
          commitFloat()
        }
        return
      }

      // Unlifted marquee (coverage mode)
      if (m && m.w >= 3 && m.h >= 3) {
        if (rectRotatePinHit(m.x, m.y, m.w, m.h, pt, 0)) {
          liftMarquee()
          const fl = floatRef.current
          if (fl) {
            setMarqueeMode('scale')
            const pivot = fl.vectorState
              ? floatDestPivot(fl, fl.vectorState.sourceRect)
              : floatRotationPivot(fl)
            floatRotateRef.current = {
              center: pivot,
              startAng: Math.atan2(pt.y - pivot.y, pt.x - pivot.x),
              startRot: fl.rot ?? 0
            }
            startPointerDragCapture()
          }
          return
        }
        const corner = hitCorner(m.x, m.y, m.w, m.h, pt)
        if (corner) {
          if (marqueeMode === 'scale') {
            liftMarquee()
            const fl = floatRef.current
            if (fl) {
              floatResizeRef.current = {
                corner,
                start: { x: fl.x, y: fl.y, w: fl.canvas.width, h: fl.canvas.height },
                source: fl.source ?? cloneCanvas(fl.canvas)
              }
              resizeSnapLockRef.current = { width: false, height: false }
              startPointerDragCapture()
            }
            return
          }
          marqueeResizeRef.current = { corner, start: { x: m.x, y: m.y, w: m.w, h: m.h } }
          resizeSnapLockRef.current = { width: false, height: false }
          startPointerDragCapture()
          return
        }
        if (pt.x >= m.x && pt.x <= m.x + m.w && pt.y >= m.y && pt.y <= m.y + m.h) {
          // Drag inside → lift and move
          liftMarquee()
          const fl = floatRef.current
          if (fl) {
            floatDragRef.current = {
              startPt: pt,
              startDp: marqueeFloatDestPivot(fl),
              startFx: fl.x,
              startFy: fl.y,
              isMarquee: true
            }
          }
          setMarqueeMode('scale')
          startPointerDragCapture()
          return
        }
        // Click outside the box keeps the coverage marquee active (Enter to finalize).
        return
      }

      // Start a new marquee only when nothing is already selected.
      if (floatRef.current || marqueeRef.current) return

      // A drag may begin in the surrounding stage; use its nearest canvas point.
      const start = clampToCanvas(pt)
      marqueeStartRef.current = start
      marqueeRef.current = { x: start.x, y: start.y, w: 0, h: 0 }
      setMarqueeMode('coverage')
      drawSelOverlay()
      startPointerDragCapture()
      return
    }

    const paintShape = (tool === 'brush' || tool === 'eraser') ? selectedPaintShape() : null
    if (paintShape) {
      const snapped = tool === 'eraser' ? snapEraserPoint(pt) : {
        pt, xGuide: null, yGuide: null, angle: null
      }
      const a = paintShape.pts[0], b = paintShape.pts[1]
      const shortSide = Math.max(1, Math.min(Math.abs(b.x - a.x), Math.abs(b.y - a.y)))
      const stroke: ObjectPaintStroke = {
        tool: tool === 'eraser' ? 'eraser' : 'brush',
        pts: [shapeLocalPaintPoint(paintShape, snapped.pt)],
        size: size / shortSide,
        color: pixelColor(color),
        tip: tool === 'eraser' ? eraserTip : brushTip
      }
      paintShape.paintStrokes = [...(paintShape.paintStrokes ?? []), stroke]
      objectPaintStrokeRef.current = { id: paintShape.id, index: paintShape.paintStrokes.length - 1 }
      drawing.current = true
      startPt.current = snapped.pt
      lastPt.current = snapped.pt
      redrawLines()
      if (tool === 'eraser') {
        drawEraserCursor(snapped.pt)
        drawEraserSnapGuides(snapped)
      }
      startPointerDragCapture()
      return
    }
    // Shape/stamp/group selected but unusable for stroke → still never paint base overlays.
    if ((tool === 'brush' || tool === 'eraser') && selectedObjectOwnsRasterTools()) {
      const selected = linesRef.current.find((item) => item.id === selectedIdRef.current)
      const l = selected ? (checkedGroupTarget(selected) ?? selected) : null
      if (l && (l.type === 'shape' || l.type === 'stamp' || l.type === 'group')) return
    }

    // Object layers own fill only when the click actually hits them. A selected
    // shape/stamp/text must not swallow Outer background / border / shadow fills.
    // Overlay cuts on live Inner are handled by floodFill (inner is in the sample,
    // not a wall); do not abort when the click lands on the cut itself.
    if (tool === 'match' || toolRef.current === 'match') {
      void (async () => {
        const armed = matchSlotRef.current
        if (armed == null) return
        const sel =
          linesRef.current.find((l) => l.id === selectedIdRef.current) ??
          linesRef.current.find((l) => isInnerUploadedImageProxy(l))
        if (!sel || !isInnerUploadedImageProxy(sel)) return
        // Keep selection locked on the Match target for the session.
        if (selectedIdRef.current !== sel.id) {
          selectedIdRef.current = sel.id
          setSelectedId(sel.id)
          setSelectedLayerIds(new Set([sel.id]))
        }
        if (selectedLayerIdsRef.current.size > 1) {
          setSelectedLayerIds(new Set([sel.id]))
        }
        if (!objectOwnsFillClick(sel, pt)) return
        const local = unmapObjDisplayPt(pt, sel)
        const next = await matchClickOnImageProxy(sel, local, armed)
        if (!next) return
        commitLines(linesRef.current.map((l) => (l.id === next.id ? next : l)))
        // Defer remapped colours until Match exits; refresh labels only.
        const labels = await buildMatchSectionLabels(next)
        setMatchLabels(labels)
        pushHistory()
        redrawLines()
        drawHandles()
      })()
      return
    }
    if (tool === 'fill') {
      // See-through on an existing punch hole (object or free stamp): demote
      // punchThrough first so Fill is not a no-op when Outer shows through.
      if (isTransparentPaintColor(color) && !transparentFillPunch()) {
        if (demotePunchThroughAtPoint(pt)) return
        // Hole under the click on a layer but demote missed (soft edge): still try
        // object Fill so punched sections convert / refill instead of no-op.
      }
      void (async () => {
        const hit = topmostPaintHit((item) => {
          if (!isPaintHitVisible(item) || !isInnerUploadedImageProxy(item)) return false
          return objectOwnsFillClick(item, pt)
        })
        const sel =
          hit ??
          linesRef.current.find(
            (l) =>
              l.id === selectedIdRef.current &&
              isInnerUploadedImageProxy(l) &&
              objectOwnsFillClick(l, pt)
          )
        if (sel) {
          const local = unmapObjDisplayPt(pt, sel)
          const marked = await fillMarkedSectionsOnImageProxy(sel, local, pixelColor(color))
          if (marked) {
            commitLines(
              linesRef.current.map((l) => (l.id === marked.item.id ? marked.item : l))
            )
            if (marked.item.imageDataUrl) {
              ensureStampImage(marked.item.imageDataUrl, () => {
                redrawLinesRef.current()
                drawHandles()
              })
            }
            pushHistory()
            redrawLines()
            drawHandles()
            return
          }
        }
        if (fillSelectedObjectLayer(pt)) return
        const targetsNow = targetCtxs()
        if (!targetsNow.length) return
        if (fillAllOpaque) {
          for (const id of [...layerOrderRef.current].reverse().filter(layerIsEditable)) {
            const ctx = layerCanvas(id).getContext('2d')
            if (ctx) recolorAllOpaque(ctx, baseCanvas(id), id)
          }
        } else {
          let id = floodFillTargetLayer(pt.x, pt.y)
          const clickOwnsObject = linesRef.current.some(
            (item) =>
              !item.punchMask &&
              isPaintHitVisible(item) &&
              objectOwnsFillClick(item, pt)
          )
          const clickOnContentHole =
            punchHoleAt('content', pt.x, pt.y) ||
            pointInEnclosedObjectHole('content', pt.x, pt.y)
          if (
            id === 'container' &&
            layerIsEditable('content') &&
            (clickOwnsObject ||
              clickOnContentHole ||
              vectorAlphaAt('content', pt.x, pt.y) > 8)
          ) {
            const ownsContainerObject = linesRef.current.some(
              (item) =>
                vectorLayerOf(item) === 'container' &&
                !item.punchMask &&
                isPaintHitVisible(item) &&
                objectOwnsFillClick(item, pt)
            )
            if (!ownsContainerObject) id = 'content'
          }
          if (id) {
            const ctx = layerCanvas(id).getContext('2d')
            if (ctx) floodFill(ctx, pt.x, pt.y, baseCanvas(id), id)
          }
        }
        redrawLines()
        pushHistory()
      })()
      return
    }

    const targets = targetCtxs()
    if (!targets.length && tool !== 'polygon' && tool !== 'brush') return
    // Brush can run with add-paint targeting even when only one layer is checked.
    if (tool === 'brush' && !addPaintCtxs().length) return

    if (tool === 'polygon') {
      // The second click of a double-click has detail >= 2. Skip adding a vertex
      // so finishing with double-click does not leave a stray last point.
      if (e.detail >= 2) {
        polyDblClickSkippedRef.current = true
        return
      }
      polyDblClickSkippedRef.current = false
      polyPts.current.push(pt)
      drawPolyPreview(pt)
      return
    }
    const initialEraserSnap = tool === 'eraser' ? snapEraserPoint(pt) : null
    const initialPoint = initialEraserSnap?.pt ?? pt
    drawing.current = true
    startPt.current = initialPoint
    lastPt.current = initialPoint
    if (tool === 'brush') {
      const c = pixelColor(color)
      for (const ctx of addPaintCtxs()) {
        stampBrushTip(ctx, brushTip, pt.x, pt.y, size, c, false)
      }
      markOuterOverlayPreserved()
      redrawLines()
      startPointerDragCapture()
    } else if (tool === 'eraser') {
      const c = pixelColor(color)
      for (const ctx of targets) {
        stampBrushTip(ctx, eraserTip, initialPoint.x, initialPoint.y, size, c, true)
      }
      if (targets.some((ctx) => ctx.canvas === layerCanvas('container'))) {
        preserveOuterOverlayRef.current = true
      }
      redrawLines()
      eraserArrowLockedRef.current = false
      drawEraserCursor(initialPoint)
      if (initialEraserSnap) drawEraserSnapGuides(initialEraserSnap)
      startPointerDragCapture()
    }
  }

  const onMove = (e: React.MouseEvent) => {
    // While a drag is captured on window, skip canvas moves to avoid double strokes.
    if (pointerDragCleanupRef.current) return
    shiftHeldRef.current = e.shiftKey
    handlePointerMove(toCanvas(e))
  }

  const onUp = (e: React.MouseEvent) => {
    // Window mouseup owns the finish when capture is active.
    if (pointerDragCleanupRef.current) return
    handlePointerUp(toCanvas(e))
  }

  const handleSave = async () => {
    if (cropSessionRef.current) applyStampCropRef.current()
    if (textEditIdRef.current) endTextEditRef.current()
    if (tool === 'polygon' && polyPts.current.length) finishPolygon()
    if (floatRef.current) commitFloat()
    const cc = ensureOffscreenCanvas(containerCanvasRef)
    const ct = ensureOffscreenCanvas(contentCanvasRef)
    const baseCc = ensureOffscreenCanvas(baseContainerCanvasRef)
    const baseCt = ensureOffscreenCanvas(baseContentCanvasRef)
    // Solid Outer Fill this session: drop leftover Outer punch/see-through holes
    // before cloning vectors / building punchMasks so Save cannot destination-out
    // the new live backgroundColour.
    const outerFillCss = lastOuterFillColorsRef.current.fill
    if (
      outerFillCss &&
      !isTransparentPaintColor(outerFillCss) &&
      (lastOuterFillTargetRef.current === 'fill' || lastOuterFillAllRef.current)
    ) {
      const all = new Uint8Array(W * H)
      all.fill(1)
      clearPunchHolesOverlapping(all, 'container', { clearAllOnLayer: true })
    }
    // Bake see-through holes into stamp pixels and detach modified live-Inner
    // proxies so Save/re-open cannot restore the original unpunched colour.
    // Rewrite local canvases → display bits before bake / punchMasks export.
    for (const l of linesRef.current) {
      if (punchMaskCanvases.has(l.id) || seeThroughMaskCanvases.has(l.id)) {
        rewritePunchBitsFromLocal(l, W, H)
      }
      syncHoleFlags(l as HoleItem)
    }
    let preparedHadSeeThrough = false
    const preparedLines = linesRef.current.flatMap((item): LineObj[] => {
      // Orphan free punchMask stamps after PH→ST→Fill: white silhouettes with no
      // punchThrough. Drop them so Save cannot cut Outer to the page / bake white.
      if (item.punchMask) {
        const keep =
          !!item.punchThrough ||
          hasPunchCoverage(item.id) ||
          hasSeeThroughCoverage(item.id)
        if (!keep) {
          clearObjectHoles(item as HoleItem)
          return []
        }
        return [item]
      }
      if (item.type === 'group' || item.marqueeItem) return [item]
      const seeThrough = objectHasSeeThroughHole(item)
      const modifiedProxy =
        !!item.contentBound &&
        (!!item.rasterEdited ||
          seeThrough ||
          !!item.punchThrough ||
          hasPunchCoverage(item.id) ||
          !!item.paintStrokes?.length ||
          reshapeIsApplied(item.reshapeQuad, item.reshapeSrc) ||
          isTransparentPaintColor(item.color ?? ''))
      if (seeThrough) {
        preparedHadSeeThrough = true
        // Keep text vectors editable after Save (linked or paint-local).
        // Mixed punch+see-through: hole PNGs + decorations bake carry ST;
        // punchMasks (exported later) keep Outer cuts from punch bits.
        if (item.type === 'text' || item.linkedOutsideText) return [item]
        return [bakeObjectAppearanceToStamp(item, W, H)]
      }
      if (modifiedProxy && item.punchThrough && !seeThrough) {
        // Detach contentBound proxy only — never drop linkedOutsideText.
        const { contentBound: _c, ...rest } = item
        return [{ ...rest, contentBound: undefined }]
      }
      if (modifiedProxy) {
        // Proxy bake is not see-through — do not force skip-live Inner.
        // Never rasterize text — Save must leave glyphs editable in Paint.
        if (item.type === 'text') return [item]
        return [bakeObjectAppearanceToStamp(item, W, H)]
      }
      return [item]
    })
    linesRef.current = preparedLines
    // Decode baked stamps before decorationsCanvas (first Save must not be empty).
    for (const l of preparedLines) {
      if (l.type === 'stamp' && l.imageDataUrl) {
        await ensureStampImageDecoded(l.imageDataUrl)
      }
    }
    const vectors = normalizeLinkedTextVectors(
      cloneLines(preparedLines) as unknown as PaintVector[],
      selectedIdRef.current
    )
    // Inner base + overlay for optical center / offset sync when no linked text.
    const contentComposite = document.createElement('canvas')
    contentComposite.width = W
    contentComposite.height = H
    const cctx = contentComposite.getContext('2d')
    if (cctx) {
      cctx.drawImage(baseCt, 0, 0)
      cctx.drawImage(ct, 0, 0)
    }
    const contentSync = buildPaintContentSync({
      vectors,
      resolution: W,
      innerDrawSize: innerDraw,
      contentComposite,
      containerBase: baseCc,
      containerOverlay: cc,
      contentBase: baseCt,
      contentOverlay: ct,
      syncOuterFillColor,
      outerFillTarget: lastOuterFillTargetRef.current ?? undefined,
      outerFillPaintColor: lastOuterFillColorRef.current ?? undefined,
      outerFillColors: lastOuterFillColorsRef.current,
      outerFillAll: lastOuterFillAllRef.current || undefined,
      preserveOuterOverlay: preserveOuterOverlayRef.current
    })
    // Full Outer recolor via Fill → clear overlay so live backgroundColor /
    // containerColor owns the color (keeps favicon↔logo sync consistent).
    // Never clear for image outers (syncOuterFillColor false) — paint stays put.
    if (contentSync.clearOuterOverlay) {
      const ctx = cc.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, W, H)
    }
    // Solid Inner Fill → clear content overlay so live fillColor owns the colour
    // (avoids a full-face contentPng that looks like Outer background on Apply).
    if (contentSync.clearContentOverlay) {
      const ctx = ct.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, W, H)
    }
    // contentBound rasters → hierarchy slots so z-order / nesting survive re-open
    // without leaving a raster that would double with live Inner outside.
    const persistVectors = persistContentProxyVectors(vectors).map((v) => {
      const line = linesRef.current.find((l) => l.id === v.id)
      if (!line) return v
      const hasPunch = hasPunchCoverage(line.id)
      const hasSt = hasSeeThroughCoverage(line.id)
      if (!hasPunch && !hasSt && !line.punchEnclosedHole && !line.punchThrough) {
        return v
      }
      if (punchMaskCanvases.has(line.id) || seeThroughMaskCanvases.has(line.id)) {
        rewritePunchBitsFromLocal(line, W, H)
      }
      const holeMaskPng = hasPunch ? serializeHoleMaskPng(line, W, H) : undefined
      const seeThroughHoleMaskPng = hasSt ? serializeSeeThroughMaskPng(line, W, H) : undefined
      syncHoleFlags(line as HoleItem)
      return {
        ...v,
        holeMaskPng,
        seeThroughHoleMaskPng,
        holeMaskMode: hasPunch ? ('punch' as const) : hasSt ? ('see-through' as const) : undefined,
        // Persist the real counter flag — do not invent enclosed for every see-through.
        punchEnclosedHole: !!line.punchEnclosedHole,
        punchThrough: hasPunch
      }
    })
    const linked = vectors.filter((v) => v.type === 'text' && v.linkedOutsideText).pop()
    // See-through on Inner must be baked with the live base into decorations
    // (and live Inner skipped) — exporting them as punchMasks would cut Outer too.
    // Detect ST even when punchThrough is also true (dual masks).
    const hasContentSeeThrough =
      preparedHadSeeThrough ||
      vectors.some((v) => {
        if ((v.layer ?? 'content') !== 'content') return false
        if ((v.visible ?? v.editable ?? true) === false) return false
        // Free punchMask operators are dest-out masks, not Inner bake targets.
        // Counting them as see-through forced skip-live Inner and left Outer
        // showing through leftover white silhouettes after PH→ST→Fill Save.
        if (v.punchMask) return false
        if (v.seeThroughHoleMaskPng) return true
        if (v.holeMaskMode === 'see-through') return true
        if (hasSeeThroughCoverage(v.id)) return true
        // punchEnclosedHole alone is punch/counter — not see-through.
        if (v.punchThrough || hasPunchCoverage(v.id)) return false
        return isTransparentPaintColor(v.color ?? '')
      })
    // Punch enclosed counters on content: bake into decorations (paint space) so
    // Inner holes align, while punchMasks still cut Outer from punch bits.
    const hasContentPunchEnclosed = vectors.some((v) => {
      if ((v.layer ?? 'content') !== 'content') return false
      if ((v.visible ?? v.editable ?? true) === false) return false
      if (!v.punchThrough && !hasPunchCoverage(v.id)) return false
      return (
        !!v.punchEnclosedHole ||
        v.type === 'text' ||
        v.type === 'shape' ||
        v.type === 'poly' ||
        v.type === 'stamp'
      )
    })
    // See-through must bake Inner (skip live) so Outer shows through holes without
    // destination-out cutting Outer. Punch-through keeps live letters + punchMasks
    // so outside text changes can regenerate matching holes (TE→BO) — unless
    // enclosed counters need bake for alignment, or dual ST is present.
    const bakeLinkedText = !!(
      linked &&
      (Math.abs(linked.rot ?? 0) > 0.001 || hasContentSeeThrough || hasContentPunchEnclosed)
    )
    const hasLiveInnerStandIn = vectors.some(
      (v) =>
        !!v.contentBound ||
        !!v.contentProxySlot ||
        (v.type === 'text' && !!v.linkedOutsideText)
    )
    const hasReplacementContent = persistVectors.some((v) => {
      if ((v.layer ?? 'content') !== 'content') return false
      if ((v.visible ?? v.editable ?? true) === false) return false
      if (v.contentProxySlot || v.contentBound) return false
      return (
        v.type === 'stamp' ||
        v.type === 'shape' ||
        v.type === 'poly' ||
        v.type === 'drawn' ||
        v.type === 'text'
      )
    })
    // Warped Inner proxy is baked into decorations. Also skip live Inner when
    // the user removed the letters/lucide stand-in and left a library stamp —
    // otherwise the live glyph/stroke peeks around the stamp on the small logo.
    // Punch-only linked letters stay live so outside edits re-punch cleanly,
    // except enclosed counters / dual ST which need bake for alignment.
    const bakeContentProxy =
      vectors.some((v) => v.contentBound && reshapeIsApplied(v.reshapeQuad, v.reshapeSrc)) ||
      (!hasLiveInnerStandIn && hasReplacementContent) ||
      hasContentSeeThrough ||
      (hasContentPunchEnclosed && !linked)
    const containerDecor = decorationsCanvas('container')
    let contentBake = bakeContentProxy
    let linkedBake = bakeLinkedText
    let contentDecor = decorationsCanvas(
      'content',
      linkedBake,
      contentBake,
      // Never composite unpunched Inner base under ST holes — that restores the
      // pre-punch solid colour outside Paint. Transparent holes must stay empty
      // so Outer shows through when live Inner is skipped.
      false
    )
    // Never ship skip-live Inner with an empty decorations plane (async stamp miss).
    // If we had see-through, keep bake flag even when the plane looks empty —
    // falling back to live Inner restores solid pre-punch colour.
    if (contentBake && !preparedHadSeeThrough && !hasContentSeeThrough) {
      const d = contentDecor.getContext('2d')?.getImageData(0, 0, W, H).data
      let any = false
      if (d) {
        for (let i = 3; i < d.length; i += 16) {
          if (d[i] > 8) {
            any = true
            break
          }
        }
      }
      if (!any) {
        contentBake = false
        linkedBake = false
        contentDecor = decorationsCanvas('content', false, false, false)
      }
    }
    const contentAboveDecor = decorationsCanvas('content', linkedBake, contentBake, false, 'above')
    const contentBelowDecor = decorationsCanvas('content', false, false, false, 'below')
    // Overlays only — live Outer/Inner settings stay outside Paint.
    await onSave(
      {
        compositePng: compositeCanvas().toDataURL('image/png'),
        containerPng: contentSync.clearOuterOverlay
          ? emptyOverlayPng(W)
          : cc.toDataURL('image/png'),
        contentPng: contentSync.clearContentOverlay
          ? emptyOverlayPng(W)
          : ct.toDataURL('image/png'),
        vectors: persistVectors,
        resolution: W,
        hasContainer: !!(hasContainer || containerUsable),
        layerOrder: [...layerOrderRef.current],
        decorationsPng: decorationsCanvas(undefined, linkedBake, contentBake).toDataURL('image/png'),
        containerDecorationsPng: containerDecor.toDataURL('image/png'),
        contentDecorationsPng: contentDecor.toDataURL('image/png'),
        contentAboveDecorationsPng: contentAboveDecor.toDataURL('image/png'),
        contentBelowDecorationsPng: contentBelowDecor.toDataURL('image/png'),
        contentSync,
        linkedTextInDecorations: linkedBake,
        contentBakedInDecorations: contentBake,
        paintShapeSize: Math.round(paintOuterSize ?? innerDraw),
        paintContentDrawSize: Math.round(innerDraw),
        paintContentSizeRatio: outsideContent?.sizeRatio,
        punchMasks: (['container', 'content'] as PaintLayerId[]).flatMap((id) => {
          // Ensure text punch silhouettes exist (enclosed counters / full glyph)
          // before export — missing in-memory bits would save an empty mask.
          if (id === 'content') {
            for (const l of linesRef.current) {
              if (l.type !== 'text' || vectorLayerOf(l) !== 'content') continue
              if (!hasPunchCoverage(l.id) && !l.punchThrough) continue
              if ((l.visible ?? l.editable ?? true) === false) continue
              if (punchMaskCanvases.has(l.id) || seeThroughMaskCanvases.has(l.id)) {
                rewritePunchBitsFromLocal(l, W, H)
              }
              const existing = punchMaskBits.get(l.id)
              if (existing && existing.some((v) => v)) continue
              const probe = takeCanvas(W, H)
              try {
                const pctx = probe.getContext('2d')!
                // renderLineBase applies rot/scale (renderText alone does not).
                renderLineBase(pctx, { ...l, color: '#000000', shadow: false, punchThrough: false })
                const data = pctx.getImageData(0, 0, W, H).data
                const ink = new Uint8Array(W * H)
                for (let p = 0; p < ink.length; p++) {
                  if (data[p * 4 + 3] >= 24) ink[p] = 1
                }
                if (l.punchEnclosedHole) {
                  // Never invent every counter — partial holes need holeMaskPng /
                  // in-memory bits. Auto-detect would re-punch all B/O bowls.
                  continue
                } else if (l.punchThrough || hasPunchCoverage(l.id)) {
                  punchMaskBits.set(l.id, ink)
                }
              } finally {
                releaseCanvas(probe)
              }
            }
          }
          const c = document.createElement('canvas')
          c.width = W
          c.height = H
          const x = c.getContext('2d')!
          const exportLines = linesRef.current
          const exportPunch = (item: LineObj) => {
            if (item.type === 'group') {
              for (const child of exportLines) {
                if (child.parentId === item.id) exportPunch(child)
              }
              return
            }
            // Punch hole only — never export see-through-only as punchMasks.
            // Free Outer punchMask stamps with punchThrough are covered above;
            // see-through-only free stamps must not cut Outer to the page
            // (that reads as Outer background turning white).
            if (item.punchThrough || hasPunchCoverage(item.id)) {
              renderPunchSilhouette(x, item, exportLines, (v) => (v.visible ?? v.editable ?? true) !== false)
            }
          }
          for (const l of exportLines) {
            if (l.parentId || vectorLayerOf(l) !== id) continue
            exportPunch(l)
          }
          const img = x.getImageData(0, 0, W, H)
          const data = img.data
          let any = false
          // Hard binary alpha — soft AA fringes become white edge lines outside Paint.
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 32) {
              data[i] = 0
              data[i + 1] = 0
              data[i + 2] = 0
              data[i + 3] = 255
              any = true
            } else {
              data[i + 3] = 0
            }
          }
          // Drop speckles from sparse UV sampling.
          if (any) {
            const raw = new Uint8Array(W * H)
            for (let p = 0; p < raw.length; p++) {
              if (data[p * 4 + 3] >= 128) raw[p] = 1
            }
            const cleaned = pruneTinyHoleComponents(raw, W, H, 6)
            for (let p = 0; p < cleaned.length; p++) {
              const i = p * 4
              if (cleaned[p]) {
                data[i] = 0
                data[i + 1] = 0
                data[i + 2] = 0
                data[i + 3] = 255
              } else {
                data[i + 3] = 0
              }
            }
            any = cleaned.some((v) => v)
          }
          // Do not dilate here — Paint punches are flush; dilate made outside
          // holes larger than in-Paint counters (especially letter bowls).
          if (!any) return []
          x.putImageData(img, 0, 0)
          return [{ layer: id, png: c.toDataURL('image/png') }]
        })
      },
      {
        logoIds: [...saveLogoIds],
        faviconIds: [...saveFaviconIds],
        copyColors: saveCopyColors
      }
    )
  }

  const toggleSaveId = (kind: 'logo' | 'favicon', id: string) => {
    const setter = kind === 'logo' ? setSaveLogoIds : setSaveFaviconIds
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const movePaintLayer = (
    dragged: PaintLayerId,
    target: PaintLayerId,
    position: Exclude<LayerDropPosition, 'inside'>
  ) => {
    if (dragged === target) return
    const next = [...layerOrderRef.current]
    const from = next.indexOf(dragged)
    if (from < 0) return
    next.splice(from, 1)
    const targetIndex = next.indexOf(target)
    if (targetIndex < 0) return
    next.splice(targetIndex + (position === 'after' ? 1 : 0), 0, dragged)
    layerOrderRef.current = next
    setLayerOrder(next)
    redrawLines()
    pushHistory()
  }

  const defaultObjectLayerName = (l: LineObj): string => {
    if (l.type === 'stamp') return 'Image'
    if (l.type === 'text') return l.text?.trim() ? `Text: ${l.text.trim().slice(0, 18)}` : 'Text'
    if (l.type === 'shape') return l.shape
      ? `${l.shape.charAt(0).toUpperCase()}${l.shape.slice(1)}`
      : 'Shape'
    if (l.type === 'poly') return 'Polygon'
    if (l.type === 'drawn') return 'Drawing'
    return 'Line'
  }

  const renameObjectLayer = (id: string, name: string) => {
    const l = linesRef.current.find((item) => item.id === id)
    if (!l) return
    l.name = name.trim() || undefined
    commitLines([...linesRef.current])
    pushHistory()
  }

  const paintRootOf = (item: LineObj, items: LineObj[]): LineObj => paintRootOfLine(item, items)

  const applyMovingLayerFlags = (
    moving: LineObj[],
    dragged: LineObj,
    layer: PaintLayerId,
    belowBase: boolean
  ) => {
    const movingIds = new Set(moving.map((item) => item.id))
    for (const item of moving) {
      item.layer = layer
      if (isLiveInnerVector(item)) {
        item.belowBase = false
        continue
      }
      // Roots of the moving subtree carry belowBase; nested children inherit via root.
      const parentInMoving = !!(item.parentId && movingIds.has(item.parentId))
      if (!parentInMoving) {
        item.belowBase = belowBase
      }
    }
    if (!isLiveInnerVector(dragged)) dragged.belowBase = belowBase
  }

  const rootIndicesOnLayer = (
    items: LineObj[],
    layer: PaintLayerId,
    belowBase?: boolean
  ): number[] => {
    const indices: number[] = []
    items.forEach((item, i) => {
      if (!item.parentId && vectorLayerOf(item) === layer) {
        if (belowBase === undefined || !!item.belowBase === belowBase) indices.push(i)
      }
    })
    return indices
  }

  const lastDirectChildIndex = (items: LineObj[], groupId: string, groupIndex: number): number => {
    let last = groupIndex
    items.forEach((item, i) => {
      if (item.parentId === groupId) last = i
    })
    return last
  }

  /** Compact roots by paint bucket while preserving z-order within each bucket. */
  const normalizePaintArrayOrder = (items: LineObj[]): LineObj[] => {
    const indexOf = (id: string) => items.findIndex((item) => item.id === id)
    const roots = items.filter((l) => !l.parentId && !l.marqueeItem && !l.punchMask)
    const used = new Set<string>()
    const out: LineObj[] = []

    const appendSubtree = (rootId: string) => {
      if (used.has(rootId)) return
      const stack: string[] = [rootId]
      while (stack.length) {
        const id = stack.pop()!
        if (used.has(id)) continue
        const node = items.find((l) => l.id === id)
        if (!node) continue
        used.add(id)
        out.push(node)
        const children = items
          .filter((l) => l.parentId === id)
          .sort((a, b) => indexOf(a.id) - indexOf(b.id))
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!.id)
      }
    }

    for (const layer of layerOrderRef.current) {
      for (const below of [true, false] as const) {
        const layerRoots = roots
          .filter((l) => vectorLayerOf(l) === layer && !!l.belowBase === below)
          .sort((a, b) => indexOf(a.id) - indexOf(b.id))
        for (const root of layerRoots) appendSubtree(root.id)
      }
    }
    for (const item of items) {
      if (!used.has(item.id)) out.push(item)
    }
    return out
  }

  const insertPeerRoot = (
    items: LineObj[],
    moving: LineObj[],
    target: LineObj,
    position: LayerDropPosition
  ): void => {
    const targetIndex = items.findIndex((l) => l.id === target.id)
    if (targetIndex < 0) {
      items.push(...moving)
      return
    }
    const insertAt =
      position === 'before'
        ? insertAfterSubtreeIndex(items, target.id)
        : targetIndex
    items.splice(insertAt, 0, ...moving)
  }

  const moveObjectLayer = (
    draggedId: string,
    targetKey: string,
    position: LayerDropPosition
  ): boolean => {
    const next = [...linesRef.current]
    const dragged = next.find((l) => l.id === draggedId)
    if (!dragged) return false

    // Move the complete nested subtree as one unit and preserve its paint order.
    const movingIds = new Set<string>([draggedId])
    let changed = true
    while (changed) {
      changed = false
      for (const item of next) {
        if (item.parentId && movingIds.has(item.parentId) && !movingIds.has(item.id)) {
          movingIds.add(item.id)
          changed = true
        }
      }
    }
    const moving = next.filter((item) => movingIds.has(item.id))
    const remaining = next.filter((item) => !movingIds.has(item.id))

    if (targetKey.startsWith('base:')) {
      const layer = targetKey.slice(5) as PaintLayerId
      const belowBase = position === 'after'
      applyMovingLayerFlags(moving, dragged, layer, belowBase)
      dragged.parentId = undefined
      const aboveRoots = rootIndicesOnLayer(remaining, layer, false)
      const belowRoots = rootIndicesOnLayer(remaining, layer, true)
      let insertAt: number
      if (belowBase) {
        // Just below the Inner/Outer paint row — front of the below-base stack.
        insertAt = belowRoots.length
          ? belowRoots[belowRoots.length - 1] + 1
          : aboveRoots.length
            ? aboveRoots[0]
            : remaining.length
      } else {
        // Just above the Inner/Outer paint row — back of the above-base stack.
        insertAt = aboveRoots.length ? aboveRoots[0] : remaining.length
      }
      remaining.splice(insertAt, 0, ...moving)
    } else {
      const targetId = targetKey.slice(7)
      if (movingIds.has(targetId)) return false
      const targetIndex = remaining.findIndex((l) => l.id === targetId)
      if (targetIndex < 0) return false
      const target = remaining[targetIndex]
      const layer = vectorLayerOf(target)
      const anchor = paintRootOf(target, remaining)
      applyMovingLayerFlags(moving, dragged, layer, !!anchor.belowBase)

      if (position === 'inside' && target.type === 'group') {
        dragged.parentId = target.id
        // Nest on top of existing group children (higher array index = higher in panel).
        const insertAt = lastDirectChildIndex(remaining, target.id, targetIndex)
        remaining.splice(insertAt + 1, 0, ...moving)
      } else {
        dragged.parentId = target.parentId
        insertPeerRoot(remaining, moving, target, position)
      }
    }
    const ordered = normalizePaintArrayOrder(remaining)
    syncGroupBounds(ordered)
    commitLines(ordered)
    redrawLines()
    drawHandles()
    pushHistory()
    return true
  }

  const dropLayerItem = (
    draggedKey: string,
    targetKey: string,
    position: LayerDropPosition
  ) => {
    if (draggedKey === targetKey) return
    if (draggedKey.startsWith('base:')) {
      const dragged = draggedKey.slice(5) as PaintLayerId
      let target: PaintLayerId | null = null
      if (targetKey.startsWith('base:')) target = targetKey.slice(5) as PaintLayerId
      else {
        const targetObject = linesRef.current.find((l) => l.id === targetKey.slice(7))
        if (targetObject) target = vectorLayerOf(targetObject)
      }
      if (target) movePaintLayer(dragged, target, position === 'after' ? 'after' : 'before')
      return
    }
    const moved = moveObjectLayer(draggedKey.slice(7), targetKey, position)
    if (moved && position === 'inside' && targetKey.startsWith('object:')) {
      const targetId = targetKey.slice(7)
      setCollapsedGroupIds((prev) => {
        if (!prev.has(targetId)) return prev
        const next = new Set(prev)
        next.delete(targetId)
        return next
      })
    }
  }

  const canNestDraggedIntoGroup = (draggedKey: string | null, targetGroupId: string): boolean => {
    if (!draggedKey || draggedKey.startsWith('base:')) return false
    const draggedId = draggedKey.slice(7)
    if (draggedId === targetGroupId) return false
    let current = linesRef.current.find((item) => item.id === targetGroupId)
    while (current?.parentId) {
      if (current.parentId === draggedId) return false
      current = linesRef.current.find((item) => item.id === current?.parentId)
    }
    return true
  }

  const dropPositionForRect = (
    rect: DOMRect,
    clientY: number,
    allowInside: boolean
  ): LayerDropPosition => {
    const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5
    // Most of a group row is a nesting target; narrow edge strips still allow
    // precise reordering immediately above or below the group.
    if (allowInside && ratio >= 0.15 && ratio <= 0.85) return 'inside'
    return ratio < 0.5 ? 'before' : 'after'
  }

  const stopLayersPanelEdgeScroll = () => {
    layersDragScrollVelRef.current = 0
    if (layersDragScrollRafRef.current != null) {
      cancelAnimationFrame(layersDragScrollRafRef.current)
      layersDragScrollRafRef.current = null
    }
  }

  const resolveLayerDropAtPoint = (clientX: number, clientY: number) => {
    const dragged = draggedLayerRef.current
    if (!dragged) return
    const stack = document.elementsFromPoint(clientX, clientY)
    let row: HTMLElement | null = null
    for (const node of stack) {
      if (!(node instanceof Element)) continue
      const hit = node.closest('[data-layer-drop-key]')
      if (hit instanceof HTMLElement) {
        row = hit
        break
      }
    }
    if (!row) return
    const key = row.getAttribute('data-layer-drop-key')
    if (!key || key === dragged) return
    let allowInside = false
    if (key.startsWith('object:')) {
      const id = key.slice(7)
      const target = linesRef.current.find((item) => item.id === id)
      allowInside =
        target?.type === 'group' && canNestDraggedIntoGroup(dragged, id)
    }
    const position = dropPositionForRect(row.getBoundingClientRect(), clientY, allowInside)
    setLayerDropTarget((prev) =>
      prev?.key === key && prev.position === position ? prev : { key, position }
    )
  }

  const updateLayersPanelDragScroll = (clientY: number) => {
    const el = layersPanelScrollRef.current
    if (!el || !draggedLayerRef.current) {
      stopLayersPanelEdgeScroll()
      return
    }
    const rect = el.getBoundingClientRect()
    const edge = 40
    let vel = 0
    if (clientY < rect.top + edge) {
      const t = Math.min(1, (rect.top + edge - clientY) / edge)
      vel = -Math.ceil(3 + t * 16)
    } else if (clientY > rect.bottom - edge) {
      const t = Math.min(1, (clientY - (rect.bottom - edge)) / edge)
      vel = Math.ceil(3 + t * 16)
    }
    layersDragScrollVelRef.current = vel
    if (!vel) {
      stopLayersPanelEdgeScroll()
      return
    }
    if (layersDragScrollRafRef.current != null) return
    const tick = () => {
      layersDragScrollRafRef.current = null
      const list = layersPanelScrollRef.current
      const speed = layersDragScrollVelRef.current
      if (!list || !draggedLayerRef.current || !speed) {
        layersDragScrollVelRef.current = 0
        return
      }
      list.scrollTop += speed
      const { x, y } = layersPointerLastClientRef.current
      resolveLayerDropAtPoint(x, y)
      layersDragScrollRafRef.current = requestAnimationFrame(tick)
    }
    layersDragScrollRafRef.current = requestAnimationFrame(tick)
  }

  const detachLayersPointerListeners = () => {
    layersPointerDetachRef.current?.()
    layersPointerDetachRef.current = null
  }

  const endLayersPointerDrag = (commit: boolean) => {
    const dragged = draggedLayerRef.current
    const target = layerDropTargetRef.current
    layersPointerPendingRef.current = null
    draggedLayerRef.current = null
    setLayerDropTarget(null)
    setLayerPointerDragging(false)
    stopLayersPanelEdgeScroll()
    detachLayersPointerListeners()
    if (commit && dragged && target && target.key !== dragged) {
      dropLayerItem(dragged, target.key, target.position)
    }
  }

  const attachLayersPointerListeners = () => {
    if (layersPointerDetachRef.current) return
    const move = (e: PointerEvent) => layersPointerMoveHandlerRef.current(e)
    const up = () => layersPointerUpHandlerRef.current()
    const onWheel = (e: WheelEvent) => {
      if (!draggedLayerRef.current) return
      const el = layersPanelScrollRef.current
      if (!el) return
      el.scrollTop += e.deltaY
      e.preventDefault()
      const { x, y } = layersPointerLastClientRef.current
      resolveLayerDropAtPoint(x, y)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('wheel', onWheel, { passive: false })
    layersPointerDetachRef.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('wheel', onWheel)
    }
  }

  layersPointerMoveHandlerRef.current = (e: PointerEvent) => {
    const pending = layersPointerPendingRef.current
    if (pending && !draggedLayerRef.current) {
      const dx = e.clientX - pending.x
      const dy = e.clientY - pending.y
      if (dx * dx + dy * dy < 25) return
      draggedLayerRef.current = pending.key
      layersPointerPendingRef.current = null
      setLayerDropTarget(null)
      setLayerPointerDragging(true)
    }
    if (!draggedLayerRef.current) return
    layersPointerLastClientRef.current = { x: e.clientX, y: e.clientY }
    updateLayersPanelDragScroll(e.clientY)
    resolveLayerDropAtPoint(e.clientX, e.clientY)
  }

  layersPointerUpHandlerRef.current = () => {
    if (draggedLayerRef.current) endLayersPointerDrag(true)
    else {
      layersPointerPendingRef.current = null
      detachLayersPointerListeners()
    }
  }

  const beginLayersPointerReorder = (key: string, clientX: number, clientY: number) => {
    layersPointerPendingRef.current = { key, x: clientX, y: clientY }
    layersPointerLastClientRef.current = { x: clientX, y: clientY }
    attachLayersPointerListeners()
  }

  /**
   * Word-style crop: Crop enters a mode with handles. Apply with Crop again,
   * Enter, or click outside. Escape cancels.
   */
  const endCropSession = (restore: boolean) => {
    const cs = cropSessionRef.current
    const l = cs ? linesRef.current.find((item) => item.id === cs.id) : null
    if (restore && cs && l && l.pts.length >= 2) {
      l.pts = [{ ...cs.startPts[0] }, { ...cs.startPts[1] }]
    }
    if (l) l.transformOrigin = undefined
    cropSessionRef.current = null
    setCropping(false)
    setCropHoverCursor(null)
  }

  const applyStampCrop = (): boolean => {
    const cs = cropSessionRef.current
    if (!cs) return true
    const l = linesRef.current.find((item) => item.id === cs.id)
    if (!l || l.type !== 'stamp' || !l.imageDataUrl || l.pts.length < 2) {
      endCropSession(false)
      redrawLines()
      drawHandles()
      return true
    }
    const full =
      Math.abs(cs.x - cs.imgX) < 0.75 &&
      Math.abs(cs.y - cs.imgY) < 0.75 &&
      Math.abs(cs.w - cs.imgW) < 0.75 &&
      Math.abs(cs.h - cs.imgH) < 0.75
    if (full) {
      const moved =
        Math.hypot(l.pts[0].x - cs.startPts[0].x, l.pts[0].y - cs.startPts[0].y) > 0.5 ||
        Math.hypot(l.pts[1].x - cs.startPts[1].x, l.pts[1].y - cs.startPts[1].y) > 0.5
      endCropSession(false)
      commitLines([...linesRef.current])
      redrawLines()
      drawHandles()
      if (moved) pushHistory()
      return true
    }
    const img = ensureStampImage(l.imageDataUrl, () => { applyStampCrop() })
    if (!img) return false
    const nw = img.naturalWidth || img.width
    const nh = img.naturalHeight || img.height
    if (nw < 1 || nh < 1) {
      endCropSession(false)
      redrawLines()
      drawHandles()
      return true
    }
    let sx = ((cs.x - cs.imgX) / Math.max(1, cs.imgW)) * nw
    let sy = ((cs.y - cs.imgY) / Math.max(1, cs.imgH)) * nh
    let sw = (cs.w / Math.max(1, cs.imgW)) * nw
    let sh = (cs.h / Math.max(1, cs.imgH)) * nh
    sx = Math.max(0, Math.floor(sx))
    sy = Math.max(0, Math.floor(sy))
    sw = Math.max(1, Math.min(nw - sx, Math.round(sw)))
    sh = Math.max(1, Math.min(nh - sy, Math.round(sh)))
    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    out.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    const origin = l.transformOrigin ?? objCenter(l)
    const localCenter = { x: cs.x + cs.w / 2, y: cs.y + cs.h / 2 }
    const displayedCenter = rotatePt(localCenter, origin, l.rot ?? 0)
    const ox = (cs.x - cs.imgX) / Math.max(1, cs.imgW)
    const oy = (cs.y - cs.imgY) / Math.max(1, cs.imgH)
    const rw = cs.w / Math.max(1, cs.imgW)
    const rh = cs.h / Math.max(1, cs.imgH)
    if (l.paintStrokes?.length) {
      l.paintStrokes = l.paintStrokes.map((stroke) => ({
        ...stroke,
        pts: stroke.pts.map((p) => ({
          x: (p.x - ox) / Math.max(0.0001, rw),
          y: (p.y - oy) / Math.max(0.0001, rh)
        }))
      }))
    }
    l.pts = [
      { x: displayedCenter.x - cs.w / 2, y: displayedCenter.y - cs.h / 2 },
      { x: displayedCenter.x + cs.w / 2, y: displayedCenter.y + cs.h / 2 }
    ]
    l.imageDataUrl = out.toDataURL('image/png')
    l.sourceSvgMarkup = undefined
    l.sourceStampSize = undefined
    l.keepStrokeOnResize = undefined
    ensureStampImage(l.imageDataUrl)
    endCropSession(false)
    commitLines([...linesRef.current])
    redrawLines()
    drawHandles()
    pushHistory()
    return true
  }
  applyStampCropRef.current = applyStampCrop

  const cancelStampCrop = () => {
    if (!cropSessionRef.current) return
    endCropSession(true)
    commitLines([...linesRef.current])
    redrawLines()
    drawHandles()
  }
  cancelStampCropRef.current = cancelStampCrop

  const cropSelectedStamp = () => {
    if (cropSessionRef.current) {
      applyStampCrop()
      return
    }
    const l = linesRef.current.find((item) => item.id === selectedIdRef.current)
    if (!l || l.type !== 'stamp' || !l.imageDataUrl || l.pts.length < 2) return
    if (toolRef.current !== 'pointer') setTool('pointer')
    const origin = objCenter(l)
    l.transformOrigin = { x: origin.x, y: origin.y }
    const r = stampLocalRect(l)
    cropSessionRef.current = {
      id: l.id,
      imgX: r.x,
      imgY: r.y,
      imgW: r.w,
      imgH: r.h,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      startPts: [{ ...l.pts[0] }, { ...l.pts[1] }]
    }
    setCropping(true)
    drawHandles()
  }

  /** Create a persistent parent group without flattening its child objects. */
  const groupSelectedLayers = () => {
    const selectedIds = new Set(
      [...selectedLayerIds].filter((id) => {
        const l = linesRef.current.find((item) => item.id === id)
        return !!l && !l.marqueeItem
      })
    )
    // If both a group and one of its descendants are selected, group the
    // parent once rather than creating duplicate/cyclic membership.
    const hasSelectedAncestor = (l: LineObj): boolean => {
      let parentId = l.parentId
      while (parentId) {
        if (selectedIds.has(parentId)) return true
        parentId = linesRef.current.find((item) => item.id === parentId)?.parentId
      }
      return false
    }
    const ids = new Set(
      [...selectedIds].filter((id) => {
        const l = linesRef.current.find((item) => item.id === id)
        return !!l && !hasSelectedAncestor(l)
      })
    )
    if (ids.size < 2) return

    const topFirst = [...linesRef.current].reverse()
    const topmost = topFirst.find((l) => ids.has(l.id))
    if (!topmost) return
    const selected = linesRef.current.filter((l) => ids.has(l.id))
    const boxes = selected.map(boundsForLine)
    const left = Math.min(...boxes.map((b) => b.x))
    const top = Math.min(...boxes.map((b) => b.y))
    const right = Math.max(...boxes.map((b) => b.x + b.w))
    const bottom = Math.max(...boxes.map((b) => b.y + b.h))
    const parents = new Set(selected.map((l) => l.parentId))
    const commonParentId = parents.size === 1 ? selected[0]?.parentId : undefined
    const topRoot = paintRootOf(topmost, linesRef.current)
    const grouped: LineObj = {
      id: genId(),
      name: 'Group',
      type: 'group',
      pts: [{ x: left, y: top }, { x: right, y: bottom }],
      startCap: 'none',
      endCap: 'none',
      dash: 'solid',
      thickness: 0,
      color: '#000000ff',
      layer: vectorLayerOf(topmost),
      parentId: commonParentId,
      belowBase: !!topRoot.belowBase
    }

    const topmostIndex = linesRef.current.findIndex((l) => l.id === topmost.id)
    // Keep grouped children contiguous in paint order (bottom → top matches panel top → bottom).
    const groupedChildren = [...linesRef.current]
      .reverse()
      .filter((l) => ids.has(l.id))
      .reverse()
      .map((l) => ({ ...l, parentId: grouped.id }))
    let insertAt = topmostIndex
    for (let i = 0; i < topmostIndex; i++) {
      if (ids.has(linesRef.current[i].id)) insertAt--
    }
    const next = linesRef.current.filter((l) => !ids.has(l.id))
    next.splice(insertAt, 0, grouped, ...groupedChildren)
    syncGroupBounds(next)
    commitLines(next)
    selectedIdRef.current = grouped.id
    setSelectedId(grouped.id)
    setSelectedLayerIds(new Set([grouped.id]))
    setTool('pointer')
    redrawLines()
    drawHandles()
    pushHistory([`object:${grouped.id}`, ...[...ids].map((id) => `object:${id}`)])
  }

  const ungroupSelectedLayer = () => {
    const group = linesRef.current.find((l) => l.id === selectedIdRef.current && l.type === 'group')
    if (!group) return
    const childIds = linesRef.current.filter((l) => l.parentId === group.id).map((l) => l.id)
    const next = linesRef.current
      .filter((l) => l.id !== group.id)
      .map((l) =>
        l.parentId === group.id
          ? { ...l, parentId: undefined, belowBase: !!group.belowBase }
          : l
      )
    syncGroupBounds(next)
    commitLines(next)
    selectedIdRef.current = childIds[0] ?? null
    setSelectedId(childIds[0] ?? null)
    setSelectedLayerIds(new Set(childIds))
    redrawLines()
    drawHandles()
    pushHistory([`object:${group.id}`, ...childIds.map((id) => `object:${id}`)])
  }

  const eligibleObjectIds = lines.filter((l) => !l.marqueeItem && !l.punchMask).map((l) => l.id)
  const allObjectsSelected = eligibleObjectIds.length > 0 &&
    eligibleObjectIds.every((id) => selectedLayerIds.has(id))
  const toggleSelectAllObjects = () => {
    const ids = linesRef.current.filter((l) => !l.marqueeItem).map((l) => l.id)
    if (!ids.length) return
    setTool('pointer')
    const allOn = ids.every((id) => selectedLayerIdsRef.current.has(id))
    if (allOn) {
      selectedLayerIdsRef.current = new Set()
      setSelectedLayerIds(new Set())
      selectedIdRef.current = null
      setSelectedId(null)
    } else {
      const next = new Set(ids)
      selectedLayerIdsRef.current = next
      setSelectedLayerIds(next)
      const first = linesRef.current.find((l) => ids.includes(l.id))
      if (first) {
        selectedIdRef.current = first.id
        setSelectedId(first.id)
      }
    }
    setSelectedBaseLayer(null)
    selectedBaseLayerRef.current = null
    clearPreview()
    redrawLines()
    drawHandles()
  }

  const canSave =
    !showSaveTargets || saveLogoIds.size > 0 || saveFaviconIds.size > 0
  saveCurrentCanvasesRef.current = () => { void handleSave() }
  canSaveRef.current = canSave

  const TOOLS: { key: Tool; icon: React.ReactNode; label: string }[] = [
    { key: 'pointer', icon: <MousePointer2 size={16} />, label: 'Pointer — click an item drawn this session to edit it' },
    { key: 'brush', icon: <Brush size={16} />, label: 'Brush' },
    { key: 'eraser', icon: <Eraser size={16} />, label: 'Eraser' },
    { key: 'fill', icon: <PaintBucket size={16} />, label: 'Fill' },
    { key: 'eyedropper', icon: <Pipette size={16} />, label: 'Pick colour' },
    { key: 'line', icon: <Minus size={16} />, label: 'Line' },
    { key: 'text', icon: <TypeIcon size={16} />, label: 'Text' },
    { key: 'polygon', icon: <PenTool size={16} />, label: 'Polygon (click points, double-click to finish)' },
    { key: 'select', icon: <BoxSelect size={16} />, label: 'Select (marquee) — drag a box, then Ctrl+C / Ctrl+V' }
  ]

  const shapeToolActive = tool === 'shape' || tool === 'polygon' || tool === 'freepoly'
  const polyGroupActive = tool === 'freepoly' || (tool === 'shape' && POLY_KIND_SET.has(shapeKind))
  const irregGroupActive = tool === 'shape' && !POLY_KIND_SET.has(shapeKind)
  const noTarget = !editContainer && !editContent

  const selectedObj = lines.find((l) => l.id === selectedId) || null
  const selectedLayerHasAncestor = (l: LineObj): boolean => {
    let parentId = l.parentId
    while (parentId) {
      if (selectedLayerIds.has(parentId)) return true
      parentId = lines.find((item) => item.id === parentId)?.parentId
    }
    return false
  }
  const groupableLayerCount = lines.filter(
    (l) => selectedLayerIds.has(l.id) && !l.marqueeItem && !selectedLayerHasAncestor(l)
  ).length
  const selectedIsGroup = selectedObj?.type === 'group'
  const panelObjectsForBase = (
    id: PaintLayerId,
    belowBase: boolean
  ): { l: LineObj; depth: number }[] => {
    const result: { l: LineObj; depth: number }[] = []
    const appendChildren = (parentId: string, depth: number) => {
      for (const child of [...lines].filter((l) => l.parentId === parentId).reverse()) {
        result.push({ l: child, depth })
        if (child.type === 'group' && !collapsedGroupIds.has(child.id)) {
          appendChildren(child.id, depth + 1)
        }
      }
    }
    const roots = [...lines]
      .filter(
        (l) =>
          vectorLayerOf(l) === id &&
          !l.marqueeItem &&
          !l.punchMask &&
          !l.parentId &&
          !!l.belowBase === belowBase
      )
      .reverse()
    for (const root of roots) {
      result.push({ l: root, depth: 0 })
      if (root.type === 'group' && !collapsedGroupIds.has(root.id)) appendChildren(root.id, 1)
    }
    return result
  }
  const directGroupChildCount = (groupId: string): number =>
    lines.filter((item) => item.parentId === groupId).length
  const editingText = selectedObj ? selectedObj.type === 'text' : tool === 'text'
  const editingPoly = selectedObj ? selectedObj.type === 'poly' : tool === 'freepoly'
  const editingShape = selectedObj ? selectedObj.type === 'shape' : tool === 'shape'
  const editingStamp = selectedObj?.type === 'stamp'
  const editingContentProxy = !!(selectedObj?.contentBound && editingStamp)
  const imageMatchTarget = !!(
    selectedObj &&
    isInnerUploadedImageProxy(selectedObj) &&
    selectedLayerIds.size <= 1
  )
  /** Keep Match chrome visible for the whole Match session (not only while imageMatchTarget is true). */
  const showMatchChrome = tool === 'match' || imageMatchTarget

  const findImageMatchProxy = (): LineObj | null => {
    const sel = linesRef.current.find((l) => l.id === selectedIdRef.current)
    if (sel && isInnerUploadedImageProxy(sel)) return sel
    return linesRef.current.find((l) => isInnerUploadedImageProxy(l)) ?? null
  }

  useEffect(() => {
    if (tool !== 'match') return
    if (imageMatchTarget) return
    // Selection briefly lost / multi-select — try to keep Match on the image proxy.
    const proxy = findImageMatchProxy()
    if (proxy) {
      selectedIdRef.current = proxy.id
      setSelectedId(proxy.id)
      setSelectedLayerIds(new Set([proxy.id]))
      return
    }
    setTool('pointer')
    setMatchSlot(null)
    setMatchLabels([])
  }, [tool, imageMatchTarget])

  const matchModeActiveRef = useRef(false)
  useEffect(() => {
    const wasMatch = matchModeActiveRef.current
    matchModeActiveRef.current = tool === 'match'
    if (!wasMatch || tool === 'match') return
    // Left Match via another tool / intentional exit — apply Color 1–5 from marks.
    setMatchSlot(null)
    setMatchLabels([])
    void (async () => {
      const sel = findImageMatchProxy()
      if (!sel) return
      const next = await refreshStampFromMarks(sel)
      commitLines(linesRef.current.map((l) => (l.id === next.id ? next : l)))
      if (next.imageDataUrl) {
        ensureStampImage(next.imageDataUrl, () => {
          redrawLinesRef.current()
          drawHandles()
        })
      }
      pushHistory()
      redrawLines()
      drawHandles()
    })()
  }, [tool])

  useEffect(() => {
    if (tool !== 'match') {
      setMatchLabels([])
      return
    }
    const target = selectedObj && isInnerUploadedImageProxy(selectedObj) ? selectedObj : null
    if (!target) return
    let cancelled = false
    void buildMatchSectionLabels(target).then((labels) => {
      if (!cancelled) setMatchLabels(labels)
    })
    return () => {
      cancelled = true
    }
  }, [tool, selectedObj?.id, selectedObj?.colorMarkPng])

  const exitMatchMode = useCallback(() => {
    setTool('pointer')
    // Remap + cleanup runs in the tool-leave effect above.
  }, [])

  const enterMatchMode = useCallback(() => {
    const sel =
      linesRef.current.find((l) => l.id === selectedIdRef.current) ??
      linesRef.current.find((l) => isInnerUploadedImageProxy(l))
    if (!sel || !isInnerUploadedImageProxy(sel)) return
    // Lock selection onto the image proxy before switching tools.
    selectedIdRef.current = sel.id
    setSelectedId(sel.id)
    setSelectedLayerIds(new Set([sel.id]))
    setTool('match')
    setMatchSlot(null)
    void (async () => {
      const current = linesRef.current.find((l) => l.id === sel.id) ?? sel
      if (current.colorRegionPng && current.colorMarkPng) {
        const labels = await buildMatchSectionLabels(current)
        setMatchLabels(labels)
        return
      }
      // First Match: build stable regions + default marks from scanned palette.
      // Keep the current remapped look until Match exits (refresh then).
      const prevDisplay = current.imageDataUrl
      const next = await enrichImageProxyWithMatch(current, null)
      const kept = prevDisplay
        ? { ...next, imageDataUrl: prevDisplay }
        : next
      commitLines(linesRef.current.map((l) => (l.id === kept.id ? kept : l)))
      if (kept.imageDataUrl) {
        ensureStampImage(kept.imageDataUrl, () => {
          redrawLinesRef.current()
          drawHandles()
        })
      }
      const labels = await buildMatchSectionLabels(kept)
      setMatchLabels(labels)
      redrawLines()
      drawHandles()
    })()
  }, [])
  const fillableCtx = editingPoly || editingShape
  /** Text / stamp / group ignore the general stroke Size slider. */
  const selectionUsesStrokeSlider = (l: LineObj | null | undefined): boolean => {
    if (!l || l.marqueeItem) return false
    if (l.type === 'group' || l.type === 'text' || l.type === 'stamp') return false
    return true
  }
  const strokeSizeEnabled =
    tool === 'brush' ||
    tool === 'eraser' ||
    !selectedObj ||
    selectionUsesStrokeSlider(selectedObj)
  const showVecOptions = !selectedIsGroup && !editingText && !editingStamp && (tool === 'line' || tool === 'freepoly' || tool === 'shape' || (selectedObj != null))

  const patchContentProxy = (patch: Partial<LineObj>, commit = true): void => {
    if (!selectedIdRef.current || !selectedObj?.contentBound) return
    if (commit) updateSelected(patch)
    else updateSelectedLive(patch)
  }

  // Live-patch the selected text object (if any) with the given fields.
  const patchText = (patch: Partial<LineObj>, commit = true): void => {
    if (selectedIdRef.current && selectedObj?.type === 'text') {
      const clearsHole =
        patch.text !== undefined ||
        patch.fontFamily !== undefined ||
        patch.fontSize !== undefined ||
        patch.fontWeight !== undefined ||
        patch.bold !== undefined ||
        patch.italic !== undefined ||
        patch.underline !== undefined ||
        patch.letterSpacing !== undefined
      if (commit) updateSelected(patch)
      else updateSelectedLive(patch)
      // Rebuild after the glyph metrics/text are applied.
      if (clearsHole) {
        const live = linesRef.current.find((l) => l.id === selectedIdRef.current)
        if (live) {
          refreshTextHoleMaskForNewGlyphs(live, W, H)
          redrawLines()
          drawHandles()
        }
      }
    }
  }

  const applyOutsideTextSettings = (settings: OutsideTextSettings) => {
    const id = selectedIdRef.current
    const selected = id ? linesRef.current.find((l) => l.id === id) : null
    const target =
      selected?.type === 'text'
        ? selected
        : linesRef.current.find((l) => l.type === 'text' && l.linkedOutsideText)
          ?? linesRef.current.find((l) => l.type === 'text')
    if (!target) {
      const seeded = lineFromOutsideText(settings, W, innerDraw)
      linesRef.current = [...linesRef.current, seeded]
      commitLines(linesRef.current)
      selectLine(seeded)
      loadFont(seeded.fontFamily ?? 'Inter').then(() => {
        const cur = linesRef.current.find((l) => l.id === seeded.id)
        if (!cur) return
        const next = applyOutsideTextToLine(cur, settings, W, innerDraw)
        linesRef.current = linesRef.current.map((l) => (l.id === next.id ? next : l))
        commitLines(linesRef.current)
        setTextValue(next.text ?? '')
        setFontFamily(next.fontFamily ?? 'Inter')
        setFontSize(next.fontSize ?? 48)
        setFontWeightV(next.weight ?? 700)
        setUnderline(!!next.underline)
        setItalic(!!next.italic)
        setTxtLetterSpacing(next.letterSpacing ?? 0)
        setColor(next.color)
        setTxtShadow(!!next.shadow)
        setTxtShadowColor(next.shadowColor ?? '#000000b3')
        setTxtShadowBlur(next.shadowBlur ?? 8)
        setTxtShadowOX(next.shadowOffsetX ?? 0)
        setTxtShadowOY(next.shadowOffsetY ?? 3)
        setTxtShadowSpread(next.shadowSpread ?? 0)
        redrawLines()
        drawHandles()
        pushHistory()
      })
      return
    }
    const next = applyOutsideTextToLine(target, settings, W, innerDraw, {
      preservePosition: !target.linkedOutsideText,
      linkToOutside: !!target.linkedOutsideText
    })
    linesRef.current = linesRef.current.map((l) => (l.id === next.id ? next : l))
    commitLines(linesRef.current)
    selectedIdRef.current = next.id
    setSelectedId(next.id)
    setTextValue(next.text ?? '')
    setFontFamily(next.fontFamily ?? 'Inter')
    setFontSize(next.fontSize ?? 48)
    setFontWeightV(next.weight ?? 700)
    setUnderline(!!next.underline)
    setItalic(!!next.italic)
    setTxtLetterSpacing(next.letterSpacing ?? 0)
    setColor(next.color)
    setHexText(isGradientColor(next.color) ? firstSolidColor(next.color) : next.color)
    setTxtShadow(!!next.shadow)
    setTxtShadowColor(next.shadowColor ?? '#000000b3')
    setTxtShadowBlur(next.shadowBlur ?? 8)
    setTxtShadowOX(next.shadowOffsetX ?? 0)
    setTxtShadowOY(next.shadowOffsetY ?? 3)
    setTxtShadowSpread(next.shadowSpread ?? 0)
    loadFont(next.fontFamily ?? 'Inter').then(() => { redrawLines(); drawHandles() })
    redrawLines()
    drawHandles()
    pushHistory()
  }

  const pickPolyShape = (k: ShapeKind) => {
    setPolyKind(k)
    setShapeKind(k)
    setTool('shape')
    setOpenMenu(null)
    setShapeMenuRect(null)
    const id = selectedIdRef.current
    const live = id ? linesRef.current.find((l) => l.id === id) : null
    // Only retarget an already-selected polygon-family shape — never convert
    // irregular ↔ polygon (or free poly) when picking from the toolbar menus.
    if (
      live &&
      live.type === 'shape' &&
      live.shape &&
      POLY_KIND_SET.has(live.shape) &&
      live.shape !== k
    ) {
      clearHolesOnShapeIdentityChange(live)
      updateSelected({ shape: k })
      redrawLines()
      drawHandles()
    }
  }
  const pickIrregShape = (k: ShapeKind) => {
    setIrregKind(k)
    setShapeKind(k)
    setTool('shape')
    setOpenMenu(null)
    setShapeMenuRect(null)
    const id = selectedIdRef.current
    const live = id ? linesRef.current.find((l) => l.id === id) : null
    if (
      live &&
      live.type === 'shape' &&
      live.shape &&
      !POLY_KIND_SET.has(live.shape) &&
      live.shape !== k
    ) {
      clearHolesOnShapeIdentityChange(live)
      updateSelected({ shape: k })
      redrawLines()
      drawHandles()
    }
  }

  return (
    <TransparentFillModeContext.Provider
      value={{
        mode: transparentFillMode,
        setMode: applyTransparentFillMode
      }}
    >
    <div style={NO_DRAG} className="fixed top-10 left-0 right-0 bottom-0 z-[9998] flex flex-col bg-bg/95 backdrop-blur-sm">
      {openMenu && (
        <div
          className="absolute inset-0 z-[10040]"
          onClick={() => {
            setOpenMenu(null)
            setShapeMenuRect(null)
          }}
        />
      )}
      {/* Header — drag region so the window can still be moved in paint mode */}
      <div style={DRAG} className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface shrink-0">
        <span className="text-sm font-semibold text-text">{title}</span>
        <div style={NO_DRAG} className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface3 text-muted hover:text-text transition-colors"
          >
            <X size={13} /> Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            title={!canSave ? 'Select at least one variant to save to' : 'Save (Ctrl+S)'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={13} /> Save
          </button>
        </div>
      </div>

      {/* Toolbar — two fixed rows so tools and paint settings stay visible without one long scroll strip */}
      <div className="shrink-0 border-b border-border bg-surface">
      <div className="h-11 flex items-center gap-3 px-4 flex-nowrap overflow-x-auto">
        {/* Tools */}
        <div className="flex items-center gap-1 shrink-0">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTool(t.key)}
              title={t.label}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                tool === t.key ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              {t.icon}
            </button>
          ))}

          {/* Polygon shapes group */}
          <div className="relative">
            <button
              ref={polyMenuBtnRef}
              onClick={() => {
                if (polyKind === 'freepoly') setTool('freepoly')
                else { setShapeKind(polyKind); setTool('shape') }
                if (openMenu === 'poly') {
                  setOpenMenu(null)
                  setShapeMenuRect(null)
                } else {
                  setShapeMenuRect(polyMenuBtnRef.current?.getBoundingClientRect() ?? null)
                  setOpenMenu('poly')
                }
              }}
              title="Polygon shapes ▾"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                polyGroupActive ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              <Square size={16} />
            </button>
            {openMenu === 'poly' && shapeMenuRect && (
              <ShapeMenu
                title="Polygons"
                items={POLY_SHAPES}
                current={shapeKind}
                anchorRect={shapeMenuRect}
                onPick={pickPolyShape}
                freePoly={{
                  n: freePolyN,
                  onN: setFreePolyN,
                  active: tool === 'freepoly',
                  onPick: () => {
                    setPolyKind('freepoly')
                    setTool('freepoly')
                    setOpenMenu(null)
                    setShapeMenuRect(null)
                  }
                }}
                aspectLock={{
                  enabled: polyLockAspect,
                  onEnabled: setPolyLockAspect,
                  aspectW: polyAspectW,
                  aspectH: polyAspectH,
                  onAspectW: setPolyAspectW,
                  onAspectH: setPolyAspectH,
                  title: 'When checked, polygons (including free polygon) keep this aspect while drawing or corner-resizing. Hold Shift for the same while unchecked.'
                }}
              />
            )}
          </div>

          {/* Irregular shapes group */}
          <div className="relative">
            <button
              ref={irregMenuBtnRef}
              onClick={() => {
                setShapeKind(irregKind)
                setTool('shape')
                if (openMenu === 'irreg') {
                  setOpenMenu(null)
                  setShapeMenuRect(null)
                } else {
                  setShapeMenuRect(irregMenuBtnRef.current?.getBoundingClientRect() ?? null)
                  setOpenMenu('irreg')
                }
              }}
              title="Irregular shapes ▾"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                irregGroupActive ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              <Circle size={16} />
            </button>
            {openMenu === 'irreg' && shapeMenuRect && (
              <ShapeMenu
                title="Irregular shapes"
                items={IRREG_SHAPES}
                current={shapeKind}
                anchorRect={shapeMenuRect}
                onPick={pickIrregShape}
                aspectLock={{
                  enabled: irregLockAspect,
                  onEnabled: setIrregLockAspect,
                  aspectW: irregAspectW,
                  aspectH: irregAspectH,
                  onAspectW: setIrregAspectW,
                  onAspectH: setIrregAspectH,
                  title: 'When checked, irregular shapes keep this aspect while drawing or corner-resizing. Hold Shift for the same while unchecked.'
                }}
              />
            )}
          </div>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Copy / paste */}
          <button
            onClick={() => clipActionsRef.current.copy()}
            disabled={!selectedId && !hasMarquee}
            title="Copy (Ctrl+C)"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors disabled:opacity-30 disabled:hover:text-muted"
          >
            <Copy size={16} />
          </button>
          <button
            onClick={() => clipActionsRef.current.paste()}
            disabled={noTarget && !hasClip}
            title="Paste (Ctrl+V) — system image or copied region/shape. Lands on the top editable layer."
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors disabled:opacity-30 disabled:hover:text-muted"
          >
            <ClipboardPaste size={16} />
          </button>
          <input
            ref={imageFileInputRef}
            type="file"
            accept="image/*,.svg,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              onExternalImageFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => imageFileInputRef.current?.click()}
            disabled={noTarget}
            title="Add image or SVG on top of the highest editable layer (does not replace the icon)"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-muted"
          >
            <Upload size={16} />
          </button>

          {/* Clipboard status */}
          <div className="flex items-center gap-1.5 pl-1 text-[10px] whitespace-nowrap select-none">
            <span className="text-border">|</span>
            <span className="text-muted/70">Copied:</span>
            <span className={hasClip ? 'text-text font-medium' : 'text-muted/50'}>{hasClip ? clipLabel : 'nothing'}</span>
            <span className="text-border">|</span>
          </div>
        </div>
      </div>

      <div className="h-11 flex items-center gap-3 px-4 border-t border-border/70 flex-nowrap overflow-x-auto">
        {/* Colour — solid / linear / radial (same picker as outside paint mode) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            ref={colorSwatchRef}
            type="button"
            onClick={() => {
              if (colorSwatchRef.current) {
                setColorPopupRect(colorSwatchRef.current.getBoundingClientRect())
                setColorPopupOpen(true)
              }
            }}
            className="w-8 h-8 shrink-0 rounded cursor-pointer border border-border/50 overflow-hidden"
            style={{ background: color }}
            title="Colour — click for solid / gradient"
          />
          {isGradientColor(color) ? (
            <button
              type="button"
              onClick={() => {
                if (colorSwatchRef.current) {
                  setColorPopupRect(colorSwatchRef.current.getBoundingClientRect())
                  setColorPopupOpen(true)
                }
              }}
              className="w-28 px-2 py-1 rounded bg-surface3 border border-border text-xs text-muted font-mono text-left truncate hover:border-accent transition-colors"
              title="Edit gradient"
            >
              gradient
            </button>
          ) : (
            <input
              type="text"
              value={hexText}
              onChange={(e) => {
                setHexText(e.target.value)
                const n = normalizeHex(e.target.value)
                if (n) {
                  setColor(n)
                  if (selectedIdRef.current) {
                    updateSelectedLive((l) => applySelectedObjectColor(l, n))
                  }
                }
              }}
              onBlur={() => setHexText(color)}
              placeholder="#RRGGBBAA"
              className="w-28 px-2 py-1 rounded bg-surface3 border border-border text-xs font-mono text-text focus:outline-none focus:border-accent"
              title="Hex with optional alpha (#RRGGBB or #RRGGBBAA)"
            />
          )}
          {colorPopupOpen && colorPopupRect && (
            <ColorPickerPopup
              value={color}
              onChange={(c) => {
                setColor(c)
                if (!isGradientColor(c)) setHexText(c)
                if (selectedIdRef.current) {
                  updateSelectedLive((l) => applySelectedObjectColor(l, c))
                }
              }}
              onClose={() => {
                setColorPopupOpen(false)
                if (selectedIdRef.current) pushHistory()
              }}
              rect={colorPopupRect}
            />
          )}
        </div>

        {!isGradientColor(color) && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted">Opacity</span>
            <input
              type="range" min={0} max={100} value={hexAlpha(color)}
              onChange={(e) => {
                const c = withAlpha(color, Number(e.target.value))
                setColor(c)
                setHexText(c)
                if (selectedIdRef.current) {
                  updateSelectedLive((l) => applySelectedObjectColor(l, c))
                }
              }}
              onMouseUp={() => { if (selectedIdRef.current) pushHistory() }}
              className="w-24"
            />
            <span className="text-[10px] text-muted w-7 text-right tabular-nums">{hexAlpha(color)}%</span>
          </div>
        )}

        <div className="w-px h-6 bg-border shrink-0" />

        {/* Size / thickness / border width */}
        <div
          className={`flex items-center gap-2 shrink-0 ${strokeSizeEnabled ? '' : 'opacity-40'}`}
          title={
            !strokeSizeEnabled
              ? 'Stroke size does not apply to text, stamps, or groups'
              : fillableCtx || tool === 'shape' || tool === 'freepoly' || tool === 'polygon'
              ? 'Border / stroke width of the selected shape (or next shape you draw)'
              : tool === 'line' ||
                  (tool === 'pointer' &&
                    !!selectedObj &&
                    (selectedObj.type === 'polyline' ||
                      selectedObj.type === 'free' ||
                      selectedObj.type === 'drawn' ||
                      selectedObj.type === 'arrow'))
                ? 'Stroke thickness of the selected line (or next line you draw)'
                : tool === 'brush' || tool === 'eraser'
                  ? 'Brush / eraser tip size'
                  : tool === 'pointer' || tool === 'reshape'
                    ? selectedId
                      ? 'Stroke / border width of the selected object'
                      : 'Default tip / stroke size used when you switch to Brush, Line, or Shape'
                    : 'Tip / stroke size'
          }
        >
          <span className="text-[11px] text-muted whitespace-nowrap">
            {fillableCtx || tool === 'shape' || tool === 'freepoly' || tool === 'polygon'
              ? 'Border width'
              : tool === 'line' ||
                  (tool === 'pointer' &&
                    !!selectedObj &&
                    (selectedObj.type === 'polyline' ||
                      selectedObj.type === 'free' ||
                      selectedObj.type === 'drawn' ||
                      selectedObj.type === 'arrow'))
                ? 'Thickness'
                : tool === 'brush' || tool === 'eraser'
                  ? 'Size'
                  : tool === 'pointer' || tool === 'reshape'
                    ? selectedId && selectionUsesStrokeSlider(selectedObj)
                      ? 'Stroke'
                      : 'Size'
                    : 'Size'}
          </span>
          <input
            type="range"
            min={0}
            max={128}
            value={size}
            disabled={!strokeSizeEnabled}
            onChange={(e) => {
              if (!strokeSizeEnabled) return
              const v = Number(e.target.value)
              setSize(v)
              if (selectedIdRef.current && selectionUsesStrokeSlider(
                linesRef.current.find((l) => l.id === selectedIdRef.current)
              )) {
                updateSelectedLive((l) => ({ thickness: v, borderWidth: v }))
              }
            }}
            onMouseUp={() => {
              if (strokeSizeEnabled && selectedIdRef.current && selectionUsesStrokeSlider(
                linesRef.current.find((l) => l.id === selectedIdRef.current)
              )) {
                pushHistory()
              }
            }}
            className="w-28 disabled:cursor-not-allowed"
          />
          <span className="text-[10px] text-muted w-8 text-right tabular-nums">{size}px</span>
        </div>

        {/* After Size so 0% opacity never inserts between Opacity and Size (or over them) */}
        {isTransparentPaintColor(color) && (
          <>
            <div className="w-px h-6 bg-border shrink-0" />
            <div className="flex items-center shrink-0">
              <TransparentFillToggle mode={transparentFillMode} onChange={applyTransparentFillMode} />
            </div>
          </>
        )}

        {(shapeToolActive || fillableCtx) && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={shapeFill}
              onChange={(e) => { setShapeFill(e.target.checked); if (fillableCtx && selectedIdRef.current) updateSelected({ fill: e.target.checked }) }}
            />
            Fill shape
          </label>
        )}
        {(tool === 'shape' || tool === 'freepoly' || editingShape || editingPoly ||
          (editingStamp && !!selectedObj?.sourceSvgMarkup)) && (
          <label
            className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none"
            title="Keep the current stroke width instead of scaling it with the object"
          >
            <input
              type="checkbox"
              checked={keepStrokeOnResize}
              onChange={(e) => {
                const keep = e.target.checked
                setKeepStrokeOnResize(keep)
                if (selectedIdRef.current) updateSelected({ keepStrokeOnResize: keep })
              }}
              className="accent-accent"
            />
            Keep stroke on resize
          </label>
        )}

        <div className="w-px h-6 bg-border" />

        {/* Canvas transform — selected object, or full canvas when nothing selected */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => applyCanvasXform('ccw90')}
            title={selectedId ? 'Rotate selection 90° counter-clockwise' : 'Rotate canvas 90° counter-clockwise'}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors"
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            onClick={() => applyCanvasXform('cw90')}
            title={selectedId ? 'Rotate selection 90° clockwise' : 'Rotate canvas 90° clockwise'}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors"
          >
            <RotateCw size={15} />
          </button>
          <button
            type="button"
            onClick={() => applyCanvasXform('180')}
            title={selectedId ? 'Rotate selection 180°' : 'Rotate canvas 180°'}
            className="h-8 px-1.5 rounded-lg flex items-center justify-center bg-surface3 text-[10px] font-semibold text-muted hover:text-text transition-colors"
          >
            180°
          </button>
          <button
            type="button"
            onClick={() => applyCanvasXform('flipH')}
            title={selectedId ? 'Flip selection horizontally' : 'Flip canvas horizontally'}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors"
          >
            <FlipHorizontal2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => applyCanvasXform('flipV')}
            title={selectedId ? 'Flip selection vertically' : 'Flip canvas vertically'}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text transition-colors"
          >
            <FlipVertical2 size={15} />
          </button>
          <button
            type="button"
            disabled={!reshapeTargetLine() && !(selectedObj && lineReshapeable(selectedObj))}
            onClick={() => {
              const target = reshapeTargetLine() ?? (selectedObj && lineReshapeable(selectedObj) ? selectedObj : null)
              if (!target) return
              activateReshapeForTarget(target)
            }}
            title="Reshape — snap to ink edges, then drag corners to warp"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              tool === 'reshape' ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <Spline size={15} />
          </button>
          <button
            type="button"
            disabled={(noTarget && selectedObj?.type !== 'stamp') || bgRemoving}
            onClick={() => { void removeBgOnLayers() }}
            title={selectedObj?.type === 'stamp' ? 'Remove background on selected image' : 'Remove background on checked layers'}
            className="h-8 px-2 rounded-lg flex items-center gap-1 bg-surface3 text-[10px] font-medium text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles size={12} />
            {bgRemoving ? '…' : 'Remove BG'}
          </button>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Undo / redo / clear */}
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Undo2 size={15} />
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Redo2 size={15} />
          </button>
          {selectedObj?.type === 'stamp' && (
            <button
              onClick={cropSelectedStamp}
              title={cropping
                ? 'Apply crop (Enter). Esc cancels. Drag handles to crop, drag inside to move the picture.'
                : 'Crop image — drag handles like Word. Shift locks aspect.'}
              className={`h-8 px-2 rounded-lg flex items-center gap-1 text-[10px] font-medium transition-colors ${
                cropping
                  ? 'bg-accent text-white'
                  : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              <CropIcon size={14} /> {cropping ? 'Done' : 'Crop'}
            </button>
          )}
          <button
            onClick={() => {
              if (floatRef.current) clipActionsRef.current.discardFloat()
              else if (marqueeRef.current) clipActionsRef.current.clearRegion()
              else if (selectedIdRef.current) deleteSelectedRef.current()
            }}
            disabled={!selectedId && !hasMarquee}
            title="Delete selected item (Del)"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-danger transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-muted">
            <Trash2 size={15} />
          </button>
          <button onClick={clearAll} title="Clear editable layers"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface3 text-muted hover:text-danger transition-colors">
            <Ban size={15} />
          </button>
        </div>
      </div>
      </div>

      {/* Context options — fixed height so tool changes never shift the canvas */}
      <div className="h-11 shrink-0 border-b border-border bg-surface2 overflow-hidden">
        <div className="h-full min-w-0 flex flex-nowrap items-center overflow-x-auto overflow-y-hidden">
      {/* Fill options */}
      {tool === 'fill' ? (
        <div className="flex items-center gap-3 px-4 h-11 flex-nowrap shrink-0">
          <span className="text-[11px] font-semibold text-text">Fill</span>
          <label
            className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none"
            title="Recolor every non-transparent pixel on the editable layer(s) to the fill colour. Soft edges keep their transparency."
          >
            <input
              type="checkbox"
              checked={fillAllOpaque}
              onChange={(e) => setFillAllOpaque(e.target.checked)}
              className="accent-accent"
            />
            All non-transparent
          </label>
          <label
            className={`flex items-center gap-1.5 text-[11px] select-none ${
              fillAllOpaque ? 'text-muted/40 cursor-not-allowed' : 'text-muted cursor-pointer'
            }`}
            title="Also paint thin anti-aliased fringes and 1–2px leftover outlines next to the fill. Thick opaque borders (designed on purpose) are left alone."
          >
            <input
              type="checkbox"
              checked={fillCleanEdges}
              disabled={fillAllOpaque}
              onChange={(e) => setFillCleanEdges(e.target.checked)}
              className="accent-accent"
            />
            Clean thin edges
          </label>
          <span className="text-[10px] text-muted whitespace-nowrap">
            {isTransparentPaintColor(color)
              ? transparentFillMode === 'punch'
                ? 'Punch hole — the filled area cuts through every layer below; layers above still show'
                : 'See-through — this fill disappears so layers below show through'
              : fillAllOpaque
                ? 'Click any editable layer — every opaque pixel becomes the fill colour'
                : 'Fills AA fringes & thin rings · skips thick borders · thin session outlines inside the click also match fill colour'}
          </span>
        </div>
      ) : tool === 'select' && hasMarquee ? (
        <div className="flex items-center gap-3 px-4 h-11 flex-nowrap shrink-0">
          <span className="text-[11px] font-semibold text-text">Marquee</span>
          <span className="text-[9px] uppercase tracking-wide text-muted/70">Corner dots</span>
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => applyMarqueeMode('coverage')}
              title="Adjust what the box covers (pixels stay on the canvas until you move or scale)"
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                marqueeMode === 'coverage' ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              Coverage
            </button>
            <button
              onClick={() => applyMarqueeMode('scale')}
              title="Lift the selection and stretch/resize the highlighted pixels"
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                marqueeMode === 'scale' ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              Scale content
            </button>
          </div>
          <span className="text-[10px] text-muted whitespace-nowrap">
            {marqueeMode === 'coverage'
              ? 'Blue box — drag corners to change the covered area'
              : 'Amber box — drag corners to stretch the selection'}
          </span>
        </div>
      ) : tool === 'brush' ? (
        <div className="flex items-center gap-1 px-4 h-11 flex-nowrap shrink-0" title="Brush tip shape">
          <span className="text-[11px] text-muted mr-0.5">Tip</span>
          {BRUSH_TIPS.map((t) => (
            <button
              key={t.value}
              type="button"
              title={t.label}
              onClick={() => setBrushTip(t.value)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                brushTip === t.value ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              <BrushTipIcon tip={t.value} />
            </button>
          ))}
        </div>
      ) : tool === 'eraser' ? (
        <div className="flex items-center gap-1 px-4 h-11 flex-nowrap shrink-0" title="Eraser shape">
          <span className="text-[11px] text-muted mr-0.5">Shape</span>
          {([
            { value: 'round' as const, label: 'Circle' },
            { value: 'square' as const, label: 'Square' }
          ]).map((t) => (
            <button
              key={t.value}
              type="button"
              title={t.label}
              onClick={() => setEraserTip(t.value)}
              className={`h-8 px-2 rounded-lg flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                eraserTip === t.value ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
              }`}
            >
              <BrushTipIcon tip={t.value} />
              {t.label}
            </button>
          ))}
        </div>
      ) : ((editingContentProxy && selectedObj) || tool === 'match') ? (
        <div className="flex items-center gap-2.5 px-4 h-11 flex-nowrap shrink-0 overflow-x-auto">
          <span className="text-[11px] font-semibold text-text shrink-0">Inner content</span>
          {showMatchChrome && (() => {
            const matchObj =
              (selectedObj && isInnerUploadedImageProxy(selectedObj) ? selectedObj : null) ||
              lines.find((l) => isInnerUploadedImageProxy(l)) ||
              null
            if (!matchObj) return null
            return (
            <>
              <div className="w-px h-6 bg-border shrink-0" />
              <button
                type="button"
                title="Match — mark sections with Color 1–5 (click Match again to apply colours and exit)"
                onClick={() => {
                  if (tool === 'match') exitMatchMode()
                  else enterMatchMode()
                }}
                className={`h-8 px-2 rounded-lg flex items-center gap-1.5 text-[11px] font-medium shrink-0 transition-colors ${
                  tool === 'match' ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'
                }`}
              >
                <Tags size={14} />
                Match
              </button>
              <button
                type="button"
                title={matchLabelsVisible ? 'Hide section numbers' : 'Show section numbers'}
                onClick={() => setMatchLabelsVisible((v) => !v)}
                className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  matchLabelsVisible
                    ? 'bg-surface3 text-text'
                    : 'bg-surface3 text-muted hover:text-text'
                }`}
              >
                {matchLabelsVisible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <span className="text-[10px] text-muted shrink-0" title="Same as Style → Image colours">
                Color 1–5
              </span>
              {([1, 2, 3, 4, 5] as const).map((slot) => {
                const key = `imageColor${slot}` as
                  | 'imageColor1'
                  | 'imageColor2'
                  | 'imageColor3'
                  | 'imageColor4'
                  | 'imageColor5'
                const hex =
                  (matchObj[key] || '').trim() ||
                  matchObj.imagePalette?.[slot - 1] ||
                  '#888888'
                const active = tool === 'match' && matchSlot === slot
                return (
                  <button
                    key={slot}
                    type="button"
                    title={
                      tool === 'match'
                        ? active
                          ? `Color ${slot} armed — click again to disarm`
                          : `Arm Color ${slot} — then click sections`
                        : `Color ${slot} — click swatch to edit`
                    }
                    onClick={() => {
                      if (tool === 'match') {
                        setMatchSlot((s) => (s === slot ? null : slot))
                        return
                      }
                    }}
                    className={`relative flex items-center gap-1 shrink-0 rounded-lg border px-1 py-0.5 transition-colors ${
                      active ? 'border-accent bg-accent/15 ring-1 ring-accent' : 'border-border bg-surface3'
                    }`}
                  >
                    <span className="text-[9px] text-muted w-3 text-center">{slot}</span>
                    <input
                      type="color"
                      value={hex.slice(0, 7)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = e.target.value
                        void (async () => {
                          const next = await setImageProxySlotColor(matchObj, slot, v)
                          if (!next) return
                          const stored =
                            tool === 'match'
                              ? { ...next, imageDataUrl: matchObj.imageDataUrl }
                              : next
                          commitLines(
                            linesRef.current.map((l) => (l.id === stored.id ? stored : l))
                          )
                          if (tool !== 'match' && stored.imageDataUrl) {
                            ensureStampImage(stored.imageDataUrl, () => {
                              redrawLinesRef.current()
                              drawHandles()
                            })
                          }
                          pushHistory()
                          redrawLines()
                          drawHandles()
                        })()
                      }}
                      className="w-6 h-6 rounded cursor-pointer border border-border/50 bg-transparent"
                    />
                  </button>
                )
              })}
              <button
                type="button"
                title="Scan soft AA outline and soft-bleed neighbouring solid colours up to 3px"
                onClick={() => {
                  void (async () => {
                    const source = matchObj.imageSourceDataUrl || matchObj.imageDataUrl
                    if (!source) return
                    const baked = await bakeImageSoftAaBleed({
                      imageDataUrl: source,
                      imageUseOriginalColors: matchObj.imageUseOriginalColors,
                      imagePalette: matchObj.imagePalette,
                      imageColor1: matchObj.imageColor1,
                      imageColor2: matchObj.imageColor2,
                      imageColor3: matchObj.imageColor3,
                      imageColor4: matchObj.imageColor4,
                      imageColor5: matchObj.imageColor5,
                      imageColorMarkPng: matchObj.colorMarkPng
                    })
                    if (!baked) return
                    const next: LineObj = {
                      ...matchObj,
                      imageDataUrl: baked.imageDataUrl,
                      imageSourceDataUrl: baked.imageDataUrl,
                      imageUseOriginalColors: baked.imageUseOriginalColors,
                      imagePalette: baked.imagePalette,
                      imageColor1: baked.imageColor1,
                      imageColor2: baked.imageColor2,
                      imageColor3: baked.imageColor3,
                      imageColor4: baked.imageColor4,
                      imageColor5: baked.imageColor5,
                      colorMarkPng: undefined,
                      colorRegionPng: undefined
                    }
                    commitLines(
                      linesRef.current.map((l) => (l.id === next.id ? next : l))
                    )
                    ensureStampImage(next.imageDataUrl!, () => {
                      redrawLinesRef.current()
                      drawHandles()
                    })
                    pushHistory()
                    redrawLines()
                    drawHandles()
                  })()
                }}
                className="h-8 px-2 rounded-lg flex items-center text-[11px] font-medium shrink-0 bg-surface3 text-muted hover:text-text transition-colors"
              >
                Clean AA
              </button>
              {tool === 'match' && (
                <span className="text-[10px] text-muted shrink-0">
                  {matchSlot == null
                    ? 'Choose Color 1–5, then click sections'
                    : `Click sections for Color ${matchSlot} · click colour again to disarm`}
                </span>
              )}
            </>
            )
          })()}
          <div className="w-px h-6 bg-border shrink-0" />
          <span className="text-[10px] text-muted shrink-0">
            Drag to move · corner handles to resize
          </span>
          <div className="w-px h-6 bg-border shrink-0" />
          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={txtShadow}
              onChange={(e) => {
                setTxtShadow(e.target.checked)
                patchContentProxy({ shadow: e.target.checked })
              }}
            />
            Shadow
          </label>
          {txtShadow && (
            <>
              <input
                type="color"
                value={txtShadowColor.slice(0, 7)}
                onChange={(e) => {
                  const c = e.target.value
                  setTxtShadowColor(c)
                  patchContentProxy({ shadowColor: c })
                }}
                className="w-7 h-7 shrink-0 rounded cursor-pointer border border-border/50 bg-transparent"
                title="Shadow colour"
              />
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                Blur
                <input type="number" min={0} max={128} value={txtShadowBlur}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(128, Number(e.target.value) || 0))
                    setTxtShadowBlur(v)
                    patchContentProxy({ shadowBlur: v })
                  }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                Spread
                <input type="number" min={0} max={64} value={txtShadowSpread}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(64, Number(e.target.value) || 0))
                    setTxtShadowSpread(v)
                    patchContentProxy({ shadowSpread: v })
                  }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                X
                <input type="number" min={-128} max={128} value={txtShadowOX}
                  onChange={(e) => {
                    const v = Math.max(-128, Math.min(128, Number(e.target.value) || 0))
                    setTxtShadowOX(v)
                    patchContentProxy({ shadowOffsetX: v })
                  }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                Y
                <input type="number" min={-128} max={128} value={txtShadowOY}
                  onChange={(e) => {
                    const v = Math.max(-128, Math.min(128, Number(e.target.value) || 0))
                    setTxtShadowOY(v)
                    patchContentProxy({ shadowOffsetY: v })
                  }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
            </>
          )}
          <button
            onClick={deleteSelected}
            title="Remove Inner content proxy (settings stay outside; re-opens fresh next time)"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-surface3 text-muted hover:text-danger transition-colors shrink-0 ml-auto"
          >
            <Trash2 size={12} /> Remove
          </button>
        </div>
      ) : editingText ? (
        <div className="flex items-center gap-2.5 px-4 h-11 flex-nowrap shrink-0">
          <span className="text-[11px] font-semibold text-text shrink-0">
            {textEditId ? 'Typing' : 'Text'}
          </span>
          {lettersOutside && (
            <label
              className="flex items-center gap-1.5 text-[11px] text-muted select-none shrink-0 cursor-pointer"
              title="Copy text, font, size, weight, color, spacing, and offset from outside Inner content settings"
            >
              <input
                type="checkbox"
                checked={useOutsideText}
                onChange={(e) => {
                  const on = e.target.checked
                  setUseOutsideText(on)
                  if (on && lettersOutside) applyOutsideTextSettings(lettersOutside)
                }}
                className="accent-accent"
              />
              Use outside text settings
            </label>
          )}
          <label className="flex items-center gap-1.5 text-[11px] text-muted select-none shrink-0">
            Font
            <select
              value={fontFamily}
              onChange={(e) => { setFontFamily(e.target.value); patchText({ fontFamily: e.target.value }) }}
              className="px-2 py-1 rounded-md bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent cursor-pointer max-w-[140px]"
            >
              {FONT_FAMILY_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.families.map((f) => <option key={f} value={f}>{f}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted select-none shrink-0">
            Size
            <input
              type="number" min={4} max={512} value={fontSize}
              onChange={(e) => { const v = Math.max(4, Math.min(512, Number(e.target.value) || 4)); setFontSize(v); patchText({ fontSize: v }) }}
              className="w-14 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted select-none shrink-0" title="Line height as % of font size">
            Line height
            <input
              type="number" min={80} max={300} step={1}
              value={Math.round(txtLineHeight * 100)}
              onChange={(e) => {
                const v = Math.max(0.8, Math.min(3, (Number(e.target.value) || 128) / 100))
                setTxtLineHeight(v)
                patchText({ lineHeight: v })
              }}
              className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
            />
            <span className="text-[10px] text-muted">%</span>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted select-none shrink-0" title="Extra space between characters">
            Spacing
            <input
              type="number" min={-20} max={80} step={1}
              value={txtLetterSpacing}
              onChange={(e) => {
                const v = Math.max(-20, Math.min(80, Number(e.target.value) || 0))
                setTxtLetterSpacing(v)
                patchText({ letterSpacing: v })
              }}
              className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
            />
            <span className="text-[10px] text-muted">px</span>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted select-none shrink-0">
            Weight
            <select
              value={String(fontWeightV)}
              onChange={(e) => {
                const v = Number(e.target.value)
                setFontWeightV(v)
                patchText({ weight: v, bold: v >= 700 })
              }}
              className="px-2 py-1 rounded-md bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent cursor-pointer"
            >
              {FONT_WEIGHTS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </label>
          <button
            onClick={() => { const v = !underline; setUnderline(v); patchText({ underline: v }) }}
            title="Underline"
            className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors ${underline ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}
          >
            <UnderlineIcon size={15} />
          </button>
          <button
            onClick={() => { const v = !italic; setItalic(v); patchText({ italic: v }) }}
            title="Italic"
            className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors ${italic ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}
          >
            <ItalicIcon size={15} />
          </button>

          <div className="w-px h-6 bg-border shrink-0" />

          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={txtShadow}
              onChange={(e) => { setTxtShadow(e.target.checked); patchText({ shadow: e.target.checked }) }}
            />
            Shadow
          </label>
          {txtShadow && (
            <>
              <input
                type="color"
                value={txtShadowColor.slice(0, 7)}
                onChange={(e) => { const c = e.target.value; setTxtShadowColor(c); patchText({ shadowColor: c }) }}
                className="w-7 h-7 shrink-0 rounded cursor-pointer border border-border/50 bg-transparent"
                title="Shadow colour"
              />
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                Blur
                <input type="number" min={0} max={128} value={txtShadowBlur}
                  onChange={(e) => { const v = Math.max(0, Math.min(128, Number(e.target.value) || 0)); setTxtShadowBlur(v); patchText({ shadowBlur: v }) }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                Spread
                <input type="number" min={0} max={64} value={txtShadowSpread}
                  onChange={(e) => { const v = Math.max(0, Math.min(64, Number(e.target.value) || 0)); setTxtShadowSpread(v); patchText({ shadowSpread: v }) }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                X
                <input type="number" min={-128} max={128} value={txtShadowOX}
                  onChange={(e) => { const v = Math.max(-128, Math.min(128, Number(e.target.value) || 0)); setTxtShadowOX(v); patchText({ shadowOffsetX: v }) }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                Y
                <input type="number" min={-128} max={128} value={txtShadowOY}
                  onChange={(e) => { const v = Math.max(-128, Math.min(128, Number(e.target.value) || 0)); setTxtShadowOY(v); patchText({ shadowOffsetY: v }) }}
                  className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent" />
              </label>
            </>
          )}
          {selectedId && (
            <button
              onClick={deleteSelected}
              title="Delete text (Del)"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-surface3 text-muted hover:text-danger transition-colors shrink-0 ml-auto"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      ) : showVecOptions ? (
        <div className="flex items-center gap-3 px-4 h-11 flex-nowrap shrink-0">
          <span className="text-[11px] font-semibold text-text shrink-0">
            {editingShape
              ? (selectedObj ? 'Edit shape' : 'New shape')
              : editingPoly
                ? (selectedObj ? 'Edit polygon' : 'New polygon')
                : (selectedObj ? 'Edit line' : 'New line')}
          </span>
          {!fillableCtx && (
            <>
              <LineSelect
                label="Type"
                value={lineType}
                options={LINE_TYPES.filter((o) => o.value !== 'poly')}
                onChange={(v) => {
                  setLineType(v)
                  if (selectedIdRef.current) updateSelected((l) => ({ type: v, pts: convertPts(l, v) }))
                }}
              />
              {(lineType === 'polyline' || lineType === 'free') && (
                <label className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="uppercase tracking-wide text-[9px] text-muted/70">Points</span>
                  <input
                    type="number" min={2} max={40} value={linePointCount}
                    onChange={(e) => {
                      const n = Math.max(2, Math.min(40, Number(e.target.value) || 2))
                      setLinePointCount(n)
                      if (selectedIdRef.current) updateSelected((l) => ({ pts: resampleAlong(flattenLine(l), n) }))
                    }}
                    className="w-14 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
                  />
                </label>
              )}
              <LineSelect
                label="Start"
                value={startCap}
                options={CAP_TYPES}
                onChange={(v) => {
                  setStartCap(v)
                  if (v === 'none') {
                    if (selectedIdRef.current) updateSelected({ startCap: v })
                    return
                  }
                  const sz = startCapSize || defaultCapSize(size)
                  setStartCapSize(sz)
                  if (selectedIdRef.current) updateSelected({ startCap: v, startCapSize: sz })
                }}
              />
              {startCap !== 'none' && (
                <label className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="uppercase tracking-wide text-[9px] text-muted/70">Start size</span>
                  <input
                    type="number"
                    min={1}
                    max={256}
                    value={startCapSize}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(256, Number(e.target.value) || 1))
                      setStartCapSize(v)
                      if (selectedIdRef.current) updateSelected({ startCapSize: v })
                    }}
                    className="w-14 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
                    title="Start cap size"
                  />
                </label>
              )}
              <LineSelect
                label="End"
                value={endCap}
                options={CAP_TYPES}
                onChange={(v) => {
                  setEndCap(v)
                  if (v === 'none') {
                    if (selectedIdRef.current) updateSelected({ endCap: v })
                    return
                  }
                  const sz = endCapSize || defaultCapSize(size)
                  setEndCapSize(sz)
                  if (selectedIdRef.current) updateSelected({ endCap: v, endCapSize: sz })
                }}
              />
              {endCap !== 'none' && (
                <label className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="uppercase tracking-wide text-[9px] text-muted/70">End size</span>
                  <input
                    type="number"
                    min={1}
                    max={256}
                    value={endCapSize}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(256, Number(e.target.value) || 1))
                      setEndCapSize(v)
                      if (selectedIdRef.current) updateSelected({ endCapSize: v })
                    }}
                    className="w-14 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
                    title="End cap size"
                  />
                </label>
              )}
            </>
          )}
          <LineSelect
            label="Style"
            value={lineDash}
            options={DASH_TYPES}
            onChange={(v) => { setLineDash(v); if (selectedIdRef.current) updateSelected({ dash: v }) }}
          />
          <span className="text-border">|</span>
          <label className="flex items-center gap-1.5 text-[11px] text-muted select-none">
            <span className="uppercase tracking-wide text-[9px] text-muted/70">Border</span>
            <button
              ref={borderSwatchRef}
              type="button"
              onClick={() => {
                if (borderSwatchRef.current) {
                  setBorderPopupRect(borderSwatchRef.current.getBoundingClientRect())
                  setBorderPopupOpen(true)
                }
              }}
              className="w-7 h-7 shrink-0 rounded cursor-pointer border border-border/50 overflow-hidden"
              style={{ background: borderColor }}
              title="Border colour"
            />
          </label>
          {borderPopupOpen && borderPopupRect && (
            <ColorPickerPopup
              value={borderColor}
              onChange={(c) => {
                setBorderColor(c)
                if (!fillableCtx) setColor(c)
                if (selectedIdRef.current) {
                  updateSelectedLive((l) =>
                    l.type === 'poly' || l.type === 'shape'
                      ? { borderColor: c }
                      : { borderColor: c, color: c }
                  )
                }
              }}
              onClose={() => {
                setBorderPopupOpen(false)
                if (selectedIdRef.current) pushHistory()
              }}
              rect={borderPopupRect}
            />
          )}
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="uppercase tracking-wide text-[9px] text-muted/70">Width</span>
            <input
              type="number"
              min={0}
              max={128}
              value={size}
              onChange={(e) => {
                const v = Math.max(0, Math.min(128, Number(e.target.value) || 0))
                setSize(v)
                if (selectedIdRef.current) updateSelected({ thickness: v, borderWidth: v })
              }}
              className="w-14 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
              title="Border width (0 = no border)"
            />
          </label>
          {(
            editingPoly ||
            (editingShape && shapeSupportsRadius((selectedObj?.shape ?? shapeKind) as ShapeKind)) ||
            (!fillableCtx && (lineType === 'polyline' || lineType === 'free' || lineType === 'drawn'))
          ) && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="uppercase tracking-wide text-[9px] text-muted/70">Radius</span>
              <input
                type="number"
                min={0}
                max={256}
                value={borderRadius}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(256, Number(e.target.value) || 0))
                  setBorderRadius(v)
                  if (selectedIdRef.current) updateSelected({ borderRadius: v })
                }}
                className="w-14 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent"
                title="Border / corner radius"
              />
            </label>
          )}
          <span className="text-[10px] text-muted">
            {fillableCtx ? 'Fill colour & fill toggle use the toolbar above.' : 'Stroke colour also uses the toolbar above.'}
          </span>
          {/* Drawn (freehand) — split: set-before-draw vs edit-anytime */}
          {!fillableCtx && lineType === 'drawn' && (() => {
            const nFilled = drawnPointCount.trim() !== ''
            return (
              <>
                <span className="text-border">|</span>
                <span className="text-[9px] uppercase tracking-wide text-muted/70" title="These only affect how the next freehand stroke is captured">
                  Before draw
                </span>
                <label
                  className={`flex items-center gap-1.5 text-[11px] select-none ${
                    nFilled ? 'text-muted/40 cursor-not-allowed' : 'text-muted cursor-pointer'
                  }`}
                  title={nFilled
                    ? 'Disabled while adjustable points is set — that value overrides sampling'
                    : 'Set before drawing. On: place points by travel distance · Off: default (every mouse move)'}
                >
                  <input
                    type="checkbox"
                    checked={drawnDistanceMode}
                    disabled={nFilled}
                    onChange={(e) => setDrawnDistanceMode(e.target.checked)}
                    className="accent-accent disabled:opacity-40"
                  />
                  Distance sample
                </label>
                <label
                  className="flex items-center gap-1.5 text-[11px] text-muted select-none"
                  title="Set before drawing (also reshapes a selected freehand line). When set, overrides distance sampling."
                >
                  <span className="uppercase tracking-wide text-[9px] text-muted/70">Adjustable points</span>
                  <input
                    type="number"
                    min={2}
                    max={200}
                    value={drawnPointCount}
                    placeholder="auto"
                    onChange={(e) => {
                      const raw = e.target.value
                      setDrawnPointCount(raw)
                      const n = Number(raw)
                      if (raw.trim() !== '' && n >= 2 && selectedIdRef.current) {
                        updateSelected((l) =>
                          l.type === 'drawn'
                            ? { pts: resampleAlong(flattenLine(l), Math.max(2, Math.min(200, Math.round(n)))) }
                            : {}
                        )
                      }
                    }}
                    className="w-16 px-1.5 py-1 rounded bg-surface3 border border-border text-[11px] text-text focus:outline-none focus:border-accent placeholder:text-muted/40"
                  />
                </label>
                <span className="text-border">|</span>
                <span className="text-[9px] uppercase tracking-wide text-muted/70" title="These apply immediately to the selected freehand line">
                  Anytime
                </span>
                <label
                  className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none"
                  title="Works anytime — On: smooth curve through adjustable points · Off: straight segments"
                >
                  <input
                    type="checkbox"
                    checked={drawnCurve}
                    onChange={(e) => {
                      const v = e.target.checked
                      setDrawnCurve(v)
                      if (selectedIdRef.current) updateSelected((l) => l.type === 'drawn' ? { drawnCurve: v } : {})
                    }}
                    className="accent-accent"
                  />
                  Curve points
                </label>
              </>
            )
          })()}
          {selectedId && (
            <button
              onClick={deleteSelected}
              title="Delete selected (Del)"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-surface3 text-muted hover:text-danger transition-colors"
            >
              <Trash2 size={12} /> Delete {editingShape ? 'shape' : editingPoly ? 'polygon' : 'line'}
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 text-[10px] text-muted/50 select-none whitespace-nowrap">
          Tool options appear here
        </div>
      )}
        </div>
      </div>

      {/* Canvas + icon palette + optional save-target columns */}
      <div
        className="flex flex-1 min-h-0"
        onDragOver={handlePaintDragOver}
        onDrop={(e) => { void handleStageDrop(e) }}
      >
      {/* Left: Library / Browse / AI icon palette */}
      <aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-border shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Icons</p>
          <p className="text-[9px] text-muted/70 mt-0.5">Drag, click, paste, or drop image/SVG files · mixes with paint</p>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <IconPicker
            value={paletteIcon}
            onChange={(patch) => setPaletteIcon((prev) => ({ ...prev, ...patch }))}
            onOpenSettings={onOpenSettings ?? (() => {})}
            tabs={['library', 'browse', 'svg', 'ai']}
            onPickSvg={(svg) => { void placeSvgMarkupRef.current(svg, undefined, 'library') }}
            enableDrag
            fillHeight
            keepStrokeOnResize={keepStrokeOnResize}
            onKeepStrokeOnResizeChange={setKeepStrokeOnResize}
          />
        </div>
      </aside>
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
      {/* Canvas stage — same pan/zoom as logo & favicon preview */}
      <PreviewStage
        className="flex-1 min-h-0"
        onStageMouseDown={(e) => {
          if (e.button !== 0) return
          // Canvas stopsPropagation — only the stage background (outside the
          // icon frame) should reach here. Guard anyway in case a child misses it.
          const frame = previewRef.current ?? stageRef.current
          if (frame) {
            const r = frame.getBoundingClientRect()
            if (
              e.clientX >= r.left &&
              e.clientX <= r.right &&
              e.clientY >= r.top &&
              e.clientY <= r.bottom
            ) {
              return
            }
          }
          // Large objects that fill the icon: click the surrounding stage to deselect.
          // Layers / toolbar / library sit outside PreviewStage and never hit this.
          if (tool === 'pointer' || tool === 'reshape') {
            if (!selectedIdRef.current && selectedLayerIdsRef.current.size === 0) return
            lineDragRef.current = null
            selectedIdRef.current = null
            setSelectedId(null)
            selectedLayerIdsRef.current = new Set()
            setSelectedLayerIds(new Set())
            redrawLines()
            drawHandles()
            return
          }
          if (tool !== 'select') return
          // Clicks on the stage gutter must not start a new marquee or finalize
          // an active one — only the preview canvas handles those.
          if (floatRef.current || marqueeRef.current) return
          onDown(e)
        }}
      >
        <div
          ref={stageRef}
          className="relative shadow-2xl"
          style={{
            background: CHECKER,
            width: 'min(70vh, 70vw)',
            height: 'min(70vh, 70vw)'
          }}
          onDragOver={(e) => {
            if (!paintDropAcceptsDrag(e)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => { void handleStageDrop(e) }}
        >
          {/* Only the composited frame + interaction preview mount in the stage.
              Base buffers are off-DOM. key remounts the display surface whenever
              any layer checkbox changes so Chromium cannot keep a stale bitmap. */}
          <canvas
            key={`paint-display:${layerVisibilitySig}`}
            ref={displayCompositeRef}
            width={W}
            height={H}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{
              imageRendering: 'auto',
              visibility: anythingLayerVisible ? 'visible' : 'hidden'
            }}
          />
          <canvas
            key={`paint-preview:${layerVisibilitySig}`}
            ref={previewRef}
            width={W}
            height={H}
            className="absolute inset-0 w-full h-full"
            style={{
              visibility: anythingLayerVisible ? 'visible' : 'hidden',
              cursor: cropping && cropHoverCursor
                ? cropHoverCursor
                : tool === 'pointer' || tool === 'reshape' ? 'default' : tool === 'text' ? 'text' : (noTarget && tool !== 'fill' && tool !== 'eyedropper' && tool !== 'line' && tool !== 'freepoly' && tool !== 'select' && tool !== 'shape' ? 'not-allowed' : 'crosshair')
            }}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={() => {
              // Do not end the stroke here — window capture keeps following the cursor.
              if (!pointerDragCleanupRef.current && !drawing.current && tool === 'eraser') clearPreview()
            }}
            onDoubleClick={(e) => {
              if (tool === 'polygon') {
                e.preventDefault()
                // If the second click was not skipped (detail unavailable), undo it.
                finishPolygon({ dropLastPoint: !polyDblClickSkippedRef.current })
                return
              }
              if (tool !== 'pointer') return
              const pt = toCanvas(e)
              const hit = topmostPaintHit((l) => {
                const canEditText =
                  l.type === 'text' ||
                  (l.type === 'stamp' && !!(l.linkedOutsideText || l.text?.trim()))
                if (!canEditText || !isPaintHitVisible(l)) return false
                const q = unmapObjDisplayPt(pt, l)
                return pointInPoly(flattenLine(l), q)
              })
              if (hit) startTextEditRef.current(hit.id)
            }}
          />
          {tool === 'match' &&
            matchLabelsVisible &&
            selectedObj &&
            matchLabels.length > 0 &&
            (() => {
              const a = selectedObj.pts[0]
              const b = selectedObj.pts[1]
              if (!a || !b) return null
              const sx = stageSize.w / W
              const sy = stageSize.h / H
              const bx = Math.min(a.x, b.x)
              const by = Math.min(a.y, b.y)
              const dw = Math.max(1, Math.abs(b.x - a.x))
              const dh = Math.max(1, Math.abs(b.y - a.y))
              const rot = selectedObj.rot ?? 0
              const c = objCenter(selectedObj)
              return (
                <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]">
                  {matchLabels.map((lab) => {
                    const lx = bx + (lab.ix / Math.max(1, lab.imgW)) * dw
                    const ly = by + (lab.iy / Math.max(1, lab.imgH)) * dh
                    const p =
                      rot !== 0
                        ? rotatePt({ x: lx, y: ly }, c, rot)
                        : { x: lx, y: ly }
                    return (
                      <span
                        key={lab.regionId}
                        className="absolute font-bold leading-none select-none"
                        style={{
                          left: p.x * sx,
                          top: p.y * sy,
                          transform: 'translate(-50%, -50%)',
                          color: lab.labelColor,
                          fontSize: Math.max(10, Math.min(22, (Math.min(dw, dh) * sx) / 12)),
                          textShadow:
                            lab.labelColor === '#ffffff'
                              ? '0 0 2px rgba(0,0,0,0.85)'
                              : '0 0 2px rgba(255,255,255,0.85)'
                        }}
                      >
                        {lab.slot}
                      </span>
                    )
                  })}
                </div>
              )
            })()}
          {textEditId && (() => {
            const l = lines.find((x) => x.id === textEditId) || linesRef.current.find((x) => x.id === textEditId)
            if (!l || l.type !== 'text') return null
            const sx = stageSize.w / W
            const sy = stageSize.h / H
            const p = l.pts[0]
            const probe: LineObj = { ...l, text: textValue || ' ' }
            const m = textMetrics(probe)
            const fs = (l.fontSize ?? fontSize) * sx
            const weight = String(l.weight ?? (l.bold ? 700 : fontWeightV))
            const solid = firstSolidColor(l.color)
            const c = objCenter(l)
            const rot = l.rot ?? 0
            const b = textInkBBox(probe)
            const corner = rotatePt({ x: b.x, y: b.y }, c, rot)
            const pin = rotatePinAt({ ...l, text: textValue || ' ' })
            const exitAndDrag = (kind: 'handle' | 'rotate', ev: React.MouseEvent) => {
              ev.preventDefault()
              ev.stopPropagation()
              const id = textEditIdRef.current
              if (!id) return
              const obj = linesRef.current.find((x) => x.id === id)
              endTextEditRef.current()
              if (!obj) return
              const pt = clientToCanvas(ev)
              if (kind === 'handle') {
                lineDragRef.current = { kind: 'handle', id, idx: 0 }
              } else {
                const center = objCenter(obj)
                lineDragRef.current = {
                  kind: 'rotate', id, center,
                  startAng: Math.atan2(pt.y - center.y, pt.x - center.x),
                  startRot: obj.rot ?? 0
                }
              }
              beginWindowDrag()
            }
            return (
              <>
                <textarea
                  ref={textAreaRef}
                  value={textValue}
                  placeholder="Type here…"
                  rows={Math.max(1, textValue.split('\n').length)}
                  onChange={(e) => {
                    const v = e.target.value
                    setTextValue(v)
                    const cur = linesRef.current.find((x) => x.id === textEditIdRef.current)
                    if (cur && cur.type === 'text') {
                      cur.text = v
                      refreshTextHoleMaskForNewGlyphs(cur, W, H)
                      linesRef.current = [...linesRef.current]
                      setLines(linesRef.current)
                      redrawLines()
                      drawHandles()
                    }
                  }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return
                    const startX = e.clientX
                    const startY = e.clientY
                    const id = textEditIdRef.current
                    if (!id) return
                    let dragging = false
                    const onMove = (ev: MouseEvent) => {
                      if (!dragging) {
                        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return
                        dragging = true
                        endTextEditRef.current()
                        lineDragRef.current = { kind: 'move', id, grab: clientToCanvas(ev) }
                      } else {
                        lineMove(clientToCanvas(ev))
                      }
                    }
                    const onUp = (ev: MouseEvent) => {
                      window.removeEventListener('mousemove', onMove)
                      window.removeEventListener('mouseup', onUp)
                      if (dragging) lineUp(clientToCanvas(ev))
                    }
                    window.addEventListener('mousemove', onMove)
                    window.addEventListener('mouseup', onUp)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      e.stopPropagation()
                      endTextEditRef.current()
                      return
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      e.stopPropagation()
                      endTextEditRef.current()
                    }
                    // Shift+Enter → native newline
                  }}
                  spellCheck={false}
                  className="absolute z-20 m-0 p-0 border border-accent/80 rounded-sm bg-transparent outline-none resize-none overflow-hidden caret-accent"
                  style={{
                    left: p.x * sx,
                    top: p.y * sy,
                    width: Math.max(fs * 0.6, m.w * sx + 4),
                    height: Math.max(fs * 1.2, m.h * sy + 2),
                    fontFamily: l.fontFamily ?? fontFamily,
                    fontSize: fs,
                    fontWeight: weight as React.CSSProperties['fontWeight'],
                    fontStyle: l.italic ? 'italic' : 'normal',
                    textDecoration: l.underline ? 'underline' : 'none',
                    lineHeight: l.lineHeight ?? txtLineHeight,
                    letterSpacing: `${(l.letterSpacing ?? txtLetterSpacing) * sx}px`,
                    color: solid.length === 9 ? solid.slice(0, 7) : solid,
                    opacity: solid.length === 9 ? parseInt(solid.slice(7, 9), 16) / 255 : 1,
                    transform: `rotate(${(rot * 180) / Math.PI}deg)`,
                    transformOrigin: '0 0',
                    whiteSpace: 'pre',
                    boxShadow: '0 0 0 1px rgba(59,130,246,0.35)'
                  }}
                />
                {/* Above textarea so corner / pin can exit edit mode */}
                <button
                  type="button"
                  title="Drag to move · exits typing"
                  onMouseDown={(e) => exitAndDrag('handle', e)}
                  className="absolute z-30 rounded-full bg-white border-2 border-accent shadow cursor-grab active:cursor-grabbing"
                  style={{
                    left: corner.x * sx - 7,
                    top: corner.y * sy - 7,
                    width: 14,
                    height: 14
                  }}
                />
                <button
                  type="button"
                  title="Drag to rotate · exits typing"
                  onMouseDown={(e) => exitAndDrag('rotate', e)}
                  className="absolute z-30 rounded-full bg-white border-2 shadow cursor-grab active:cursor-grabbing"
                  style={{
                    left: pin.x * sx - 7,
                    top: pin.y * sy - 7,
                    width: 14,
                    height: 14,
                    borderColor: '#10b981'
                  }}
                />
              </>
            )
          })()}
          {(tool === 'pointer' || tool === 'reshape') && selectedId && !textEditId && !cropping && (() => {
            const l =
              lines.find((x) => x.id === selectedId) ??
              linesRef.current.find((x) => x.id === selectedId)
            if (!l || !isVectorVisible(l)) return null
            const sx = stageSize.w / W
            const sy = stageSize.h / H
            const anchor = rotatePinAnchor(l)
            const tip = rotatePinTip(l)
            const pad = ROTATE_PIN_HIT_PAD
            const left = Math.min(anchor.x, tip.x) - pad
            const top = Math.min(anchor.y, tip.y) - pad
            const hitW = Math.max(28, (Math.max(anchor.x, tip.x) - left + pad) * sx)
            const hitH = Math.max(28, (Math.max(anchor.y, tip.y) - top + pad) * sy)
            return (
              <button
                type="button"
                title="Drag to rotate"
                className="absolute z-20 cursor-grab active:cursor-grabbing"
                style={{
                  left: left * sx,
                  top: top * sy,
                  width: hitW,
                  height: hitH,
                  background: 'transparent',
                  border: 'none',
                  padding: 0
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const obj = linesRef.current.find((x) => x.id === selectedIdRef.current)
                  if (!obj) return
                  startRotateDrag(obj, clientToCanvas(e))
                  beginWindowDrag()
                }}
              />
            )
          })()}
        </div>
      </PreviewStage>

      {/* Footer — status hint */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-surface shrink-0">
        <div className="text-[11px] text-muted">
          {tool === 'text'
            ? (textEditId ? 'Typing…' : 'Text')
            : tool === 'pointer'
            ? 'Click to select · drag to move · double-click text to type · Del deletes selected (when not typing)'
            : tool === 'reshape'
            ? 'Drag purple corners to warp · corners snap to match width/height and align with other points · Shift locks axis · drag inside to move'
            : tool === 'select'
            ? (hasMarquee
              ? (marqueeMode === 'coverage'
                ? 'Coverage mode — drag corners to adjust what the box covers · drag inside to lift & move · switch to Scale content to stretch'
                : 'Scale mode — drag corners to stretch pixels · drag inside to move · Enter place · Del delete')
              : 'Drag a box to select · then use Coverage / Scale content with the corner dots')
            : tool === 'line' || tool === 'freepoly'
            ? 'Lines/shapes are session vectors (not tied to Editable layers) • drag to draw • Fill uses them as walls'
            : tool === 'shape'
              ? 'Drag to draw the selected shape — session vectors, not tied to Editable layers'
              : tool === 'fill'
                ? (selectedObj
                  ? `Fill selected object layer: ${selectedObj.name ?? defaultObjectLayerName(selectedObj)}`
                  : noTarget
                  ? 'Select an object layer, or enable Inner content / Outer shape, to use Fill.'
                  : fillAllOpaque
                    ? `All non-transparent on: ${editLayersLabel()} · click to recolor every opaque pixel`
                    : `Fill on: ${editLayersLabel()} · session drawings act as walls`)
                : noTarget && selectedObj?.type !== 'shape'
                ? 'Enable Outer shape and/or Inner content for brush, eraser, and fill.'
                : tool === 'polygon'
                  ? 'Click to add points • double-click or Enter to finish • Esc to cancel shape'
                  : tool === 'brush'
                    ? selectedObj?.type === 'shape'
                      ? `Brush on shape layer: ${selectedObj.name ?? 'Shape'}`
                      : `Brush on: ${addPaintTargetLabel()} (topmost checked layer)`
                    : tool === 'eraser'
                      ? selectedObj?.type === 'shape'
                        ? `Eraser on shape layer: ${selectedObj.name ?? 'Shape'} · Shift snaps angle`
                        : `Eraser on: ${editLayersLabel()} · Shift snaps angle`
                      : `Brush/eraser — check editable layers in the Layers panel`}
        </div>
      </div>
      </div>

      <aside className="w-[16.9rem] shrink-0 border-l border-border bg-surface flex flex-col min-h-0">
        {showSaveTargets && (
          <section className="h-2/5 min-h-0 flex flex-col border-b border-border">
            <div className="px-3 py-2 border-b border-border shrink-0 space-y-1.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Save to variants</p>
                <p className="text-[9px] text-muted/70 mt-0.5">Pick where this paint applies</p>
              </div>
              <label
                className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-muted hover:text-text"
                title="On: copy fill, border, shadow, and remapped image/SVG colours to every selected variant. Off: each variant keeps its own Colour settings (paint and objects still apply)"
              >
                <input
                  type="checkbox"
                  className="accent-accent shrink-0"
                  checked={saveCopyColors}
                  onChange={(e) => setSaveCopyColors(e.target.checked)}
                />
                Colour settings
              </label>
            </div>
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 min-w-0 overflow-y-auto border-r border-border px-2 py-2 space-y-1">
                <p className="text-[9px] font-semibold text-text-dim uppercase tracking-wide mb-1.5 px-1">Logo</p>
                {logoVariantOptions.length === 0 ? (
                  <p className="text-[9px] text-muted/50 px-1">None</p>
                ) : (
                  logoVariantOptions.map((v) => (
                    <label
                      key={v.id}
                      className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer text-[11px] transition-colors ${
                        saveLogoIds.has(v.id) ? 'bg-accent/15 text-text' : 'text-muted hover:bg-surface3 hover:text-text'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={saveLogoIds.has(v.id)}
                        onChange={() => toggleSaveId('logo', v.id)}
                        className="accent-accent shrink-0"
                      />
                      <span className="truncate">{v.label.trim() || 'unnamed'}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="flex-1 min-w-0 overflow-y-auto px-2 py-2 space-y-1">
                <p className="text-[9px] font-semibold text-text-dim uppercase tracking-wide mb-1.5 px-1">Favicon</p>
                {faviconVariantOptions.length === 0 ? (
                  <p className="text-[9px] text-muted/50 px-1">None</p>
                ) : (
                  faviconVariantOptions.map((v) => (
                    <label
                      key={v.id}
                      className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer text-[11px] transition-colors ${
                        saveFaviconIds.has(v.id) ? 'bg-accent/15 text-text' : 'text-muted hover:bg-surface3 hover:text-text'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={saveFaviconIds.has(v.id)}
                        onChange={() => toggleSaveId('favicon', v.id)}
                        className="accent-accent shrink-0"
                      />
                      <span className="truncate">{v.label.trim() || 'unnamed'}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        <section className={`${showSaveTargets ? 'h-3/5' : 'h-full'} min-h-0 flex flex-col`}>
          <div className="px-3 py-2 border-b border-border shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Layers</p>
            <p className="text-[9px] text-muted/70 mt-0.5">
              Drag above/below · scroll or edge-hover while dragging · drop on group centre to nest · below Inner/Outer paint to send behind
            </p>
          </div>
          <div
            ref={layersPanelScrollRef}
            className={`flex-1 min-h-0 overflow-y-scroll p-2 space-y-1.5${
              layerPointerDragging ? ' cursor-grabbing select-none' : ''
            }`}
            onScroll={() => {
              if (!draggedLayerRef.current) return
              const { x, y } = layersPointerLastClientRef.current
              resolveLayerDropAtPoint(x, y)
            }}
          >
            {layerOrder.map((id) => {
              const isContent = id === 'content'
              const enabled = isContent ? editContent : editContainer && containerUsable
              const disabled = !isContent && !containerUsable
              return (
                <React.Fragment key={id}>
                  {([false, true] as const).map((belowBase) => (
                    <React.Fragment key={belowBase ? 'below' : 'above'}>
                  {panelObjectsForBase(id, belowBase)
                    .map(({ l, depth }) => {
                      const key = `object:${l.id}`
                      const selected = selectedLayerIds.has(l.id)
                      const objectEnabled = (l.visible ?? l.editable ?? true) !== false
                      const effectivelyEnabled = isVectorVisible(l)
                      const icon = l.type === 'group'
                        ? <Layers size={13} />
                        : l.type === 'stamp'
                        ? (l.stampSource === 'library'
                          ? <Library size={13} />
                          : <ImageIcon size={13} />)
                        : l.type === 'text'
                          ? <TypeIcon size={13} />
                          : l.type === 'shape' || l.type === 'poly'
                            ? <Square size={13} />
                            : l.type === 'drawn'
                              ? <Pencil size={13} />
                            : <Minus size={13} />
                      return (
                        <div
                          key={key}
                          data-layer-drop-key={key}
                          onPointerDown={(e) => {
                            if (e.button !== 0 || renamingLayerId === l.id) return
                            const t = e.target as HTMLElement | null
                            if (t?.closest?.('input,button,textarea,a')) return
                            if (!effectivelyEnabled) return
                            selectedBaseLayerRef.current = null
                            setSelectedBaseLayer(null)
                            const multi = e.ctrlKey || e.metaKey
                            if (multi) {
                              const next = new Set(selectedLayerIds)
                              if (next.has(l.id)) next.delete(l.id)
                              else next.add(l.id)
                              setSelectedLayerIds(next)
                              if (next.has(l.id)) selectLine(l, true)
                              else if (selectedIdRef.current === l.id) {
                                const fallback = linesRef.current.find((item) => next.has(item.id))
                                selectedIdRef.current = fallback?.id ?? null
                                setSelectedId(fallback?.id ?? null)
                              }
                            } else {
                              selectLine(l)
                            }
                            setTool('pointer')
                            redrawLines()
                            drawHandles()
                            beginLayersPointerReorder(key, e.clientX, e.clientY)
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            setRenamingLayerId(l.id)
                            setLayerNameDraft(l.name ?? defaultObjectLayerName(l))
                          }}
                          className={`relative flex items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-[11px] transition-colors cursor-pointer ${
                            layerPointerDragging && draggedLayerRef.current === key
                              ? 'opacity-45 '
                              : ''
                          }${
                            layerDropTarget?.key === key && layerDropTarget.position === 'inside'
                              ? 'ring-2 ring-accent bg-accent/25 '
                              : ''
                          }${
                            selected
                              ? 'border-accent bg-surface3/70 text-text'
                              : objectEnabled
                                ? 'border-border bg-surface3/70 text-text hover:border-muted'
                                : 'border-border bg-surface3/40 text-muted opacity-55'
                          }`}
                          style={{ marginLeft: depth * 16 }}
                          title="Drag to reorder · scroll while dragging · double-click name to rename"
                        >
                          {layerDropTarget?.key === key && layerDropTarget.position !== 'inside' && (
                            <span
                              className={`absolute left-0 right-0 h-0.5 bg-accent rounded-full pointer-events-none z-10 ${
                                layerDropTarget.position === 'before' ? '-top-1' : '-bottom-1'
                              }`}
                            >
                              <span className="absolute -left-0.5 -top-1 w-2 h-2 rounded-full bg-accent" />
                            </span>
                          )}
                          <GripVertical size={13} className="cursor-grab shrink-0 text-muted" />
                          {l.type === 'group' ? (
                            <button
                              type="button"
                              draggable={false}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                setCollapsedGroupIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(l.id)) next.delete(l.id)
                                  else next.add(l.id)
                                  return next
                                })
                              }}
                              className="w-4 h-4 -mx-0.5 shrink-0 rounded flex items-center justify-center text-muted hover:text-text hover:bg-surface"
                              title={collapsedGroupIds.has(l.id) ? 'Expand group' : 'Collapse group'}
                            >
                              {collapsedGroupIds.has(l.id)
                                ? <ChevronRight size={12} />
                                : <ChevronDown size={12} />}
                            </button>
                          ) : (
                            <span className="w-3 shrink-0" />
                          )}
                          <input
                            type="checkbox"
                            checked={objectEnabled}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const checked = e.target.checked
                              const affectedIds = new Set<string>([l.id])
                              if (l.type === 'group') {
                                let changed = true
                                while (changed) {
                                  changed = false
                                  for (const item of linesRef.current) {
                                    if (
                                      item.parentId &&
                                      affectedIds.has(item.parentId) &&
                                      !affectedIds.has(item.id)
                                    ) {
                                      affectedIds.add(item.id)
                                      changed = true
                                    }
                                  }
                                }
                              }
                              // Group toggles cascade to the complete subtree.
                              // A child can still be re-enabled independently afterward.
                              const next = linesRef.current.map((item) =>
                                affectedIds.has(item.id) ? { ...item, visible: checked } : item
                              )
                              commitLines(next)
                              if (!checked) {
                                setSelectedLayerIds((prev) => {
                                  const selected = new Set(prev)
                                  for (const id of affectedIds) selected.delete(id)
                                  return selected
                                })
                              }
                              if (
                                !checked &&
                                selectedIdRef.current &&
                                affectedIds.has(selectedIdRef.current)
                              ) {
                                selectedIdRef.current = null
                                setSelectedId(null)
                              } else if (checked && l.type === 'group' && selectedIdRef.current) {
                                let current = linesRef.current.find((item) => item.id === selectedIdRef.current)
                                while (current?.parentId) {
                                  if (current.parentId === l.id) {
                                    selectedIdRef.current = l.id
                                    setSelectedId(l.id)
                                    break
                                  }
                                  current = linesRef.current.find((item) => item.id === current?.parentId)
                                }
                              }
                              clearPreview()
                              redrawLinesRef.current()
                              pushHistory()
                            }}
                            className="accent-accent shrink-0"
                          />
                          {icon}
                          {renamingLayerId === l.id ? (
                            <input
                              autoFocus
                              value={layerNameDraft}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setLayerNameDraft(e.target.value)}
                              onBlur={() => {
                                renameObjectLayer(l.id, layerNameDraft)
                                setRenamingLayerId(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                                if (e.key === 'Escape') {
                                  setRenamingLayerId(null)
                                  setLayerNameDraft('')
                                }
                              }}
                              className="min-w-0 flex-1 px-1 py-0.5 rounded bg-surface border border-accent text-[10px] text-text outline-none"
                            />
                          ) : (
                            <span className="truncate font-medium flex-1 min-w-0">
                              {l.name ?? defaultObjectLayerName(l)}
                            </span>
                          )}
                          {l.type === 'group' && (
                            <span
                              className="shrink-0 min-w-4 px-1 rounded bg-surface text-[9px] text-muted text-center"
                              title={`${directGroupChildCount(l.id)} direct child layer${directGroupChildCount(l.id) === 1 ? '' : 's'}`}
                            >
                              {directGroupChildCount(l.id)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  {!belowBase && (
                  <div
                    data-layer-drop-key={`base:${id}`}
                    onPointerDown={(e) => {
                      if (disabled || e.button !== 0) return
                      const t = e.target as HTMLElement | null
                      if (t?.closest?.('input,button,textarea,a')) return
                      setTool('pointer')
                      selectedBaseLayerRef.current = id
                      setSelectedBaseLayer(id)
                      selectedIdRef.current = null
                      setSelectedId(null)
                      setSelectedLayerIds(new Set())
                      clearPreview()
                      requestAnimationFrame(() => drawHandles())
                      beginLayersPointerReorder(`base:${id}`, e.clientX, e.clientY)
                    }}
                    className={`relative flex items-center gap-1.5 rounded-lg border px-1.5 py-2 text-[11px] transition-colors ${
                      layerPointerDragging && draggedLayerRef.current === `base:${id}`
                        ? 'opacity-45 '
                        : ''
                    }${
                      disabled
                        ? 'opacity-40 border-border text-muted cursor-not-allowed'
                        : selectedBaseLayer === id
                          ? 'border-accent bg-surface3/70 text-text'
                          : enabled
                            ? 'border-border bg-surface3/70 text-text hover:border-muted'
                            : 'border-border bg-surface3/70 text-muted hover:border-muted'
                    }`}
                    title={disabled
                      ? 'This icon has no Outer shape layer'
                      : 'Live base + paint overlay. Brush/eraser/fill write to the overlay only; settings stay editable outside Paint.'}
                  >
                    {layerDropTarget?.key === `base:${id}` && (
                      <span
                        className={`absolute left-0 right-0 h-0.5 bg-accent rounded-full pointer-events-none z-10 ${
                          layerDropTarget.position === 'before' ? '-top-1' : '-bottom-1'
                        }`}
                      >
                        <span className="absolute -left-0.5 -top-1 w-2 h-2 rounded-full bg-accent" />
                      </span>
                    )}
                    <GripVertical size={13} className={disabled ? '' : 'cursor-grab shrink-0'} />
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={disabled}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        if (isContent) {
                          editContentRef.current = e.target.checked
                          setEditContent(e.target.checked)
                        } else {
                          editContainerRef.current = e.target.checked
                          setEditContainer(e.target.checked)
                        }
                        if (!e.target.checked && selectedBaseLayerRef.current === id) {
                          selectedBaseLayerRef.current = null
                          setSelectedBaseLayer(null)
                        }
                        clearPreview()
                        redrawLinesRef.current()
                      }}
                      className="accent-accent shrink-0"
                    />
                    {isContent ? <ImageIcon size={13} /> : <Layers size={13} />}
                    <span className="truncate font-semibold">
                      {isContent ? 'Inner paint' : 'Outer paint'}
                    </span>
                    <span className="ml-auto text-[8px] uppercase tracking-wide text-muted/50">Overlay</span>
                  </div>
                  )}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              )
            })}
          </div>
          <div className="shrink-0 border-t border-border p-2 space-y-1.5">
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                toggleSelectAllObjects()
              }}
              disabled={eligibleObjectIds.length === 0}
              className="w-full h-7 rounded-lg flex items-center justify-center bg-surface3 border border-border text-[10px] font-semibold text-muted hover:text-text hover:border-muted disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              {allObjectsSelected ? 'Deselect all' : 'Select all'}
            </button>
            <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={groupSelectedLayers}
              disabled={groupableLayerCount < 2}
              title={groupableLayerCount < 2
                ? 'Ctrl-click at least two object layers'
                : `Group ${groupableLayerCount} layers nondestructively`}
              className="h-8 rounded-lg flex items-center justify-center gap-1.5 bg-surface3 border border-border text-[10px] font-semibold text-muted hover:text-text hover:border-muted disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              <Layers size={13} />
              Group{groupableLayerCount >= 2 ? ` (${groupableLayerCount})` : ''}
            </button>
            <button
              type="button"
              onClick={ungroupSelectedLayer}
              disabled={!selectedIsGroup}
              title={selectedIsGroup ? 'Keep child layers and remove their parent group' : 'Select a group layer'}
              className="h-8 rounded-lg flex items-center justify-center gap-1.5 bg-surface3 border border-border text-[10px] font-semibold text-muted hover:text-text hover:border-muted disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              Ungroup
            </button>
            </div>
            <p className="mt-1 text-[8px] text-center text-muted/55">
              Ctrl-click layers to select multiple
            </p>
          </div>
        </section>
      </aside>
      </div>
    </div>
    </TransparentFillModeContext.Provider>
  )
}
