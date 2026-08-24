import React, { useMemo, useState } from 'react'
import { X, FolderDown } from './Icons'

export type LogoExportFormat = 'png' | 'svg'
export type FaviconExportFormat = 'png' | 'svg' | 'ico'

export interface GroupExportOptions {
  logos: boolean
  favicons: boolean
  logoFormats: LogoExportFormat[]
  faviconFormats: FaviconExportFormat[]
}

interface GroupExportModalProps {
  onConfirm: (opts: GroupExportOptions) => void
  onClose: () => void
}

const LOGO_FORMATS: LogoExportFormat[] = ['png', 'svg']
const FAVICON_FORMATS: FaviconExportFormat[] = ['png', 'svg', 'ico']

function toggleIn<T extends string>(list: T[], value: T, on: boolean): T[] {
  if (on) return list.includes(value) ? list : [...list, value]
  return list.filter((v) => v !== value)
}

export function GroupExportModal({ onConfirm, onClose }: GroupExportModalProps): JSX.Element {
  const [logos, setLogos] = useState(true)
  const [favicons, setFavicons] = useState(true)
  const [logoFormats, setLogoFormats] = useState<LogoExportFormat[]>(['png', 'svg'])
  const [faviconFormats, setFaviconFormats] = useState<FaviconExportFormat[]>(['png', 'svg', 'ico'])

  const canExport = useMemo(
    () => (logos && logoFormats.length > 0) || (favicons && faviconFormats.length > 0),
    [logos, favicons, logoFormats, faviconFormats]
  )

  const setLogosOn = (on: boolean) => {
    setLogos(on)
    setLogoFormats(on ? [...LOGO_FORMATS] : [])
  }

  const setFaviconsOn = (on: boolean) => {
    setFavicons(on)
    setFaviconFormats(on ? [...FAVICON_FORMATS] : [])
  }

  const setLogoFormat = (fmt: LogoExportFormat, on: boolean) => {
    const next = toggleIn(logoFormats, fmt, on)
    setLogoFormats(next)
    setLogos(next.length > 0)
  }

  const setFaviconFormat = (fmt: FaviconExportFormat, on: boolean) => {
    const next = toggleIn(faviconFormats, fmt, on)
    setFaviconFormats(next)
    setFavicons(next.length > 0)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canExport) return
    onConfirm({
      logos: logos && logoFormats.length > 0,
      favicons: favicons && faviconFormats.length > 0,
      logoFormats: logos ? logoFormats : [],
      faviconFormats: favicons ? faviconFormats : []
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm mx-4 bg-surface2 border border-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FolderDown size={14} className="text-accent" />
            <h2 className="text-sm font-semibold text-text">Group export</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface3 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            Choose which assets and formats to include for every variant.
          </p>

          <div className="space-y-3">
            <div>
              <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={logos && logoFormats.length > 0}
                  onChange={(e) => setLogosOn(e.target.checked)}
                  className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                />
                Logo
              </label>
              <div className="ml-6 mt-2 space-y-1.5 border-l border-border pl-3">
                {LOGO_FORMATS.map((fmt) => (
                  <label
                    key={fmt}
                    className="flex items-center gap-2.5 text-sm text-text-dim cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={logoFormats.includes(fmt)}
                      onChange={(e) => setLogoFormat(fmt, e.target.checked)}
                      className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                    />
                    <span className="uppercase font-mono text-xs tracking-wide">{fmt}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={favicons && faviconFormats.length > 0}
                  onChange={(e) => setFaviconsOn(e.target.checked)}
                  className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                />
                Favicons
              </label>
              <div className="ml-6 mt-2 space-y-1.5 border-l border-border pl-3">
                {FAVICON_FORMATS.map((fmt) => (
                  <label
                    key={fmt}
                    className="flex items-center gap-2.5 text-sm text-text-dim cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={faviconFormats.includes(fmt)}
                      onChange={(e) => setFaviconFormat(fmt, e.target.checked)}
                      className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                    />
                    <span className="uppercase font-mono text-xs tracking-wide">{fmt}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm text-text-dim bg-surface3 hover:bg-border transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canExport}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Export
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
