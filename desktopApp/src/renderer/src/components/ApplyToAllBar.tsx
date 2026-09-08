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
  /** Show Favicon target checkbox (default true). */
  showFavicon?: boolean
  /** Show Logo target checkbox (default true). */
  showLogo?: boolean
}

/**
 * Checkbox-driven “apply active variant to all” control.
 * Content: shape/settings, colour settings, and/or paint edits.
 * Layer: Inner and/or Outer. App: Favicon and/or Logo.
 */
export function ApplyToAllBar({
  onApply,
  applied = false,
  title = 'Copy selected parts of this variant onto every other variant',
  showFavicon = true,
  showLogo = true
}: ApplyToAllBarProps) {
  const [shape, setShape] = useState(true)
  const [color, setColor] = useState(false)
  const [edit, setEdit] = useState(false)
  const [inner, setInner] = useState(true)
  const [outer, setOuter] = useState(false)
  const [favicon, setFavicon] = useState(showFavicon)
  const [logo, setLogo] = useState(showLogo)

  const opts: ApplyToAllOptions = {
    shape,
    color,
    edit,
    inner,
    outer,
    favicon: showFavicon ? favicon : false,
    logo: showLogo ? logo : false
  }
  const canApply = applyToAllOptionsActive(opts)

  return (
    <div
      className="ml-1 flex items-center gap-2 shrink-0 flex-wrap"
      title={title}
    >
      <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-border bg-surface3 text-[10px] text-muted">
        <span className="font-semibold text-text/80 whitespace-nowrap">Content</span>
        <label className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            className="accent-accent"
            checked={shape}
            onChange={(e) => setShape(e.target.checked)}
          />
          Shape & settings
        </label>
        <label
          className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap"
          title="Fill, border, and shadow colours only — not Paint objects"
        >
          <input
            type="checkbox"
            className="accent-accent"
            checked={color}
            onChange={(e) => setColor(e.target.checked)}
          />
          Colour settings
        </label>
        <label
          className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap"
          title="Paint edits: Inner = Inner paint + objects above it; Outer = everything below Inner paint"
        >
          <input
            type="checkbox"
            className="accent-accent"
            checked={edit}
            onChange={(e) => setEdit(e.target.checked)}
          />
          Edit
        </label>
      </div>
      <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-border bg-surface3 text-[10px] text-muted">
        <span className="font-semibold text-text/80 whitespace-nowrap">Layer</span>
        <label
          className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap"
          title="With Edit: Inner paint + objects above it. With Shape/Colour: live Inner settings."
        >
          <input
            type="checkbox"
            className="accent-accent"
            checked={inner}
            onChange={(e) => setInner(e.target.checked)}
          />
          Inner
        </label>
        <label
          className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap"
          title="With Edit: everything below Inner paint (incl. Outer). With Shape/Colour: live Outer settings."
        >
          <input
            type="checkbox"
            className="accent-accent"
            checked={outer}
            onChange={(e) => setOuter(e.target.checked)}
          />
          Outer
        </label>
      </div>
      {(showFavicon || showLogo) && (
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-border bg-surface3 text-[10px] text-muted">
          <span className="font-semibold text-text/80 whitespace-nowrap">App</span>
          {showFavicon && (
            <label className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                className="accent-accent"
                checked={favicon}
                onChange={(e) => setFavicon(e.target.checked)}
              />
              Favicon
            </label>
          )}
          {showLogo && (
            <label className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                className="accent-accent"
                checked={logo}
                onChange={(e) => setLogo(e.target.checked)}
              />
              Logo
            </label>
          )}
        </div>
      )}
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
