import React, { useRef, useState, useEffect, useCallback } from 'react'
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
}

const ZOOM_MIN = 0.1
const ZOOM_MAX = 12
const DEFAULT_STAGE_BG = '#000000'
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

function toColorInputValue(hex: string): string {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/)
  return m ? `#${m[1]}` : '#000000'
}

/**
 * A pan + zoom viewport for preview content.
 *  • Middle-click drag pans the view.
 *  • Ctrl + scroll (or right-button + scroll) zooms toward the cursor.
 *  • Controls (bottom-right): stage colour, default/fit, zoom in, zoom out.
 * Auto-fits until the user pans/zooms; Default restores fit.
 * Stage colour is preview-only and does not affect the exported image.
 */
export function PreviewStage({
  children,
  background = DEFAULT_STAGE_BG,
  className,
  onStageMouseDown,
  leadingControls
}: PreviewStageProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 })
  const [stageBg, setStageBg] = useState(() => toColorInputValue(background))
  /** Only promote the transform layer while interacting — permanent will-change
   *  caches child <canvas> bitmaps in Chromium so cleared frames stay visible. */
  const [transformHot, setTransformHot] = useState(false)
  const autoFitRef = useRef(true)
  const panning = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  const hotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const markTransformHot = useCallback(() => {
    setTransformHot(true)
    if (hotTimerRef.current) clearTimeout(hotTimerRef.current)
    hotTimerRef.current = setTimeout(() => {
      hotTimerRef.current = null
      setTransformHot(false)
    }, 180)
  }, [])

  // Fit content to container (capped at 1× so small icons aren't upscaled).
  const fit = useCallback(() => {
    const c = containerRef.current
    const el = contentRef.current
    if (!c || !el) return
    // offsetWidth/Height ignore CSS transforms → true natural content size.
    const ew = el.offsetWidth
    const eh = el.offsetHeight
    if (!ew || !eh) return
    const s = clamp(Math.min((c.clientWidth * 0.9) / ew, (c.clientHeight * 0.9) / eh, 1), ZOOM_MIN, ZOOM_MAX)
    setView({ scale: s, tx: 0, ty: 0 })
  }, [])

  const resetView = useCallback(() => {
    autoFitRef.current = true
    fit()
  }, [fit])

  // Zoom around a point (mx,my) measured from the container centre.
  const zoomAt = useCallback((factor: number, mx: number, my: number) => {
    autoFitRef.current = false
    markTransformHot()
    setView((prev) => {
      const s1 = clamp(prev.scale * factor, ZOOM_MIN, ZOOM_MAX)
      const r = s1 / prev.scale
      return { scale: s1, tx: mx - r * (mx - prev.tx), ty: my - r * (my - prev.ty) }
    })
  }, [markTransformHot])

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
      setView((prev) => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }))
    }
    const onUp = () => { panning.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (hotTimerRef.current) clearTimeout(hotTimerRef.current)
    }
  }, [markTransformHot])

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
              transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
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
}
