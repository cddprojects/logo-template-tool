import React, { useRef, useEffect, useCallback, useState, useMemo, Suspense } from 'react'
import { Download, FileImage, FileCode2, RefreshCw, CheckCircle2, Plus, X, Pencil, Upload, ClipboardCopy, ClipboardPaste, GripVertical, Paintbrush, ArrowDownToLine } from 'lucide-react'
import type { FaviconConfig, AssetVariant, PaintSaveResult, PaintVector, PaintLayerId, PaintSession, FaviconOuterShape, OuterShapeCategory, PaintSaveTargets, LogoConfig, IconConfig, OutsideContentSettings } from '../types'
import { FAVICON_SHAPE_OPTIONS, faviconOuterCategory, DEFAULT_ICON_CONFIG } from '../types'
import { bakeFaviconPaintContentLayer, renderFavicon, faviconInnerDrawSize } from '../utils/renderer'
import { exportFaviconPng, exportFaviconSvg, exportFaviconIco, getStoredExportNameStyle, setStoredExportNameStyle } from '../utils/exporter'
import type { ExportNameStyle } from '../utils/exporter'
import { Section, ColorRow, SliderRow, ToggleRow, SelectRow, FontSelect, WeightSelect, TextRow, TextareaRow, ShapeGrid, NumberInputRow, AiImageGenPanel, RemoveBgButton, OuterCategoryTabs, ExportNameStyleToggle, ImageRecolorControls } from './Controls'
import { IconPicker } from './IconPicker'
import { PreviewStage } from './PreviewStage'
import { lazyWithRetry } from '../utils/lazyWithRetry'

/** Paint editor is large — load only when Edit opens. */
const IconPaintEditor = lazyWithRetry(() =>
  import('./IconPaintEditor').then((m) => ({ default: m.IconPaintEditor }))
)
import { hasMultipleColors } from '../utils/iconUtils'
import { emptyImageRecolorFields, recolorFieldsAfterImageChange } from '../utils/imageRecolor'
import {
  applyPaintSaveToFavicon,
  mapFaviconStashToIconStash,
  outsideContentFromFavicon,
  switchFaviconContentType,
  updateIconStashAfterSave
} from '../utils/paintSettingsSync'
import { faviconContentToIconConfig } from './LogoEditor'
import { contentTypeFromIconForFavicon, FAVICON_CONTENT_TYPE_OPTIONS, unwrapSvgPath } from '../utils/contentTypeSync'
import { sanitizePaintSessionProxies, syncOutsideLettersIntoPaintSession } from '../utils/paintDecorations'
import { CanvaPromptPanel } from './CanvaPromptPanel'
import { resolveCanvaAppName } from '../utils/canvaPrompt'

const MAX_VARIANTS = Infinity

// Default values extracted to module-level constants so useMemo comparisons
// never see new object literals as dependencies.
const DEFAULT_FAVICON_OUTER = {
  outerShape: 'square' as const,
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
}

const DEFAULT_FAVICON_CONTENT = {
  type: 'letters' as const,
  text: 'M',
  textColor: '#ffffff',
  fontFamily: 'Inter',
  fontWeight: '700',
  fontSizeRatio: 0.52,
  fontItalic: false,
  fontUnderline: false,
  letterSpacing: 0,
  shape: 'circle' as const,
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
  imageDataUrl: '',
  imageSizeRatio: 0.8,
  imageUseOriginalColors: true,
  imagePalette: [] as string[],
  imageColor1: '',
  imageColor2: '',
  imageColor3: '',
  imageColor4: '',
  imageColor5: '',
  canvaBusinessType: 'recruitment-services' as const,
  canvaDesignType: 'icon' as const,
  canvaPrimaryColor: '#6366f1',
  canvaSecondaryColor: '',
  canvaImageReference: 'none' as const,
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
  contentBorderWidth: 0,
}

interface FaviconEditorProps {
  versionName: string
  variants: AssetVariant<FaviconConfig>[]
  logoVariants?: AssetVariant<LogoConfig>[]
  onChange: (variants: AssetVariant<FaviconConfig>[]) => void
  onLogoChange?: (variants: AssetVariant<LogoConfig>[]) => void
  onOpenSettings: () => void
  isActive?: boolean
}

export function FaviconEditor({
  versionName,
  variants,
  logoVariants = [],
  onChange,
  onLogoChange,
  onOpenSettings,
  isActive = true
}: FaviconEditorProps): JSX.Element {
  const [activeId, setActiveId] = useState(variants[0]?.id ?? '')
  const [editingLabel, setEditingLabel] = useState<string | null>(null)
  const [labelInput, setLabelInput] = useState('')
  const [styleClipboard, setStyleClipboard] = useState<FaviconConfig | null>(null)
  const [appliedToAll, setAppliedToAll] = useState(false)
  const dragIndexRef = useRef<number | null>(null)
  const variantsRef = useRef(variants)
  const logoVariantsRef = useRef(logoVariants)
  variantsRef.current = variants
  logoVariantsRef.current = logoVariants
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderIdRef = useRef(0)
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportNameStyle, setExportNameStyle] = useState<ExportNameStyle>(() => getStoredExportNameStyle())
  const [previewSize, setPreviewSize] = useState(512)
  const [panelWidth, setPanelWidth] = useState(288)
  // Ref to the panel DOM node so we can update its width directly during drag
  // without a React state update (= no re-render = no spurious canvas redraw).
  const panelRef = useRef<HTMLDivElement>(null)
  const panelWidthRef = useRef(288)

  // Keep name-style in sync with logo editor (shared localStorage preference).
  useEffect(() => {
    if (isActive) setExportNameStyle(getStoredExportNameStyle())
  }, [isActive])

  const onPanelDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = panelWidthRef.current
    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.min(520, Math.max(240, startWidth + (startX - ev.clientX)))
      panelWidthRef.current = newWidth
      if (panelRef.current) panelRef.current.style.width = `${newWidth}px`
    }
    const onUp = () => {
      // Commit to React state once (one re-render on mouseup, not on every move)
      setPanelWidth(panelWidthRef.current)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  useEffect(() => {
    if (!variants.find((v) => v.id === activeId) && variants.length > 0) setActiveId(variants[0].id)
  }, [variants, activeId])

  const active = variants.find((v) => v.id === activeId) ?? variants[0]

  // Memoize the merged config so that local state changes (panelWidth, editingLabel,
  // exporting) — which re-render this component but don't touch `active` — do NOT
  // produce a new object reference, and therefore do NOT trigger the canvas useEffect.
  const config = useMemo<FaviconConfig | undefined>(() => {
    if (!active) return undefined
    return {
      ...DEFAULT_FAVICON_OUTER,
      ...active.config,
      content: { ...DEFAULT_FAVICON_CONTENT, ...active.config?.content }
    }
  }, [active])

  const updateConfig = useCallback(
    (patch: Partial<FaviconConfig>) => {
      if (!active) return
      onChange(variants.map((v) => v.id === active.id ? { ...v, config: { ...v.config, ...patch } } : v))
    },
    [active, variants, onChange]
  )

  const setContent = useCallback(
    (patch: Partial<FaviconConfig['content']>) => {
      if (!config || !active) return
      // Type switch: stash current type fields + Inner overlay/vectors, restore target.
      if (patch.type !== undefined && patch.type !== config.content.type) {
        const switched = switchFaviconContentType(config, patch.type)
        const { type: _t, ...rest } = patch
        updateConfig({
          ...switched,
          content: { ...switched.content, ...rest, type: patch.type }
        })
        return
      }
      const nextContent = { ...config.content, ...patch }
      const letterKeyTouched = [
        'text', 'textColor', 'fontFamily', 'fontWeight', 'fontItalic',
        'fontUnderline', 'fontSizeRatio', 'letterSpacing', 'offsetX', 'offsetY',
        'contentBorderColor', 'contentBorderWidth',
        'contentShadowEnabled', 'contentShadowInset', 'contentShadowColor',
        'contentShadowBlur', 'contentShadowSpread', 'contentShadowOffsetX', 'contentShadowOffsetY'
      ].some((k) => k in patch)
      // Live letters draw outside — migrate legacy baked-text decorations so
      // Text / font / color changes show immediately without re-opening Paint.
      if (
        letterKeyTouched &&
        nextContent.type === 'letters' &&
        config.paintSession
      ) {
        const nextSession = syncOutsideLettersIntoPaintSession(config.paintSession, {
          text: nextContent.text ?? '',
          textColor: nextContent.textColor ?? '#ffffff',
          fontFamily: nextContent.fontFamily ?? 'Inter',
          fontWeight: nextContent.fontWeight ?? '700',
          fontItalic: !!nextContent.fontItalic,
          fontUnderline: !!nextContent.fontUnderline,
          fontSizeRatio: nextContent.fontSizeRatio ?? 0.52,
          letterSpacing: nextContent.letterSpacing ?? 0,
          offsetX: nextContent.offsetX ?? 0,
          offsetY: nextContent.offsetY ?? 0,
          contentShadowEnabled: !!nextContent.contentShadowEnabled,
          contentShadowColor: nextContent.contentShadowColor ?? '#00000080',
          contentShadowBlur: nextContent.contentShadowBlur ?? 8,
          contentShadowSpread: nextContent.contentShadowSpread ?? 0,
          contentShadowOffsetX: nextContent.contentShadowOffsetX ?? 0,
          contentShadowOffsetY: nextContent.contentShadowOffsetY ?? 3
        }, faviconInnerDrawSize(config, 512))
        updateConfig({ content: nextContent, paintSession: nextSession ?? null })
        return
      }
      updateConfig({ content: nextContent })
    },
    [config, active, updateConfig]
  )

  // ── Paint editor ──────────────────────────────────────────────────────────
  const [showPaint, setShowPaint] = useState(false)
  const [paintContainer, setPaintContainer] = useState<string | null>(null)
  const [paintContent, setPaintContent] = useState<string | null>(null)
  const [paintContainerOverlay, setPaintContainerOverlay] = useState<string | null>(null)
  const [paintContentOverlay, setPaintContentOverlay] = useState<string | null>(null)
  const [paintVectors, setPaintVectors] = useState<PaintVector[]>([])
  const [paintHasContainer, setPaintHasContainer] = useState(false)
  const [paintLayerOrder, setPaintLayerOrder] = useState<PaintLayerId[]>(['content', 'container'])
  const [paintOutsideContent, setPaintOutsideContent] = useState<OutsideContentSettings | null>(null)

  const hasOuterShape = !!config && config.outerShape !== 'none'

  // Always rebake live bases; restore paint overlays from session.
  const openPaint = useCallback(async () => {
    if (!config) return
    const isLetters = config.content.type === 'letters'
    // All Inner types bring their size/offset/shadow settings into Paint.
    setPaintOutsideContent(outsideContentFromFavicon(config.content))

    // Drop any persisted contentBound proxies (Paint-ephemeral only).
    const session = sanitizePaintSessionProxies(config.paintSession) ?? null
    const bakeConfig = { ...config, paintSession: null as null }

    const containerCanvas = document.createElement('canvas')
    const contentCanvas = document.createElement('canvas')
    // Outer bake: blank Inner so only the live Outer shape is the base.
    await renderFavicon(containerCanvas, {
      ...bakeConfig,
      size: 512,
      content: {
        ...config.content,
        type: 'letters',
        text: ' ',
        fontUnderline: false,
        contentShadowEnabled: false,
        contentBorderWidth: 0,
        offsetX: 0,
        offsetY: 0
      }
    }).catch(() => {})
    // Inner bake at shadow-inset scale (matches live favicon + Paint sizeRatio).
    await bakeFaviconPaintContentLayer(
      contentCanvas,
      bakeConfig,
      isLetters
        ? {
            ...config.content,
            type: 'letters',
            text: ' ',
            fontUnderline: false,
            contentShadowEnabled: false,
            contentBorderWidth: 0,
            offsetX: 0,
            offsetY: 0
          }
        : {
            ...config.content,
            contentShadowEnabled: false,
            contentBorderWidth: 0,
            offsetX: 0,
            offsetY: 0
          },
      512
    ).catch(() => {})
    setPaintContainer(containerCanvas.toDataURL('image/png'))
    setPaintContent(contentCanvas.toDataURL('image/png'))
    const hasSession = !!(session && session.version === 1)
    setPaintContainerOverlay(hasSession ? session!.containerPng : null)
    setPaintContentOverlay(hasSession ? session!.contentPng : null)
    setPaintVectors(hasSession && Array.isArray(session!.vectors) ? session!.vectors : [])
    setPaintHasContainer(hasSession ? !!session!.hasContainer : config.outerShape !== 'none')
    setPaintLayerOrder(
      hasSession && session!.layerOrder?.length === 2
        ? session!.layerOrder
        : ['content', 'container']
    )
    setShowPaint(true)
  }, [config])

  // Sync relationships are exact-name only.
  const matchingLogoVariant = useMemo(() => {
    if (!logoVariants.length || !active) return undefined
    return logoVariants.find((v) => v.label === active.label)
  }, [logoVariants, active?.label])

  const savePaint = useCallback(async (result: PaintSaveResult, targets: PaintSaveTargets) => {
    const session: PaintSession = sanitizePaintSessionProxies({
      version: 1,
      resolution: result.resolution,
      containerPng: result.containerPng,
      contentPng: result.contentPng,
      vectors: result.vectors,
      hasContainer: result.hasContainer,
      layerOrder: result.layerOrder,
      paintOverlaysOnly: true,
      decorationsPng: result.decorationsPng,
      containerDecorationsPng: result.containerDecorationsPng,
      contentDecorationsPng: result.contentDecorationsPng,
      // Linked letters stay as live outside settings (not baked into decorations).
      linkedTextInDecorations: result.linkedTextInDecorations ?? false,
      paintShapeSize: result.paintShapeSize
    })!
    const favIds = new Set(targets.faviconIds)
    const logoIds = new Set(targets.logoIds)
    const sync = result.contentSync
    if (!config) return

    const savedFavicon = applyPaintSaveToFavicon(config, session, sync)
    const savedIcon = updateIconStashAfterSave(
      {
        ...faviconContentToIconConfig(
          savedFavicon.content,
          matchingLogoVariant?.config.icon ?? DEFAULT_ICON_CONFIG,
          savedFavicon
        ),
        // Hidden per-type stash comes from the painted favicon, not the linked
        // logo’s preserved custom icon (that `icon` field is unused while synced).
        contentTypeStash: mapFaviconStashToIconStash(savedFavicon.contentTypeStash)
      },
      session
    )

    if (favIds.size > 0) {
      onChange(
        variantsRef.current.map((v) => {
          if (!favIds.has(v.id)) return v
          return { ...v, config: structuredClone(savedFavicon) }
        })
      )
    }

    if (logoIds.size > 0 && onLogoChange) {
      onLogoChange(
        logoVariantsRef.current.map((v) => {
          if (!logoIds.has(v.id)) return v
          // Paint Save is a one-time copy: unlink and replace the stored original
          // icon (the custom `icon` kept while synced) with the painted result.
          return {
            ...v,
            config: {
              ...v.config,
              iconLinked: false,
              iconSyncBroken: false,
              syncedIconSnapshot: null,
              syncedIcon: null,
              icon: structuredClone(savedIcon)
            }
          }
        })
      )
    }
    setShowPaint(false)
  }, [onChange, onLogoChange, matchingLogoVariant, config])

  const copyIconFromLogo = useCallback(() => {
    if (!config || !matchingLogoVariant?.config?.icon) return
    const icon = matchingLogoVariant.config.icon as IconConfig
    if (icon.paintSession || (icon.sourceType === 'image' && icon.imageDataUrl)) {
      updateConfig({
        outerShape: 'none',
        borderWidth: 0,
        borderColor: 'transparent',
        shadowEnabled: false,
        paintSession: icon.paintSession ?? null,
        content: {
          ...config.content,
          type: 'image',
          imageDataUrl: icon.imageDataUrl,
          imageSizeRatio: icon.imageSizeRatio ?? 1,
          offsetX: 0,
          offsetY: 0,
          contentShadowEnabled: false,
          imageUseOriginalColors: icon.imageUseOriginalColors ?? true,
          imagePalette: icon.imagePalette ?? [],
          imageColor1: icon.imageColor1 ?? '',
          imageColor2: icon.imageColor2 ?? '',
          imageColor3: icon.imageColor3 ?? '',
          imageColor4: icon.imageColor4 ?? '',
          imageColor5: icon.imageColor5 ?? ''
        }
      })
      return
    }
    const contentType = contentTypeFromIconForFavicon(icon)
    updateConfig({
      paintSession: null,
      content: {
        ...config.content,
        type: contentType,
        text: contentType === 'canva' ? config.content.text : (icon.text ?? config.content.text),
        textColor: icon.textColor ?? icon.primaryColor ?? config.content.textColor,
        fontFamily: icon.fontFamily ?? config.content.fontFamily,
        fontWeight: icon.fontWeight ?? config.content.fontWeight,
        fontItalic: icon.fontItalic ?? false,
        fontUnderline: icon.fontUnderline ?? false,
        fontSizeRatio: icon.fontSizeRatio ?? config.content.fontSizeRatio,
        letterSpacing: icon.letterSpacing ?? 0,
        shape: icon.shape === 'none' ? config.content.shape : (icon.shape as FaviconConfig['content']['shape']),
        shapeColor: icon.primaryColor ?? config.content.shapeColor,
        shapeSizeRatio: icon.shapeSizeRatio ?? config.content.shapeSizeRatio,
        shapeBorderRadius: Math.round(
          ((icon.shapeBorderRadius ?? 0) * 256) / Math.max(1, icon.size || 112)
        ),
        lucideIconName: icon.lucideIconName ?? config.content.lucideIconName,
        lucideColor: icon.primaryColor ?? config.content.lucideColor,
        lucideSizeRatio: icon.lucideSizeRatio ?? config.content.lucideSizeRatio,
        lucideStrokeWidth: icon.lucideStrokeWidth ?? config.content.lucideStrokeWidth,
        svgMarkup: contentType === 'svg-markup' ? (icon.svgMarkup ?? '') : config.content.svgMarkup,
        svgPath: contentType === 'svg' ? unwrapSvgPath(icon.svgMarkup ?? '') : config.content.svgPath,
        svgColor: contentType === 'svg' ? (icon.primaryColor ?? config.content.svgColor) : config.content.svgColor,
        svgMarkupSizeRatio: icon.svgMarkupSizeRatio ?? config.content.svgMarkupSizeRatio,
        svgMarkupUseOriginalColors: icon.svgMarkupUseOriginalColors ?? false,
        svgMarkupSecondaryColor: icon.svgMarkupSecondaryColor ?? '',
        svgMarkupTertiaryColor: icon.svgMarkupTertiaryColor ?? '',
        svgMarkupColor4: icon.svgMarkupColor4 ?? '',
        svgMarkupColor5: icon.svgMarkupColor5 ?? '',
        canvaPrimaryColor:
          contentType === 'canva'
            ? (icon.textColor ?? icon.primaryColor ?? config.content.canvaPrimaryColor)
            : config.content.canvaPrimaryColor,
        imageDataUrl: icon.imageDataUrl ?? '',
        imageSizeRatio: icon.imageSizeRatio ?? 0.8,
        imageUseOriginalColors: icon.imageUseOriginalColors ?? true,
        imagePalette: icon.imagePalette ?? [],
        imageColor1: icon.imageColor1 ?? '',
        imageColor2: icon.imageColor2 ?? '',
        imageColor3: icon.imageColor3 ?? '',
        imageColor4: icon.imageColor4 ?? '',
        imageColor5: icon.imageColor5 ?? ''
      }
    })
  }, [config, matchingLogoVariant, updateConfig])

  // Keep ref in sync when state changes (e.g. initial value, programmatic resize)
  useEffect(() => { panelWidthRef.current = panelWidth }, [panelWidth])

  // RAF-gated canvas render. Skipped entirely when the Favicon tab is hidden
  // (isActive=false) to avoid CPU work while the user is on the Logo tab.
  useEffect(() => {
    if (!canvasRef.current || !config || !isActive) return
    const renderId = ++renderIdRef.current

    const doRender = () => {
      if (renderId !== renderIdRef.current) return
      renderFavicon(canvasRef.current!, { ...config, size: previewSize }).catch(() => {})
    }

    const rafId = requestAnimationFrame(doRender)

    // Re-render when a new font finishes loading. Debounced: loadingdone fires
    // once per face, so a single font can fire 4-8 events in quick succession.
    let fontsTimer: ReturnType<typeof setTimeout> | null = null
    const onFontsLoaded = () => {
      if (fontsTimer) clearTimeout(fontsTimer)
      fontsTimer = setTimeout(() => requestAnimationFrame(doRender), 200)
    }
    document.fonts.addEventListener('loadingdone', onFontsLoaded)

    return () => {
      cancelAnimationFrame(rafId)
      if (fontsTimer) clearTimeout(fontsTimer)
      document.fonts.removeEventListener('loadingdone', onFontsLoaded)
    }
  }, [config, previewSize, isActive])

  const addVariant = () => {
    // 2nd variant → "Light" based on 1st; 3rd+ → "Variant N" based on Light (2nd) variant
    const isLight = variants.length === 1
    const sourceVariant = isLight ? variants[0] : (variants.find((v) => v.label === 'Light') ?? variants[variants.length - 1])
    const label = isLight ? 'Light' : `Variant ${variants.length + 1}`
    const newVariant: AssetVariant<FaviconConfig> = {
      id: `fav_${Date.now()}`,
      label,
      config: { ...sourceVariant.config }
    }
    const updated = [...variants, newVariant]
    onChange(updated)
    setActiveId(newVariant.id)
  }

  const removeVariant = (id: string) => {
    if (variants.length <= 1) return
    const updated = variants.filter((v) => v.id !== id)
    onChange(updated)
    if (activeId === id) setActiveId(updated[0].id)
  }

  const renameVariant = async (id: string, label: string) => {
    const previous = variants.find((v) => v.id === id)
    const previousLabel = previous?.label
    onChange(variants.map((v) => (v.id === id ? { ...v, label } : v)))
    // Freeze the favicon's current rendered appearance into every logo that was
    // linked to this exact-name variant before breaking the relationship.
    if (
      onLogoChange &&
      previous &&
      previousLabel !== label
    ) {
      const linkedLogoIds = new Set(
        logoVariants
          .filter((lv) => (lv.config.iconLinked ?? true) && lv.label === previousLabel)
          .map((lv) => lv.id)
      )
      if (linkedLogoIds.size > 0) {
        const canvas = document.createElement('canvas')
        await renderFavicon(canvas, { ...previous.config, size: 512 }).catch(() => {})
        const frozenDataUrl = canvas.width && canvas.height
          ? canvas.toDataURL('image/png')
          : ''
        onLogoChange(
          logoVariants.map((lv) => {
            if (!linkedLogoIds.has(lv.id)) return lv
            return {
              ...lv,
              config: {
                ...lv.config,
                iconLinked: false,
                iconSyncBroken: true,
                syncedIconSnapshot: {
                  ...lv.config.icon,
                  sourceType: 'image' as const,
                  imageDataUrl: frozenDataUrl || lv.config.icon.imageDataUrl,
                  imageSizeRatio: 1,
                  offsetX: 0,
                  offsetY: 0,
                  containerEnabled: false,
                  shadowEnabled: false,
                  contentShadowEnabled: false,
                  paintSession: previous.config.paintSession ?? null
                },
                icon: lv.config.icon
              }
            }
          })
        )
      }
    }
    setEditingLabel(null)
  }

  // Copy the full style (config) of a variant to the clipboard.
  const copyStyle = (id: string) => {
    const v = variants.find((x) => x.id === id)
    if (v) setStyleClipboard(structuredClone(v.config))
  }

  // Paste the clipboard style onto the active variant (keeps its id + label).
  const pasteStyle = () => {
    if (!styleClipboard || !active) return
    onChange(
      variants.map((v) => (v.id === active.id ? { ...v, config: structuredClone(styleClipboard) } : v))
    )
  }

  /** Copy the active favicon's complete design to every favicon variant. */
  const applyActiveFaviconToAll = () => {
    if (!config || !active || variants.length < 2) return
    onChange(
      variants.map((variant) => ({
        ...variant,
        config: structuredClone(config)
      }))
    )
    setAppliedToAll(true)
    window.setTimeout(() => setAppliedToAll(false), 1600)
  }

  // Drag-to-reorder variants.
  const handleVariantDrop = (targetId: string) => {
    const from = dragIndexRef.current
    dragIndexRef.current = null
    setDragOverId(null)
    if (from == null) return
    const targetIdx = variants.findIndex((v) => v.id === targetId)
    if (targetIdx < 0 || targetIdx === from) return
    const reordered = [...variants]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(targetIdx, 0, moved)
    onChange(reordered)
  }

  const handleExport = async (format: 'png' | 'svg' | 'ico') => {
    if (!config || !active) return
    setExporting(format)
    try {
      const rawLabel = active.label.trim()
      const label =
        exportNameStyle === 'group'
          ? rawLabel
          : variants.length > 1
            ? rawLabel || undefined
            : undefined
      const variantIndex = Math.max(0, variants.findIndex((v) => v.id === active.id))
      const nameOpts = { nameStyle: exportNameStyle, variantIndex }
      if (format === 'png') await exportFaviconPng(config, versionName, 512, label, nameOpts)
      else if (format === 'svg') await exportFaviconSvg(config, versionName, label, nameOpts)
      else await exportFaviconIco(config, versionName, label, nameOpts)
      setExporting('done:' + format)
      setTimeout(() => setExporting(null), 1500)
    } catch { setExporting(null) }
  }

  if (!config) return <div className="flex-1 flex items-center justify-center text-muted text-sm">No variants</div>

  // Shapes that support a controllable border (SVG-path + math shapes)
  const shapesSupportingBorder = [
    'circle', 'square', 'rounded', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star',
    'map-pin', 'shield', 'badge'
  ]
  const showBorderControls = shapesSupportingBorder.includes(config.outerShape)
  // Shapes where border-radius has a visual effect
  const showBorderRadius = ['square', 'rounded'].includes(config.outerShape)
  const outerCategory = faviconOuterCategory(config.outerShape)

  const setOuterCategory = (cat: OuterShapeCategory) => {
    if (cat === outerCategory) return
    if (cat === 'none') {
      updateConfig({
        outerShape: 'none',
        transparentBg: true,
        ...((config.borderWidth ?? 0) > 0 ? { borderWidth: 0 } : {})
      })
      return
    }
    if (cat === 'image') {
      updateConfig({
        outerShape: 'image',
        transparentBg: false,
        ...((config.borderWidth ?? 0) > 0 ? { borderWidth: 0 } : {})
      })
      return
    }
    if (cat === 'svg') {
      updateConfig({
        outerShape: 'svg-markup',
        transparentBg: false,
        ...((config.borderWidth ?? 0) > 0 ? { borderWidth: 0 } : {})
      })
      return
    }
    // shapes
    const fallback: FaviconOuterShape = 'square'
    const next = FAVICON_SHAPE_OPTIONS.some((s) => s.value === config.outerShape)
      ? config.outerShape
      : fallback
    const newSupportsBorder = shapesSupportingBorder.includes(next)
    updateConfig({
      outerShape: next,
      transparentBg: false,
      ...((!newSupportsBorder && (config.borderWidth ?? 0) > 0) ? { borderWidth: 0 } : {})
    })
  }

  // With no outer shape/container there's no padding to reserve, so the inner
  // content may fill the whole canvas — allow up to 100%. Otherwise cap at 90%
  // so content stays inside the container.
  const contentSizeMax = config.outerShape === 'none' ? 100 : 90
  const isCanvaContent = config.content.type === 'canva'
  const canvaAppName = useMemo(
    () => resolveCanvaAppName(logoVariants, active?.label),
    [logoVariants, active?.label]
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {showPaint && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/90 text-sm text-muted">
              Opening paint editor…
            </div>
          }
        >
          <IconPaintEditor
            containerImage={paintContainer}
            contentImage={paintContent}
            containerOverlayImage={paintContainerOverlay}
            contentOverlayImage={paintContentOverlay}
            hasContainer={paintHasContainer || hasOuterShape}
            innerDrawSize={faviconInnerDrawSize(config, 512)}
            outerBorderWidthPx={config.borderWidth ?? 0}
            outerBorderColor={config.borderColor}
            outerShadowColor={config.shadowColor}
            outerFillColor={config.backgroundColor}
            initialVectors={paintVectors}
            initialLayerOrder={paintLayerOrder}
            outsideContentSettings={paintOutsideContent}
            syncOuterFillColor={config.outerShape !== 'image'}
            title="Edit favicon icon"
            logoVariantOptions={logoVariants.map((v) => ({ id: v.id, label: v.label }))}
            faviconVariantOptions={variants.map((v) => ({ id: v.id, label: v.label }))}
            initialSaveTargets={{
              // Only pre-select the logo twin when that logo is actively synced to this favicon.
              logoIds:
                matchingLogoVariant && (matchingLogoVariant.config.iconLinked ?? true)
                  ? [matchingLogoVariant.id]
                  : [],
              faviconIds: active ? [active.id] : []
            }}
            onSave={savePaint}
            onClose={() => { setShowPaint(false); setPaintOutsideContent(null) }}
            onOpenSettings={onOpenSettings}
          />
        </Suspense>
      )}
      {/* Variant tab bar */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border bg-surface shrink-0">
        <span className="text-xs text-muted mr-2">Variant:</span>
        {variants.map((v, idx) => (
          <div key={v.id}
            draggable={editingLabel !== v.id}
            onDragStart={() => { dragIndexRef.current = idx }}
            onDragOver={(e) => { e.preventDefault(); if (dragOverId !== v.id) setDragOverId(v.id) }}
            onDragEnd={() => { dragIndexRef.current = null; setDragOverId(null) }}
            onDrop={(e) => { e.preventDefault(); handleVariantDrop(v.id) }}
            className={`group flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${activeId === v.id ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text hover:bg-border'} ${dragOverId === v.id ? 'ring-2 ring-accent/60' : ''}`}
            onClick={() => setActiveId(v.id)}
          >
            <GripVertical size={10} className={`shrink-0 cursor-grab ${activeId === v.id ? 'text-white/50' : 'text-muted/50'}`} />
            {editingLabel === v.id ? (
              <input
                autoFocus
                value={labelInput}
                placeholder="Name"
                onChange={(e) => setLabelInput(e.target.value)}
                onBlur={() => {
                  renameVariant(v.id, labelInput)
                  setEditingLabel(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renameVariant(v.id, labelInput)
                    setEditingLabel(null)
                  }
                  if (e.key === 'Escape') setEditingLabel(null)
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-16 bg-transparent outline-none text-white placeholder:text-white/40"
              />
            ) : (
              <>
                <span className={v.label.trim() ? undefined : 'opacity-40 italic'}>
                  {v.label.trim() ? v.label : 'unnamed'}
                </span>
                <button onClick={(e) => { e.stopPropagation(); setEditingLabel(v.id); setLabelInput(v.label) }}
                  title="Rename"
                  className={`opacity-0 group-hover:opacity-100 transition-opacity ${activeId === v.id ? 'text-white/70 hover:text-white' : 'text-muted hover:text-text'}`}>
                  <Pencil size={9} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); copyStyle(v.id) }}
                  title="Copy style"
                  className={`opacity-0 group-hover:opacity-100 transition-opacity ${activeId === v.id ? 'text-white/70 hover:text-white' : 'text-muted hover:text-text'}`}>
                  <ClipboardCopy size={9} />
                </button>
              </>
            )}
            {variants.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); removeVariant(v.id) }}
                title="Delete variant"
                className={`opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 ${activeId === v.id ? 'text-white/70 hover:text-white' : 'text-muted hover:text-danger'}`}>
                <X size={9} />
              </button>
            )}
          </div>
        ))}
        <button onClick={addVariant} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted hover:text-text hover:bg-surface3 transition-colors border border-dashed border-border">
          <Plus size={10} /> Add variant
        </button>
        {styleClipboard && (
          <button onClick={pasteStyle}
            title="Paste copied style onto the active variant"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-accent hover:bg-accent/10 transition-colors border border-dashed border-accent/50">
            <ClipboardPaste size={10} /> Paste style
          </button>
        )}
        {variants.length > 1 && (
          <button
            type="button"
            onClick={applyActiveFaviconToAll}
            title="Copy this favicon's complete design to every favicon variant"
            className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              appliedToAll
                ? 'border-success/60 bg-success/10 text-success'
                : 'border-border bg-surface3 text-muted hover:text-text hover:border-muted'
            }`}
          >
            {appliedToAll ? <CheckCircle2 size={11} /> : <ClipboardCopy size={11} />}
            {appliedToAll ? 'Applied to all' : 'Apply favicon to all'}
          </button>
        )}
      </div>

      {/* Editor body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Canvas */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <PreviewStage
            className="flex-1"
            leadingControls={
              !isCanvaContent ? (
              <button
                type="button"
                onClick={openPaint}
                className="h-7 px-2.5 rounded-lg flex items-center gap-1.5 text-[11px] font-semibold bg-surface3 text-text hover:bg-border border border-border transition-colors"
                title="Open paint editor — choose which logo / favicon variants to save to"
              >
                <Paintbrush size={13} /> Edit
              </button>
              ) : undefined
            }
          >
            <div className="flex flex-col items-center gap-8">
              <div className="rounded-xl overflow-hidden shadow-2xl" style={{ background: config.outerShape === 'none' ? 'repeating-conic-gradient(#2d2d42 0% 25%, #1a1a24 0% 50%) 0 0 / 16px 16px' : undefined }}>
                <canvas ref={canvasRef} style={{ display: 'block', width: previewSize, height: previewSize }} />
              </div>
              <div className="flex items-end gap-4">
                {[16, 32, 48, 64].map((s) => <SizeThumbnail key={s} config={config} size={s} />)}
              </div>
            </div>
          </PreviewStage>

          <div className="px-4 py-2 border-t border-border bg-surface shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs text-muted">Preview:</span>
              {[128, 256, 512].map((s) => (
                <button key={s} onClick={() => setPreviewSize(s)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${previewSize === s ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}>
                  {s}px
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted mr-1">Export:</span>
              <ExportButton label="PNG" icon={<FileImage size={13} />} loading={exporting === 'png'} done={exporting === 'done:png'} onClick={() => handleExport('png')} />
              <ExportButton label="SVG" icon={<FileCode2 size={13} />} loading={exporting === 'svg'} done={exporting === 'done:svg'} onClick={() => handleExport('svg')} />
              <ExportButton label="ICO" icon={<span className="text-[10px] font-bold">ICO</span>} loading={exporting === 'ico'} done={exporting === 'done:ico'} onClick={() => handleExport('ico')} accent />
              <ExportNameStyleToggle
                value={exportNameStyle}
                onChange={(v) => {
                  setExportNameStyle(v)
                  setStoredExportNameStyle(v)
                }}
              />
            </div>
          </div>
        </div>

        {/* Style panel */}
        <div ref={panelRef} className="shrink-0 bg-surface border-l border-border overflow-y-auto relative" style={{ width: panelWidth }}>
          {/* Drag handle */}
          <div
            onMouseDown={onPanelDragStart}
            className="absolute left-0 top-0 w-1.5 h-full cursor-col-resize z-10 hover:bg-accent/40 transition-colors"
            title="Drag to resize panel"
          />
          <Section title="Container Shape">
            <div className="py-1.5">
              <p className="text-xs text-muted mb-1">Outer shape</p>
              <OuterCategoryTabs value={outerCategory} onChange={setOuterCategory} />
              {outerCategory === 'shapes' && (
                <div className="grid grid-cols-4 gap-1 mt-1.5">
                  {FAVICON_SHAPE_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      title={s.label}
                      type="button"
                      onClick={() => {
                        const newSupportsBorder = shapesSupportingBorder.includes(s.value)
                        updateConfig({
                          outerShape: s.value,
                          transparentBg: false,
                          ...((!newSupportsBorder && (config.borderWidth ?? 0) > 0) ? { borderWidth: 0 } : {})
                        })
                      }}
                      className={`py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                        config.outerShape === s.value
                          ? 'bg-accent text-white'
                          : 'bg-surface3 text-muted hover:bg-border hover:text-text'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Image upload input for 'image' outer shape */}
            {config.outerShape === 'image' && (
              <FaviconImageUpload
                imageDataUrl={config.outerShapeImageDataUrl ?? ''}
                onChange={(url) => updateConfig({ outerShapeImageDataUrl: url })}
              />
            )}
            {/* SVG picker + controls for 'svg-markup' outer shape */}
            {config.outerShape === 'svg-markup' && (
              <>
                <div className="py-1.5">
                  <IconPicker
                    value={{
                      sourceType: 'svg',
                      lucideIconName: 'image',
                      lucideStrokeWidth: 2,
                      svgMarkup: config.outerShapeSvgMarkup ?? '',
                      shape: 'none',
                      primaryColor: config.outerShapeSvgColor ?? '#ffffff',
                      secondaryColor: '',
                      size: 48,
                      visible: true
                    }}
                    onChange={(patch) => {
                      if (patch.svgMarkup !== undefined) {
                        updateConfig({
                          outerShapeSvgMarkup: patch.svgMarkup,
                          outerShapeSvgUseOriginalColors: hasMultipleColors(patch.svgMarkup ?? '')
                        })
                      }
                    }}
                    onOpenSettings={onOpenSettings}
                    tabs={['browse', 'svg', 'ai']}
                  />
                </div>
                <SliderRow
                  label="Size %"
                  value={Math.round((config.outerShapeSvgSizeRatio ?? 1.0) * 100)}
                  min={20} max={200}
                  onChange={(v) => updateConfig({ outerShapeSvgSizeRatio: v / 100 })}
                  unit="%"
                />
                <ToggleRow
                  label="Original colors"
                  value={config.outerShapeSvgUseOriginalColors ?? false}
                  onChange={(v) => updateConfig({ outerShapeSvgUseOriginalColors: v })}
                />
                {!(config.outerShapeSvgUseOriginalColors ?? false) && (
                  <>
                    <ColorRow label="Color 1" value={config.outerShapeSvgColor ?? '#ffffff'} onChange={(v) => updateConfig({ outerShapeSvgColor: v })} />
                    <ColorRow
                      label="Color 2"
                      value={config.outerShapeSvgSecondaryColor || config.outerShapeSvgColor || '#ffffff'}
                      onChange={(v) => updateConfig({ outerShapeSvgSecondaryColor: v === (config.outerShapeSvgColor || '#ffffff') ? '' : v })}
                    />
                    <ColorRow
                      label="Color 3"
                      value={config.outerShapeSvgTertiaryColor || config.outerShapeSvgColor || '#ffffff'}
                      onChange={(v) => updateConfig({ outerShapeSvgTertiaryColor: v === (config.outerShapeSvgColor || '#ffffff') ? '' : v })}
                    />
                    <ColorRow
                      label="Color 4"
                      value={config.outerShapeSvgColor4 || config.outerShapeSvgColor || '#ffffff'}
                      onChange={(v) => updateConfig({ outerShapeSvgColor4: v === (config.outerShapeSvgColor || '#ffffff') ? '' : v })}
                    />
                    <ColorRow
                      label="Color 5"
                      value={config.outerShapeSvgColor5 || config.outerShapeSvgColor || '#ffffff'}
                      onChange={(v) => updateConfig({ outerShapeSvgColor5: v === (config.outerShapeSvgColor || '#ffffff') ? '' : v })}
                    />
                  </>
                )}
                <SliderRow label="Offset X" value={config.outerShapeOffsetX ?? 0} min={-100} max={100} onChange={(v) => updateConfig({ outerShapeOffsetX: v })} unit="px" />
                <SliderRow label="Offset Y" value={config.outerShapeOffsetY ?? 0} min={-100} max={100} onChange={(v) => updateConfig({ outerShapeOffsetY: v })} unit="px" />
              </>
            )}
            {config.outerShape !== 'none' && config.outerShape !== 'image' && config.outerShape !== 'svg-markup' && (
              <ColorRow label="Fill color" value={config.backgroundColor} onChange={(v) => updateConfig({ backgroundColor: v })} />
            )}
            {showBorderRadius && (
              <NumberInputRow label="Border radius" value={config.borderRadius ?? 40} min={0} unit="px" onChange={(v) => updateConfig({ borderRadius: v })} />
            )}
            {showBorderControls && (
              <>
                <ColorRow label="Border color" value={config.borderColor === 'transparent' ? '#000000' : config.borderColor} onChange={(v) => updateConfig({ borderColor: v })} />
                <SliderRow label="Border width" value={config.borderWidth} min={0} max={24} onChange={(v) => updateConfig({ borderWidth: v, borderColor: v > 0 && config.borderColor === 'transparent' ? '#000000' : config.borderColor })} unit="px" />
              </>
            )}
            {config.outerShape !== 'none' && (
              <>
                <ToggleRow label="Shadow" value={config.shadowEnabled ?? false} onChange={(v) => updateConfig({ shadowEnabled: v })} />
                {config.shadowEnabled && (
                  <>
                    {/* Position: Outline (outer) vs Inset (inner) */}
                    <div className="flex items-center gap-2 py-1.5 min-w-0">
                      <label className="text-xs text-muted w-20 min-w-[5rem] shrink-0">Position</label>
                      <div className="flex flex-1 min-w-0 gap-1">
                        {(['outline', 'inset'] as const).map((pos) => (
                          <button
                            key={pos}
                            onClick={() => updateConfig({ shadowInset: pos === 'inset' })}
                            className={`flex-1 py-1 rounded text-[10px] font-medium capitalize transition-colors ${
                              (config.shadowInset ?? false) === (pos === 'inset')
                                ? 'bg-accent text-white'
                                : 'bg-surface3 text-muted hover:text-text'
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>
                    <ColorRow solidOnly label="Color" value={config.shadowColor ?? '#00000073'} onChange={(v) => updateConfig({ shadowColor: v })} />
                    <SliderRow label="Blur" value={config.shadowBlur ?? 12} min={0} max={60} onChange={(v) => updateConfig({ shadowBlur: v })} unit="px" />
                    <SliderRow label="Spread" value={config.shadowSpread ?? 0} min={0} max={40} onChange={(v) => updateConfig({ shadowSpread: v })} unit="px" />
                    <SliderRow label="Offset X" value={config.shadowOffsetX ?? 0} min={-30} max={30} onChange={(v) => updateConfig({ shadowOffsetX: v })} unit="px" />
                    <SliderRow label="Offset Y" value={config.shadowOffsetY ?? 4} min={-30} max={30} onChange={(v) => updateConfig({ shadowOffsetY: v })} unit="px" />
                  </>
                )}
              </>
            )}
          </Section>

          <Section title="Inner Content">
            <SelectRow label="Content type" value={config.content.type}
              options={FAVICON_CONTENT_TYPE_OPTIONS}
              onChange={(v) => setContent({ type: v as FaviconConfig['content']['type'] })}
            />

            <div className="flex gap-1.5 py-1">
              <button
                type="button"
                onClick={copyIconFromLogo}
                disabled={!matchingLogoVariant}
                title="Copy logo with the exact same variant name into this favicon (works when unsynced)"
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-surface3 text-muted hover:text-text border border-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowDownToLine size={13} /> From logo
              </button>
            </div>

            {config.content.type === 'letters' && (
              <>
                <TextRow label="Text" value={config.content.text} placeholder="A" onChange={(v) => setContent({ text: v })} />
                <FontSelect label="Font" value={config.content.fontFamily} onChange={(v) => setContent({ fontFamily: v })} />
                <WeightSelect label="Weight" value={config.content.fontWeight} onChange={(v) => setContent({ fontWeight: v })} />
                <div className="flex items-center gap-2 py-1.5 min-w-0">
                  <label className="text-xs text-muted w-20 min-w-[5rem] shrink-0">Style</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setContent({ fontItalic: !(config.content.fontItalic ?? false) })}
                      title="Italic"
                      className={`w-8 h-7 rounded text-xs font-medium italic transition-colors ${(config.content.fontItalic ?? false) ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}
                    >I</button>
                    <button
                      onClick={() => setContent({ fontUnderline: !(config.content.fontUnderline ?? false) })}
                      title="Underline"
                      className={`w-8 h-7 rounded text-xs font-medium underline transition-colors ${(config.content.fontUnderline ?? false) ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}
                    >U</button>
                  </div>
                </div>
                <SliderRow label="Size %" value={Math.round(config.content.fontSizeRatio * 100)} min={20} max={contentSizeMax} onChange={(v) => setContent({ fontSizeRatio: v / 100 })} unit="%" />
                <SliderRow label="Text spacing" value={config.content.letterSpacing ?? 0} min={-10} max={40} onChange={(v) => setContent({ letterSpacing: v })} unit="px" />
                <ColorRow label="Color" value={config.content.textColor} onChange={(v) => setContent({ textColor: v })} />
              </>
            )}
            {config.content.type === 'shape' && (
              <>
                <ShapeGrid label="Inner shape" value={config.content.shape} onChange={(v) => setContent({ shape: v })} />
                <SliderRow label="Size %" value={Math.round(config.content.shapeSizeRatio * 100)} min={10} max={contentSizeMax} onChange={(v) => setContent({ shapeSizeRatio: v / 100 })} unit="%" />
                {config.content.shape === 'square' && (
                  <NumberInputRow
                    label="Border radius"
                    value={config.content.shapeBorderRadius ?? 0}
                    min={0}
                    unit="px"
                    onChange={(v) => setContent({ shapeBorderRadius: v })}
                  />
                )}
                <ColorRow label="Color" value={config.content.shapeColor} onChange={(v) => setContent({ shapeColor: v })} />
              </>
            )}
            {config.content.type === 'lucide' && (
              <>
                <div className="py-1.5">
                  <IconPicker
                    value={{ sourceType: 'lucide', lucideIconName: config.content.lucideIconName, lucideStrokeWidth: config.content.lucideStrokeWidth, svgMarkup: config.content.svgMarkup, shape: 'none', primaryColor: config.content.lucideColor, secondaryColor: '', size: 48, visible: true }}
                    onChange={(patch) => {
                      const u: Partial<FaviconConfig['content']> = {}
                      if (patch.lucideIconName !== undefined) u.lucideIconName = patch.lucideIconName
                      if (patch.lucideStrokeWidth !== undefined) u.lucideStrokeWidth = patch.lucideStrokeWidth
                      if (patch.svgMarkup !== undefined) {
                        u.svgMarkup = patch.svgMarkup
                        u.type = 'svg-markup' as const
                        u.svgMarkupUseOriginalColors = hasMultipleColors(patch.svgMarkup ?? '')
                      }
                      if (patch.sourceType === 'svg') u.type = 'svg-markup' as const
                      setContent(u)
                    }}
                    onOpenSettings={onOpenSettings}
                    tabs={['library', 'browse', 'ai']}
                  />
                </div>
                <SliderRow label="Size %" value={Math.round(config.content.lucideSizeRatio * 100)} min={20} max={contentSizeMax} onChange={(v) => setContent({ lucideSizeRatio: v / 100 })} unit="%" />
                <ColorRow label="Color" value={config.content.lucideColor} onChange={(v) => setContent({ lucideColor: v })} />
              </>
            )}
            {config.content.type === 'svg-markup' && (
              <>
                <div className="py-1.5">
                  <IconPicker
                    value={{ sourceType: 'svg', lucideIconName: config.content.lucideIconName, lucideStrokeWidth: config.content.lucideStrokeWidth, svgMarkup: config.content.svgMarkup, shape: 'none', primaryColor: config.content.lucideColor, secondaryColor: '', size: 48, visible: true }}
                    onChange={(patch) => {
                      const u: Partial<FaviconConfig['content']> = {}
                      if (patch.svgMarkup !== undefined) {
                        u.svgMarkup = patch.svgMarkup
                        u.svgMarkupUseOriginalColors = hasMultipleColors(patch.svgMarkup ?? '')
                      }
                      if (patch.lucideIconName !== undefined) { u.lucideIconName = patch.lucideIconName; u.type = 'lucide' as const }
                      if (patch.sourceType === 'lucide') u.type = 'lucide' as const
                      setContent(u)
                    }}
                    onOpenSettings={onOpenSettings}
                    tabs={['browse', 'svg', 'ai']}
                  />
                </div>
                <SliderRow label="Size %" value={Math.round(config.content.svgMarkupSizeRatio * 100)} min={20} max={contentSizeMax} onChange={(v) => setContent({ svgMarkupSizeRatio: v / 100 })} unit="%" />
                <ToggleRow
                  label="Original colors"
                  value={config.content.svgMarkupUseOriginalColors ?? false}
                  onChange={(v) => setContent({ svgMarkupUseOriginalColors: v })}
                />
                {!(config.content.svgMarkupUseOriginalColors ?? false) && (
                  <>
                    <ColorRow label="Color 1" value={config.content.lucideColor} onChange={(v) => setContent({ lucideColor: v })} />
                    <ColorRow
                      label="Color 2"
                      value={config.content.svgMarkupSecondaryColor || config.content.lucideColor}
                      onChange={(v) => setContent({ svgMarkupSecondaryColor: v === config.content.lucideColor ? '' : v })}
                    />
                    <ColorRow
                      label="Color 3"
                      value={config.content.svgMarkupTertiaryColor || config.content.lucideColor}
                      onChange={(v) => setContent({ svgMarkupTertiaryColor: v === config.content.lucideColor ? '' : v })}
                    />
                    <ColorRow
                      label="Color 4"
                      value={config.content.svgMarkupColor4 || config.content.lucideColor}
                      onChange={(v) => setContent({ svgMarkupColor4: v === config.content.lucideColor ? '' : v })}
                    />
                    <ColorRow
                      label="Color 5"
                      value={config.content.svgMarkupColor5 || config.content.lucideColor}
                      onChange={(v) => setContent({ svgMarkupColor5: v === config.content.lucideColor ? '' : v })}
                    />
                  </>
                )}
              </>
            )}
            {config.content.type === 'svg' && (
              <>
                <div className="py-1.5">
                  <label className="block text-xs text-muted mb-1.5">SVG path (d attribute)</label>
                  <TextareaRow label="SVG path" value={config.content.svgPath} placeholder="M 0 0 L 100 0..." onChange={(v) => setContent({ svgPath: v })} />
                </div>
                <ColorRow label="Color" value={config.content.svgColor} onChange={(v) => setContent({ svgColor: v })} />
              </>
            )}
            {config.content.type === 'image' && (
              <>
                <ImageUploadContent
                  imageDataUrl={config.content.imageDataUrl}
                  imageSizeRatio={config.content.imageSizeRatio ?? 0.8}
                  onImageChange={async (dataUrl) => {
                    if (!dataUrl) {
                      setContent({ imageDataUrl: '', ...emptyImageRecolorFields() })
                      return
                    }
                    const paletteFields = await recolorFieldsAfterImageChange(dataUrl, config.content)
                    setContent({ imageDataUrl: dataUrl, ...paletteFields })
                  }}
                  onSizeChange={(ratio) => setContent({ imageSizeRatio: ratio })}
                />
                <ImageRecolorControls
                  imageDataUrl={config.content.imageDataUrl}
                  imageUseOriginalColors={config.content.imageUseOriginalColors ?? true}
                  imagePalette={config.content.imagePalette ?? []}
                  imageColor1={config.content.imageColor1}
                  imageColor2={config.content.imageColor2}
                  imageColor3={config.content.imageColor3}
                  imageColor4={config.content.imageColor4}
                  imageColor5={config.content.imageColor5}
                  onChange={(patch) => setContent(patch)}
                />
              </>
            )}
            {config.content.type === 'canva' && (
              <CanvaPromptPanel
                content={config.content}
                faviconConfig={config}
                logoIcon={matchingLogoVariant?.config?.icon ?? null}
                appName={canvaAppName}
                onChange={(patch) => setContent(patch)}
              />
            )}
            {!isCanvaContent && (
              <>
            <SliderRow label="Offset X" value={config.content.offsetX ?? 0} min={-80} max={80} onChange={(v) => setContent({ offsetX: v })} unit="px" />
            <SliderRow label="Offset Y" value={config.content.offsetY ?? 0} min={-80} max={80} onChange={(v) => setContent({ offsetY: v })} unit="px" />
            <ColorRow label="Border" value={(config.content.contentBorderColor ?? 'transparent') === 'transparent' ? '#000000' : (config.content.contentBorderColor ?? '#000000')} onChange={(v) => setContent({ contentBorderColor: v })} />
            <SliderRow label="Border width" value={config.content.contentBorderWidth ?? 0} min={0} max={20} onChange={(v) => setContent({ contentBorderWidth: v, contentBorderColor: v > 0 && (config.content.contentBorderColor ?? 'transparent') === 'transparent' ? '#000000' : (config.content.contentBorderColor ?? 'transparent') })} unit="px" />
            <ToggleRow label="Shadow" value={config.content.contentShadowEnabled ?? false} onChange={(v) => setContent({ contentShadowEnabled: v })} />
            {(config.content.contentShadowEnabled) && (
              <>
                {/* Outline (drop-shadow outside) vs Inset (inner glow/shadow) */}
                <div className="flex items-center gap-2 py-1.5 min-w-0">
                  <label className="text-xs text-muted w-20 min-w-[5rem] shrink-0">Position</label>
                  <div className="flex flex-1 min-w-0 gap-1">
                    {(['outline', 'inset'] as const).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setContent({ contentShadowInset: pos === 'inset' })}
                        className={`flex-1 py-1 rounded text-[10px] font-medium capitalize transition-colors ${
                          (config.content.contentShadowInset ?? false) === (pos === 'inset')
                            ? 'bg-accent text-white'
                            : 'bg-surface3 text-muted hover:text-text'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
                <ColorRow solidOnly label="Shadow color" value={config.content.contentShadowColor ?? '#00000080'} onChange={(v) => setContent({ contentShadowColor: v })} />
                <SliderRow label="Blur" value={config.content.contentShadowBlur ?? 8} min={0} max={40} onChange={(v) => setContent({ contentShadowBlur: v })} unit="px" />
                <SliderRow label="Spread" value={config.content.contentShadowSpread ?? 0} min={0} max={40} onChange={(v) => setContent({ contentShadowSpread: v })} unit="px" />
                <SliderRow label="Offset X" value={config.content.contentShadowOffsetX ?? 0} min={-30} max={30} onChange={(v) => setContent({ contentShadowOffsetX: v })} unit="px" />
                <SliderRow label="Offset Y" value={config.content.contentShadowOffsetY ?? 3} min={-30} max={30} onChange={(v) => setContent({ contentShadowOffsetY: v })} unit="px" />
              </>
            )}
              </>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

// React.memo: skip re-render when config and size haven't changed.
// With useMemo in the parent, config is only a new reference when the design
// actually changes — so thumbnails only re-render on real design changes.
const SizeThumbnail = React.memo(function SizeThumbnail({ config, size }: { config: FaviconConfig; size: number }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderIdRef = useRef(0)
  // Render at the full 256px reference size so the shadow has room and stays
  // proportionally correct. CSS then scales it down to the target display size.
  const RENDER_SIZE = 256
  useEffect(() => {
    if (!canvasRef.current) return
    const id = ++renderIdRef.current
    const timerId = setTimeout(() => {
      if (canvasRef.current && id === renderIdRef.current) {
        renderFavicon(canvasRef.current, { ...config, size: RENDER_SIZE }).catch(() => {})
      }
    }, 300)
    return () => clearTimeout(timerId)
  }, [config])
  return (
    <div className="flex flex-col items-center gap-1">
      <canvas ref={canvasRef} style={{ display: 'block', width: size, height: size, imageRendering: 'auto' }} />
      <span className="text-[9px] text-muted">{size}px</span>
    </div>
  )
})

interface ExportButtonProps { label: string; icon: React.ReactNode; loading: boolean; done: boolean; onClick: () => void; accent?: boolean }
function ExportButton({ label, icon, loading, done, onClick, accent }: ExportButtonProps): JSX.Element {
  return (
    <button onClick={onClick} disabled={loading || done}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${done ? 'bg-success/20 text-success' : accent ? 'bg-accent/20 text-accent hover:bg-accent/30 border border-accent/30' : 'bg-surface2 hover:bg-surface3 text-text-dim hover:text-text border border-border'} disabled:cursor-not-allowed`}>
      {loading ? <RefreshCw size={12} className="animate-spin" /> : done ? <CheckCircle2 size={12} /> : <Download size={12} />}
      {icon}{label}
    </button>
  )
}

interface ImageUploadContentProps {
  imageDataUrl: string
  imageSizeRatio: number
  onImageChange: (dataUrl: string) => void
  onSizeChange: (ratio: number) => void
}

function ImageUploadContent({ imageDataUrl, imageSizeRatio, onImageChange, onSizeChange }: ImageUploadContentProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const readFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result
      if (typeof result === 'string') onImageChange(result)
    }
    reader.readAsDataURL(file)
  }

  const handleFiles = (files: FileList | null) => {
    if (files?.[0]) readFile(files[0])
  }

  return (
    <div className="py-1.5 space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {imageDataUrl ? (
        <div className="relative group">
          <img
            src={imageDataUrl}
            alt="Uploaded icon"
            className="w-full h-24 object-contain rounded-lg bg-surface3 border border-border"
          />
          <button
            onClick={() => onImageChange('')}
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X size={10} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
          className={`flex flex-col items-center justify-center gap-2 h-24 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${dragging ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50 hover:bg-surface3'}`}
        >
          <Upload size={18} className="text-muted" />
          <p className="text-[10px] text-muted text-center leading-tight">
            Click or drag an image<br />PNG, JPG, SVG, WebP
          </p>
        </div>
      )}

      {/* AI image gen hidden — model quality insufficient: <AiImageGenPanel onGenerated={onImageChange} /> */}

      {imageDataUrl && (
        <>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-muted hover:text-text hover:bg-surface3 border border-dashed border-border transition-colors"
          >
            <Upload size={11} /> Replace image
          </button>
          <RemoveBgButton imageDataUrl={imageDataUrl} onResult={onImageChange} />
          <div className="flex items-center gap-3 py-1">
            <label className="text-xs text-muted w-24 shrink-0">Size %</label>
            <input
              type="range" min={10} max={100} step={1}
              value={Math.round(imageSizeRatio * 100)}
              onChange={(e) => onSizeChange(Number(e.target.value) / 100)}
              className="flex-1"
            />
            <span className="text-[10px] text-muted shrink-0">{Math.round(imageSizeRatio * 100)}%</span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Outer shape image upload ──────────────────────────────────────────────────

interface FaviconImageUploadProps {
  imageDataUrl: string
  onChange: (v: string) => void
}

function FaviconImageUpload({ imageDataUrl, onChange }: FaviconImageUploadProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => { if (typeof e.target?.result === 'string') onChange(e.target.result) }
    reader.readAsDataURL(file)
  }

  return (
    <div className="py-1.5 flex flex-col gap-2">
      <label className="text-xs text-muted">Background image</label>
      <input ref={fileInputRef} type="file" accept="image/*,.svg" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      {imageDataUrl && (
        <div className="relative group w-full h-24 rounded-lg overflow-hidden border border-border bg-checkerboard">
          <img src={imageDataUrl} alt="outer shape bg" className="w-full h-full object-cover" />
          <button onClick={() => onChange('')} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
        </div>
      )}
      {!imageDataUrl && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
          className={`flex flex-col items-center justify-center gap-2 h-20 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${dragging ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50 hover:bg-surface3'}`}
        >
          <Upload size={16} className="text-muted" />
          <p className="text-[10px] text-muted text-center leading-tight">Click or drag · PNG, JPG, SVG, WebP</p>
        </div>
      )}
      {imageDataUrl && (
        <>
          <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] text-muted hover:text-text hover:bg-surface3 border border-dashed border-border transition-colors">
            <Upload size={10} /> Upload
          </button>
          <RemoveBgButton imageDataUrl={imageDataUrl} onResult={onChange} />
        </>
      )}
      {/* AI image gen hidden — model quality insufficient: <AiImageGenPanel onGenerated={onChange} /> */}
    </div>
  )
}
