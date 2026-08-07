import { useState, useEffect } from 'react'
import { Minus, X, ImageIcon, HelpCircle } from './Icons'
import { HelpGuideModal } from './HelpGuideModal'

// Inline styles are mandatory for -webkit-app-region on Windows.
// Vite's production CSS minifier (lightningcss) strips unknown vendor-prefixed
// properties from stylesheets, so the property must be set via the element's
// inline style attribute where it bypasses all CSS processing.
// Requires Electron ≥ 36.5.0 + frame:false + titleBarStyle:'hidden' in main.
const DRAG    = { WebkitAppRegion: 'drag'    } as React.CSSProperties
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

function MaximizeIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="3" width="14" height="14" rx="1" />
      <rect x="3" y="7" width="14" height="14" rx="1" fill="currentColor" fillOpacity={0.15} />
      <rect x="3" y="7" width="14" height="14" rx="1" />
    </svg>
  )
}

export function TitleBar(): JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  // Web build sets window.__WEB__; hide Electron-only window chrome there.
  const isWeb =
    typeof window !== 'undefined' &&
    !!(window as Window & { __WEB__?: boolean }).__WEB__

  useEffect(() => {
    if (isWeb) return
    window.api?.onWindowMaximized?.((isMax: boolean) => setMaximized(isMax))
  }, [isWeb])

  const minimize = () => window.api?.windowMinimize()
  const toggleMaximize = () => window.api?.windowMaximize()
  const close = () => window.api?.windowClose()

  return (
    <>
      <div
        style={isWeb ? undefined : DRAG}
        className="flex items-center justify-between h-10 px-4 bg-surface border-b border-border shrink-0 select-none cursor-default"
        onDoubleClick={isWeb ? undefined : toggleMaximize}
      >
        {/* Logo — no-drag so clicks still register */}
        <div style={isWeb ? undefined : NO_DRAG} className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
            <ImageIcon size={13} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-text">Image Generator</span>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="w-5 h-5 rounded-full flex items-center justify-center text-muted hover:text-accent hover:bg-surface3 transition-colors"
            title="How to use this app"
            aria-label="How to use this app"
          >
            <HelpCircle size={14} />
          </button>
        </div>

        {/* Window controls — Electron only */}
        {!isWeb && (
          <div style={NO_DRAG} className="flex items-center gap-1">
            <button
              onClick={minimize}
              className="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-text hover:bg-surface3 transition-colors"
              title="Minimize"
            >
              <Minus size={13} />
            </button>
            <button
              onClick={toggleMaximize}
              className="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-text hover:bg-surface3 transition-colors"
              title={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? <RestoreIcon /> : <MaximizeIcon />}
            </button>
            <button
              onClick={close}
              className="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-white hover:bg-danger transition-colors"
              title="Close"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {showHelp && <HelpGuideModal onClose={() => setShowHelp(false)} />}
    </>
  )
}
