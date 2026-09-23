import React, { useState } from 'react'
import { CheckCircle2, ClipboardCopy, Info } from 'lucide-react'
import { X } from './Icons'
import type { ApplyToAllOptions, ApplyToAllResult } from '../utils/paintSettingsSync'
import { applyToAllOptionsActive } from '../utils/paintSettingsSync'

export type ApplyToAllFlash = 'idle' | 'applied' | 'already'

interface ApplyToAllBarProps {
  /** Called with the current checkbox selection. */
  onApply: (
    opts: ApplyToAllOptions
  ) => ApplyToAllResult | boolean | void | Promise<ApplyToAllResult | boolean | void>
  /** Brief feedback after Apply. */
  flash?: ApplyToAllFlash
  /** @deprecated Prefer `flash`. */
  applied?: boolean
  title?: string
  /** Show Favicon target checkbox (default true). */
  showFavicon?: boolean
  /** Show Logo target checkbox (default true). */
  showLogo?: boolean
}

/**
 * “Apply to all” trigger — Content / Layer / App options open in a popup
 * (same pattern as Group export) after the button is clicked once.
 */
export function ApplyToAllBar({
  onApply,
  flash,
  applied = false,
  title = 'Copy selected parts of this variant onto every other variant',
  showFavicon = true,
  showLogo = true
}: ApplyToAllBarProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
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
  const status: ApplyToAllFlash = flash ?? (applied ? 'applied' : 'idle')

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canApply || busy) return
    setBusy(true)
    try {
      await Promise.resolve(onApply(opts))
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ml-1 flex items-center shrink-0" title={title}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
          status === 'applied'
            ? 'border-success/60 bg-success/10 text-success'
            : status === 'already'
              ? 'border-accent/50 bg-accent/10 text-accent'
              : 'border-border bg-surface3 text-muted hover:text-text hover:border-muted'
        }`}
      >
        {status === 'applied' ? (
          <CheckCircle2 size={11} />
        ) : status === 'already' ? (
          <Info size={11} />
        ) : (
          <ClipboardCopy size={11} />
        )}
        {status === 'applied'
          ? 'Applied'
          : status === 'already'
            ? 'Already applied'
            : 'Apply to all'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !busy && setOpen(false)}
          />

          <div className="relative w-full max-w-sm mx-4 bg-surface2 border border-border rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <ClipboardCopy size={14} className="text-accent" />
                <h2 className="text-sm font-semibold text-text">Apply to all</h2>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface3 transition-colors disabled:opacity-40"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={(e) => void handleConfirm(e)} className="px-5 py-4 space-y-4">
              <p className="text-xs text-muted leading-relaxed">
                Choose which parts of this variant to copy onto every other variant.
              </p>

              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold text-text/80 mb-1.5">Content</p>
                  <div className="space-y-1.5 border-l border-border pl-3">
                    <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                        checked={shape}
                        onChange={(e) => setShape(e.target.checked)}
                      />
                      Shape &amp; settings
                    </label>
                    <label
                      className="flex items-center gap-2.5 text-sm text-text cursor-pointer select-none"
                      title="Fill, border, shadow, and remapped Color 1–5 hex values. Off + Edit: copies image Match structure from the source but remaps with each target’s own Color 1–5 (regions that were Color 1 stay Color 1, using the target’s colour)"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                        checked={color}
                        onChange={(e) => setColor(e.target.checked)}
                      />
                      Colour settings
                    </label>
                    <label
                      className="flex items-center gap-2.5 text-sm text-text cursor-pointer select-none"
                      title="Paint strokes and objects: Inner = Inner paint + objects above it; Outer = everything below Inner paint. Image Color 1–5 region structure is copied with Edit; each target’s Color 1–5 hex values are kept unless Colour settings is also on"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                        checked={edit}
                        onChange={(e) => setEdit(e.target.checked)}
                      />
                      Edit
                    </label>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-text/80 mb-1.5">Layer</p>
                  <div className="space-y-1.5 border-l border-border pl-3">
                    <label
                      className="flex items-center gap-2.5 text-sm text-text cursor-pointer select-none"
                      title="With Edit: Inner paint + objects above it. With Shape/Colour: live Inner settings."
                    >
                      <input
                        type="checkbox"
                        className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                        checked={inner}
                        onChange={(e) => setInner(e.target.checked)}
                      />
                      Inner
                    </label>
                    <label
                      className="flex items-center gap-2.5 text-sm text-text cursor-pointer select-none"
                      title="With Edit: everything below Inner paint (incl. Outer). With Shape/Colour: live Outer settings."
                    >
                      <input
                        type="checkbox"
                        className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                        checked={outer}
                        onChange={(e) => setOuter(e.target.checked)}
                      />
                      Outer
                    </label>
                  </div>
                </div>

                {(showFavicon || showLogo) && (
                  <div>
                    <p className="text-[11px] font-semibold text-text/80 mb-1.5">App</p>
                    <div className="space-y-1.5 border-l border-border pl-3">
                      {showFavicon && (
                        <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                            checked={favicon}
                            onChange={(e) => setFavicon(e.target.checked)}
                          />
                          Favicon
                        </label>
                      )}
                      {showLogo && (
                        <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                            checked={logo}
                            onChange={(e) => setLogo(e.target.checked)}
                          />
                          Logo
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm text-text-dim bg-surface3 hover:bg-border transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canApply || busy}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {busy ? 'Applying…' : 'Apply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
