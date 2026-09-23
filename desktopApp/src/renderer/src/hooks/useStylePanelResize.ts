import { useCallback, useEffect, useRef, useState, type RefObject, type MouseEvent as ReactMouseEvent } from 'react'

/** Default style-panel width; also the minimum when dragging to resize. */
export const STYLE_PANEL_MIN_WIDTH = 288
export const STYLE_PANEL_MAX_WIDTH = 560

export function useStylePanelResize(): {
  panelWidth: number
  panelRef: RefObject<HTMLDivElement>
  onResizeStart: (e: ReactMouseEvent) => void
} {
  const [panelWidth, setPanelWidth] = useState(STYLE_PANEL_MIN_WIDTH)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelWidthRef = useRef(STYLE_PANEL_MIN_WIDTH)

  useEffect(() => {
    panelWidthRef.current = panelWidth
  }, [panelWidth])

  const onResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = panelWidthRef.current
    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.min(
        STYLE_PANEL_MAX_WIDTH,
        Math.max(STYLE_PANEL_MIN_WIDTH, startWidth + (startX - ev.clientX))
      )
      panelWidthRef.current = newWidth
      if (panelRef.current) panelRef.current.style.width = `${newWidth}px`
    }
    const onUp = () => {
      setPanelWidth(panelWidthRef.current)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  return { panelWidth, panelRef, onResizeStart }
}
