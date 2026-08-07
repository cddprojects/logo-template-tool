import React, { useState, useMemo, createElement, useEffect, useRef } from 'react'
import { Search, Wand2, Code2, Shapes, Loader2, AlertCircle, CheckCircle2, Globe, ChevronLeft, ChevronRight } from 'lucide-react'
import type { IconConfig, IconSourceType } from '../types'
import { ICON_CATEGORIES, searchIcons, type IconEntry } from '../utils/iconLibrary'
import { getStoredApiKey } from '../utils/iconUtils'
import {
  AI_VISUAL_STYLES,
  styleKeywordHint,
  withSearchStyle,
  type AiVisualStyle
} from '../utils/aiStyles'

// Lazily resolved Lucide namespace for the icon grid — loaded once, then cached.
type LucideMap = Record<string, React.FC<React.SVGProps<SVGSVGElement>>>
let _lucideIconsCache: LucideMap | null = null
let _lucideIconsPromise: Promise<LucideMap> | null = null
function useLucideIcons() {
  const [icons, setIcons] = useState<LucideMap | null>(_lucideIconsCache)
  useEffect(() => {
    if (_lucideIconsCache) { setIcons(_lucideIconsCache); return }
    if (!_lucideIconsPromise) {
      _lucideIconsPromise = import('lucide-react').then((mod) => mod as unknown as LucideMap)
    }
    _lucideIconsPromise.then((mod) => { _lucideIconsCache = mod; setIcons(mod) })
  }, [])
  return icons
}

interface IconPickerProps {
  value: IconConfig
  onChange: (patch: Partial<IconConfig>) => void
  onOpenSettings: () => void
  tabs?: PickerTab[]
  /**
   * Paint-palette mode: selecting / confirming an icon delivers SVG markup
   * instead of (or in addition to) writing into `value`.
   */
  onPickSvg?: (svgMarkup: string) => void
  /** Make icon tiles draggable for drop onto the paint canvas. */
  enableDrag?: boolean
  /** Stretch to fill a tall sidebar (paint mode). */
  fillHeight?: boolean
  /** Paint-only: preserve icon stroke width when the placed object is resized. */
  keepStrokeOnResize?: boolean
  onKeepStrokeOnResizeChange?: (keep: boolean) => void
}

type PickerTab = 'library' | 'svg' | 'ai' | 'browse'

const PAINT_SVG_MIME = 'application/x-paint-svg'
const PAINT_LUCIDE_MIME = 'application/x-paint-lucide'

function librarySvgMarkup(entry: IconEntry, strokeWidth: number): string {
  if (!entry.svg) return ''
  const viewBox = entry.viewBox ?? '0 0 24 24'
  const paintAttrs = entry.source === 'game-icons'
    ? 'fill="currentColor" stroke="none"'
    : `fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ${paintAttrs}>${entry.svg}</svg>`
}

export function IconPicker({
  value,
  onChange,
  onOpenSettings,
  tabs: allowedTabs = ['library', 'browse', 'svg', 'ai'],
  onPickSvg,
  enableDrag = false,
  fillHeight = false,
  keepStrokeOnResize,
  onKeepStrokeOnResizeChange
}: IconPickerProps): JSX.Element {
  const [tab, setTab] = useState<PickerTab>(() => {
    if (value.sourceType === 'svg' && allowedTabs.includes('svg')) return 'svg'
    return allowedTabs[0] ?? 'library'
  })

  // Sync tab when sourceType changes from outside (e.g. clicking Library vs SVG button)
  useEffect(() => {
    if (onPickSvg) return
    if (value.sourceType === 'svg' && allowedTabs.includes('svg')) {
      setTab('svg')
    } else if (value.sourceType === 'lucide' && allowedTabs.includes('library')) {
      setTab('library')
    }
  }, [value.sourceType, onPickSvg, allowedTabs])

  const setSource = (type: IconSourceType) => onChange({ sourceType: type })

  const deliverSvg = (markup: string) => {
    if (onPickSvg) {
      onPickSvg(markup)
      return
    }
    setSource('svg')
    onChange({ sourceType: 'svg', svgMarkup: markup })
  }

  return (
    <div
      className={`overflow-hidden bg-surface3 ${
        fillHeight
          ? 'flex flex-col h-full min-h-0 border-0 rounded-none'
          : 'border border-border rounded-xl'
      }`}
    >
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {allowedTabs.includes('library') && <TabBtn active={tab === 'library'} onClick={() => setTab('library')} icon={<Shapes size={12} />} label="Library" />}
        {allowedTabs.includes('browse') && <TabBtn active={tab === 'browse'} onClick={() => setTab('browse')} icon={<Globe size={12} />} label="Browse" />}
        {allowedTabs.includes('svg') && <TabBtn active={tab === 'svg'} onClick={() => setTab('svg')} icon={<Code2 size={12} />} label="Custom SVG" />}
        {allowedTabs.includes('ai') && <TabBtn active={tab === 'ai'} onClick={() => setTab('ai')} icon={<Wand2 size={12} />} label="AI" />}
      </div>

      <div
        className={
          fillHeight
            ? tab === 'library'
              ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
              : 'flex-1 min-h-0 overflow-y-auto'
            : undefined
        }
      >
        {tab === 'library' && (
          <LibraryTab
            selectedName={value.sourceType === 'lucide' ? (value.lucideIconName ?? '') : ''}
            onSelect={(entry) => {
              if (entry.svg) {
                const fullSvg = librarySvgMarkup(entry, value.lucideStrokeWidth ?? 2)
                if (onPickSvg) deliverSvg(fullSvg)
                else onChange({ sourceType: 'svg', svgMarkup: fullSvg })
              } else if (onPickSvg && entry.lucide) {
                void import('../utils/iconUtils').then(({ renderLucideToSvg }) =>
                  renderLucideToSvg(entry.lucide!, 'currentColor', value.lucideStrokeWidth ?? 2).then((svg) => {
                    if (svg) deliverSvg(svg)
                  })
                )
              } else {
                onChange({ sourceType: 'lucide', lucideIconName: entry.lucide })
              }
            }}
            strokeWidth={value.lucideStrokeWidth ?? 2}
            onStrokeWidthChange={(sw) => onChange({ lucideStrokeWidth: sw })}
            enableDrag={enableDrag}
            tall={fillHeight}
            keepStrokeOnResize={keepStrokeOnResize}
            onKeepStrokeOnResizeChange={onKeepStrokeOnResizeChange}
          />
        )}

        {tab === 'svg' && (
          <SvgTab
            value={value.svgMarkup ?? ''}
            onChange={(markup) => {
              setSource('svg')
              onChange({ sourceType: 'svg', svgMarkup: markup })
            }}
            onUse={onPickSvg ? () => {
              if (value.svgMarkup?.includes('<svg')) deliverSvg(value.svgMarkup)
            } : undefined}
          />
        )}

        {tab === 'browse' && (
          <BrowseTab
            onSelected={(markup) => {
              deliverSvg(markup)
              if (!onPickSvg) setTab('svg')
            }}
            enableDrag={enableDrag}
          />
        )}

        {tab === 'ai' && (
          <AiTab
            onGenerated={(markup) => {
              deliverSvg(markup)
              if (!onPickSvg) setTab('svg')
            }}
            onOpenSettings={onOpenSettings}
            enableDrag={enableDrag}
          />
        )}
      </div>
    </div>
  )
}

export { PAINT_SVG_MIME, PAINT_LUCIDE_MIME }

// ── Library tab ───────────────────────────────────────────────────────────────

interface LibraryTabProps {
  selectedName: string
  onSelect: (entry: import('../utils/iconLibrary').IconEntry) => void
  strokeWidth: number
  onStrokeWidthChange: (sw: number) => void
  enableDrag?: boolean
  tall?: boolean
  keepStrokeOnResize?: boolean
  onKeepStrokeOnResizeChange?: (keep: boolean) => void
}

function LibraryTab({
  selectedName,
  onSelect,
  strokeWidth,
  onStrokeWidthChange,
  enableDrag = false,
  tall = false,
  keepStrokeOnResize,
  onKeepStrokeOnResizeChange
}: LibraryTabProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const gridRef = useRef<HTMLDivElement>(null)
  const LucideIcons = useLucideIcons()

  const results = useMemo(() => searchIcons(query, category === 'All' ? undefined : category), [query, category])

  // Virtual scroll: only render icons within the visible window + small buffer
  const ITEM_H = 40   // px per row (h-9 = 36px + 4px gap)
  const COLS = tall ? 5 : 6
  const BUFFER_ROWS = 3
  const [scrollTop, setScrollTop] = useState(0)
  const [gridH, setGridH] = useState(tall ? 320 : 192)

  useEffect(() => {
    if (!tall || !gridRef.current) return
    const el = gridRef.current
    const sync = () => setGridH(Math.max(160, el.clientHeight))
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tall])

  const totalRows = Math.ceil(results.length / COLS)
  const totalH = totalRows * ITEM_H

  const startRow = Math.max(0, Math.floor(scrollTop / ITEM_H) - BUFFER_ROWS)
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + gridH) / ITEM_H) + BUFFER_ROWS)
  const visibleResults = results.slice(startRow * COLS, endRow * COLS)

  // Scroll back to top whenever the filtered results change
  useEffect(() => {
    if (gridRef.current) { gridRef.current.scrollTop = 0; setScrollTop(0) }
  }, [results])

  return (
    <div className={tall ? 'flex flex-col h-full min-h-0' : undefined}>
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Search size={12} className="text-muted shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons..."
          className="flex-1 bg-transparent text-xs text-text placeholder:text-muted focus:outline-none"
        />
      </div>

      {/* Category pills */}
      <div className="flex gap-1 px-3 py-1.5 overflow-x-auto border-b border-border shrink-0">
        {['All', ...ICON_CATEGORIES].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              category === cat
                ? 'bg-accent text-white'
                : 'bg-surface text-muted hover:text-text hover:bg-border'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Virtually-scrolled icon grid */}
      <div
        ref={gridRef}
        className={`p-2 overflow-y-auto relative ${tall ? 'flex-1 min-h-0' : 'max-h-48'}`}
        style={tall ? undefined : { height: Math.min(gridH, totalH + 8) || gridH }}
        onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
      >
        {/* Total height spacer */}
        <div style={{ height: totalH, position: 'relative' }}>
          {/* Visible slice, offset to correct position */}
          <div
            className={`grid gap-1 absolute left-0 right-0 ${tall ? 'grid-cols-5' : 'grid-cols-6'}`}
            style={{ top: startRow * ITEM_H }}
          >
            {visibleResults.map((entry, i) => {
              const absIdx = startRow * COLS + i
              const Comp = (entry.lucide && LucideIcons)
                ? LucideIcons[entry.lucide]
                : null
              const isSelected = entry.lucide ? selectedName === entry.lucide : false
              const fullSvg = librarySvgMarkup(entry, strokeWidth)
              return (
                <button
                  key={entry.name + '_' + entry.category + '_' + absIdx}
                  title={enableDrag ? `${entry.name} — drag onto canvas or click` : entry.name}
                  onClick={() => onSelect(entry)}
                  draggable={enableDrag && !!(entry.svg || entry.lucide)}
                  onDragStart={(e) => {
                    if (!enableDrag) return
                    if (fullSvg) {
                      e.dataTransfer.setData(PAINT_SVG_MIME, fullSvg)
                      e.dataTransfer.setData('text/plain', fullSvg)
                    } else if (entry.lucide) {
                      e.dataTransfer.setData(
                        PAINT_LUCIDE_MIME,
                        JSON.stringify({ name: entry.lucide, strokeWidth })
                      )
                    }
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  className={`flex items-center justify-center rounded-lg h-9 transition-colors ${
                    isSelected
                      ? 'bg-accent text-white'
                      : 'bg-surface hover:bg-surface2 text-muted hover:text-text'
                  } ${enableDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  {entry.svg ? (
                    <svg
                      viewBox={entry.viewBox ?? '0 0 24 24'}
                      width={16}
                      height={16}
                      fill={entry.source === 'game-icons' ? 'currentColor' : 'none'}
                      stroke={entry.source === 'game-icons' ? 'none' : 'currentColor'}
                      strokeWidth={entry.source === 'game-icons' ? undefined : strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dangerouslySetInnerHTML={{ __html: entry.svg }}
                    />
                  ) : Comp ? (
                    createElement(
                      Comp as React.FC<{ size?: number; strokeWidth?: number }>,
                      { size: 16, strokeWidth }
                    )
                  ) : (
                    <Loader2 size={12} className="animate-spin opacity-30" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
        {results.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">No icons found</div>
        )}
      </div>

      {/* Stroke width */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border shrink-0">
        <span className="text-xs text-muted shrink-0">Stroke</span>
        <input
          type="range"
          min={0.1}
          max={8}
          step={0.1}
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
          className="flex-1"
        />
        <input
          type="number"
          min={0.1}
          max={8}
          step={0.1}
          value={strokeWidth}
          onChange={(e) => {
            const value = Number(e.target.value)
            if (Number.isFinite(value)) {
              onStrokeWidthChange(Math.max(0.1, Math.min(8, value)))
            }
          }}
          className="w-14 px-1.5 py-1 rounded bg-surface border border-border text-[11px] text-text text-right font-mono focus:outline-none focus:border-accent"
          aria-label="Icon stroke width"
        />
      </div>
      {onKeepStrokeOnResizeChange && (
        <label className="flex items-center gap-2 px-3 pb-2 text-[11px] text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={keepStrokeOnResize ?? true}
            onChange={(e) => onKeepStrokeOnResizeChange(e.target.checked)}
            className="accent-accent"
          />
          Keep stroke width when resized
        </label>
      )}

      {/* Selected icon name */}
      {selectedName && !enableDrag && (
        <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted shrink-0">
          Selected: <span className="text-text">{selectedName}</span>
        </div>
      )}
      {enableDrag && (
        <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted shrink-0">
          Drag onto canvas or click to place
        </div>
      )}
    </div>
  )
}

// ── SVG tab ───────────────────────────────────────────────────────────────────

interface SvgTabProps {
  value: string
  onChange: (markup: string) => void
  onUse?: () => void
}

function SvgTab({ value, onChange, onUse }: SvgTabProps): JSX.Element {
  const hasContent = value.trim().length > 0
  const isValid = hasContent && value.includes('<svg')

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">Paste full SVG markup</p>
        {hasContent && (
          <span
            className={`text-[10px] flex items-center gap-1 ${isValid ? 'text-success' : 'text-danger'}`}
          >
            {isValid ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
            {isValid ? 'Valid SVG' : 'Missing <svg> tag'}
          </span>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M12 2..." fill="currentColor"/>
</svg>`}
        rows={7}
        className="w-full px-2 py-1.5 rounded-lg bg-surface border border-border text-xs text-text font-mono focus:outline-none focus:border-accent resize-none"
      />
      <div className="flex items-center gap-2">
        {hasContent && (
          <button
            onClick={() => onChange('')}
            className="text-[10px] text-muted hover:text-danger transition-colors"
          >
            Clear
          </button>
        )}
        {onUse && isValid && (
          <button
            type="button"
            onClick={onUse}
            className="ml-auto px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Place on canvas
          </button>
        )}
      </div>
    </div>
  )
}

// ── Iconify browse tab ────────────────────────────────────────────────────────

type IconifyIcon = { id: string; name: string; prefix: string; svg: string }
type IconifyApi = {
  iconifySearch?: (q: string, start?: number, style?: string) => Promise<{ success: boolean; icons?: IconifyIcon[]; nextStart?: number; error?: string }>
  iconifyFetch?: (id: string) => Promise<{ success: boolean; svg?: string; error?: string }>
}

function BrowseTab({
  onSelected,
  enableDrag = false
}: {
  onSelected: (svg: string) => void
  enableDrag?: boolean
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)      // initial search
  const [loadingMore, setLoadingMore] = useState(false) // fetching a new page
  const [selected, setSelected] = useState('')
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  // Paged results — navigating pages never re-fetches; fetching a fresh page
  // dedupes against every prior page so choices don't repeat.
  const [pages, setPages] = useState<IconifyIcon[][]>([])
  const [pageIdx, setPageIdx] = useState(0)
  const [noMore, setNoMore] = useState(false)

  const pagesRef = useRef<IconifyIcon[][]>([])
  const nextStartRef = useRef(0)
  const queryRef = useRef('')

  const api = (window as Window & { api?: IconifyApi }).api

  const currentIcons = pages[pageIdx] ?? []
  const hasResults = pages.length > 0

  const resetResults = () => {
    setPages([]); pagesRef.current = []
    setPageIdx(0); setNoMore(false); setSelected('')
    nextStartRef.current = 0
  }

  const handleSearch = async () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError('')
    resetResults()
    setSearched(false)
    queryRef.current = q
    const result = await api?.iconifySearch?.(q, 0)
    setLoading(false)
    setSearched(true)
    if (!result?.success) { setError(result?.error ?? 'Search failed'); return }
    const first = result.icons ?? []
    if (first.length === 0) { setError('No icons found — try different keywords.'); return }
    nextStartRef.current = result.nextStart ?? first.length
    pagesRef.current = [first]
    setPages([first])
    setPageIdx(0)
  }

  // Fetch the next page of fresh icons (deduped against everything seen so far).
  const fetchFreshPage = async (): Promise<IconifyIcon[]> => {
    const seen = new Set(pagesRef.current.flat().map((i) => i.id))
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await api?.iconifySearch?.(queryRef.current, nextStartRef.current)
      if (!res?.success) break
      const batch = res.icons ?? []
      nextStartRef.current = res.nextStart ?? nextStartRef.current + batch.length
      if (batch.length === 0) break
      const fresh = batch.filter((i) => !seen.has(i.id))
      if (fresh.length > 0) return fresh
    }
    return []
  }

  const goNext = async () => {
    setSelected('')
    if (pageIdx < pages.length - 1) { setPageIdx((p) => p + 1); return }
    if (noMore || loadingMore) return
    setLoadingMore(true)
    const fresh = await fetchFreshPage()
    setLoadingMore(false)
    if (fresh.length === 0) { setNoMore(true); return }
    const np = [...pagesRef.current, fresh]
    pagesRef.current = np
    setPages(np)
    setPageIdx(np.length - 1)
  }

  const goPrev = () => {
    if (pageIdx > 0) { setSelected(''); setPageIdx((p) => p - 1) }
  }

  const handleConfirm = async () => {
    if (!selected) return
    setApplying(true)
    const result = await api?.iconifyFetch?.(selected)
    setApplying(false)
    if (result?.success && result.svg) {
      onSelected(result.svg)
      resetResults()
      setSearched(false)
      setQuery('')
    } else {
      setError('Failed to load icon')
    }
  }

  const atLastPage = pageIdx >= pages.length - 1

  return (
    <div className="p-3 space-y-2">
      {/* Search bar */}
      <div className="flex gap-1.5">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); resetResults() }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search 200k+ icons… (e.g. rocket, briefcase)"
          className="flex-1 px-2 py-1.5 rounded-lg bg-surface border border-border text-xs text-text focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-40 flex items-center gap-1"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted">
          <Loader2 size={14} className="animate-spin text-accent" /> Searching…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <p className="text-[11px] text-danger flex items-center gap-1"><AlertCircle size={11} />{error}</p>
      )}

      {/* Results grid — click to select, then confirm */}
      {!loading && hasResults && (
        <>
          <p className="text-[10px] text-muted">Pick one, then hit Confirm</p>
          <div className="grid grid-cols-4 gap-1.5 max-h-72 overflow-y-auto">
            {currentIcons.map((icon) => (
              <button
                key={icon.id}
                title={enableDrag ? `${icon.name} — drag or select then Confirm` : `${icon.name} (${icon.prefix})`}
                onClick={() => setSelected(icon.id)}
                draggable={enableDrag && !!icon.svg}
                onDragStart={(e) => {
                  if (!enableDrag || !icon.svg) return
                  e.dataTransfer.setData(PAINT_SVG_MIME, icon.svg)
                  e.dataTransfer.setData('text/plain', icon.svg)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                className={`relative flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors ${
                  selected === icon.id
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-surface hover:bg-surface2 hover:border-accent/40'
                } ${enableDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                {selected === icon.id && (
                  <div className="absolute top-1 right-1"><CheckCircle2 size={10} className="text-accent" /></div>
                )}
                <div
                  className="w-10 h-10 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: icon.svg }}
                />
                <span className="text-[9px] text-muted truncate w-full text-center leading-tight">{icon.name}</span>
              </button>
            ))}
          </div>

          {/* Pager — arrows load the next page only on demand */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={goPrev}
              disabled={pageIdx === 0}
              title="Previous page"
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface2 hover:bg-border text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[10px] text-muted tabular-nums">Page {pageIdx + 1}</span>
            <button
              onClick={goNext}
              disabled={loadingMore || (atLastPage && noMore)}
              title={atLastPage ? 'Load next page' : 'Next page'}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface2 hover:bg-border text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {loadingMore ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={14} />}
            </button>
          </div>
          {atLastPage && noMore && (
            <p className="text-[9px] text-muted/60 text-center">No more results for this search.</p>
          )}

          <button
            onClick={handleConfirm}
            disabled={!selected || applying}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {applying ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Confirm
          </button>
        </>
      )}

      {/* Initial hint */}
      {!loading && !searched && !hasResults && (
        <p className="text-[10px] text-muted/60 text-center py-4">
          Search across 200,000+ icons — Material, Fluent, Noto, Tabler, and more
        </p>
      )}
    </div>
  )
}

// ── AI generate tab ───────────────────────────────────────────────────────────

interface AiTabProps {
  onGenerated: (markup: string) => void
  onOpenSettings: () => void
  enableDrag?: boolean
}

function AiTab({ onGenerated, enableDrag = false }: AiTabProps): JSX.Element {
  const [description, setDescription] = useState('')
  const [visualStyle, setVisualStyle] = useState<AiVisualStyle>('any')
  const [loading, setLoading] = useState(false)      // initial search
  const [loadingMore, setLoadingMore] = useState(false) // fetching a new page
  const [error, setError] = useState('')
  // Each entry is a page of results; navigating pages never regenerates already
  // seen icons, and fetching a fresh page dedupes against every prior page.
  const [pages, setPages] = useState<IconifyIcon[][]>([])
  const [pageIdx, setPageIdx] = useState(0)
  const [noMore, setNoMore] = useState(false)
  const [selected, setSelected] = useState('')
  const [applying, setApplying] = useState(false)
  const [searched, setSearched] = useState(false)
  const [usedKeywords, setUsedKeywords] = useState('')
  const [queryList, setQueryList] = useState<string[]>([])

  const pagesRef = useRef<IconifyIcon[][]>([])
  const nextStartRef = useRef(0)
  const queriesRef = useRef<string[]>([])
  const queryIdxRef = useRef(0)
  const styleRef = useRef<AiVisualStyle>('any')
  styleRef.current = visualStyle

  const apiKey = getStoredApiKey()
  const hasKey = apiKey.length > 0
  const api = (window as Window & { api?: IconifyApi & { geminiGenerate?: (p: string, k: string) => Promise<{ success: boolean; text?: string }> } }).api

  const currentIcons = pages[pageIdx] ?? []
  const hasResults = pages.length > 0

  /** Primary keyword first; alternates only after that keyword is exhausted across packs. */
  const extractKeywordQueries = async (desc: string, style: AiVisualStyle): Promise<string[]> => {
    const cleanLine = (s: string) =>
      s.replace(/^[\d]+[.)\-:\s]*/, '').replace(/['".,]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    const styleHint = styleKeywordHint(style)

    const stopwords = new Set([
      'a', 'an', 'the', 'is', 'are', 'with', 'for', 'of', 'in', 'on', 'at', 'to', 'and', 'or',
      'that', 'this', 'it', 'as', 'from', 'by', 'about', 'into', 'very', 'some', 'one', 'two',
      'my', 'me', 'we', 'us', 'you', 'your', 'our', 'need', 'want', 'icon', 'logo', 'image'
    ])
    const words = desc
      .split(/\s+/)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter((w) => !stopwords.has(w) && w.length > 2)

    // Lead with the user's own wording so Next page stays on what they typed.
    const primary =
      words.length >= 2
        ? withSearchStyle(words.slice(0, 2).join(' '), style)
        : withSearchStyle((words[0] ?? desc.trim().toLowerCase()).slice(0, 40), style)

    const pushUnique = (list: string[], q: string) => {
      if (q && !list.includes(q)) list.push(q)
    }

    if (hasKey) {
      const res = await api?.geminiGenerate?.(
        `You help search an icon library. For this description: "${desc}"
${styleHint ? `Style lock: ${styleHint}` : ''}
Return exactly 6 short English search queries (1–3 words each).
Each query must capture a DIFFERENT visual metaphor, synonym, or related object — not near-duplicates.
One query per line. No numbering, bullets, quotes, or explanation.
Example for "person working remotely from home with laptop":
laptop
home office
video call
remote work
wifi signal
desk chair`,
        apiKey
      )
      if (res?.success && res.text) {
        const lines = res.text
          .split(/\r?\n/)
          .map(cleanLine)
          .filter((l) => l.length >= 2 && l.length <= 40)
        const uniq: string[] = [primary]
        for (const l of lines) pushUnique(uniq, withSearchStyle(l, style))
        if (uniq.length >= 2) return uniq.slice(0, 8)
      }
    }

    // Local fallback: meaningful words + 1–2 word combos for variety
    const queries: string[] = [primary]
    for (const w of words.slice(0, 5)) pushUnique(queries, withSearchStyle(w, style))
    for (let i = 0; i < Math.min(words.length - 1, 3); i++) {
      pushUnique(queries, withSearchStyle(`${words[i]} ${words[i + 1]}`, style))
    }
    return queries.length > 0 ? queries : [withSearchStyle(desc.trim().toLowerCase(), style)]
  }

  const resetResults = () => {
    setPages([]); pagesRef.current = []
    setPageIdx(0); setNoMore(false); setSelected('')
    nextStartRef.current = 0
    queryIdxRef.current = 0
    queriesRef.current = []
    setQueryList([])
  }

  const handleSearch = async () => {
    if (!description.trim()) return
    setLoading(true)
    setError('')
    resetResults()
    setSearched(false)
    setUsedKeywords('')

    const style = visualStyle
    const queries = await extractKeywordQueries(description.trim(), style)
    queriesRef.current = queries
    queryIdxRef.current = 0
    nextStartRef.current = 0
    setQueryList(queries)
    setUsedKeywords(queries[0] ?? '')

    const result = await api?.iconifySearch?.(queries[0] ?? description.trim(), 0, style)

    setLoading(false)
    setSearched(true)

    if (!result?.success) { setError(result?.error ?? 'Search failed'); return }
    const first = result.icons ?? []
    if (first.length === 0) {
      // Try remaining queries before giving up
      for (let i = 1; i < queries.length; i++) {
        const alt = await api?.iconifySearch?.(queries[i], 0, style)
        const icons = alt?.icons ?? []
        if (icons.length > 0) {
          queryIdxRef.current = i
          nextStartRef.current = alt?.nextStart ?? icons.length
          setUsedKeywords(queries[i])
          pagesRef.current = [icons]
          setPages([icons])
          setPageIdx(0)
          return
        }
      }
      setError('Nothing found — try a simpler term or a different style.')
      return
    }
    nextStartRef.current = result.nextStart ?? first.length
    pagesRef.current = [first]
    setPages([first])
    setPageIdx(0)
  }

  /**
   * Next page of fresh icons for the same keyword across packs.
   * Only after this keyword is exhausted do we try an alternate keyword.
   */
  const fetchFreshPage = async (): Promise<{ icons: IconifyIcon[]; label: string } | null> => {
    const seen = new Set(pagesRef.current.flat().map((i) => i.id))
    const queries = queriesRef.current
    if (queries.length === 0) return null
    const style = styleRef.current

    const digKeyword = async (
      q: string,
      startAt: number,
      maxAttempts: number
    ): Promise<{ icons: IconifyIcon[]; start: number } | null> => {
      let start = startAt
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await api?.iconifySearch?.(q, start, style)
        if (!res?.success) break
        const batch = res.icons ?? []
        start = res.nextStart ?? start + batch.length
        if (batch.length === 0) break
        const fresh = batch.filter((i) => !seen.has(i.id))
        if (fresh.length > 0) return { icons: fresh, start }
        // Entire batch already seen — keep digging the same keyword.
      }
      return null
    }

    // Stay on the active keyword until packs for it are exhausted.
    const currentQi = queryIdxRef.current
    const currentQ = queries[currentQi]
    const current = await digKeyword(currentQ, nextStartRef.current, 24)
    if (current) {
      nextStartRef.current = current.start
      return { icons: current.icons, label: currentQ }
    }

    // Keyword exhausted — try remaining alternate metaphors from the start.
    for (let qPass = 1; qPass < queries.length; qPass++) {
      const qi = (currentQi + qPass) % queries.length
      const q = queries[qi]
      const hit = await digKeyword(q, 0, 8)
      if (hit) {
        queryIdxRef.current = qi
        nextStartRef.current = hit.start
        return { icons: hit.icons, label: q }
      }
    }
    return null
  }

  const goNext = async () => {
    setSelected('')
    if (pageIdx < pages.length - 1) { setPageIdx((p) => p + 1); return }
    if (noMore || loadingMore) return
    setLoadingMore(true)
    const result = await fetchFreshPage()
    setLoadingMore(false)
    if (!result) { setNoMore(true); return }
    setUsedKeywords(result.label)
    const np = [...pagesRef.current, result.icons]
    pagesRef.current = np
    setPages(np)
    setPageIdx(np.length - 1)
  }

  const goPrev = () => {
    if (pageIdx > 0) { setSelected(''); setPageIdx((p) => p - 1) }
  }

  const handleConfirm = async () => {
    if (!selected) return
    setApplying(true)
    const result = await api?.iconifyFetch?.(selected)
    setApplying(false)
    if (result?.success && result.svg) {
      onGenerated(result.svg)
      resetResults()
      setSearched(false)
    } else {
      setError('Failed to load icon')
    }
  }

  const atLastPage = pageIdx >= pages.length - 1

  return (
    <div className="p-3 space-y-2">
      {/* Description input */}
      <div>
        <label className="block text-[10px] text-muted mb-1">Describe the icon you need</label>
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); resetResults(); setSearched(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSearch() } }}
          placeholder="e.g. person working remotely from home with laptop"
          rows={2}
          className="w-full px-2 py-1.5 rounded-lg bg-surface border border-border text-xs text-text focus:outline-none focus:border-accent resize-none"
        />
      </div>

      <div>
        <label className="block text-[10px] text-muted mb-1">Style lock</label>
        <div className="flex flex-wrap gap-1">
          {AI_VISUAL_STYLES.map((s) => (
            <button
              key={s.value}
              type="button"
              title={s.hint}
              onClick={() => { setVisualStyle(s.value); resetResults(); setSearched(false) }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                visualStyle === s.value
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface text-muted border-border hover:text-text'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search button */}
      {!hasResults && (
        <button
          onClick={handleSearch}
          disabled={loading || !description.trim()}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-accent hover:bg-accent-hover text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <><Loader2 size={13} className="animate-spin" />Searching…</> : <><Search size={13} />Search Icons</>}
        </button>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-[10px] text-muted text-center">Finding varied matching icons…</p>
      )}

      {/* Error */}
      {!loading && error && (
        <p className="text-[11px] text-danger flex items-center gap-1"><AlertCircle size={11} />{error}</p>
      )}

      {/* Results grid — click to select, then confirm */}
      {!loading && hasResults && (
        <>
          <p className="text-[10px] text-muted">
            Showing <span className="text-text font-medium">"{usedKeywords}"</span>
            <span className="text-muted/70"> · next page keeps this keyword across packs</span>
            {queryList.length > 1 && (
              <span className="text-muted/70"> · later pages may try alternate concepts</span>
            )}
            {' '}— pick one, then Confirm
          </p>
          <div className="grid grid-cols-4 gap-1.5 max-h-72 overflow-y-auto">
            {currentIcons.map((icon) => (
              <button
                key={icon.id}
                title={enableDrag ? `${icon.name} — drag or select then Confirm` : `${icon.name} (${icon.prefix})`}
                onClick={() => setSelected(icon.id)}
                draggable={enableDrag && !!icon.svg}
                onDragStart={(e) => {
                  if (!enableDrag || !icon.svg) return
                  e.dataTransfer.setData(PAINT_SVG_MIME, icon.svg)
                  e.dataTransfer.setData('text/plain', icon.svg)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                className={`relative flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors ${
                  selected === icon.id
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-surface hover:bg-surface2 hover:border-accent/40'
                } ${enableDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                {selected === icon.id && (
                  <div className="absolute top-1 right-1">
                    <CheckCircle2 size={10} className="text-accent" />
                  </div>
                )}
                <div
                  className="w-10 h-10 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: icon.svg }}
                />
                <span className="text-[9px] text-muted truncate w-full text-center leading-tight">{icon.name}</span>
              </button>
            ))}
          </div>

          {/* Pager — arrows generate the next page only on demand */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={goPrev}
              disabled={pageIdx === 0}
              title="Previous page"
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface2 hover:bg-border text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[10px] text-muted tabular-nums">Page {pageIdx + 1}</span>
            <button
              onClick={goNext}
              disabled={loadingMore || (atLastPage && noMore)}
              title={atLastPage ? 'Load more for this keyword' : 'Next page'}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface2 hover:bg-border text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {loadingMore ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={14} />}
            </button>
          </div>
          {atLastPage && noMore && (
            <p className="text-[9px] text-muted/60 text-center">No more distinct results for this keyword across packs.</p>
          )}

          <div className="flex gap-1.5">
            <button
              onClick={() => { resetResults(); setSearched(false); setUsedKeywords('') }}
              className="flex-1 py-1.5 rounded-lg bg-surface2 hover:bg-border text-muted hover:text-text text-xs font-medium transition-colors"
            >
              New search
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected || applying}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {applying ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Confirm
            </button>
          </div>
        </>
      )}

      {!loading && !searched && !hasResults && (
        <p className="text-[10px] text-muted/60 text-center pt-1">
          {hasKey
            ? 'AI picks search keywords from your description, then pages through matching icons across packs'
            : 'Searches 200k+ real icons from your description (add an API key for smarter keywords)'}
        </p>
      )}
    </div>
  )
}

// ── Helper ────────────────────────────────────────────────────────────────────

interface TabBtnProps {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}

function TabBtn({ active, icon, label, onClick }: TabBtnProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors border-b-2 ${
        active ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text-dim'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
