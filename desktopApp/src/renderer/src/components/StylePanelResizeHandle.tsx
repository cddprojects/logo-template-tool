import React from 'react'
import { STYLE_PANEL_MIN_WIDTH, STYLE_PANEL_MAX_WIDTH } from '../hooks/useStylePanelResize'

interface StylePanelResizeHandleProps {
  panelWidth: number
  onMouseDown: (e: React.MouseEvent) => void
}

/** Vertical grip between canvas and style panel — kept outside the scrollable panel so it always receives pointer events. */
export function StylePanelResizeHandle({
  panelWidth,
  onMouseDown
}: StylePanelResizeHandleProps): JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={panelWidth}
      aria-valuemin={STYLE_PANEL_MIN_WIDTH}
      aria-valuemax={STYLE_PANEL_MAX_WIDTH}
      onMouseDown={onMouseDown}
      className="shrink-0 w-2 cursor-col-resize z-30 hover:bg-accent/40 active:bg-accent/50 transition-colors group relative touch-none"
      title="Drag to resize panel"
    >
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-border group-hover:bg-accent/70"
      />
    </div>
  )
}
