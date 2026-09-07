import React, { useState } from 'react'
import { CheckCircle2, ClipboardCopy } from 'lucide-react'
import type { ApplyToAllOptions } from '../utils/paintSettingsSync'
import { applyToAllOptionsActive } from '../utils/paintSettingsSync'

interface ApplyToAllBarProps {
  /** Called with the current checkbox selection. */
  onApply: (opts: ApplyToAllOptions) => void
  /** Brief success flash label. */
  applied?: boolean
  title?: string
}

/**
 * Checkbox-driven “apply active variant to all” control.
 * What: shape/settings and/or colour. Layer: Inner and/or Outer.
 */
export function ApplyToAllBar({
  onApply,
  applied = false,
  title = 'Copy selected parts of this variant onto every other variant'
}: ApplyToAllBarProps) {
  const [shape, setShape] = useState(true)
  const [color, setColor] = useState(false)
  const [inner, setInner] = useState(true)
  const [outer, setOuter] = useState(false)

  const opts: ApplyToAllOptions = { shape, color, inner, outer }
  const canApply = applyToAllOptionsActive(opts)

  return (
    <div
      className="ml-1 flex items-center gap-2 shrink-0 flex-wrap"
      title={title}
    >
      <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-border bg-surface3 text-[10px] text-muted">
        <span className="font-semibold text-text/80 whitespace-nowrap">What</span>
        <label className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            className="accent-accent"
            checked={shape}
            onChange={(e) => setShape(e.target.checked)}
          />
          Shape & settings
        </label>
        <label className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            className="accent-accent"
            checked={color}
            onChange={(e) => setColor(e.target.checked)}
          />
          Colour
        </label>
      </div>
      <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-border bg-surface3 text-[10px] text-muted">
        <span className="font-semibold text-text/80 whitespace-nowrap">Layer</span>
        <label className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            className="accent-accent"
            checked={inner}
            onChange={(e) => setInner(e.target.checked)}
          />
          Inner
        </label>
        <label className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            className="accent-accent"
            checked={outer}
            onChange={(e) => setOuter(e.target.checked)}
          />
          Outer
        </label>
      </div>
      <button
        type="button"
        disabled={!canApply}
        onClick={() => onApply(opts)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          applied
            ? 'border-success/60 bg-success/10 text-success'
            : 'border-border bg-surface3 text-muted hover:text-text hover:border-muted'
        }`}
      >
        {applied ? <CheckCircle2 size={11} /> : <ClipboardCopy size={11} />}
        {applied ? 'Applied' : 'Apply to all'}
      </button>
    </div>
  )
}
