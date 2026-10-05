/**
 * PreviewStage — pan/zoom “stage” around the preview artwork.
 *
 * Children (usually a canvas) sit inside a div that we CSS-transform:
 *   translate(tx, ty) scale(s)
 *
 * Auto-fit: until the user pans/zooms, we shrink content to ~90% of the view
 * (never scale above 1×). fitNow() writes the transform to the DOM immediately
 * — LogoEditor calls this right after swapping preview buffers so the huge
 * bitmap never flashes at 100% for a frame.
 *
 * Middle-drag = pan. Ctrl+wheel (or right-button+wheel) = zoom toward cursor.
 * Stage background color is preview-only (not exported).
 */
import React, { forwardRef, useRef, useState, useEffect, useCallback, useImperativeHandle } from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'

interface View { scale: number; tx: number; ty: number }

interface PreviewStageProps {
  children: React.ReactNode
  /** Initial stage background (preview-only; does not affect export). Default: black. */
  background?: string
  className?: string
  /** Optional left-button handler for the viewport outside the preview content. */
  onStageMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void
  /** Leftmost controls on the zoom toolbar (e.g. Edit paint). */
  leadingControls?: React.ReactNode
  /**
   * Bump when the child canvas identity changes (version / variant).
   * Forces Chromium to drop a composited snapshot of the previous bitmap.
   */
  surfaceKey?: string | number
}

/** Imperative API for callers that swap canvas size in the same frame. */
export interface PreviewStageHandle {
  /**
   * Recompute fit and write the CSS transform immediately (before paint).
   * Logo previews render at full bitmap size; without a sync fit, one frame
   * shows the unscaled canvas overflowing the stage after a buffer swap.
   */
  fitNow: () => void
}

const ZOOM_MIN = 0.1
const ZOOM_MAX = 12
const DEFAULT_STAGE_BG = '#000000'
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

function toColorInputValue(hex: string): string {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/)
  return m ? `#${m[1]}` : '#000000'
}

function viewTransform(v: View): string {
  return `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`
}

/**
 * A pan + zoom viewport for preview content.
 *  • Middle-click drag pans the view.
 *  • Ctrl + scroll (or right-button + scroll) zooms toward the cursor.
 *  • Controls (bottom-right): stage colour, default/fit, zoom in, zoom out.
 * Auto-fits until the user pans/zooms; Default restores fit.
 * Stage colour is preview-only and does not affect the exported image.
 */
export const PreviewStage = forwardRef<PreviewStageHandle, PreviewStageProps>(function PreviewStage(
  {
    children,
    background = DEFAULT_STAGE_BG,
    className,
    onStageMouseDown,
    leadingControls,
    surfaceKey
  },
  ref
): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 })
  const viewRef = useRef<View>(view)
  const [stageBg, setStageBg] = useState(() => toColorInputValue(background))
  /** Only promote the transform layer while interacting — permanent will-change
   *  caches child <canvas> bitmaps in Chromium so cleared frames stay visible. */
  const [transformHot, setTransformHot] = useState(false)
  const autoFitRef = useRef(true)
  const panning = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  const hotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const applyView = useCallback((next: View) => {
    viewRef.current = next
    const el = contentRef.current
    if (el) el.style.transform = viewTransform(next)
    setView(next)
  }, [])

  const markTransformHot = useCallback(() => {
    setTransformHot(true)
    if (hotTimerRef.current) clearTimeout(hotTimerRef.current)
    hotTimerRef.current = setTimeout(() => {
      hotTimerRef.current = null
      setTransformHot(false)
    }, 180)
  }, [])

  // Fit content to container (capped at 1× so small icons aren't upscaled).
  // Writes transform to the DOM immediately so logo buffer swaps never paint
  // one oversized frame before React state catches up.
  const fit = useCallback(() => {
    const c = containerRef.current
    const el = contentRef.current
    if (!c || !el) return
    // offsetWidth/Height ignore CSS transforms → true natural content size.
    const ew = el.offsetWidth
    const eh = el.offsetHeight
    if (!ew || !eh) return
    const s = clamp(Math.min((c.clientWidth * 0.9) / ew, (c.clientHeight * 0.9) / eh, 1), ZOOM_MIN, ZOOM_MAX)
    applyView({ scale: s, tx: 0, ty: 0 })
  }, [applyView])

  useImperativeHandle(
    ref,
    () => ({
      fitNow: () => {
        if (autoFitRef.current) fit()
      }
    }),
    [fit]
  )

  const resetView = useCallback(() => {
    autoFitRef.current = true
    fit()
  }, [fit])

  // Zoom around a point (mx,my) measured from the container centre.
  const zoomAt = useCallback((factor: number, mx: number, my: number) => {
    autoFitRef.current = false
    markTransformHot()
    const prev = viewRef.current
    const s1 = clamp(prev.scale * factor, ZOOM_MIN, ZOOM_MAX)
    const r = s1 / prev.scale
    applyView({
      scale: s1,
      tx: mx - r * (mx - prev.tx),
      ty: my - r * (my - prev.ty)
    })
  }, [applyView, markTransformHot])

  const zoomButton = useCallback((factor: number) => zoomAt(factor, 0, 0), [zoomAt])

  // Auto-fit on container/content resize until the user interacts.
  useEffect(() => {
    const c = containerRef.current
    const el = contentRef.current
    if (!c || !el) return
    const ro = new ResizeObserver(() => { if (autoFitRef.current) fit() })
    ro.observe(c)
    ro.observe(el)
    fit()
    return () => ro.disconnect()
  }, [fit])

  // Version/variant changes replace child canvas pixels under a CSS transform.
  // Drop layer promotion so Chromium picks up the new bitmap; callers that
  // swap logo canvases should also call fitNow() in the same turn.
  useEffect(() => {
    if (surfaceKey === undefined) return
    setTransformHot(false)
    const el = contentRef.current
    if (!el) return
    const prev = el.style.willChange
    el.style.willChange = 'auto'
    void el.offsetWidth
    el.style.willChange = prev
  }, [surfaceKey])

  // Native non-passive wheel: Ctrl+wheel or right-button+wheel zooms.
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const onWheel = (e: WheelEvent) => {
      const withCtrl = e.ctrlKey || e.metaKey
      const withRight = !!(e.buttons & 2)
      if (!withCtrl && !withRight) return
      e.preventDefault()
      const rect = c.getBoundingClientRect()
      const mx = e.clientX - rect.left - rect.width / 2
      const my = e.clientY - rect.top - rect.height / 2
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, mx, my)
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // Middle-click drag to pan.
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      panning.current = true
      autoFitRef.current = false
      markTransformHot()
      last.current = { x: e.clientX, y: e.clientY }
      return
    }
    if (e.button === 0) onStageMouseDown?.(e)
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panning.current) return
      const dx = e.clientX - last.current.x
      const dy = e.clientY - last.current.y
      last.current = { x: e.clientX, y: e.clientY }
      markTransformHot()
      const prev = viewRef.current
      applyView({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy })
    }
    const onUp = () => { panning.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (hotTimerRef.current) clearTimeout(hotTimerRef.current)
    }
  }, [applyView, markTransformHot])

  return (
    <div
      className={`relative overflow-hidden flex flex-col ${className ?? ''}`}
    >
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 overflow-hidden"
        style={{ background: stageBg }}
        onMouseDown={onMouseDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            ref={contentRef}
            style={{
              transform: viewTransform(view),
              transformOrigin: 'center center',
              ...(transformHot ? { willChange: 'transform' as const } : null)
            }}
          >
            {children}
          </div>
        </div>
      </div>

      <div
        className="shrink-0 h-11 px-3 flex items-center gap-1 border-t border-border bg-surface"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {leadingControls && (
          <div className="flex items-center gap-1 mr-auto">
            {leadingControls}
          </div>
        )}
        {!leadingControls && <div className="mr-auto" />}
        <label
          title="Stage background (preview only — not exported)"
          className="relative w-7 h-7 rounded-lg overflow-hidden bg-surface/80 backdrop-blur border border-border cursor-pointer hover:border-muted transition-colors"
        >
          <span
            className="absolute inset-1 rounded-sm pointer-events-none border border-black/20"
            style={{ background: stageBg }}
          />
          <input
            type="color"
            value={toColorInputValue(stageBg)}
            onChange={(e) => setStageBg(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label="Stage background colour"
          />
        </label>
        <div className="px-2 h-7 flex items-center rounded-lg bg-surface/80 backdrop-blur border border-border text-[10px] font-mono text-muted select-none">
          {Math.round(view.scale * 100)}%
        </div>
        <button
          type="button"
          onClick={resetView}
          title="Default — fit to view"
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface/80 backdrop-blur border border-border text-muted hover:text-text hover:bg-surface3 transition-colors"
        >
          <Maximize size={13} />
        </button>
        <button
          type="button"
          onClick={() => zoomButton(1.2)}
          title="Zoom in (Ctrl + scroll)"
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface/80 backdrop-blur border border-border text-muted hover:text-text hover:bg-surface3 transition-colors"
        >
          <ZoomIn size={13} />
        </button>
        <button
          type="button"
          onClick={() => zoomButton(1 / 1.2)}
          title="Zoom out (Ctrl + scroll)"
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface/80 backdrop-blur border border-border text-muted hover:text-text hover:bg-surface3 transition-colors"
        >
          <ZoomOut size={13} />
        </button>
      </div>
    </div>
  )
})
