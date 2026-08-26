import React, { useRef, useEffect, useCallback, useState, useMemo, Suspense } from 'react'
import { Download, FileImage, FileCode2, RefreshCw, CheckCircle2, Plus, X, Pencil, Upload, Link, Unlink, Eye, ClipboardCopy, ClipboardPaste, GripVertical, Paintbrush, ArrowDownToLine } from 'lucide-react'
import type { LogoConfig, LogoLayout, AssetVariant, FaviconConfig, FaviconContent, IconConfig, ShapeType, PaintSaveResult, PaintSession, PaintVector, PaintLayerId, OuterShapeCategory, PaintSaveTargets, OutsideContentSettings, ContentType } from '../types'
import { FONT_FAMILIES } from '../types'
import { renderLogo, drawIcon } from '../utils/renderer'
import { sanitizePaintSessionProxies, syncOutsideLettersIntoPaintSession } from '../utils/paintDecorations'
import { exportLogoPng, exportLogoSvg, getStoredExportNameStyle, setStoredExportNameStyle } from '../utils/exporter'
import type { ExportNameStyle } from '../utils/exporter'
import { hasMultipleColors } from '../utils/iconUtils'
import { recolorFieldsAfterImageChange } from '../utils/imageRecolor'
import {
  applyPaintSaveToFavicon,
  applyPaintSaveToIcon,
  applyFaviconInnerContent,
  applyIconInnerContent,
  clearIconUploadedImage,
  iconConfigToFaviconConfig,
  mapFaviconStashToIconStash,
  updateIconStashAfterSave,
  logoPaintContentDrawSize,
  logoPaintInnerDrawSize,
  logoPaintOuterLayout,
  outsideContentFromIcon,
  switchIconSourceType
} from '../utils/paintSettingsSync'
import {
  contentTypeFromIcon,
  FAVICON_CONTENT_TYPE_OPTIONS,
  iconPatchForContentType,
  resolveFaviconDrawType,
  unwrapSvgPath,
  wrapSvgPath
} from '../utils/contentTypeSync'
import {
  Section,
  ColorRow,
  TransparentFillModeContext,
  SliderRow,
  TextRow,
  TextareaRow,
  ToggleRow,
  SelectRow,
  ShapeGrid,
  FontSelect,
  WeightSelect,
  NumberInputRow,
  OuterCategoryTabs,
  ExportNameStyleToggle,
  AiImageGenPanel,
  RemoveBgButton,
  ImageRecolorControls
} from './Controls'
import { IconPicker } from './IconPicker'
import { PreviewStage } from './PreviewStage'
import { lazyWithRetry } from '../utils/lazyWithRetry'

/** Paint editor is large — load only when Edit opens. */
const IconPaintEditor = lazyWithRetry(() =>
  import('./IconPaintEditor').then((m) => ({ default: m.IconPaintEditor }))
)

const VARIANT_LABEL_SUGGESTIONS = ['Dark', 'Light', 'Primary', 'Inverted', 'Monochrome']
/** Default style-panel width; also the minimum when dragging to resize. */
const PANEL_MIN_WIDTH = 288
const PANEL_MAX_WIDTH = 560

/** True when the persisted synced icon should be rewritten from the favicon twin. */
function syncedIconNeedsUpdate(
  prev: IconConfig | null | undefined,
  next: IconConfig
): boolean {
  if (!prev) return true
  const pa = prev.paintSession
  const pb = next.paintSession
  if ((pa?.decorationsPng ?? '') !== (pb?.decorationsPng ?? '')) return true
  if ((pa?.containerDecorationsPng ?? '') !== (pb?.containerDecorationsPng ?? '')) return true
  if ((pa?.contentDecorationsPng ?? '') !== (pb?.contentDecorationsPng ?? '')) return true
  if ((pa?.containerPng ?? '') !== (pb?.containerPng ?? '')) return true
  if ((pa?.contentPng ?? '') !== (pb?.contentPng ?? '')) return true
  if (!!(pa?.linkedTextInDecorations) !== !!(pb?.linkedTextInDecorations)) return true
  if (!!(pa?.contentBakedInDecorations) !== !!(pb?.contentBakedInDecorations)) return true
  if ((pa?.vectors?.length ?? 0) !== (pb?.vectors?.length ?? 0)) return true
  if (JSON.stringify(pa?.vectors ?? null) !== JSON.stringify(pb?.vectors ?? null)) return true
  const strip = (icon: IconConfig) => {
    const { paintSession: _p, contentTypeStash: _c, ...rest } = icon
    return rest
  }
  return JSON.stringify(strip(prev)) !== JSON.stringify(strip(next))
}

interface LogoEditorProps {
  versionName: string
  variants: AssetVariant<LogoConfig>[]
  faviconVariants: AssetVariant<FaviconConfig>[]
  onChange: (variants: AssetVariant<LogoConfig>[]) => void
  /** Update favicon variants — used when painting a synced icon so both apply. */
  onFaviconChange?: (variants: AssetVariant<FaviconConfig>[]) => void
  onOpenSettings: () => void
  isActive?: boolean
}

export function LogoEditor({ versionName, variants, faviconVariants, onChange, onFaviconChange, onOpenSettings, isActive = true }: LogoEditorProps): JSX.Element {
  const [activeId, setActiveId] = useState(variants[0]?.id ?? '')
  const [editingLabel, setEditingLabel] = useState<string | null>(null)
  const [labelInput, setLabelInput] = useState('')
  const [styleClipboard, setStyleClipboard] = useState<LogoConfig | null>(null)
  const [iconAppliedToAll, setIconAppliedToAll] = useState(false)
  const [innerAppliedToAll, setInnerAppliedToAll] = useState(false)
  const dragIndexRef = useRef<number | null>(null)
  const variantsRef = useRef(variants)
  const faviconVariantsRef = useRef(faviconVariants)
  variantsRef.current = variants
  faviconVariantsRef.current = faviconVariants
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderIdRef = useRef(0)
  const imageChangeGen = useRef(0)
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportScale, setExportScale] = useState<number>(4)
  const [exportNameStyle, setExportNameStyle] = useState<ExportNameStyle>(() => getStoredExportNameStyle())
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [previewDims, setPreviewDims] = useState<{ w: number; h: number } | null>(null)
  const [panelWidth, setPanelWidth] = useState(PANEL_MIN_WIDTH)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelWidthRef = useRef(PANEL_MIN_WIDTH)

  // Keep name-style in sync with favicon editor (shared localStorage preference).
  useEffect(() => {
    if (isActive) setExportNameStyle(getStoredExportNameStyle())
  }, [isActive])

  // Keep ref in sync with state (initial value, programmatic resize)
  useEffect(() => { panelWidthRef.current = panelWidth }, [panelWidth])

  const onPanelDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = panelWidthRef.current
    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, startWidth + (startX - ev.clientX)))
      panelWidthRef.current = newWidth
      if (panelRef.current) panelRef.current.style.width = `${newWidth}px`
    }
    const onUp = () => {
      // One React state update on mouseup instead of 60/sec during drag
      setPanelWidth(panelWidthRef.current)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Keep activeId in sync when variants change
  useEffect(() => {
    if (!variants.find((v) => v.id === activeId) && variants.length > 0) {
      setActiveId(variants[0].id)
    }
  }, [variants, activeId])

  const active = variants.find((v) => v.id === activeId) ?? variants[0]
  const config = active?.config

  // Safety-patch: ensure icon has all required fields (handles old saved data).
  // Memoized on `config` so that local UI state changes (panelWidth, exporting,
  // label editing) that re-render the component do NOT produce a new object and
  // therefore do NOT trigger the canvas useEffect.
  const safeConfig = useMemo<typeof config>(() => {
    if (!config) return config
    return {
      ...config,
      iconLinked: config.iconLinked ?? true,
      syncedIcon: config.syncedIcon ?? null,
      syncedIconSnapshot: config.syncedIconSnapshot ?? null,
      iconSyncBroken: config.iconSyncBroken ?? false,
      icon: {
        sourceType: 'shape',
        lucideIconName: 'Layers',
        lucideStrokeWidth: 2,
        lucideSizeRatio: 1.0,
        svgMarkup: '',
        svgMarkupSizeRatio: 1.0,
        shapeSizeRatio: 1.0,
        text: 'A',
        textColor: '#ffffff',
        fontFamily: 'Inter',
        fontWeight: '700',
        fontSizeRatio: 0.52,
        fontItalic: false,
        fontUnderline: false,
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
        size: 64,
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
        contentBorderWidth: 0,
        containerEnabled: false,
        containerShape: 'rounded',
        containerType: 'color' as const,
        containerColor: '#6366f1',
        containerImageDataUrl: '',
        containerSvgMarkup: '',
        containerPadding: 0.18,
        containerBorderColor: 'transparent',
        containerBorderWidth: 0,
        containerBorderRadius: 22,
        ...config.icon
      }
    }
  }, [config])

  // Sync relationships are exact-name only.
  const matchingFaviconVariant = useMemo(() => {
    if (!faviconVariants?.length || !active) return undefined
    return faviconVariants.find((v) => v.label === active.label)
  }, [faviconVariants, active?.label])

  const faviconContent = matchingFaviconVariant?.config?.content
  const faviconCfg = matchingFaviconVariant?.config

  // Sync only applies when iconLinked AND an exact-name favicon twin exists.
  const canSyncWithFavicon = !!matchingFaviconVariant
  const isSyncedWithFavicon = !!(safeConfig?.iconLinked && canSyncWithFavicon)
  const isShowingFrozenSync = !!(
    safeConfig &&
    !safeConfig.iconLinked &&
    safeConfig.iconSyncBroken &&
    safeConfig.syncedIconSnapshot
  )

  // Memoized: `faviconContentToIconConfig` runs expensive field copies + SVG
  // template replacement on every call. Only recompute when inputs actually change.
  const effectiveIcon = useMemo<IconConfig | undefined>(() => {
    if (!safeConfig) return undefined
    return resolveLogoEffectiveIcon(
      safeConfig,
      faviconContent,
      faviconCfg,
      canSyncWithFavicon
    )
  }, [safeConfig, faviconContent, faviconCfg, canSyncWithFavicon])

  const updateConfig = useCallback(
    (patch: Partial<LogoConfig>) => {
      if (!active) return
      onChange(
        variants.map((v) =>
          v.id === active.id ? { ...v, config: { ...v.config, ...patch } } : v
        )
      )
    },
    [active, variants, onChange]
  )

  // Keep every linked logo's `syncedIcon` mirror up to date with its favicon twin
  // (paint objects, outer fill, letters, …). Custom `icon` is never overwritten.
  useEffect(() => {
    let changed = false
    const nextVariants = variantsRef.current.map((logo) => {
      if (!(logo.config.iconLinked ?? true)) return logo
      const fav = faviconVariantsRef.current.find((f) => f.label === logo.label)
      if (!fav?.config?.content) return logo
      const nextSynced = faviconContentToIconConfig(
        fav.config.content,
        logo.config.icon,
        fav.config
      )
      if (!syncedIconNeedsUpdate(logo.config.syncedIcon, nextSynced)) return logo
      changed = true
      return {
        ...logo,
        config: {
          ...logo.config,
          syncedIcon: nextSynced
        }
      }
    })
    if (changed) onChange(nextVariants)
  }, [faviconVariants, onChange])

  // Auto-break when the exact-name favicon counterpart no longer exists.
  useEffect(() => {
    if (!safeConfig?.iconLinked) return
    if (canSyncWithFavicon) return
    updateConfig({ iconLinked: false })
  }, [canSyncWithFavicon, safeConfig?.iconLinked, updateConfig])

  const setIcon = useCallback(
    (patch: Partial<LogoConfig['icon']>) => {
      // Always edit the custom (unlinked) icon — never clobber syncedIcon here.
      let next: IconConfig = { ...safeConfig!.icon, ...patch }
      // Type switch: stash current source fields + Inner overlay/vectors, restore target.
      if (
        patch.sourceType !== undefined &&
        patch.sourceType !== safeConfig!.icon.sourceType
      ) {
        const switched = switchIconSourceType(safeConfig!.icon, patch.sourceType)
        const { sourceType: _s, ...rest } = patch
        next = { ...switched, ...rest, sourceType: patch.sourceType }
      }
      const letterKeyTouched = [
        'text', 'textColor', 'fontFamily', 'fontWeight', 'fontItalic',
        'fontUnderline', 'fontSizeRatio', 'letterSpacing', 'offsetX', 'offsetY',
        'contentBorderColor', 'contentBorderWidth',
        'contentShadowEnabled', 'contentShadowInset', 'contentShadowColor',
        'contentShadowBlur', 'contentShadowSpread', 'contentShadowOffsetX', 'contentShadowOffsetY'
      ].some((k) => k in patch)
      if (
        letterKeyTouched &&
        next.sourceType === 'letters' &&
        next.paintSession
      ) {
        next = {
          ...next,
          paintSession: syncOutsideLettersIntoPaintSession(next.paintSession, {
            text: next.text ?? '',
            textColor: next.textColor ?? next.primaryColor ?? '#ffffff',
            fontFamily: next.fontFamily ?? 'Inter',
            fontWeight: next.fontWeight ?? '700',
            fontItalic: !!next.fontItalic,
            fontUnderline: !!next.fontUnderline,
            fontSizeRatio: next.fontSizeRatio ?? 0.52,
            letterSpacing: next.letterSpacing ?? 0,
            offsetX: next.offsetX ?? 0,
            offsetY: next.offsetY ?? 0,
            contentShadowEnabled: !!next.contentShadowEnabled,
            contentShadowColor: next.contentShadowColor ?? '#00000080',
            contentShadowBlur: next.contentShadowBlur ?? 8,
            contentShadowSpread: next.contentShadowSpread ?? 0,
            contentShadowOffsetX: next.contentShadowOffsetX ?? 0,
            contentShadowOffsetY: next.contentShadowOffsetY ?? 3
          }, logoPaintContentDrawSize(next, 512)) ?? null
        }
      }
      updateConfig({
        icon: next,
        iconSyncBroken: false,
        syncedIconSnapshot: null,
        // Drop stale favicon mirror so custom preview/export never diverges from `icon`.
        ...(safeConfig!.iconLinked ? {} : { syncedIcon: null })
      })
    },
    [safeConfig?.icon, safeConfig?.iconLinked, updateConfig]
  )

  // ── Paint editor ──────────────────────────────────────────────────────────
  const [showPaint, setShowPaint] = useState(false)
  const [paintContainer, setPaintContainer] = useState<string | null>(null)
  const [paintContent, setPaintContent] = useState<string | null>(null)
  const [paintVectors, setPaintVectors] = useState<PaintVector[]>([])
  const [paintContainerOverlay, setPaintContainerOverlay] = useState<string | null>(null)
  const [paintContentOverlay, setPaintContentOverlay] = useState<string | null>(null)
  const [paintHasContainer, setPaintHasContainer] = useState(false)
  const [paintLayerOrder, setPaintLayerOrder] = useState<PaintLayerId[]>(['content', 'container'])
  const [paintPunchMasks, setPaintPunchMasks] = useState<{ layer: PaintLayerId; png: string }[]>([])
  const [paintOutsideContent, setPaintOutsideContent] = useState<OutsideContentSettings | null>(null)

  // Match favicon: Outer shape is available when the icon has a real container
  // (enabled + shape ≠ none). When synced, faviconContentToIconConfig already
  // sets containerEnabled from favicon.outerShape !== 'none'.
  const hasIconContainer = !!(
    effectiveIcon?.containerEnabled &&
    effectiveIcon.containerShape &&
    effectiveIcon.containerShape !== 'none'
  )

  // Always rebake live Outer/Inner bases; restore paint overlays from session.
  const openPaint = useCallback(async () => {
    if (!safeConfig || !effectiveIcon) return

    const isLetters = effectiveIcon.sourceType === 'letters'
    // All Inner types bring size/offset/shadow into Paint.
    setPaintOutsideContent(outsideContentFromIcon(effectiveIcon))

    const linkedSession =
      isSyncedWithFavicon && matchingFaviconVariant?.config?.paintSession
        ? matchingFaviconVariant.config.paintSession
        : null
    // Use the session from what is on screen (frozen snapshot / effective icon),
    // not only the custom `icon` field (stale while frozen or after unlink).
    const rawSession =
      linkedSession ??
      effectiveIcon.paintSession ??
      safeConfig.syncedIconSnapshot?.paintSession ??
      safeConfig.icon.paintSession ??
      null
    // Drop any persisted contentBound proxies (Paint-ephemeral only).
    const session = sanitizePaintSessionProxies(rawSession) ?? null

    const SIZE = 512
    const { x: drawX, y: drawY, size: drawSize } = logoPaintOuterLayout(effectiveIcon, SIZE)
    const contentPad =
      effectiveIcon.containerEnabled && effectiveIcon.containerShape !== 'none'
        ? (effectiveIcon.containerPadding ?? 0.18)
        : 0
    const contentDraw = Math.max(16, Math.round(drawSize * (1 - 2 * contentPad)))
    const contentX = drawX + Math.floor((drawSize - contentDraw) / 2)
    const contentY = drawY + Math.floor((drawSize - contentDraw) / 2)

    const baseIcon: IconConfig = {
      ...effectiveIcon,
      visible: true,
      paintSession: null,
      // Full unpunched live shape — session punchMasks restore the exact hole in Paint.
      transparentFillMode: 'see-through'
    }

    const containerCanvas = document.createElement('canvas')
    containerCanvas.width = SIZE
    containerCanvas.height = SIZE
    const contentCanvas = document.createElement('canvas')
    contentCanvas.width = SIZE
    contentCanvas.height = SIZE

    await drawIcon(
      containerCanvas.getContext('2d')!,
      {
        ...baseIcon,
        offsetX: 0,
        offsetY: 0,
        shadowEnabled: !!effectiveIcon.shadowEnabled &&
          !!effectiveIcon.containerEnabled &&
          effectiveIcon.containerShape !== 'none',
        contentShadowEnabled: false,
        sourceType: 'letters',
        text: ' ',
        fontUnderline: false,
        contentBorderWidth: 0
      },
      drawX, drawY, drawSize, 2
    ).catch(() => {})

    // Letters: blank base (linked text). Other types: centered bake, no offset/
    // shadow — contentBound stamp in Paint owns move/resize/shadow.
    // Disable container so the proxy isn't clipped to Outer.
    await drawIcon(
      contentCanvas.getContext('2d')!,
      {
        ...baseIcon,
        shadowEnabled: false,
        contentShadowEnabled: false,
        containerEnabled: false,
        containerType: 'color',
        containerColor: 'transparent',
        containerImageDataUrl: '',
        containerSvgMarkup: '',
        containerBorderWidth: 0,
        containerBorderColor: 'transparent',
        contentBorderWidth: 0,
        offsetX: 0,
        offsetY: 0,
        ...(isLetters
          ? {
              sourceType: 'letters' as const,
              text: ' ',
              fontUnderline: false
            }
          : {})
      },
      contentX, contentY, contentDraw, 2
    ).catch(() => {})

    setPaintContainer(containerCanvas.toDataURL('image/png'))
    setPaintContent(contentCanvas.toDataURL('image/png'))
    const hasSession = !!(session && session.version === 1)
    setPaintContainerOverlay(hasSession ? session!.containerPng : null)
    setPaintContentOverlay(hasSession ? session!.contentPng : null)
    setPaintVectors(hasSession && Array.isArray(session!.vectors) ? session!.vectors : [])
    setPaintHasContainer(hasSession ? !!session!.hasContainer : hasIconContainer)
    setPaintLayerOrder(
      hasSession && session!.layerOrder?.length === 2
        ? session!.layerOrder
        : ['content', 'container']
    )
    setPaintPunchMasks(hasSession ? session!.punchMasks ?? [] : [])
    setShowPaint(true)
  }, [safeConfig, effectiveIcon, matchingFaviconVariant, hasIconContainer, isSyncedWithFavicon])

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
      contentBakedInDecorations: result.contentBakedInDecorations ?? false,
      paintShapeSize: result.paintShapeSize,
      paintContentDrawSize: result.paintContentDrawSize,
      paintContentSizeRatio: result.paintContentSizeRatio,
      punchMasks: result.punchMasks
    })!
    const logoIds = new Set(targets.logoIds)
    const favIds = new Set(targets.faviconIds)
    const sync = result.contentSync
    if (!safeConfig || !effectiveIcon) return

    let savedIcon = applyPaintSaveToIcon(effectiveIcon, session, sync)
    const savedFavicon = isSyncedWithFavicon && matchingFaviconVariant
      ? applyPaintSaveToFavicon(matchingFaviconVariant.config, session, sync)
      : iconConfigToFaviconConfig(savedIcon)
    if (isSyncedWithFavicon) {
      // Synced live icon is derived from the favicon; use that stash so pasted
      // variants get hidden letter/shape/lucide/image/svg settings, not the
      // unused custom `icon` stash kept while linked.
      savedIcon = updateIconStashAfterSave(
        {
          ...savedIcon,
          contentTypeStash: mapFaviconStashToIconStash(savedFavicon.contentTypeStash)
        },
        session
      )
    }

    if (favIds.size > 0 && onFaviconChange) {
      onFaviconChange(
        faviconVariantsRef.current.map((v) => {
          if (!favIds.has(v.id)) return v
          return { ...v, config: structuredClone(savedFavicon) }
        })
      )
    }

    if (logoIds.size > 0) {
      onChange(
        variantsRef.current.map((v) => {
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
  }, [onChange, onFaviconChange, isSyncedWithFavicon, matchingFaviconVariant, safeConfig, effectiveIcon])

  const copyIconFromFavicon = useCallback(() => {
    if (!safeConfig || !matchingFaviconVariant?.config) return
    const fav = matchingFaviconVariant.config
    let nextIcon: IconConfig = {
      ...faviconContentToIconConfig(fav.content, safeConfig.icon, fav),
      paintSession: fav.paintSession ?? null
    }
    // Only flatten to a raster icon when the favicon inner content is actually image-based.
    // paintSession alone (letters/shape + paint overlays) must keep typed inner content.
    const flattenAsImage =
      fav.content.type === 'image' &&
      !!(fav.content.imageDataUrl || nextIcon.imageDataUrl)
    if (flattenAsImage) {
      nextIcon = {
        ...nextIcon,
        sourceType: 'image',
        imageDataUrl: fav.content.imageDataUrl || nextIcon.imageDataUrl,
        imageSizeRatio: fav.content.imageSizeRatio ?? 1,
        containerEnabled: fav.outerShape !== 'none' ? nextIcon.containerEnabled : false,
        paintSession: fav.paintSession ?? null
      }
    }
    if (nextIcon.sourceType !== safeConfig.icon.sourceType) {
      nextIcon = {
        ...switchIconSourceType(safeConfig.icon, nextIcon.sourceType),
        ...nextIcon,
        sourceType: nextIcon.sourceType
      }
    }
    updateConfig({
      icon: nextIcon,
      iconLinked: false,
      iconSyncBroken: false,
      syncedIconSnapshot: null,
      syncedIcon: null
    })
  }, [safeConfig, matchingFaviconVariant, updateConfig])

  // Apply a patch to EVERY variant (used for "same text on all variants").
  const updateAllVariants = useCallback(
    (patch: Partial<LogoConfig>) => {
      onChange(variants.map((v) => ({ ...v, config: { ...v.config, ...patch } })))
    },
    [variants, onChange]
  )

  // Title text edit: propagate to all variants when the shared flag is on.
  const setTitleText = useCallback(
    (text: string) => {
      if (safeConfig?.textShared) updateAllVariants({ text })
      else updateConfig({ text })
    },
    [safeConfig?.textShared, updateAllVariants, updateConfig]
  )

  const setSubtitleText = useCallback(
    (secondaryText: string) => {
      if (safeConfig?.secondaryTextShared) updateAllVariants({ secondaryText })
      else updateConfig({ secondaryText })
    },
    [safeConfig?.secondaryTextShared, updateAllVariants, updateConfig]
  )

  // Toggling the "share" checkbox writes the flag to every variant. Turning it
  // ON also copies the active variant's current text to all variants.
  const toggleTitleShared = useCallback(
    (on: boolean) => {
      if (on) updateAllVariants({ textShared: true, text: safeConfig?.text ?? '' })
      else updateAllVariants({ textShared: false })
    },
    [updateAllVariants, safeConfig?.text]
  )

  const toggleSubtitleShared = useCallback(
    (on: boolean) => {
      if (on) updateAllVariants({ secondaryTextShared: true, secondaryText: safeConfig?.secondaryText ?? '' })
      else updateAllVariants({ secondaryTextShared: false })
    },
    [updateAllVariants, safeConfig?.secondaryText]
  )

  // Redraw canvas when active config changes.
  // Gated on isActive: when the user is on the Favicon tab, logo renders are
  // skipped entirely. The moment the user switches to the Logo tab (isActive
  // flips to true) a fresh render fires with the latest state.
  // Uses requestAnimationFrame so rapid state changes only trigger one render
  // per display frame (~16 ms) with no perceptible delay.
  useEffect(() => {
    if (!canvasRef.current || !safeConfig || !effectiveIcon || !isActive) return
    const renderId = ++renderIdRef.current
    const renderConfig = { ...safeConfig, icon: effectiveIcon }

    const faviconForIconRender = isSyncedWithFavicon ? faviconCfg : undefined

    const doRender = () => {
      if (renderId !== renderIdRef.current) return
      renderLogo(canvasRef.current!, renderConfig, 4, true, faviconForIconRender).catch(() => {})
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
  }, [safeConfig, effectiveIcon, isActive, isSyncedWithFavicon, faviconCfg])

  const addVariant = () => {
    const isLight = variants.length === 1
    let config: LogoConfig
    let label: string

    if (isLight) {
      // 2nd variant → "Light" with fixed light-mode overrides
      label = 'Light'
      const base = variants[0].config
      config = {
        ...base,
        backgroundColor: '#ffffff',
        transparentBg: true,
        textColor: '#111111',
        secondaryTextColor: '#555566',
        icon: { ...base.icon, primaryColor: '#6366f1' }
      }
    } else {
      // 3rd+ → copy from Light variant (or last variant if Light not found)
      label = `Variant ${variants.length + 1}`
      const light = variants.find((v) => v.label === 'Light') ?? variants[variants.length - 1]
      config = { ...light.config }
    }

    const newVariant: AssetVariant<LogoConfig> = { id: `logo_${Date.now()}`, label, config }
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

  const renameVariant = (id: string, label: string) => {
    onChange(
      variants.map((v) => {
        if (v.id !== id) return v
        const linkedFavicon = faviconVariants.find((f) => f.label === v.label)
        const breaksSync =
          label !== v.label &&
          (v.config.iconLinked ?? true) &&
          !!linkedFavicon
        const frozenIcon = breaksSync && linkedFavicon
          ? (v.config.syncedIcon ?? faviconContentToIconConfig(
              linkedFavicon.config.content,
              v.config.icon,
              linkedFavicon.config
            ))
          : null
        return {
          ...v,
          label,
          config: {
            ...v.config,
            iconLinked: breaksSync ? false : v.config.iconLinked,
            icon: v.config.icon,
            syncedIcon: breaksSync ? (frozenIcon ?? v.config.syncedIcon) : v.config.syncedIcon,
            syncedIconSnapshot: breaksSync ? frozenIcon : v.config.syncedIconSnapshot,
            iconSyncBroken: breaksSync ? true : v.config.iconSyncBroken
          }
        }
      })
    )
    setEditingLabel(null)
  }

  const unlinkFromFavicon = useCallback(() => {
    if (!safeConfig) return
    // Restore the original custom icon preserved while synced — do not overwrite
    // with the live favicon mirror.
    updateConfig({
      iconLinked: false,
      iconSyncBroken: false,
      syncedIconSnapshot: null,
      syncedIcon: null
    })
  }, [safeConfig, updateConfig])

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

  /**
   * Apply only the active logo icon across logo variants.
   * A synced source propagates its favicon design too; a custom source copies
   * the original stored logo icon and leaves favicon variants untouched.
   */
  const applyActiveIconToAll = () => {
    if (!safeConfig || !effectiveIcon || variants.length < 2) return

    if (isSyncedWithFavicon && matchingFaviconVariant) {
      if (onFaviconChange) {
        const sourceFavicon = structuredClone(matchingFaviconVariant.config)
        onFaviconChange(
          faviconVariants.map((variant) => ({
            ...variant,
            config: structuredClone(sourceFavicon)
          }))
        )
      }

      const faviconLabels = new Set(faviconVariants.map((variant) => variant.label))
      const mirrored = structuredClone(effectiveIcon)
      onChange(
        variants.map((variant) => {
          if (faviconLabels.has(variant.label)) {
            return {
              ...variant,
              config: {
                ...variant.config,
                iconLinked: true,
                iconSyncBroken: false,
                syncedIconSnapshot: null,
                syncedIcon: structuredClone(mirrored)
              }
            }
          }
          return {
            ...variant,
            config: {
              ...variant.config,
              icon: structuredClone(mirrored),
              syncedIcon: null,
              iconLinked: false,
              iconSyncBroken: false,
              syncedIconSnapshot: null
            }
          }
        })
      )
    } else {
      const sourceIcon = structuredClone(effectiveIcon ?? safeConfig.icon)
      onChange(
        variants.map((variant) => ({
          ...variant,
          config: {
            ...variant.config,
            icon: structuredClone(sourceIcon),
            iconLinked: false,
            iconSyncBroken: false,
            syncedIconSnapshot: null
          }
        }))
      )
    }

    setIconAppliedToAll(true)
    window.setTimeout(() => setIconAppliedToAll(false), 1600)
  }

  /** Copy only inner content; keep each variant's outer + color slots. */
  const applyActiveInnerToAll = () => {
    if (!safeConfig || !effectiveIcon || variants.length < 2) return

    if (isSyncedWithFavicon && matchingFaviconVariant) {
      const sourceFavicon = matchingFaviconVariant.config
      const mergedByLabel = new Map(
        faviconVariants.map((variant) => [
          variant.label,
          applyFaviconInnerContent(sourceFavicon, variant.config)
        ])
      )
      if (onFaviconChange) {
        onFaviconChange(
          faviconVariants.map((variant) => ({
            ...variant,
            config: mergedByLabel.get(variant.label) ?? variant.config
          }))
        )
      }

      const sourceIcon = effectiveIcon
      onChange(
        variants.map((variant) => {
          const mergedFav = mergedByLabel.get(variant.label)
          if (mergedFav) {
            const baseIcon =
              variant.config.syncedIcon ??
              variant.config.icon ??
              safeConfig.icon
            return {
              ...variant,
              config: {
                ...variant.config,
                iconLinked: true,
                iconSyncBroken: false,
                syncedIconSnapshot: null,
                syncedIcon: faviconContentToIconConfig(
                  mergedFav.content,
                  baseIcon,
                  mergedFav
                )
              }
            }
          }
          return {
            ...variant,
            config: {
              ...variant.config,
              icon: applyIconInnerContent(sourceIcon, variant.config.icon),
              syncedIcon: null,
              iconLinked: false,
              iconSyncBroken: false,
              syncedIconSnapshot: null
            }
          }
        })
      )
    } else {
      const sourceIcon = effectiveIcon ?? safeConfig.icon
      onChange(
        variants.map((variant) => ({
          ...variant,
          config: {
            ...variant.config,
            icon: applyIconInnerContent(sourceIcon, variant.config.icon),
            iconLinked: false,
            iconSyncBroken: false,
            syncedIconSnapshot: null
          }
        }))
      )
    }

    setInnerAppliedToAll(true)
    window.setTimeout(() => setInnerAppliedToAll(false), 1600)
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

  const handleExport = async (format: 'png' | 'svg') => {
    if (!safeConfig || !active || !effectiveIcon) return
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
      const exportConfig = { ...safeConfig, icon: effectiveIcon }
      const nameOpts = { nameStyle: exportNameStyle, variantIndex }
      if (format === 'png') {
        await exportLogoPng(exportConfig, versionName, exportScale, label, {
          ...nameOpts,
          highQuality: true,
          faviconIconSource: isSyncedWithFavicon ? faviconCfg : undefined
        })
      }
      else await exportLogoSvg(exportConfig, versionName, label, nameOpts)
      setExporting('done:' + format)
      setTimeout(() => setExporting(null), 1500)
    } catch {
      setExporting(null)
    }
  }

  const handleSizePreview = async () => {
    if (!safeConfig || !effectiveIcon) return
    const canvas = document.createElement('canvas')
    await renderLogo(
      canvas,
      { ...safeConfig, icon: effectiveIcon },
      exportScale,
      true,
      isSyncedWithFavicon ? faviconCfg : undefined
    )
    setPreviewDims({ w: canvas.width, h: canvas.height })
    setPreviewDataUrl(canvas.toDataURL('image/png'))
  }

  if (!safeConfig) return <div className="flex-1 flex items-center justify-center text-muted text-sm">No variants</div>

  return (
    <TransparentFillModeContext.Provider
      value={{
        mode: safeConfig.transparentFillMode ?? effectiveIcon.transparentFillMode ?? 'see-through',
        setMode: (mode) => {
          updateConfig({ transparentFillMode: mode })
          setIcon({ transparentFillMode: mode })
        }
      }}
    >
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
            hasContainer={paintHasContainer || hasIconContainer}
            innerDrawSize={logoPaintContentDrawSize(effectiveIcon, 512)}
            paintOuterSize={logoPaintInnerDrawSize(effectiveIcon, 512)}
            outerBorderWidthPx={
              (effectiveIcon.containerBorderWidth ?? 0) *
              (logoPaintInnerDrawSize(effectiveIcon, 512) /
                Math.max(1, effectiveIcon.size || 1))
            }
            outerBorderColor={effectiveIcon.containerBorderColor}
            outerShadowColor={effectiveIcon.shadowColor}
            outerFillColor={effectiveIcon.containerColor}
            initialVectors={paintVectors}
            initialPunchMasks={paintPunchMasks}
            initialLayerOrder={paintLayerOrder}
            initialPaintShapeSize={
              (isSyncedWithFavicon
                ? matchingFaviconVariant?.config?.paintSession
                : effectiveIcon.paintSession)?.paintShapeSize
            }
            outsideContentSettings={paintOutsideContent}
            syncOuterFillColor={(effectiveIcon.containerType ?? 'color') !== 'image'}
            title={isSyncedWithFavicon ? 'Edit icon (choose variants to save)' : 'Edit logo icon'}
            logoVariantOptions={variants.map((v) => ({ id: v.id, label: v.label }))}
            faviconVariantOptions={faviconVariants.map((v) => ({ id: v.id, label: v.label }))}
            initialSaveTargets={{
              logoIds: active ? [active.id] : [],
              // Only pre-select the favicon twin when this logo is actively synced to it.
              faviconIds:
                isSyncedWithFavicon && matchingFaviconVariant
                  ? [matchingFaviconVariant.id]
                  : []
            }}
            onSave={savePaint}
            onClose={() => { setShowPaint(false); setPaintOutsideContent(null) }}
            onOpenSettings={onOpenSettings}
          />
        </Suspense>
      )}
      {/* Variant tab bar */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border bg-surface shrink-0 min-w-0">
        <span className="text-xs text-muted mr-2 shrink-0">Variant:</span>
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto overflow-y-hidden flex-nowrap">
        {variants.map((v, idx) => (
          <div
            key={v.id}
            draggable={editingLabel !== v.id}
            onDragStart={() => { dragIndexRef.current = idx }}
            onDragOver={(e) => { e.preventDefault(); if (dragOverId !== v.id) setDragOverId(v.id) }}
            onDragEnd={() => { dragIndexRef.current = null; setDragOverId(null) }}
            onDrop={(e) => { e.preventDefault(); handleVariantDrop(v.id) }}
            className={`group flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors shrink-0 ${
              activeId === v.id
                ? 'bg-accent text-white'
                : 'bg-surface3 text-muted hover:text-text hover:bg-border'
            } ${dragOverId === v.id ? 'ring-2 ring-accent/60' : ''}`}
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
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingLabel(v.id)
                    setLabelInput(v.label)
                  }}
                  title="Rename"
                  className={`opacity-0 group-hover:opacity-100 transition-opacity ${activeId === v.id ? 'text-white/70 hover:text-white' : 'text-muted hover:text-text'}`}
                >
                  <Pencil size={9} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); copyStyle(v.id) }}
                  title="Copy style"
                  className={`opacity-0 group-hover:opacity-100 transition-opacity ${activeId === v.id ? 'text-white/70 hover:text-white' : 'text-muted hover:text-text'}`}
                >
                  <ClipboardCopy size={9} />
                </button>
              </>
            )}
            {variants.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); removeVariant(v.id) }}
                title="Delete variant"
                className={`opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 ${activeId === v.id ? 'text-white/70 hover:text-white' : 'text-muted hover:text-danger'}`}
              >
                <X size={9} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addVariant}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted hover:text-text hover:bg-surface3 transition-colors border border-dashed border-border shrink-0"
        >
          <Plus size={10} /> Add variant
        </button>
        {styleClipboard && (
          <button
            onClick={pasteStyle}
            title="Paste copied style onto the active variant"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-accent hover:bg-accent/10 transition-colors border border-dashed border-accent/50 shrink-0"
          >
            <ClipboardPaste size={10} /> Paste style
          </button>
        )}
        </div>
        {variants.length > 1 && (
          <div className="ml-1 flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={applyActiveIconToAll}
              title={
                isSyncedWithFavicon
                  ? 'Apply this synced favicon to every favicon and logo variant'
                  : 'Apply this original custom logo icon to every logo variant'
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                iconAppliedToAll
                  ? 'border-success/60 bg-success/10 text-success'
                  : 'border-border bg-surface3 text-muted hover:text-text hover:border-muted'
              }`}
            >
              {iconAppliedToAll ? <CheckCircle2 size={11} /> : <ClipboardCopy size={11} />}
              {iconAppliedToAll ? 'Applied to all' : 'Apply icon to all'}
            </button>
            <button
              type="button"
              onClick={applyActiveInnerToAll}
              title={
                isSyncedWithFavicon
                  ? 'Copy only the inner content shape/type to every favicon and logo variant. Each keeps its outer settings and colors.'
                  : 'Copy only the inner content shape/type to every logo variant. Each keeps its outer settings and colors.'
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                innerAppliedToAll
                  ? 'border-success/60 bg-success/10 text-success'
                  : 'border-border bg-surface3 text-muted hover:text-text hover:border-muted'
              }`}
            >
              {innerAppliedToAll ? <CheckCircle2 size={11} /> : <ClipboardCopy size={11} />}
              {innerAppliedToAll ? 'Inner applied' : 'Apply inner to all'}
            </button>
          </div>
        )}
      </div>

      {/* Editor body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Canvas area */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <PreviewStage
            className="flex-1"
            leadingControls={
              safeConfig.icon.visible ? (
                <button
                  type="button"
                  onClick={openPaint}
                  className="h-7 px-2.5 rounded-lg flex items-center gap-1.5 text-[11px] font-semibold bg-surface3 text-text hover:bg-border border border-border transition-colors"
                  title="Paint the icon — choose which logo / favicon variants to save to"
                >
                  <Paintbrush size={13} /> Edit
                </button>
              ) : null
            }
          >
            <div
              className="rounded-xl shadow-2xl overflow-hidden"
              style={{
                background: 'repeating-conic-gradient(#2d2d42 0% 25%, #1a1a24 0% 50%) 0 0 / 16px 16px'
              }}
            >
              <canvas ref={canvasRef} style={{ display: 'block' }} />
            </div>
          </PreviewStage>

          {/* Export bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-surface shrink-0 flex-wrap">
            <span className="text-xs text-muted mr-1">Export:</span>
            <ExportButton label="PNG" icon={<FileImage size={13} />} loading={exporting === 'png'} done={exporting === 'done:png'} onClick={() => handleExport('png')} />
            <ExportButton label="SVG" icon={<FileCode2 size={13} />} loading={exporting === 'svg'} done={exporting === 'done:svg'} onClick={() => handleExport('svg')} />
            <ExportNameStyleToggle
              value={exportNameStyle}
              onChange={(v) => {
                setExportNameStyle(v)
                setStoredExportNameStyle(v)
              }}
            />
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] text-muted">Scale</span>
              {([2, 4, 8, 12] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setExportScale(s)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${exportScale === s ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:bg-border hover:text-text'}`}
                >
                  {s}×
                </button>
              ))}
              <button
                onClick={handleSizePreview}
                title="Preview at export size"
                className="ml-1 p-1 rounded text-muted hover:text-text hover:bg-surface3 transition-colors"
              >
                <Eye size={13} />
              </button>
            </div>
          </div>

          {/* Actual-size preview modal */}
          {previewDataUrl && (
            <div
              className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm"
              onClick={() => setPreviewDataUrl(null)}
            >
              <div className="flex items-center justify-between px-6 py-3 bg-surface/90 border-b border-border shrink-0" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-text">Export preview ({exportScale}×)</span>
                  {previewDims && (
                    <span className="text-xs text-muted">{previewDims.w} × {previewDims.h} px</span>
                  )}
                </div>
                <button onClick={() => setPreviewDataUrl(null)} className="p-1.5 rounded hover:bg-surface3 text-muted hover:text-text transition-colors">
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-auto flex items-center justify-center p-8" onClick={() => setPreviewDataUrl(null)}>
                <img
                  src={previewDataUrl}
                  alt="Export preview"
                  style={{ imageRendering: 'pixelated' }}
                  className="max-w-none border border-border/30 rounded shadow-2xl bg-checkerboard"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="px-6 py-2 bg-surface/90 border-t border-border shrink-0 text-[10px] text-muted text-center">
                Click anywhere outside to close · Image shown at actual pixel dimensions
              </div>
            </div>
          )}
        </div>

        {/* Style panel */}
        <div ref={panelRef} className="shrink-0 bg-surface border-l border-border overflow-y-auto relative" style={{ width: panelWidth }}>
          {/* Drag handle */}
          <div
            onMouseDown={onPanelDragStart}
            className="absolute left-0 top-0 -ml-1 w-3 h-full cursor-col-resize z-10 hover:bg-accent/40 active:bg-accent/50 transition-colors group"
            title="Drag to resize panel"
          >
            <span className="absolute left-1 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-border group-hover:bg-accent/70" />
          </div>
          <Section title="Text">
            <TextRow label="Logo title" value={safeConfig.text} placeholder="MyApp" onChange={(v) => setTitleText(v)} />
            <ToggleRow label="Same text on all variants" value={safeConfig.textShared ?? false} onChange={toggleTitleShared} />
            <FontSelect label="Font" value={safeConfig.fontFamily} onChange={(v) => updateConfig({ fontFamily: v })} />
            <WeightSelect label="Weight" value={safeConfig.fontWeight} onChange={(v) => updateConfig({ fontWeight: v })} />
            <div className="flex items-center gap-2 py-1.5 min-w-0">
              <label className="text-xs text-muted w-20 min-w-[5rem] shrink-0">Style</label>
              <div className="flex gap-1">
                <button
                  onClick={() => updateConfig({ fontItalic: !(safeConfig.fontItalic ?? false) })}
                  title="Italic"
                  className={`w-8 h-7 rounded text-xs font-medium italic transition-colors ${(safeConfig.fontItalic ?? false) ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}
                >I</button>
                <button
                  onClick={() => updateConfig({ fontUnderline: !(safeConfig.fontUnderline ?? false) })}
                  title="Underline"
                  className={`w-8 h-7 rounded text-xs font-medium underline transition-colors ${(safeConfig.fontUnderline ?? false) ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}
                >U</button>
              </div>
            </div>
            <SliderRow label="Size" value={safeConfig.fontSize} min={10} max={120} onChange={(v) => updateConfig({ fontSize: v })} unit="px" />
            <SliderRow label="Text spacing" value={safeConfig.letterSpacing ?? 0} min={-10} max={40} onChange={(v) => updateConfig({ letterSpacing: v })} unit="px" />
            <ColorRow label="Color" value={safeConfig.textColor} onChange={(v) => updateConfig({ textColor: v })} />
            <ToggleRow label="Text shadow" value={safeConfig.textShadowEnabled ?? false} onChange={(v) => updateConfig({ textShadowEnabled: v })} />
            {(safeConfig.textShadowEnabled ?? false) && (
              <div className="pl-2 border-l-2 border-border/60 space-y-1">
                <ColorRow solidOnly label="Shadow color" value={safeConfig.textShadowColor ?? '#00000073'} onChange={(v) => updateConfig({ textShadowColor: v })} />
                <SliderRow label="Blur" value={safeConfig.textShadowBlur ?? 6} min={0} max={40} onChange={(v) => updateConfig({ textShadowBlur: v })} unit="px" />
                <SliderRow label="Spread" value={safeConfig.textShadowSpread ?? 0} min={0} max={40} onChange={(v) => updateConfig({ textShadowSpread: v })} unit="px" />
                <SliderRow label="Offset X" value={safeConfig.textShadowOffsetX ?? 0} min={-40} max={40} onChange={(v) => updateConfig({ textShadowOffsetX: v })} unit="px" />
                <SliderRow label="Offset Y" value={safeConfig.textShadowOffsetY ?? 3} min={-40} max={40} onChange={(v) => updateConfig({ textShadowOffsetY: v })} unit="px" />
              </div>
            )}
          </Section>

          <Section title="Subtitle" defaultOpen={false}>
            <TextRow label="Text" value={safeConfig.secondaryText} placeholder="v1.0" onChange={(v) => setSubtitleText(v)} />
            <ToggleRow label="Same subtitle on all variants" value={safeConfig.secondaryTextShared ?? false} onChange={toggleSubtitleShared} />
            <FontSelect label="Font" value={safeConfig.secondaryFontFamily} onChange={(v) => updateConfig({ secondaryFontFamily: v })} />
            <WeightSelect label="Weight" value={safeConfig.secondaryFontWeight} onChange={(v) => updateConfig({ secondaryFontWeight: v })} />
            <div className="flex items-center gap-2 py-1.5 min-w-0">
              <label className="text-xs text-muted w-20 min-w-[5rem] shrink-0">Style</label>
              <div className="flex gap-1">
                <button
                  onClick={() => updateConfig({ secondaryFontItalic: !(safeConfig.secondaryFontItalic ?? false) })}
                  title="Italic"
                  className={`w-8 h-7 rounded text-xs font-medium italic transition-colors ${(safeConfig.secondaryFontItalic ?? false) ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}
                >I</button>
                <button
                  onClick={() => updateConfig({ secondaryFontUnderline: !(safeConfig.secondaryFontUnderline ?? false) })}
                  title="Underline"
                  className={`w-8 h-7 rounded text-xs font-medium underline transition-colors ${(safeConfig.secondaryFontUnderline ?? false) ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}
                >U</button>
              </div>
            </div>
            <SliderRow label="Size" value={safeConfig.secondaryFontSize} min={8} max={80} onChange={(v) => updateConfig({ secondaryFontSize: v })} unit="px" />
            <SliderRow label="Text spacing" value={safeConfig.secondaryLetterSpacing ?? 0} min={-10} max={40} onChange={(v) => updateConfig({ secondaryLetterSpacing: v })} unit="px" />
            <ColorRow label="Color" value={safeConfig.secondaryTextColor} onChange={(v) => updateConfig({ secondaryTextColor: v })} />
            <SliderRow label="Gap" value={safeConfig.titleSubtitleGap ?? 4} min={0} max={48} onChange={(v) => updateConfig({ titleSubtitleGap: v })} unit="px" />
          </Section>

          <Section title="Icon">
            {/* Linked toggle + copy from favicon */}
            <div className="flex items-center justify-between gap-2 py-1.5 flex-wrap">
              <span className="text-xs text-muted">Custom icon</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={copyIconFromFavicon}
                  disabled={!matchingFaviconVariant}
                  title="Copy favicon with the exact same variant name into this logo (works when unsynced)"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-surface3 text-muted hover:text-text border border-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowDownToLine size={10} /> From favicon
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (safeConfig.iconLinked) {
                      unlinkFromFavicon()
                      return
                    }
                    if (isShowingFrozenSync) {
                      updateConfig({
                        iconSyncBroken: false,
                        syncedIconSnapshot: null
                      })
                      return
                    }
                    if (!canSyncWithFavicon || !matchingFaviconVariant) return
                    // Re-sync: refresh syncedIcon from favicon; leave custom icon alone.
                    updateConfig({
                      iconLinked: true,
                      iconSyncBroken: false,
                      syncedIconSnapshot: null,
                      syncedIcon: faviconContentToIconConfig(
                        matchingFaviconVariant.config.content,
                        safeConfig.icon,
                        matchingFaviconVariant.config
                      )
                    })
                  }}
                  disabled={!safeConfig.iconLinked && !isShowingFrozenSync && !canSyncWithFavicon}
                  title={
                    safeConfig.iconLinked
                      ? 'Unlink — use a custom logo icon'
                      : isShowingFrozenSync
                        ? 'Return to the original logo icon'
                      : canSyncWithFavicon
                        ? `Sync with favicon “${matchingFaviconVariant!.label}” (exact name match)`
                        : 'Needs a favicon variant with the exact same name'
                  }
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    isSyncedWithFavicon || isShowingFrozenSync
                      ? 'bg-accent/15 text-accent border border-accent/30'
                      : 'bg-surface3 text-muted hover:text-text border border-border'
                  }`}
                >
                  {isSyncedWithFavicon
                    ? <><Link size={10} /> Synced with favicon</>
                    : isShowingFrozenSync
                      ? <><Unlink size={10} /> Frozen favicon</>
                      : <><Unlink size={10} /> Custom</>}
                </button>
              </div>
            </div>

            <ToggleRow label="Visible" value={safeConfig.icon.visible} onChange={(v) => setIcon({ visible: v })} />

            {(isSyncedWithFavicon || isShowingFrozenSync) && safeConfig.icon.visible && (
              <SelectRow
                label="Icon source"
                value={faviconContent?.type ?? contentTypeFromIcon(effectiveIcon ?? safeConfig.icon)}
                options={FAVICON_CONTENT_TYPE_OPTIONS}
                onChange={() => {}}
                disabled
              />
            )}

            {!isSyncedWithFavicon && !isShowingFrozenSync && safeConfig.icon.visible && (
              <>
                <SelectRow
                  label="Icon source"
                  value={contentTypeFromIcon(safeConfig.icon)}
                  options={FAVICON_CONTENT_TYPE_OPTIONS}
                  onChange={(v) =>
                    setIcon(
                      iconPatchForContentType(
                        v as ContentType,
                        safeConfig.icon,
                        matchingFaviconVariant?.config.content
                      )
                    )
                  }
                />

                {contentTypeFromIcon(safeConfig.icon) === 'shape' && (
                  <>
                    <ShapeGrid label="Shape" value={safeConfig.icon.shape} onChange={(v) => setIcon({ shape: v })} includeNone />
                    <SliderRow label="Size %" value={Math.round((safeConfig.icon.shapeSizeRatio ?? 1.0) * 100)} min={10} max={100} onChange={(v) => setIcon({ shapeSizeRatio: v / 100 })} unit="%" />
                    {safeConfig.icon.shape === 'square' && (
                      <NumberInputRow
                        label="Border radius"
                        value={safeConfig.icon.shapeBorderRadius ?? 0}
                        min={0}
                        unit="px"
                        onChange={(v) => setIcon({ shapeBorderRadius: v })}
                      />
                    )}
                  </>
                )}
                {contentTypeFromIcon(safeConfig.icon) === 'letters' && (
                  <>
                    <TextRow label="Text" value={safeConfig.icon.text ?? ''} placeholder="A" onChange={(v) => setIcon({ text: v })} />
                    <FontSelect label="Font" value={safeConfig.icon.fontFamily ?? 'Inter'} onChange={(v) => setIcon({ fontFamily: v })} />
                    <WeightSelect label="Weight" value={safeConfig.icon.fontWeight ?? '700'} onChange={(v) => setIcon({ fontWeight: v })} />
                    <div className="flex items-center gap-2 py-1.5 min-w-0">
                      <label className="text-xs text-muted w-20 min-w-[5rem] shrink-0">Style</label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setIcon({ fontItalic: !(safeConfig.icon.fontItalic ?? false) })}
                          title="Italic"
                          className={`w-8 h-7 rounded text-xs font-medium italic transition-colors ${(safeConfig.icon.fontItalic ?? false) ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}
                        >I</button>
                        <button
                          onClick={() => setIcon({ fontUnderline: !(safeConfig.icon.fontUnderline ?? false) })}
                          title="Underline"
                          className={`w-8 h-7 rounded text-xs font-medium underline transition-colors ${(safeConfig.icon.fontUnderline ?? false) ? 'bg-accent text-white' : 'bg-surface3 text-muted hover:text-text'}`}
                        >U</button>
                      </div>
                    </div>
                    <SliderRow label="Size %" value={Math.round((safeConfig.icon.fontSizeRatio ?? 0.52) * 100)} min={20} max={90} onChange={(v) => setIcon({ fontSizeRatio: v / 100 })} unit="%" />
                    <SliderRow label="Text spacing" value={safeConfig.icon.letterSpacing ?? 0} min={-10} max={40} onChange={(v) => setIcon({ letterSpacing: v })} unit="px" />
                    <ColorRow label="Color" value={safeConfig.icon.textColor ?? '#ffffff'} onChange={(v) => setIcon({ textColor: v })} />
                  </>
                )}
                {contentTypeFromIcon(safeConfig.icon) === 'lucide' && (
                  <>
                    <div className="py-1.5">
                      <IconPicker
                        value={safeConfig.icon}
                        onChange={(patch) => {
                          if (patch.svgMarkup !== undefined) {
                            patch = { ...patch, svgMarkupUseOriginalColors: hasMultipleColors(patch.svgMarkup ?? '') }
                          }
                          setIcon(patch)
                        }}
                        onOpenSettings={onOpenSettings}
                        tabs={['library', 'browse', 'ai']}
                      />
                    </div>
                    <SliderRow label="Size %" value={Math.round((safeConfig.icon.lucideSizeRatio ?? 1.0) * 100)} min={10} max={100} onChange={(v) => setIcon({ lucideSizeRatio: v / 100 })} unit="%" />
                  </>
                )}
                {contentTypeFromIcon(safeConfig.icon) === 'svg-markup' && (
                  <>
                    <div className="py-1.5">
                      <IconPicker
                        value={safeConfig.icon}
                        onChange={(patch) => {
                          if (patch.svgMarkup !== undefined) {
                            patch = { ...patch, svgMarkupUseOriginalColors: hasMultipleColors(patch.svgMarkup ?? '') }
                          }
                          setIcon(patch)
                        }}
                        onOpenSettings={onOpenSettings}
                        tabs={['browse', 'svg', 'ai']}
                      />
                    </div>
                    <SliderRow label="Size %" value={Math.round((safeConfig.icon.svgMarkupSizeRatio ?? 1.0) * 100)} min={10} max={100} onChange={(v) => setIcon({ svgMarkupSizeRatio: v / 100 })} unit="%" />
                  </>
                )}
                {contentTypeFromIcon(safeConfig.icon) === 'svg' && (
                  <>
                    <div className="py-1.5">
                      <TextareaRow
                        label="SVG path"
                        value={unwrapSvgPath(safeConfig.icon.svgMarkup ?? '')}
                        placeholder="M 0 0 L 100 0..."
                        onChange={(v) =>
                          setIcon({
                            svgMarkup: wrapSvgPath(v, safeConfig.icon.primaryColor ?? '#ffffff')
                          })
                        }
                      />
                    </div>
                    <ColorRow
                      label="Color"
                      value={safeConfig.icon.primaryColor ?? '#ffffff'}
                      onChange={(v) =>
                        setIcon({
                          primaryColor: v,
                          svgMarkup: wrapSvgPath(
                            unwrapSvgPath(safeConfig.icon.svgMarkup ?? ''),
                            v
                          )
                        })
                      }
                    />
                  </>
                )}
                {contentTypeFromIcon(safeConfig.icon) === 'image' && (
                  <>
                    <IconImageUpload
                      imageDataUrl={safeConfig.icon.imageDataUrl ?? ''}
                      imageSizeRatio={safeConfig.icon.imageSizeRatio ?? 0.8}
                      onImageChange={async (v) => {
                        const gen = ++imageChangeGen.current
                        if (!v) {
                          setIcon(clearIconUploadedImage(safeConfig.icon))
                          return
                        }
                        const paletteFields = await recolorFieldsAfterImageChange(v, safeConfig.icon)
                        if (gen !== imageChangeGen.current) return
                        setIcon({ imageDataUrl: v, ...paletteFields })
                      }}
                      onSizeChange={(v) => setIcon({ imageSizeRatio: v })}
                    />
                    <ImageRecolorControls
                      imageDataUrl={safeConfig.icon.imageDataUrl ?? ''}
                      imageUseOriginalColors={safeConfig.icon.imageUseOriginalColors ?? true}
                      imagePalette={safeConfig.icon.imagePalette ?? []}
                      imageColor1={safeConfig.icon.imageColor1}
                      imageColor2={safeConfig.icon.imageColor2}
                      imageColor3={safeConfig.icon.imageColor3}
                      imageColor4={safeConfig.icon.imageColor4}
                      imageColor5={safeConfig.icon.imageColor5}
                      onChange={(patch) => setIcon(patch)}
                    />
                  </>
                )}

                {contentTypeFromIcon(safeConfig.icon) === 'canva' && (
                  <p className="text-[10px] text-muted leading-snug py-1">
                    Canva prompts are configured on the matching Favicon variant. Use{' '}
                    <span className="text-text">From favicon</span> or sync to mirror that workflow.
                  </p>
                )}

                {(() => {
                  const ct = contentTypeFromIcon(safeConfig.icon)
                  if (['letters', 'image', 'canva', 'svg'].includes(ct)) return null
                  return (
                  <>
                    {ct === 'svg-markup' && (
                      <ToggleRow
                        label="Original colors"
                        value={safeConfig.icon.svgMarkupUseOriginalColors ?? false}
                        onChange={(v) => setIcon({ svgMarkupUseOriginalColors: v })}
                      />
                    )}
                    {!(ct === 'svg-markup' && (safeConfig.icon.svgMarkupUseOriginalColors ?? false)) && (
                      <>
                        <ColorRow
                          label={ct === 'svg-markup' ? 'Color 1' : 'Color'}
                          value={safeConfig.icon.primaryColor}
                          onChange={(v) => setIcon({ primaryColor: v })}
                        />
                        {ct === 'svg-markup' && (
                          <>
                            <ColorRow
                              label="Color 2"
                              value={safeConfig.icon.svgMarkupSecondaryColor || safeConfig.icon.primaryColor}
                              onChange={(v) => setIcon({ svgMarkupSecondaryColor: v === safeConfig.icon.primaryColor ? '' : v })}
                            />
                            <ColorRow
                              label="Color 3"
                              value={safeConfig.icon.svgMarkupTertiaryColor || safeConfig.icon.primaryColor}
                              onChange={(v) => setIcon({ svgMarkupTertiaryColor: v === safeConfig.icon.primaryColor ? '' : v })}
                            />
                            <ColorRow
                              label="Color 4"
                              value={safeConfig.icon.svgMarkupColor4 || safeConfig.icon.primaryColor}
                              onChange={(v) => setIcon({ svgMarkupColor4: v === safeConfig.icon.primaryColor ? '' : v })}
                            />
                            <ColorRow
                              label="Color 5"
                              value={safeConfig.icon.svgMarkupColor5 || safeConfig.icon.primaryColor}
                              onChange={(v) => setIcon({ svgMarkupColor5: v === safeConfig.icon.primaryColor ? '' : v })}
                            />
                          </>
                        )}
                      </>
                    )}
                  </>
                  )
                })()}
                {contentTypeFromIcon(safeConfig.icon) === 'shape' && (
                  <ColorRow label="Accent" value={safeConfig.icon.secondaryColor} onChange={(v) => setIcon({ secondaryColor: v })} />
                )}

                {contentTypeFromIcon(safeConfig.icon) !== 'canva' && (
                  <>
                    <SliderRow label="Offset X" value={safeConfig.icon.offsetX ?? 0} min={-80} max={80} onChange={(v) => setIcon({ offsetX: v })} unit="px" />
                    <SliderRow label="Offset Y" value={safeConfig.icon.offsetY ?? 0} min={-80} max={80} onChange={(v) => setIcon({ offsetY: v })} unit="px" />
                    <ColorRow label="Border" value={(safeConfig.icon.contentBorderColor ?? 'transparent') === 'transparent' ? '#000000' : (safeConfig.icon.contentBorderColor ?? '#000000')} onChange={(v) => setIcon({ contentBorderColor: v })} />
                    <SliderRow label="Border width" value={safeConfig.icon.contentBorderWidth ?? 0} min={0} max={20} onChange={(v) => setIcon({ contentBorderWidth: v, contentBorderColor: v > 0 && (safeConfig.icon.contentBorderColor ?? 'transparent') === 'transparent' ? '#000000' : (safeConfig.icon.contentBorderColor ?? 'transparent') })} unit="px" />
                    <ToggleRow label="Shadow" value={safeConfig.icon.contentShadowEnabled ?? false} onChange={(v) => setIcon({ contentShadowEnabled: v })} />
                    {(safeConfig.icon.contentShadowEnabled ?? false) && (
                      <>
                        <div className="flex items-center gap-2 py-1.5 min-w-0">
                          <label className="text-xs text-muted w-20 min-w-[5rem] shrink-0">Position</label>
                          <div className="flex flex-1 min-w-0 gap-1">
                            {(['outline', 'inset'] as const).map((pos) => (
                              <button
                                key={pos}
                                onClick={() => setIcon({ contentShadowInset: pos === 'inset' })}
                                className={`flex-1 py-1 rounded text-[10px] font-medium capitalize transition-colors ${
                                  (safeConfig.icon.contentShadowInset ?? false) === (pos === 'inset')
                                    ? 'bg-accent text-white'
                                    : 'bg-surface3 text-muted hover:text-text'
                                }`}
                              >
                                {pos}
                              </button>
                            ))}
                          </div>
                        </div>
                        <ColorRow solidOnly label="Shadow color" value={safeConfig.icon.contentShadowColor ?? '#00000080'} onChange={(v) => setIcon({ contentShadowColor: v })} />
                        <SliderRow label="Blur" value={safeConfig.icon.contentShadowBlur ?? 8} min={0} max={40} onChange={(v) => setIcon({ contentShadowBlur: v })} unit="px" />
                        <SliderRow label="Spread" value={safeConfig.icon.contentShadowSpread ?? 0} min={0} max={40} onChange={(v) => setIcon({ contentShadowSpread: v })} unit="px" />
                        <SliderRow label="Offset X" value={safeConfig.icon.contentShadowOffsetX ?? 0} min={-30} max={30} onChange={(v) => setIcon({ contentShadowOffsetX: v })} unit="px" />
                        <SliderRow label="Offset Y" value={safeConfig.icon.contentShadowOffsetY ?? 3} min={-30} max={30} onChange={(v) => setIcon({ contentShadowOffsetY: v })} unit="px" />
                      </>
                    )}
                  </>
                )}

                {/* Container / outer shape */}
                {(() => {
                  const icon = safeConfig.icon
                  const containerCat: OuterShapeCategory =
                    !icon.containerEnabled || icon.containerShape === 'none'
                      ? 'none'
                      : (icon.containerType ?? 'color') === 'image'
                        ? 'image'
                        : (icon.containerType ?? 'color') === 'svg'
                          ? 'svg'
                          : 'shapes'
                  const setContainerCat = (cat: OuterShapeCategory) => {
                    if (cat === 'none') {
                      setIcon({ containerEnabled: false, containerShape: 'none' })
                      return
                    }
                    if (cat === 'image') {
                      setIcon({
                        containerEnabled: true,
                        containerType: 'image',
                        containerShape: icon.containerShape === 'none' ? 'square' : icon.containerShape
                      })
                      return
                    }
                    if (cat === 'svg') {
                      setIcon({
                        containerEnabled: true,
                        containerType: 'svg',
                        containerShape: icon.containerShape === 'none' ? 'square' : icon.containerShape
                      })
                      return
                    }
                    setIcon({
                      containerEnabled: true,
                      containerType: 'color',
                      containerShape: icon.containerShape === 'none' ? 'square' : icon.containerShape
                    })
                  }
                  return (
                    <>
                      <p className="text-xs text-muted mb-1 pt-1">Outer shape</p>
                      <OuterCategoryTabs value={containerCat} onChange={setContainerCat} />
                      {containerCat === 'shapes' && (
                        <>
                          <ShapeGrid
                            label=""
                            value={icon.containerShape === 'none' ? 'square' : (icon.containerShape ?? 'square')}
                            onChange={(v) => setIcon({ containerShape: v, containerEnabled: true, containerType: 'color' })}
                          />
                          <ColorRow
                            label="Fill color"
                            value={icon.containerColor ?? '#6366f1'}
                            onChange={(v) => setIcon({ containerColor: v })}
                          />
                        </>
                      )}
                      {containerCat === 'image' && (
                        <ContainerImageUpload
                          imageDataUrl={icon.containerImageDataUrl ?? ''}
                          onChange={(url) => setIcon({ containerImageDataUrl: url })}
                        />
                      )}
                      {containerCat === 'svg' && (
                        <TextareaRow
                          label="SVG markup"
                          value={icon.containerSvgMarkup ?? ''}
                          placeholder="<svg ...>...</svg>"
                          onChange={(v) => setIcon({ containerSvgMarkup: v })}
                        />
                      )}
                      {containerCat !== 'none' && (
                        <>
                          <SliderRow
                            label="Padding"
                            value={Math.round((icon.containerPadding ?? 0.18) * 100)}
                            min={0}
                            max={40}
                            onChange={(v) => setIcon({ containerPadding: v / 100 })}
                            unit="%"
                          />
                          <ColorRow
                            label="Border"
                            value={(icon.containerBorderColor ?? 'transparent') === 'transparent' ? '#000000' : (icon.containerBorderColor ?? '#000000')}
                            onChange={(v) => setIcon({ containerBorderColor: v })}
                          />
                          <SliderRow
                            label="Border width"
                            value={icon.containerBorderWidth ?? 0}
                            min={0}
                            max={24}
                            onChange={(v) => setIcon({
                              containerBorderWidth: v,
                              containerBorderColor: v > 0 && (icon.containerBorderColor ?? 'transparent') === 'transparent'
                                ? '#000000'
                                : (icon.containerBorderColor ?? 'transparent')
                            })}
                            unit="px"
                          />
                          {(['square', 'rounded'].includes(icon.containerShape ?? 'square')) && (
                            <NumberInputRow
                              label="Border radius"
                              value={icon.containerBorderRadius ?? 0}
                              min={0}
                              unit="px"
                              onChange={(v) => setIcon({ containerBorderRadius: v })}
                            />
                          )}
                        </>
                      )}
                    </>
                  )
                })()}
              </>
            )}

            <SliderRow label="Size" value={safeConfig.icon.size} min={16} max={256} onChange={(v) => setIcon({ size: v })} unit="px" />

            {!isSyncedWithFavicon && (
              <>
                <ToggleRow label="Container shadow" value={safeConfig.icon.shadowEnabled ?? false} onChange={(v) => setIcon({ shadowEnabled: v })} />
                {safeConfig.icon.shadowEnabled && (
                  <>
                    <ColorRow solidOnly label="Shadow color" value={safeConfig.icon.shadowColor ?? '#00000073'} onChange={(v) => setIcon({ shadowColor: v })} />
                    <SliderRow label="Blur" value={safeConfig.icon.shadowBlur ?? 8} min={0} max={40} onChange={(v) => setIcon({ shadowBlur: v })} unit="px" />
                    <SliderRow label="Spread" value={safeConfig.icon.shadowSpread ?? 0} min={0} max={40} onChange={(v) => setIcon({ shadowSpread: v })} unit="px" />
                    <SliderRow label="Offset X" value={safeConfig.icon.shadowOffsetX ?? 0} min={-20} max={20} onChange={(v) => setIcon({ shadowOffsetX: v })} unit="px" />
                    <SliderRow label="Offset Y" value={safeConfig.icon.shadowOffsetY ?? 4} min={-20} max={20} onChange={(v) => setIcon({ shadowOffsetY: v })} unit="px" />
                  </>
                )}
              </>
            )}

            <SliderRow label="Gap" value={safeConfig.gap} min={0} max={64} onChange={(v) => updateConfig({ gap: v })} unit="px" />
          </Section>

          <Section title="Canvas" defaultOpen={false}>
            {/* Layout picker */}
            <div className="flex items-center py-1.5">
              <span className="text-xs text-muted w-20 shrink-0">Layout</span>
              <div className="flex gap-1">
                {([
                  { value: 'icon-left',  title: 'Icon left, text right',
                    icon: (
                      <svg width="28" height="18" viewBox="0 0 28 18" fill="none">
                        <rect x="1" y="3" width="12" height="12" rx="2" fill="currentColor" opacity="0.9"/>
                        <rect x="16" y="5" width="10" height="2.5" rx="1" fill="currentColor" opacity="0.7"/>
                        <rect x="16" y="10" width="7" height="2" rx="1" fill="currentColor" opacity="0.45"/>
                      </svg>
                    )},
                  { value: 'icon-right', title: 'Text left, icon right',
                    icon: (
                      <svg width="28" height="18" viewBox="0 0 28 18" fill="none">
                        <rect x="2" y="5" width="10" height="2.5" rx="1" fill="currentColor" opacity="0.7"/>
                        <rect x="2" y="10" width="7" height="2" rx="1" fill="currentColor" opacity="0.45"/>
                        <rect x="15" y="3" width="12" height="12" rx="2" fill="currentColor" opacity="0.9"/>
                      </svg>
                    )},
                  { value: 'icon-top',   title: 'Icon top, text bottom',
                    icon: (
                      <svg width="18" height="28" viewBox="0 0 18 28" fill="none">
                        <rect x="3" y="1" width="12" height="12" rx="2" fill="currentColor" opacity="0.9"/>
                        <rect x="1" y="16" width="16" height="2.5" rx="1" fill="currentColor" opacity="0.7"/>
                        <rect x="3" y="21" width="12" height="2" rx="1" fill="currentColor" opacity="0.45"/>
                      </svg>
                    )},
                ] as { value: LogoLayout; title: string; icon: React.ReactNode }[]).map(({ value, title, icon }) => {
                  const active = (safeConfig.layout ?? 'icon-left') === value
                  return (
                    <button
                      key={value}
                      title={title}
                      onClick={() => updateConfig({ layout: value })}
                      className={`flex items-center justify-center w-10 h-9 rounded border transition-colors ${
                        active
                          ? 'bg-accent/20 border-accent text-accent'
                          : 'border-border text-muted hover:text-text hover:border-border2'
                      }`}
                    >
                      {icon}
                    </button>
                  )
                })}
              </div>
            </div>

            <ToggleRow label="Transparent" value={safeConfig.transparentBg} onChange={(v) => updateConfig({ transparentBg: v })} />
            {!safeConfig.transparentBg && (
              <ColorRow label="Background" value={safeConfig.backgroundColor} onChange={(v) => updateConfig({ backgroundColor: v })} />
            )}
            <SliderRow label="Padding" value={safeConfig.padding} min={0} max={80} onChange={(v) => updateConfig({ padding: v })} unit="px" />
          </Section>
        </div>
      </div>
    </div>
    </TransparentFillModeContext.Provider>
  )
}

interface ExportButtonProps {
  label: string; icon: React.ReactNode; loading: boolean; done: boolean; onClick: () => void
}
function ExportButton({ label, icon, loading, done, onClick }: ExportButtonProps): JSX.Element {
  return (
    <button onClick={onClick} disabled={loading || done}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${done ? 'bg-success/20 text-success' : 'bg-surface2 hover:bg-surface3 text-text-dim hover:text-text border border-border'} disabled:cursor-not-allowed`}
    >
      {loading ? <RefreshCw size={12} className="animate-spin" /> : done ? <CheckCircle2 size={12} /> : <Download size={12} />}
      {icon}{label}
    </button>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Convert favicon content config → IconConfig so the logo can mirror the favicon design. */
// SVG markup for complex favicon outer shapes that have no equivalent ShapeType.
// Color is applied at runtime by injecting a fill attribute.
const COMPLEX_OUTER_SHAPE_SVGS: Partial<Record<string, string>> = {
  'map-pin': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="5 2 14 20"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>`,
  shield:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 2 16 20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  badge:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="2 2 20 20"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/></svg>`,
}

// SVG path data (viewBox 0 0 24 24) for Path2D border rendering — mirrors
// OUTER_SHAPE_BORDER_PATHS in renderer.ts so drawIcon can use the same
// clip-and-double technique as the favicon renderer.
const COMPLEX_OUTER_SHAPE_BORDER_PATHS: Partial<Record<string, string>> = {
  'map-pin': `M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z`,
  shield:    `M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z`,
  badge:     `M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z`,
}

// Y offset as a fraction of the logo icon size so the content centre aligns
// with the visual centre of the shape's inner area (not the bounding-box centre).
const COMPLEX_SHAPE_Y_OFFSET_RATIO: Record<string, number> = {
  'map-pin': -0.15,  // circular head sits at ~35% of bounding-box height
  'shield':  -0.025, // shield centre sits at ~47.5% of bounding-box height
  'badge':    0,     // badge is symmetric, centre at 50%
}

/** Icon actually shown in preview / paint open / unsynced paint save for one logo variant. */
export function resolveLogoEffectiveIcon(
  config: LogoConfig,
  faviconContent: FaviconContent | undefined,
  faviconCfg: FaviconConfig | undefined,
  canSyncWithFavicon: boolean
): IconConfig {
  if ((config.iconLinked ?? true) && canSyncWithFavicon && faviconContent) {
    return faviconContentToIconConfig(faviconContent, config.icon, faviconCfg)
  }
  if (
    !config.iconLinked &&
    config.iconSyncBroken &&
    config.syncedIconSnapshot
  ) {
    return config.syncedIconSnapshot
  }
  // Custom mode: always render the editable `icon` field (setIcon / From favicon /
  // paint save). Stale `syncedIcon` mirrors must not override live edits.
  return config.icon
}

export function faviconContentToIconConfig(content: FaviconContent, base: IconConfig, faviconCfg?: FaviconConfig): IconConfig {
  const renderType = resolveFaviconDrawType(content)
  const sourceMap: Record<string, IconConfig['sourceType']> = {
    letters: 'letters',
    shape: 'shape',
    lucide: 'lucide',
    'svg-markup': 'svg',
    svg: 'svg',
    image: 'image',
    canva: 'letters'
  }

  const outerShape = faviconCfg?.outerShape ?? 'rounded'
  const isComplexSvgShape = outerShape in COMPLEX_OUTER_SHAPE_SVGS

  // Map favicon outer shape → container shape for the logo icon.
  // Complex SVG shapes (map-pin / shield / badge) use 'square' as the bounding
  // clip so the full SVG (including tail for map-pin) is always visible.
  const containerShapeMap: Record<string, ShapeType> = {
    rounded: 'rounded', circle: 'circle', square: 'square',
    triangle: 'triangle', diamond: 'diamond', pentagon: 'pentagon',
    hexagon: 'hexagon', star: 'star',
    badge: 'square', 'map-pin': 'square', shield: 'square',
    image: 'square', 'svg-markup': 'square',
    none: 'none'
  }
  const containerShape: ShapeType = containerShapeMap[outerShape] ?? 'rounded'

  // Derive container fill type and SVG markup from the favicon outer shape.
  let containerType: 'color' | 'image' | 'svg' = 'color'
  let containerImageDataUrl = base.containerImageDataUrl ?? ''
  let containerSvgMarkup = base.containerSvgMarkup ?? ''
  if (faviconCfg) {
    if (outerShape === 'image') {
      containerType = 'image'
      containerImageDataUrl = faviconCfg.outerShapeImageDataUrl ?? ''
    } else if (outerShape === 'svg-markup') {
      containerType = 'svg'
      containerSvgMarkup = faviconCfg.outerShapeSvgMarkup ?? ''
    } else if (isComplexSvgShape) {
      // Render the complex shape using its SVG path, colored with the favicon bg.
      containerType = 'svg'
      const fillColor = faviconCfg.transparentBg ? 'transparent' : (faviconCfg.backgroundColor ?? '#6366f1')
      const tmpl = COMPLEX_OUTER_SHAPE_SVGS[outerShape]!
      // Inject fill color into the SVG root element before the first child element
      containerSvgMarkup = tmpl.replace(/>(?=<path|<polygon)/, ` fill="${fillColor}">`)
    } else {
      containerType = 'color'
    }
  }

  // Favicon drawFaviconContent shadow values are raw pixels on a ~256px favicon canvas.
  // drawIcon multiplies them by dprScale (= icon.size * dpr / icon.size = dpr), so
  // the same raw value maps to a much larger relative shadow on the smaller icon canvas.
  // Scale shadow down by (icon.size / favSize) so the apparent size matches.
  const favSize = faviconCfg?.size ?? 256
  const shadowScale = base.size / favSize

  // Offset values are raw favicon pixels — apply the same scale factor.
  const rawOffsetX = (content.offsetX ?? 0) * shadowScale
  const rawOffsetY = (content.offsetY ?? 0) * shadowScale
  const contentOffsetX = Math.round(rawOffsetX)

  // For complex shapes the visual content centre doesn't sit at 50% of the
  // bounding box. Apply a per-shape Y nudge so the logo matches the favicon.
  const shapeYOffsetRatio = isComplexSvgShape
    ? (COMPLEX_SHAPE_Y_OFFSET_RATIO[outerShape] ?? 0)
    : 0
  const contentOffsetY = Math.round(shapeYOffsetRatio * base.size) + Math.round(rawOffsetY)

  // Size ratios map 1:1 onto the logo icon. Favicon content is drawn against the
  // full canvas (or full complex-shape canvas), so we also zero containerPadding
  // when synced — otherwise the old padScale (= 1/(1-2*pad)) amplified sizes and
  // anything above ~64% favicon size already overflowed and got clipped.
  // With padding 0, favicon 100% = logo content fills the icon edge-to-edge.

  return {
    ...base,
    sourceType: (sourceMap[renderType] ?? 'shape') as IconConfig['sourceType'],
    canvaMode: content.type === 'canva',
    shape: content.shape,
    primaryColor: renderType === 'lucide' ? content.lucideColor
      : renderType === 'svg-markup' ? content.lucideColor
      : renderType === 'svg' ? content.svgColor
      : renderType === 'shape' ? content.shapeColor
      : renderType === 'letters' ? content.textColor
      : base.primaryColor,
    lucideIconName: content.lucideIconName,
    lucideStrokeWidth: content.lucideStrokeWidth,
    lucideSizeRatio: content.lucideSizeRatio ?? 0.6,
    svgMarkup: renderType === 'svg-markup' ? content.svgMarkup
      : renderType === 'svg'
        ? wrapSvgPath(content.svgPath ?? '', content.svgColor ?? base.primaryColor ?? '#ffffff')
        : base.svgMarkup,
    svgMarkupSizeRatio: content.svgMarkupSizeRatio ?? 0.7,
    svgMarkupUseOriginalColors: content.svgMarkupUseOriginalColors ?? false,
    svgMarkupSecondaryColor: content.svgMarkupSecondaryColor ?? '',
    svgMarkupTertiaryColor: content.svgMarkupTertiaryColor ?? '',
    svgMarkupColor4: content.svgMarkupColor4 ?? '',
    svgMarkupColor5: content.svgMarkupColor5 ?? '',
    shapeSizeRatio: content.shapeSizeRatio ?? 0.5,
    shapeBorderRadius: Math.round((content.shapeBorderRadius ?? 0) * base.size / 256),
    text: content.text,
    textColor: content.textColor,
    fontFamily: content.fontFamily,
    fontWeight: content.fontWeight,
    fontItalic: content.fontItalic ?? false,
    fontUnderline: content.fontUnderline ?? false,
    fontSizeRatio: content.fontSizeRatio,
    letterSpacing: content.letterSpacing ?? 0,
    imageDataUrl: content.imageDataUrl ?? '',
    imageSizeRatio: content.imageSizeRatio ?? 0.8,
    imageUseOriginalColors: content.imageUseOriginalColors ?? true,
    imagePalette: content.imagePalette ?? [],
    imageColor1: content.imageColor1 ?? '',
    imageColor2: content.imageColor2 ?? '',
    imageColor3: content.imageColor3 ?? '',
    imageColor4: content.imageColor4 ?? '',
    imageColor5: content.imageColor5 ?? '',
    // Offset: carry favicon inner content offset into logo icon offset
    offsetX: contentOffsetX,
    offsetY: contentOffsetY,
    containerEnabled: faviconCfg ? (outerShape !== 'none') : base.containerEnabled,
    containerShape,
    containerType,
    containerColor: faviconCfg?.backgroundColor ?? base.containerColor,
    containerImageDataUrl,
    containerSvgMarkup,
    containerPadding: 0,
    containerBorderColor: faviconCfg?.borderColor ?? base.containerBorderColor ?? 'transparent',
    containerBorderWidth: faviconCfg
      ? (faviconCfg.borderWidth ?? 0) * shadowScale
      : (base.containerBorderWidth ?? 0),
    containerBorderRadius: faviconCfg
      ? (isComplexSvgShape ? 0 : Math.round((faviconCfg.borderRadius ?? 0) * base.size / 256))
      : (base.containerBorderRadius ?? 0),
    // Supply the SVG path so drawIcon can use Path2D clip-and-double border
    // (matching how the favicon renderer draws borders for these shapes).
    containerSvgBorderPath: isComplexSvgShape
      ? (COMPLEX_OUTER_SHAPE_BORDER_PATHS[outerShape] ?? undefined)
      : undefined,
    shadowEnabled: faviconCfg?.shadowEnabled ?? base.shadowEnabled,
    shadowColor: faviconCfg?.shadowColor ?? base.shadowColor,
    // Outer shadow values are in "256px favicon pixels". drawIcon multiplies them
    // by dprScale = renderSize / icon.size, so they must be pre-scaled to
    // icon.size units here — otherwise the logo shadow is proportionally far
    // larger than the favicon shadow (e.g. ×2 at dpr=2 for an 80px icon).
    shadowBlur:    (faviconCfg?.shadowBlur    ?? base.shadowBlur    ?? 8) * shadowScale,
    shadowSpread:  (faviconCfg?.shadowSpread  ?? base.shadowSpread  ?? 0) * shadowScale,
    shadowOffsetX: (faviconCfg?.shadowOffsetX ?? base.shadowOffsetX ?? 0) * shadowScale,
    shadowOffsetY: (faviconCfg?.shadowOffsetY ?? base.shadowOffsetY ?? 4) * shadowScale,
    // Sync inner content shadow — scale pixel values to match the smaller icon canvas.
    contentShadowEnabled: content.contentShadowEnabled ?? base.contentShadowEnabled ?? false,
    contentShadowInset: content.contentShadowInset ?? base.contentShadowInset ?? false,
    contentShadowColor: content.contentShadowColor ?? base.contentShadowColor ?? '#00000080',
    contentShadowBlur:    (content.contentShadowBlur    ?? base.contentShadowBlur    ?? 8) * shadowScale,
    contentShadowSpread:  (content.contentShadowSpread  ?? base.contentShadowSpread  ?? 0) * shadowScale,
    contentShadowOffsetX: (content.contentShadowOffsetX ?? base.contentShadowOffsetX ?? 0) * shadowScale,
    contentShadowOffsetY: (content.contentShadowOffsetY ?? base.contentShadowOffsetY ?? 3) * shadowScale,
    contentBorderColor: content.contentBorderColor ?? base.contentBorderColor ?? 'transparent',
    contentBorderWidth: (content.contentBorderWidth ?? base.contentBorderWidth ?? 0) * shadowScale,
    // Paint overlays + added objects from the favicon session (shapes, stamps, text).
    paintSession: faviconCfg?.paintSession ?? base.paintSession ?? null
  }
}

interface IconImageUploadProps {
  imageDataUrl: string
  imageSizeRatio: number
  onImageChange: (v: string) => void
  onSizeChange: (v: number) => void
}

function IconImageUpload({ imageDataUrl, imageSizeRatio, onImageChange, onSizeChange }: IconImageUploadProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const readFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => { if (typeof e.target?.result === 'string') onImageChange(e.target.result) }
    reader.readAsDataURL(file)
  }

  return (
    <div className="py-1.5 space-y-2">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) readFile(e.target.files[0]) }} />
      {imageDataUrl ? (
        <div className="relative group">
          <img src={imageDataUrl} alt="Icon" className="w-full h-16 object-contain rounded-lg bg-surface3 border border-border" />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (fileInputRef.current) fileInputRef.current.value = ''
              onImageChange('')
            }}
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          ><X size={10} /></button>
        </div>
      ) : (
        <div onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-lg border-2 border-dashed border-border hover:border-accent/50 hover:bg-surface3 cursor-pointer transition-colors">
          <Upload size={14} className="text-muted" />
          <p className="text-[10px] text-muted">Click to upload image</p>
        </div>
      )}
      {/* AI image gen hidden — model quality insufficient: <AiImageGenPanel onGenerated={onImageChange} /> */}

      {imageDataUrl && (
        <>
          <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-1.5 py-1 rounded text-[10px] text-muted hover:text-text hover:bg-surface3 border border-dashed border-border transition-colors"><Upload size={10} /> Replace</button>
          <RemoveBgButton imageDataUrl={imageDataUrl} onResult={onImageChange} />
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted w-24 shrink-0">Size %</label>
            <input type="range" min={10} max={100} step={1} value={Math.round(imageSizeRatio * 100)} onChange={(e) => onSizeChange(Number(e.target.value) / 100)} className="flex-1" />
            <span className="text-[10px] text-muted shrink-0">{Math.round(imageSizeRatio * 100)}%</span>
          </div>
        </>
      )}
    </div>
  )
}

interface ContainerImageUploadProps {
  imageDataUrl: string
  onChange: (v: string) => void
}

function ContainerImageUpload({ imageDataUrl, onChange }: ContainerImageUploadProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const readFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => { if (typeof e.target?.result === 'string') onChange(e.target.result) }
    reader.readAsDataURL(file)
  }

  return (
    <div className="py-1.5 space-y-2">
      <input ref={fileInputRef} type="file" accept="image/*,.svg" className="hidden" onChange={(e) => { if (e.target.files?.[0]) readFile(e.target.files[0]) }} />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full py-1.5 rounded border border-dashed border-border text-xs text-muted hover:text-text hover:border-accent transition-colors"
      >
        {imageDataUrl ? 'Replace image / SVG' : 'Upload image / SVG'}
      </button>
      {imageDataUrl && (
        <div className="flex items-center gap-2">
          <img src={imageDataUrl} className="w-10 h-10 rounded object-cover border border-border" />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (fileInputRef.current) fileInputRef.current.value = ''
              onChange('')
            }}
            className="text-xs text-muted hover:text-red-400 transition-colors"
          >Remove</button>
        </div>
      )}
      {imageDataUrl && <RemoveBgButton imageDataUrl={imageDataUrl} onResult={onChange} />}
      {/* AI image gen hidden — model quality insufficient: <AiImageGenPanel onGenerated={onChange} /> */}
    </div>
  )
}
