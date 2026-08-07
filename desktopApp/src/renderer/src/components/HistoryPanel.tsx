import { useEffect, useRef } from 'react'
import { History as HistoryIcon, X } from './Icons'
import type { HistoryEntry } from '../hooks/useVersions'

interface HistoryPanelProps {
  entries: HistoryEntry[]
  index: number
  onJump: (index: number) => void
  onClose: () => void
}

function relativeTime(time: number): string {
  const diff = Date.now() - time
  const s = Math.round(diff / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

export function HistoryPanel({ entries, index, onJump, onClose }: HistoryPanelProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on click outside / Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Show newest at the top.
  const ordered = entries.map((e, i) => ({ ...e, i })).reverse()

  return (
    <div
      ref={panelRef}
      className="absolute right-2 top-12 z-[9998] w-64 max-h-[70vh] flex flex-col bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <HistoryIcon size={13} className="text-accent" />
          <span className="text-xs font-semibold text-text-dim uppercase tracking-wider">History</span>
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-text hover:bg-surface3 transition-colors"
        >
          <X size={11} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {ordered.map(({ label, time, i }) => {
          const isCurrent = i === index
          const isFuture = i > index
          return (
            <button
              key={i}
              onClick={() => onJump(i)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                isCurrent
                  ? 'bg-accent-dim border-l-2 border-accent'
                  : 'border-l-2 border-transparent hover:bg-surface2'
              } ${isFuture ? 'opacity-45' : ''}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isCurrent ? 'bg-accent' : isFuture ? 'bg-muted' : 'bg-text-dim'
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-xs truncate ${isCurrent ? 'text-text font-medium' : 'text-text-dim'}`}>
                  {label}
                </p>
              </div>
              <span className="text-[10px] text-muted shrink-0">{relativeTime(time)}</span>
            </button>
          )
        })}
      </div>

      <div className="px-3 py-1.5 border-t border-border shrink-0">
        <p className="text-[10px] text-muted">{entries.length} step{entries.length !== 1 ? 's' : ''} · click to jump</p>
      </div>
    </div>
  )
}
