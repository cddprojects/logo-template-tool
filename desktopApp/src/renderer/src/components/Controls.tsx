import React, { useState, useRef } from 'react'
import { Sparkles, Loader } from 'lucide-react'
import { generateAIImage, removeImageBackground } from '../utils/iconUtils'
import {
  AI_VISUAL_STYLES,
  withImageStyle,
  type AiVisualStyle
} from '../utils/aiStyles'
import {
  imageRecolorFieldsFromPalette,
  scanImagePalette,
  type ImageRecolorFields
} from '../utils/imageRecolor'
import { FONT_FAMILIES, FONT_FAMILY_GROUPS, FONT_WEIGHTS, SHAPES, OUTER_SHAPE_CATEGORIES } from '../types'
import type { ShapeType, OuterShapeCategory } from '../types'
import type { ExportNameStyle } from '../utils/exporter'
import { loadFont } from '../utils/fontLoader'

// ── Primitives ─────────────────────────────────────────────────────────────────

interface RowProps {
  label: string
  children: React.ReactNode
  hint?: string
}

export function Row({ label, children, hint }: RowProps): JSX.Element {
  return (
    <div className="flex items-center gap-2 py-1.5 min-w-0">
      <label className="text-xs text-muted w-20 min-w-[5rem] shrink-0 truncate" title={label}>{label}</label>
      <div className="flex-1 min-w-0 overflow-hidden">{children}</div>
      {hint && <span className="text-[10px] text-muted/60 shrink-0 ml-1">{hint}</span>}
    </div>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

export function Section({ title, children, defaultOpen = true }: SectionProps): JSX.Element {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-text-dim uppercase tracking-wider hover:text-text transition-colors"
      >
        {title}
        <span
          className="text-muted transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>
      {open && <div className="px-4 pb-4 space-y-0.5 min-w-0">{children}</div>}
    </div>
  )
}

// ── Gradient helpers ───────────────────────────────────────────────────────────

export interface GradientStop { color: string; pos: number }
export interface LinearGradientData { deg: number; stops: [GradientStop, GradientStop] }

export function isGradientColor(v: string): boolean {
  return typeof v === 'string' && (v.startsWith('linear-gradient(') || v.startsWith('radial-gradient('))
}

// ── Linear gradient ────────────────────────────────────────────────────────────

export function parseGradientData(value: string): LinearGradientData | null {
  const m = value.match(
    /linear-gradient\((\d+(?:\.\d+)?)deg,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+(?:\.\d+)?)%,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+(?:\.\d+)?)%\)/
  )
  if (!m) return null
  return {
    deg: parseFloat(m[1]),
    stops: [
      { color: m[2], pos: parseFloat(m[3]) },
      { color: m[4], pos: parseFloat(m[5]) }
    ]
  }
}

export function buildGradientValue(data: LinearGradientData): string {
  const [s1, s2] = data.stops
  return `linear-gradient(${Math.round(data.deg)}deg, ${s1.color} ${s1.pos}%, ${s2.color} ${s2.pos}%)`
}

// ── Radial gradient ────────────────────────────────────────────────────────────

export interface RadialGradientData {
  centerX: number  // 0-100 %
  centerY: number  // 0-100 %
  stops: [GradientStop, GradientStop]
}

export function parseRadialGradientData(value: string): RadialGradientData | null {
  // Matches: radial-gradient(circle at 50% 50%, #rrggbb 0%, #rrggbb 100%)
  const m = value.match(
    /radial-gradient\(circle at (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+(?:\.\d+)?)%,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+(\d+(?:\.\d+)?)%\)/
  )
  if (!m) return null
  return {
    centerX: parseFloat(m[1]),
    centerY: parseFloat(m[2]),
    stops: [
      { color: m[3], pos: parseFloat(m[4]) },
      { color: m[5], pos: parseFloat(m[6]) }
    ]
  }
}

export function buildRadialGradientValue(cx: number, cy: number, c1: string, p1: number, c2: string, p2: number): string {
  return `radial-gradient(circle at ${cx}% ${cy}%, ${c1} ${p1}%, ${c2} ${p2}%)`
}

const byteHex = (n: number): string =>
  Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/**
 * Normalize a solid CSS colour to #RRGGBB or #RRGGBBAA.
 * Gradients are left unchanged; unknown values fall back to #888888.
 */
export function toHexColor(color: string): string {
  const h = color.trim()
  if (isGradientColor(h)) return h
  if (/^#[0-9a-fA-F]{8}$/i.test(h)) return h.toLowerCase()
  if (/^#[0-9a-fA-F]{6}$/i.test(h)) return h.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/i.test(h)) {
    const r = h[1], g = h[2], b = h[3]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const rgba = h.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)$/i)
  if (rgba) {
    const r = Number(rgba[1]), g = Number(rgba[2]), b = Number(rgba[3])
    const a = rgba[4] !== undefined ? Math.round(parseFloat(rgba[4]) * 255) : 255
    const rgb = `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`
    return a >= 255 ? rgb : `${rgb}${byteHex(a)}`
  }
  return '#888888'
}

/** Returns the first solid color from a gradient string, or the string itself (as HEX). */
export function firstSolidColor(color: string): string {
  if (!isGradientColor(color)) return toHexColor(color)
  const m = color.match(/(?:linear|radial)-gradient\([^,]+(?:,\s*[^,]+)?,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/)
  return m ? toHexColor(m[1]) : '#888888'
}

/** Native <input type="color"> only accepts #RRGGBB (6 digits). */
function toColorInputValue(color: string): string {
  return toHexColor(color).slice(0, 7)
}

/** Apply a #RRGGBB pick from the native color input, keeping prior alpha if present. */
function withPickedRgb(prev: string, pickedRgb: string): string {
  const rgb = toColorInputValue(pickedRgb)
  const prevHex = toHexColor(prev)
  if (/^#[0-9a-fA-F]{8}$/i.test(prevHex)) return rgb + prevHex.slice(7, 9)
  if (/^#[0-9a-fA-F]{6}$/i.test(prevHex)) return rgb
  return rgb + 'ff'
}

// ── Color picker popup ─────────────────────────────────────────────────────────

interface ColorPickerPopupProps {
  value: string
  onChange: (v: string) => void
  onClose: () => void
  rect: DOMRect
  /** When true, hide Linear/Radial tabs (for shadow colours, which only support solids). */
  solidOnly?: boolean
}

export function ColorPickerPopup({ value, onChange, onClose, rect, solidOnly = false }: ColorPickerPopupProps): JSX.Element {
  const isLinear = !solidOnly && value.startsWith('linear-gradient(')
  const isRadial = !solidOnly && value.startsWith('radial-gradient(')
  const isGrad   = isLinear || isRadial
  const [tab, setTab] = React.useState<'solid' | 'linear' | 'radial'>(
    solidOnly ? 'solid' : isLinear ? 'linear' : isRadial ? 'radial' : 'solid'
  )

  // Shared initial stop colors (from whichever gradient type is active)
  const parsedLin = React.useMemo(() => parseGradientData(value), [value])
  const parsedRad = React.useMemo(() => parseRadialGradientData(value), [value])
  const initC1 = toHexColor(parsedLin?.stops[0].color ?? parsedRad?.stops[0].color ?? (isGrad ? '#6366f1' : value))
  const initC2 = toHexColor(parsedLin?.stops[1].color ?? parsedRad?.stops[1].color ?? '#8b5cf6')
  const initP1 = parsedLin?.stops[0].pos   ?? parsedRad?.stops[0].pos   ?? 0
  const initP2 = parsedLin?.stops[1].pos   ?? parsedRad?.stops[1].pos   ?? 100

  // Linear state
  const [deg,        setDeg]        = React.useState(parsedLin?.deg ?? 135)
  const [linC1,      setLinC1]      = React.useState(initC1)
  const [linP1,      setLinP1]      = React.useState(initP1)
  const [linC2,      setLinC2]      = React.useState(initC2)
  const [linP2,      setLinP2]      = React.useState(initP2)

  // Radial state
  const [radCX,      setRadCX]      = React.useState(parsedRad?.centerX ?? 50)
  const [radCY,      setRadCY]      = React.useState(parsedRad?.centerY ?? 50)
  const [radC1,      setRadC1]      = React.useState(initC1)
  const [radP1,      setRadP1]      = React.useState(initP1)
  const [radC2,      setRadC2]      = React.useState(initC2)
  const [radP2,      setRadP2]      = React.useState(initP2)

  // Solid state
  const [solidHex, setSolidHex] = React.useState(initC1)
  const [hexText,  setHexText]  = React.useState(initC1)
  const hexFocused = React.useRef(false)
  React.useEffect(() => { if (!hexFocused.current) setHexText(solidHex) }, [solidHex])

  // Keep local fields in sync when the parent value changes (eyedropper, external edits).
  React.useEffect(() => {
    const lin = value.startsWith('linear-gradient(')
    const rad = value.startsWith('radial-gradient(')
    if (lin) {
      const p = parseGradientData(value)
      if (!p) return
      const c1 = toHexColor(p.stops[0].color)
      const c2 = toHexColor(p.stops[1].color)
      setDeg(p.deg)
      setLinC1(c1); setLinP1(p.stops[0].pos)
      setLinC2(c2); setLinP2(p.stops[1].pos)
      setSolidHex(c1)
      setRadC1(c1); setRadC2(c2)
      setRadP1(p.stops[0].pos); setRadP2(p.stops[1].pos)
    } else if (rad) {
      const p = parseRadialGradientData(value)
      if (!p) return
      const c1 = toHexColor(p.stops[0].color)
      const c2 = toHexColor(p.stops[1].color)
      setRadCX(p.centerX); setRadCY(p.centerY)
      setRadC1(c1); setRadP1(p.stops[0].pos)
      setRadC2(c2); setRadP2(p.stops[1].pos)
      setSolidHex(c1)
      setLinC1(c1); setLinC2(c2)
      setLinP1(p.stops[0].pos); setLinP2(p.stops[1].pos)
    } else {
      const hex = toHexColor(value)
      setSolidHex(hex)
      setLinC1(hex)
      setRadC1(hex)
    }
  }, [value])

  const emitLinear = React.useCallback((d: number, c1: string, p1: number, c2: string, p2: number) => {
    onChange(buildGradientValue({ deg: d, stops: [{ color: c1, pos: p1 }, { color: c2, pos: p2 }] }))
  }, [onChange])

  const emitRadial = React.useCallback((cx: number, cy: number, c1: string, p1: number, c2: string, p2: number) => {
    onChange(buildRadialGradientValue(cx, cy, c1, p1, c2, p2))
  }, [onChange])

  /** Solid color + Stop 1 stay linked so a pick updates both. */
  const applyPrimaryColor = React.useCallback((next: string, opts?: { emitSolid?: boolean }) => {
    setSolidHex(next)
    setLinC1(next)
    setRadC1(next)
    if (opts?.emitSolid !== false && tab === 'solid') onChange(next)
    else if (tab === 'linear') emitLinear(deg, next, linP1, linC2, linP2)
    else if (tab === 'radial') emitRadial(radCX, radCY, next, radP1, radC2, radP2)
    else onChange(next)
  }, [tab, onChange, emitLinear, emitRadial, deg, linP1, linC2, linP2, radCX, radCY, radP1, radC2, radP2])

  // Close on click outside
  const popupRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose()
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handle), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handle) }
  }, [onClose])

  // Position: below swatch, clamp to viewport
  const POPUP_W = 288
  const activeTab = solidOnly ? 'solid' : tab
  const POPUP_H = activeTab === 'solid' ? (solidOnly ? 72 : 100) : activeTab === 'linear' ? 248 : 272
  const left = Math.min(rect.left, window.innerWidth - POPUP_W - 8)
  const topBelow = rect.bottom + 6
  const top = topBelow + POPUP_H > window.innerHeight - 8 ? rect.top - POPUP_H - 6 : topBelow

  const linPreview = buildGradientValue({ deg, stops: [{ color: linC1, pos: linP1 }, { color: linC2, pos: linP2 }] })
  const radPreview = buildRadialGradientValue(radCX, radCY, radC1, radP1, radC2, radP2)

  const TABS: { key: 'solid' | 'linear' | 'radial'; label: string }[] = [
    { key: 'solid',  label: 'Solid'   },
    { key: 'linear', label: 'Linear'  },
    { key: 'radial', label: 'Radial'  },
  ]

  return (
    <div
      ref={popupRef}
      style={{ position: 'fixed', left, top, width: POPUP_W, zIndex: 9999 }}
      className="bg-surface border border-border rounded-xl shadow-2xl p-3 space-y-2.5"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Tabs — hidden when solid-only (shadow colours). */}
      {!solidOnly && (
        <div className="flex gap-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setTab(key)
                if (key === 'solid')  onChange(solidHex)
                if (key === 'linear') emitLinear(deg, linC1, linP1, linC2, linP2)
                if (key === 'radial') emitRadial(radCX, radCY, radC1, radP1, radC2, radP2)
              }}
              className={`flex-1 py-1 text-xs rounded-md font-medium transition-colors ${
                tab === key ? 'bg-accent text-white' : 'bg-surface2 text-muted hover:text-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Solid ── */}
      {activeTab === 'solid' && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={toColorInputValue(solidHex)}
            onChange={e => {
              const next = withPickedRgb(solidHex, e.target.value)
              applyPrimaryColor(next)
            }}
            className="w-8 h-8 shrink-0 rounded cursor-pointer border border-border/50"
            title="Pick colour"
          />
          <input
            type="text"
            value={hexText}
            onFocus={() => { hexFocused.current = true }}
            onBlur={() => {
              hexFocused.current = false
              if (/^#[0-9a-fA-F]{6,8}$/.test(hexText)) applyPrimaryColor(hexText)
              else setHexText(solidHex)
            }}
            onChange={e => {
              setHexText(e.target.value)
              if (/^#[0-9a-fA-F]{6,8}$/.test(e.target.value)) applyPrimaryColor(e.target.value)
            }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="flex-1 min-w-0 px-2 py-1 rounded bg-surface3 border border-border text-xs font-mono focus:outline-none focus:border-accent"
            maxLength={9}
          />
        </div>
      )}

      {/* ── Linear gradient ── */}
      {!solidOnly && activeTab === 'linear' && (
        <div className="space-y-2">
          <div className="h-6 rounded-md border border-border/40" style={{ background: linPreview }} />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted w-12 shrink-0">Angle</span>
            <input
              type="number"
              value={deg}
              min={0} max={360}
              onChange={e => {
                const v = Math.max(0, Math.min(360, parseInt(e.target.value) || 0))
                setDeg(v); emitLinear(v, linC1, linP1, linC2, linP2)
              }}
              className="w-14 px-2 py-1 rounded bg-surface3 border border-border text-xs text-center focus:outline-none focus:border-accent"
            />
            <span className="text-xs text-muted">°</span>
          </div>
          <GradientStops
            c1={linC1} p1={linP1} c2={linC2} p2={linP2}
            onChange={(c1, p1, c2, p2) => {
              setLinC1(c1); setLinP1(p1); setLinC2(c2); setLinP2(p2)
              // Stop 1 drives the solid colour as well
              setSolidHex(c1)
              setRadC1(c1)
              emitLinear(deg, c1, p1, c2, p2)
            }}
          />
        </div>
      )}

      {/* ── Radial gradient ── */}
      {!solidOnly && activeTab === 'radial' && (
        <div className="space-y-2">
          {/* Square preview */}
          <div className="w-full rounded-md border border-border/40" style={{ aspectRatio: '2/1', background: radPreview }} />
          {/* Center X/Y */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted w-12 shrink-0">Center</span>
            <div className="flex items-center gap-1 flex-1">
              <input
                type="number"
                value={radCX}
                min={0} max={100}
                onChange={e => {
                  const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                  setRadCX(v); emitRadial(v, radCY, radC1, radP1, radC2, radP2)
                }}
                className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-xs text-center focus:outline-none focus:border-accent"
              />
              <span className="text-[10px] text-muted">%</span>
              <span className="text-[10px] text-muted px-0.5">×</span>
              <input
                type="number"
                value={radCY}
                min={0} max={100}
                onChange={e => {
                  const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                  setRadCY(v); emitRadial(radCX, v, radC1, radP1, radC2, radP2)
                }}
                className="w-12 px-1.5 py-1 rounded bg-surface3 border border-border text-xs text-center focus:outline-none focus:border-accent"
              />
              <span className="text-[10px] text-muted">%</span>
            </div>
          </div>
          <GradientStops
            c1={radC1} p1={radP1} c2={radC2} p2={radP2}
            onChange={(c1, p1, c2, p2) => {
              setRadC1(c1); setRadP1(p1); setRadC2(c2); setRadP2(p2)
              setSolidHex(c1)
              setLinC1(c1)
              emitRadial(radCX, radCY, c1, p1, c2, p2)
            }}
          />
        </div>
      )}
    </div>
  )
}

// Shared stop-pair editor used by both linear and radial tabs
function GradientStops({
  c1, p1, c2, p2,
  onChange
}: {
  c1: string; p1: number; c2: string; p2: number
  onChange: (c1: string, p1: number, c2: string, p2: number) => void
}): JSX.Element {
  return (
    <>
      {([
        { label: 'Stop 1', color: c1, pos: p1,
          onC: (c: string) => onChange(c, p1, c2, p2),
          onP: (p: number) => onChange(c1, p, c2, p2) },
        { label: 'Stop 2', color: c2, pos: p2,
          onC: (c: string) => onChange(c1, p1, c, p2),
          onP: (p: number) => onChange(c1, p1, c2, p) },
      ]).map(({ label, color, pos, onC, onP }) => (
        <div key={label} className="space-y-0.5">
          <span className="text-[10px] text-muted uppercase tracking-wide">{label}</span>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={toColorInputValue(color)}
              onChange={e => onC(withPickedRgb(color, e.target.value))}
              className="w-6 h-6 shrink-0 rounded cursor-pointer border border-border/50"
              title={label}
            />
            <GradientStopHex color={color} onChange={onC} />
            <input
              type="number"
              value={pos}
              min={0} max={100}
              onChange={e => onP(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
              className="w-10 px-1 py-1 rounded bg-surface3 border border-border text-xs text-center focus:outline-none focus:border-accent"
            />
            <span className="text-[10px] text-muted">%</span>
          </div>
        </div>
      ))}
    </>
  )
}

// Tiny hex text input for a gradient stop color
function GradientStopHex({ color, onChange }: { color: string; onChange: (c: string) => void }): JSX.Element {
  const hex = toHexColor(color)
  const [text, setText] = React.useState(hex)
  const focused = React.useRef(false)
  React.useEffect(() => { if (!focused.current) setText(toHexColor(color)) }, [color])
  return (
    <input
      type="text"
      value={text}
      onFocus={() => { focused.current = true }}
      onBlur={() => {
        focused.current = false
        if (/^#[0-9a-fA-F]{6,8}$/.test(text)) onChange(text)
        else setText(hex)
      }}
      onChange={e => {
        setText(e.target.value)
        if (/^#[0-9a-fA-F]{6,8}$/.test(e.target.value)) onChange(e.target.value)
      }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className="flex-1 min-w-0 px-1.5 py-1 rounded bg-surface3 border border-border text-xs font-mono focus:outline-none focus:border-accent"
      maxLength={9}
    />
  )
}

// ── Color picker row ───────────────────────────────────────────────────────────

interface ColorRowProps {
  label: string
  value: string
  onChange: (v: string) => void
  /** Solid colours only — no Linear/Radial tabs (use for shadow colours). */
  solidOnly?: boolean
}

export function ColorRow({ label, value, onChange, solidOnly = false }: ColorRowProps): JSX.Element {
  const [open, setOpen] = React.useState(false)
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null)
  const swatchRef = React.useRef<HTMLButtonElement>(null)

  // Shadows can't use gradients — always present a solid colour.
  const effectiveValue = solidOnly && isGradientColor(value) ? firstSolidColor(value) : value
  const isGrad = !solidOnly && isGradientColor(effectiveValue)
  const displayHex = isGrad ? effectiveValue : toHexColor(effectiveValue)
  const [hexText, setHexText] = React.useState(displayHex)
  const hexFocused = React.useRef(false)
  React.useEffect(() => {
    if (!hexFocused.current) {
      setHexText(isGrad ? effectiveValue : toHexColor(effectiveValue))
    }
  }, [effectiveValue, isGrad])

  // Coerce a stored gradient down to a solid the first time a solid-only row mounts.
  React.useEffect(() => {
    if (solidOnly && isGradientColor(value)) {
      onChange(firstSolidColor(value))
    }
    // Only run when the stored value is a gradient under solidOnly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solidOnly, value])

  const openPopup = () => {
    if (swatchRef.current) {
      setAnchorRect(swatchRef.current.getBoundingClientRect())
      setOpen(true)
    }
  }

  const emit = (v: string) => onChange(solidOnly ? firstSolidColor(v) : v)

  return (
    <Row label={label}>
      <div className="flex items-center gap-2 min-w-0">
        {/* Swatch — shows gradient or solid color, opens popup */}
        <button
          ref={swatchRef}
          onClick={openPopup}
          className="w-7 h-7 shrink-0 rounded cursor-pointer border border-border/60 overflow-hidden"
          style={{ background: effectiveValue }}
          title="Click to edit color"
        />

        {isGrad ? (
          /* Gradient: show a clickable label */
          <button
            onClick={openPopup}
            className="flex-1 min-w-0 w-0 px-2 py-1 rounded bg-surface3 border border-border text-xs text-muted font-mono text-left truncate hover:border-accent transition-colors"
          >
            gradient
          </button>
        ) : (
          /* Solid: editable hex text input */
          <input
            type="text"
            value={hexText}
            onFocus={() => { hexFocused.current = true }}
            onBlur={() => {
              hexFocused.current = false
              if (/^#[0-9a-fA-F]{6,8}$/.test(hexText) && hexText.toLowerCase() !== displayHex.toLowerCase()) {
                emit(hexText)
              } else {
                setHexText(displayHex)
              }
            }}
            onChange={e => {
              setHexText(e.target.value)
              if (/^#[0-9a-fA-F]{6,8}$/.test(e.target.value)) emit(e.target.value)
            }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="flex-1 min-w-0 w-0 px-2 py-1 rounded bg-surface3 border border-border text-xs text-text font-mono focus:outline-none focus:border-accent"
            maxLength={9}
          />
        )}

        {open && anchorRect && (
          <ColorPickerPopup
            value={effectiveValue}
            onChange={emit}
            onClose={() => setOpen(false)}
            rect={anchorRect}
            solidOnly={solidOnly}
          />
        )}
      </div>
    </Row>
  )
}

// ── Slider row ─────────────────────────────────────────────────────────────────

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  unit?: string
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = ''
}: SliderRowProps): JSX.Element {
  const [localValue, setLocalValue] = React.useState(value)
  const [textValue, setTextValue] = React.useState(String(value))
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFocused = React.useRef(false)

  // Single effect syncs both states from external prop changes (avoids double re-render)
  React.useEffect(() => {
    if (isFocused.current || timerRef.current) return
    setLocalValue(value)
    setTextValue(String(value))
  }, [value])

  if (unit === 'px') {
    const commitText = (raw: string) => {
      let n = parseFloat(raw)
      if (isNaN(n)) n = localValue
      if (min !== undefined) n = Math.max(min, n)
      if (max !== undefined) n = Math.min(max, n)
      const clamped = Math.round(n)
      setLocalValue(clamped)
      setTextValue(String(clamped))
      onChange(clamped)
    }
    return (
      <Row label={label}>
        <div className="flex items-center gap-1 min-w-0">
          <input
            type="text"
            inputMode="numeric"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onFocus={(e) => { isFocused.current = true; e.target.select() }}
            onBlur={(e) => { isFocused.current = false; commitText(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { commitText((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur() }
              if (e.key === 'ArrowUp') { e.preventDefault(); commitText(String(localValue + step)) }
              if (e.key === 'ArrowDown') { e.preventDefault(); commitText(String(localValue - step)) }
            }}
            className="w-16 min-w-0 px-2 py-1 rounded bg-surface3 border border-border text-xs text-text focus:outline-none focus:border-accent font-mono text-right"
          />
          <span className="text-xs text-muted shrink-0">px</span>
        </div>
      </Row>
    )
  }

  // ── Other units → range slider ──────────────────────────────────────────────
  const flush = (v: number) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    onChange(v)
  }

  const handleChange = (v: number) => {
    setLocalValue(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { timerRef.current = null; onChange(v) }, 50)
  }

  return (
    <Row label={label} hint={`${localValue}${unit}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={localValue}
        onChange={(e) => handleChange(Number(e.target.value))}
        onPointerUp={() => flush(localValue)}
        onKeyUp={() => flush(localValue)}
        className="w-full min-w-0"
      />
    </Row>
  )
}

// ── Select row ─────────────────────────────────────────────────────────────────

interface SelectRowProps {
  label: string
  value: string
  options: { label: string; value: string }[]
  onChange: (v: string) => void
}

export function SelectRow({ label, value, options, onChange }: SelectRowProps): JSX.Element {
  return (
    <Row label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 px-2 py-1 rounded bg-surface3 border border-border text-xs text-text focus:outline-none focus:border-accent appearance-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  )
}

// ── Text input row ─────────────────────────────────────────────────────────────

interface TextRowProps {
  label: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
  mono?: boolean
}

export function TextRow({ label, value, placeholder, onChange, mono }: TextRowProps): JSX.Element {
  const [localValue, setLocalValue] = React.useState(value)
  const isFocused = React.useRef(false)

  // Sync when external value changes (variant switch, reset, etc.) but not while typing
  React.useEffect(() => {
    if (!isFocused.current) setLocalValue(value)
  }, [value])

  const commit = (v: string) => { if (v !== value) onChange(v) }

  return (
    <Row label={label}>
      <input
        type="text"
        value={localValue}
        placeholder={placeholder}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => { isFocused.current = true }}
        onBlur={(e) => { isFocused.current = false; commit(e.target.value) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur() } }}
        className={`w-full min-w-0 px-2 py-1 rounded bg-surface3 border border-border text-xs text-text focus:outline-none focus:border-accent ${mono ? 'font-mono' : ''}`}
      />
    </Row>
  )
}

// ── Number input row (deferred – commits on blur / Enter) ─────────────────────

interface NumberInputRowProps {
  label: string
  value: number
  min?: number
  max?: number
  unit?: string
  onChange: (v: number) => void
}

export function NumberInputRow({ label, value, min, max, unit, onChange }: NumberInputRowProps): JSX.Element {
  const [localValue, setLocalValue] = React.useState(String(value))
  const isFocused = React.useRef(false)

  React.useEffect(() => {
    if (!isFocused.current) setLocalValue(String(value))
  }, [value])

  const commit = (raw: string) => {
    let n = parseFloat(raw)
    if (isNaN(n)) n = value
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    const clamped = Math.round(n)
    setLocalValue(String(clamped))
    if (clamped !== value) onChange(clamped)
  }

  return (
    <Row label={label}>
      <div className="flex items-center gap-1 min-w-0">
        <input
          type="text"
          inputMode="numeric"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => { isFocused.current = true }}
          onBlur={(e) => { isFocused.current = false; commit(e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur() } }}
          className="w-20 min-w-0 px-2 py-1 rounded bg-surface3 border border-border text-xs text-text focus:outline-none focus:border-accent font-mono text-right"
        />
        {unit && <span className="text-xs text-textMuted shrink-0">{unit}</span>}
      </div>
    </Row>
  )
}

// ── Textarea row (deferred – commits on blur / Enter) ──────────────────────────

interface TextareaRowProps {
  label: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
  rows?: number
}

export function TextareaRow({ label, value, placeholder, onChange, rows = 4 }: TextareaRowProps): JSX.Element {
  const [localValue, setLocalValue] = React.useState(value)
  const isFocused = React.useRef(false)

  React.useEffect(() => {
    if (!isFocused.current) setLocalValue(value)
  }, [value])

  const commit = (v: string) => { if (v !== value) onChange(v) }

  return (
    <div className="py-1.5">
      <label className="block text-xs text-muted mb-1.5">{label}</label>
      <textarea
        value={localValue}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => { isFocused.current = true }}
        onBlur={(e) => { isFocused.current = false; commit(e.target.value) }}
        className="w-full min-w-0 px-2 py-1.5 rounded bg-surface3 border border-border text-xs text-text font-mono focus:outline-none focus:border-accent resize-none"
      />
    </div>
  )
}

// ── Toggle row ─────────────────────────────────────────────────────────────────

interface ToggleRowProps {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}

export function ToggleRow({ label, value, onChange }: ToggleRowProps): JSX.Element {
  return (
    <Row label={label}>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          value ? 'bg-accent' : 'bg-surface3 border border-border'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </Row>
  )
}

// ── Shape grid ─────────────────────────────────────────────────────────────────

interface ShapeGridProps {
  label?: string
  value: ShapeType
  onChange: (v: ShapeType) => void
  includeNone?: boolean
}

export function ShapeGrid({ label, value, onChange, includeNone = false }: ShapeGridProps): JSX.Element {
  const shapes = includeNone ? SHAPES : SHAPES.filter((s) => s.value !== 'none')

  return (
    <div className="py-1.5">
      {label ? <p className="text-xs text-muted mb-2">{label}</p> : null}
      <div className="grid grid-cols-4 gap-1">
        {shapes.map((s) => (
          <button
            key={s.value}
            title={s.label}
            onClick={() => onChange(s.value as ShapeType)}
            className={`py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
              value === s.value
                ? 'bg-accent text-white'
                : 'bg-surface3 text-muted hover:bg-border hover:text-text'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface OuterCategoryTabsProps {
  value: OuterShapeCategory
  onChange: (v: OuterShapeCategory) => void
}

export function OuterCategoryTabs({ value, onChange }: OuterCategoryTabsProps): JSX.Element {
  return (
    <div className="flex gap-1 py-1.5">
      {OUTER_SHAPE_CATEGORIES.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
            value === c.value
              ? 'bg-accent text-white'
              : 'bg-surface3 text-muted hover:bg-border hover:text-text'
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

// ── Export filename style (single export) ──────────────────────────────────────

interface ExportNameStyleToggleProps {
  value: ExportNameStyle
  onChange: (v: ExportNameStyle) => void
}

export function ExportNameStyleToggle({ value, onChange }: ExportNameStyleToggleProps): JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted">Name</span>
      {([
        {
          id: 'full' as const,
          label: 'Full',
          title: 'version-logo-variant… / version-favicon-512-variant…'
        },
        {
          id: 'group' as const,
          label: 'Group',
          title: 'Same as group export: logo.png / logo-dark.png, favicon.png…'
        }
      ]).map((opt) => (
        <button
          key={opt.id}
          type="button"
          title={opt.title}
          onClick={() => onChange(opt.id)}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
            value === opt.id
              ? 'bg-accent text-white'
              : 'bg-surface3 text-muted hover:bg-border hover:text-text'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Custom font helpers ────────────────────────────────────────────────────────

const CUSTOM_FONT_KEY = 'customFontEntries'
const CUSTOM_SENTINEL = '__custom__'

// In-memory cache for auto-fetched preset fonts (never saved to localStorage —
// localStorage is reserved for user-explicitly-loaded custom fonts only).
const presetFontCache = new Map<string, SavedFontEntry[]>()
// Track preset fonts currently being fetched to avoid duplicate IPC requests
const presetFontsLoading = new Set<string>()

interface SavedFontEntry { url: string; weight: string; style: string }

function getSavedFonts(): Record<string, SavedFontEntry[]> {
  try { return JSON.parse(localStorage.getItem(CUSTOM_FONT_KEY) ?? '{}') } catch { return {} }
}

function saveFontEntries(family: string, entries: SavedFontEntry[]) {
  const map = getSavedFonts()
  if (entries.length > 0) { map[family] = entries } else { delete map[family] }
  localStorage.setItem(CUSTOM_FONT_KEY, JSON.stringify(map))
}

/**
 * Inject @font-face CSS rules for `family` using the given entries.
 * Using a <style> tag handles variable weight ranges (e.g. "400 700") correctly,
 * whereas the FontFace constructor API has inconsistent support for them.
 */
function injectFontCSS(family: string, entries: SavedFontEntry[]): void {
  const id = `cfont-${family.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`
  document.getElementById(id)?.remove()
  if (entries.length === 0) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = entries.map(({ url, weight, style: sty }) =>
    `@font-face{font-family:"${family}";src:url("${url}");font-weight:${weight};font-style:${sty};font-display:block;}`
  ).join('\n')
  document.head.appendChild(style)
}

/** After injecting CSS, explicitly request each face so the browser actually loads the data: URL. */
async function loadFontFaces(family: string, entries: SavedFontEntry[]): Promise<void> {
  injectFontCSS(family, entries)
  // document.fonts.load() triggers the actual decode. Use the lower bound of any weight range.
  await Promise.all(
    entries.map(({ weight, style: sty }) => {
      const w = weight.includes(' ') ? weight.split(' ')[0] : weight
      return document.fonts.load(`${w} 16px "${family}"`).catch(() => {})
    })
  )
}

/** Re-inject all saved custom fonts at startup. data: URLs need no network. */
;(function restoreAllFonts() {
  const map = getSavedFonts()
  let dirty = false
  for (const [family, entries] of Object.entries(map)) {
    const clean = entries.filter((e) => e.url.startsWith('data:'))
    if (clean.length !== entries.length) {
      if (clean.length === 0) delete map[family]; else map[family] = clean
      dirty = true
    }
    if (clean.length > 0) {
      injectFontCSS(family, clean)
      // Trigger loading fire-and-forget; data: URLs decode near-instantly
      clean.forEach(({ weight, style: sty }) => {
        const w = weight.includes(' ') ? weight.split(' ')[0] : weight
        document.fonts.load(`${w} 16px "${family}"`).catch(() => {})
      })
    }
  }
  if (dirty) localStorage.setItem(CUSTOM_FONT_KEY, JSON.stringify(map))
})()

/** Normalises user-pasted text (URL / @import / <link> snippet) to a plain URL. */
function extractUrl(raw: string): string {
  const t = raw.trim()
  // Extract the LAST href= — skip preconnect links
  const hrefs = [...t.matchAll(/href=["']([^"']+)["']/g)]
  if (hrefs.length) return hrefs[hrefs.length - 1][1]
  // @import url(...)
  const imp = t.match(/@import\s+(?:url\()?["']?([^"'\s)]+)["']?\)?/)
  if (imp) return imp[1]
  return t
}

// ── Font family select ─────────────────────────────────────────────────────────

interface FontSelectProps {
  label: string
  value: string
  onChange: (v: string) => void
}

type FontStatus = 'idle' | 'loading' | 'loaded' | 'error'

export function FontSelect({ label, value, onChange }: FontSelectProps): JSX.Element {
  const isCustom = !FONT_FAMILIES.includes(value)
  const [showCustom, setShowCustom] = React.useState(isCustom)
  const [fontName, setFontName] = React.useState(isCustom ? value : '')
  const [customUrl, setCustomUrl] = React.useState('')
  const [showAdvanced, setShowAdvanced] = React.useState(false)
  const [status, setStatus] = React.useState<FontStatus>('idle')
  const [errorMsg, setErrorMsg] = React.useState('')

  // Sync when an external value change switches us back to/from custom
  React.useEffect(() => {
    const cust = !FONT_FAMILIES.includes(value)
    setShowCustom(cust)
    if (cust) {
      setFontName(value)
      const saved = getSavedFonts()[value]
      setStatus(saved ? 'loaded' : 'idle')
    } else {
      setStatus('idle')
    }
  }, [value])

  /** Load font using the advanced URL, auto-extracting the family name from it. */
  const handleLoadFromUrl = async () => {
    const rawUrl = customUrl.trim()
    if (!rawUrl) return
    const url = extractUrl(rawUrl)
    // Extract family name from ?family=Name:axes or ?family=Name
    const familyMatch = url.match(/[?&]family=([^&:]+)/)
    const extracted = familyMatch
      ? decodeURIComponent(familyMatch[1].replace(/\+/g, ' ')).trim()
      : fontName.trim()
    if (!extracted) { setErrorMsg('Could not detect font name from URL. Type it in the name field first.'); setStatus('error'); return }
    setFontName(extracted)
    setStatus('loading')
    setErrorMsg('')
    try {
      const result = await window.api.fetchGoogleFont(extracted, url)
      if (!result.ok || !result.entries?.length) {
        setErrorMsg(result.error ?? 'No font faces returned')
        setStatus('error')
        return
      }
      await loadFontFaces(extracted, result.entries)
      saveFontEntries(extracted, result.entries)
      setStatus('loaded')
      onChange(extracted)
    } catch (e) {
      setErrorMsg(String(e))
      setStatus('error')
    }
  }

  const handleLoad = async () => {
    const name = fontName.trim()
    if (!name) return
    setStatus('loading')

    try {
      setErrorMsg('')
      let entries: SavedFontEntry[] = []

      // Main process fetches CSS + downloads font files → returns base64 data: URLs.
      // data: URLs load instantly in the renderer with no CORS/network issues.
      const cssUrl = showAdvanced && customUrl.trim() ? extractUrl(customUrl) : undefined
      const result = await window.api.fetchGoogleFont(name, cssUrl)
      if (!result.ok || !result.entries?.length) {
        setErrorMsg(result.error ?? (result.entries?.length === 0 ? 'No font faces returned' : 'Unknown error'))
        setStatus('error')
        return
      }
      entries = result.entries
      await loadFontFaces(name, entries)  // awaits decode from memory (near-instant for data: URLs)

      saveFontEntries(name, entries)
      setStatus('loaded')
      onChange(name)
    } catch (e) {
      setErrorMsg(String(e))
      setStatus('error')
    }
  }

  const statusIcon = status === 'loading' ? '⏳' : status === 'loaded' ? '✓' : status === 'error' ? '✗' : ''
  const statusColor = status === 'loaded' ? 'text-green-400' : status === 'error' ? 'text-red-400' : 'text-textMuted'

  if (showCustom) {
    return (
      <Row label={label}>
        <div className="flex flex-col gap-1.5 w-full">
          {/* Font name + load button */}
          <div className="flex gap-1 items-center">
            <button
              title="Back to preset fonts"
              onClick={() => { setShowCustom(false); setStatus('idle'); onChange(FONT_FAMILIES[0]) }}
              className="shrink-0 px-1.5 py-1 rounded bg-surface3 border border-border text-xs text-muted hover:text-text"
            >←</button>
            <input
              type="text"
              value={fontName}
              onChange={(e) => { setFontName(e.target.value); setStatus('idle') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLoad() }}
              placeholder="Font family name…"
              className="flex-1 min-w-0 px-2 py-1 rounded bg-surface3 border border-border text-xs text-text focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleLoad}
              disabled={status === 'loading' || !fontName.trim()}
              className="shrink-0 px-2 py-1 rounded bg-accent text-white text-xs font-medium disabled:opacity-50"
            >Load</button>
            {statusIcon && <span className={`text-xs ${statusColor} shrink-0`}>{statusIcon}</span>}
          </div>

          {/* Status hint */}
          {status === 'loaded' && (
            <p className="text-[10px] text-green-400">Font loaded — using "{fontName}"</p>
          )}
          {status === 'error' && (
            <p className="text-[10px] text-red-400 break-all">
              {errorMsg || 'Not found on Google Fonts. Try advanced mode.'}
            </p>
          )}
          {status === 'idle' && !showAdvanced && (
            <p className="text-[10px] text-textMuted">Loads from Google Fonts automatically. Press Load or Enter.</p>
          )}

          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-[10px] text-textMuted hover:text-text text-left"
          >{showAdvanced ? '▲ Hide advanced' : '▼ Advanced: paste custom URL'}</button>

          {showAdvanced && (
            <div className="flex gap-1 items-center">
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLoadFromUrl() }}
                placeholder="https://fonts.googleapis.com/css2?family=..."
                className="flex-1 min-w-0 px-2 py-1 rounded bg-surface3 border border-border text-[10px] text-text font-mono focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleLoadFromUrl}
                disabled={status === 'loading' || !customUrl.trim()}
                className="shrink-0 px-2 py-1 rounded bg-accent text-white text-[10px] font-medium disabled:opacity-50"
              >Apply</button>
            </div>
          )}
        </div>
      </Row>
    )
  }

  const handlePresetSelect = (newFont: string) => {
    onChange(newFont) // apply immediately so the dropdown reflects the selection
    // Load the font file, then re-fire onChange so the canvas re-renders once
    // the font face is actually available (not just queued for download).
    loadFont(newFont).then(() => onChange(newFont))
  }

  return (
    <Row label={label}>
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === CUSTOM_SENTINEL) { setShowCustom(true); setFontName(''); setCustomUrl(''); setStatus('idle') }
          else handlePresetSelect(e.target.value)
        }}
        className="w-full min-w-0 px-2 py-1 rounded bg-surface3 border border-border text-xs text-text focus:outline-none focus:border-accent appearance-none cursor-pointer"
      >
        <option value={CUSTOM_SENTINEL}>— Other (custom) —</option>
        {FONT_FAMILY_GROUPS.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.families.map((f) => <option key={f} value={f}>{f}</option>)}
          </optgroup>
        ))}
      </select>
    </Row>
  )
}

// ── Font weight select ─────────────────────────────────────────────────────────

interface WeightSelectProps {
  label: string
  value: string
  onChange: (v: string) => void
}

// ── AI Image Generate Panel ────────────────────────────────────────────────────
// Reusable drop-in for any image upload section.

interface PresetColorRowProps { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }
function PresetColorRow({ label, value, onChange, placeholder, required }: PresetColorRowProps) {
  const isValid = /^#[0-9a-fA-F]{3,8}$/.test(value)
  return (
    <div className="flex gap-1.5 items-center">
      <span className="text-[10px] text-muted w-14 shrink-0">{label}</span>
      <div className="w-4 h-4 rounded border border-border shrink-0" style={{ background: isValid ? value : 'transparent' }} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '#rrggbb'}
        className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-surface2 border border-border text-[10px] text-text font-mono focus:outline-none focus:border-accent placeholder:text-muted/50"
      />
      {!required && value && (
        <button onClick={() => onChange('')} className="text-muted hover:text-text transition-colors text-[11px] leading-none">×</button>
      )}
    </div>
  )
}

interface AiImageGenPanelProps {
  onGenerated: (dataUrl: string) => void
}

export function AiImageGenPanel({ onGenerated }: AiImageGenPanelProps): JSX.Element {
  const [show, setShow] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [refImage, setRefImage] = useState<string | null>(null)
  const [showPreset, setShowPreset] = useState(false)
  const [showTips, setShowTips] = useState(false)
  const [iconOnly, setIconOnly] = useState(false)
  const [visualStyle, setVisualStyle] = useState<AiVisualStyle>('any')

  // Preset form state
  const [primaryColor, setPrimaryColor] = useState('#4A90D9')
  const [secondaryColor, setSecondaryColor] = useState('')
  const [tertiaryColor, setTertiaryColor] = useState('')
  const [topic, setTopic] = useState('')
  const [siteTitle, setSiteTitle] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => setRefImage(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const applyPreset = () => {
    const colorParts = [
      `primary color ${primaryColor}`,
      secondaryColor.trim() ? `secondary color ${secondaryColor.trim()}` : '',
      tertiaryColor.trim() ? `tertiary color ${tertiaryColor.trim()}` : ''
    ].filter(Boolean).join(', ')

    // Strict color rule — list only the chosen colors so the AI doesn't introduce others
    const chosenColors = [primaryColor, secondaryColor.trim(), tertiaryColor.trim()].filter(Boolean)
    const strictColorRule = `use ONLY these exact colors: ${chosenColors.join(', ')} — no other hues, shades, tints, or gradients outside these colors`

    const parts = iconOnly
      ? [
          'isolated icon symbol',
          '1:1 aspect ratio',
          'transparent background',
          'no outer container shape, no frame, no badge, no border',
          colorParts,
          strictColorRule,
          topic.trim() ? `design related to topic: ${topic.trim()}` : '',
          siteTitle.trim() ? `for website titled: ${siteTitle.trim()}` : '',
          'strictly follow every instruction in this prompt exactly'
        ]
      : [
          'complete website favicon icon',
          '1:1 aspect ratio',
          'transparent background',
          colorParts,
          strictColorRule,
          topic.trim() ? `design related to topic: ${topic.trim()}` : '',
          siteTitle.trim() ? `for website titled: ${siteTitle.trim()}` : '',
          'strictly follow every instruction in this prompt exactly'
        ]

    setPrompt(parts.filter(Boolean).join(', '))
    setShowPreset(false)
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    const result = await generateAIImage(withImageStyle(prompt.trim(), visualStyle), refImage ?? undefined)
    setLoading(false)
    if (result.success && result.dataUrl) {
      onGenerated(result.dataUrl)
      setShow(false)
      setPrompt('')
      setRefImage(null)
    } else {
      setError(result.error ?? 'Generation failed')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => { setShow((v) => !v); setError('') }}
        className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${show ? 'bg-accent/20 text-accent border-accent/40' : 'text-muted hover:text-text hover:bg-surface3 border-dashed border-border'}`}
      >
        <Sparkles size={10} /> AI Generate
      </button>
      {show && (
        <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-surface3 border border-border">
          {/* Reference image upload */}
          {refImage ? (
            <div className="relative w-full h-14 rounded-md overflow-hidden border border-border">
              <img src={refImage} className="w-full h-full object-cover" />
              <button
                onClick={() => setRefImage(null)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center text-[9px] leading-none"
              >×</button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-1.5 rounded-md border border-dashed border-border text-[10px] text-muted hover:text-text hover:border-text/30 transition-colors"
            >
              + Upload reference image (optional)
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }} />

          {/* Prompt textarea */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
            placeholder="Describe the image… or use Preset →"
            rows={2}
            className="w-full px-2 py-1.5 rounded-md bg-surface border border-border text-xs text-text focus:outline-none focus:border-accent resize-y min-h-[3rem] placeholder:text-muted"
          />

          <div>
            <p className="text-[10px] text-muted mb-1">Style lock</p>
            <div className="flex flex-wrap gap-1">
              {AI_VISUAL_STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  title={s.hint}
                  onClick={() => setVisualStyle(s.value)}
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

          {/* Preset form */}
          {showPreset && (
            <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-surface border border-border/60">
              <p className="text-[10px] text-muted font-medium">Preset prompt builder</p>

              {/* Icon-only toggle */}
              <button
                onClick={() => setIconOnly((v) => !v)}
                className="flex items-center gap-2 w-full text-left"
              >
                <div className={`relative w-7 h-4 rounded-full transition-colors shrink-0 ${iconOnly ? 'bg-accent' : 'bg-border'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${iconOnly ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-[10px] text-text leading-tight">
                  {iconOnly
                    ? <><span className="font-medium">Shape only</span> — just the inner symbol, no outer container</>
                    : <><span className="font-medium">Full favicon</span> — complete icon with outer shape & background</>
                  }
                </span>
              </button>

              <PresetColorRow label="Primary" value={primaryColor} onChange={setPrimaryColor} required />
              <PresetColorRow label="Secondary" value={secondaryColor} onChange={setSecondaryColor} placeholder="optional" />
              <PresetColorRow label="Tertiary" value={tertiaryColor} onChange={setTertiaryColor} placeholder="optional" />
              <div className="flex gap-1.5 items-center">
                <span className="text-[10px] text-muted w-14 shrink-0">Topic</span>
                <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. finance, remote work…"
                  className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-surface2 border border-border text-[10px] text-text focus:outline-none focus:border-accent placeholder:text-muted/50" />
              </div>
              <div className="flex gap-1.5 items-center">
                <span className="text-[10px] text-muted w-14 shrink-0">Site title</span>
                <input type="text" value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} placeholder="e.g. BudgetPro…"
                  className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-surface2 border border-border text-[10px] text-text focus:outline-none focus:border-accent placeholder:text-muted/50" />
              </div>
              <button onClick={applyPreset}
                className="mt-0.5 w-full py-1 rounded-md bg-accent/20 text-accent text-[10px] font-medium hover:bg-accent/30 transition-colors">
                Apply to Prompt
              </button>
            </div>
          )}

          {/* Error */}
          {error && <p className="text-[10px] text-red-400 leading-tight">{error}</p>}

          {/* Tips */}
          <div>
            <button onClick={() => setShowTips((v) => !v)}
              className="text-[10px] text-muted hover:text-text transition-colors">
              {showTips ? '▾' : '▸'} Not getting what you want?
            </button>
            {showTips && (
              <div className="mt-1.5 flex flex-col gap-1 p-2 rounded-lg bg-surface border border-border/60 text-[10px] text-muted leading-relaxed">
                <p className="text-text font-medium mb-0.5">Tips for better results</p>
                <p>• <span className="text-text">Be specific</span> — describe shapes, style, mood (e.g. "minimalist flat icon", "3D glossy", "neon glow")</p>
                <p>• <span className="text-text">Add a style</span> — e.g. "flat design", "gradient", "line art", "watercolor", "pixel art"</p>
                <p>• <span className="text-text">Say what to avoid</span> — e.g. "no text", "no background", "no shadows"</p>
                <p>• <span className="text-text">Try regenerating</span> — each run produces a different result</p>
                <p>• <span className="text-text">Upload a reference image</span> — use an existing logo/style as the base and describe changes</p>
                <p>• <span className="text-text">Use the Preset</span> — it auto-fills colors, topic and site name so the AI understands your brand</p>
                <p>• <span className="text-text">Keep prompts short</span> — 10–20 words works better than long paragraphs</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={() => { setShowPreset((v) => !v); setError('') }}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${showPreset ? 'bg-surface text-text border-border' : 'text-muted hover:text-text hover:bg-surface border-dashed border-border'}`}
            >
              Preset
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <><Loader size={11} className="animate-spin" /> Generating…</> : <><Sparkles size={11} /> Generate</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function WeightSelect({ label, value, onChange }: WeightSelectProps): JSX.Element {
  return (
    <SelectRow
      label={label}
      value={value}
      options={FONT_WEIGHTS}
      onChange={onChange}
    />
  )
}

// ── Remove Background Button ───────────────────────────────────────────────────
// Runs an uploaded image through briaai/RMBG-1.4 to strip the background.

interface RemoveBgButtonProps {
  imageDataUrl: string
  onResult: (dataUrl: string) => void
}

export function RemoveBgButton({ imageDataUrl, onResult }: RemoveBgButtonProps): JSX.Element {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    setLoading(true)
    setError('')
    const result = await removeImageBackground(imageDataUrl)
    setLoading(false)
    if (result.success && result.dataUrl) {
      onResult(result.dataUrl)
    } else {
      setError(result.error ?? 'Failed')
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 py-1 rounded-lg text-[10px] font-medium border border-dashed border-border text-muted hover:text-text hover:bg-surface3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? <><Loader size={10} className="animate-spin" /> Removing background…</>
          : '✦ Remove BG'}
      </button>
      {error && <p className="text-[10px] text-red-400 leading-tight">{error}</p>}
    </div>
  )
}

// ── Image recolor (scan up to 5 colours, toggle manual replace like SVG) ───────

export type ImageRecolorPatch = Partial<ImageRecolorFields>

interface ImageRecolorControlsProps {
  imageDataUrl: string
  imageUseOriginalColors?: boolean
  imagePalette?: string[]
  imageColor1?: string
  imageColor2?: string
  imageColor3?: string
  imageColor4?: string
  imageColor5?: string
  onChange: (patch: ImageRecolorPatch) => void
}

export function ImageRecolorControls({
  imageDataUrl,
  imageUseOriginalColors = true,
  imagePalette = [],
  imageColor1 = '',
  imageColor2 = '',
  imageColor3 = '',
  imageColor4 = '',
  imageColor5 = '',
  onChange
}: ImageRecolorControlsProps): JSX.Element | null {
  const [scanning, setScanning] = useState(false)
  if (!imageDataUrl) return null

  const colors = [imageColor1, imageColor2, imageColor3, imageColor4, imageColor5]
  const colorKeys = ['imageColor1', 'imageColor2', 'imageColor3', 'imageColor4', 'imageColor5'] as const

  const scan = async () => {
    setScanning(true)
    try {
      const palette = await scanImagePalette(imageDataUrl)
      onChange(imageRecolorFieldsFromPalette(palette))
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-1 pt-1">
      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-xs text-muted">Image colours</span>
        <button
          type="button"
          onClick={scan}
          disabled={scanning}
          className="px-2 py-1 rounded-lg text-[10px] font-medium bg-surface3 text-muted hover:text-text border border-border disabled:opacity-50 transition-colors"
          title="Scan the image for up to 5 solid colours"
        >
          {scanning ? 'Scanning…' : imagePalette.length ? 'Rescan colours' : 'Scan colours'}
        </button>
      </div>
      {imagePalette.length > 0 && (
        <>
          <ToggleRow
            label="Original colors"
            value={imageUseOriginalColors}
            onChange={(v) => {
              if (v) {
                onChange({ imageUseOriginalColors: true })
                return
              }
              // Entering manual mode: seed empty slots from the scanned palette.
              const patch: ImageRecolorPatch = { imageUseOriginalColors: false }
              colorKeys.forEach((key, i) => {
                if (!(colors[i] || '').trim() && imagePalette[i]) patch[key] = imagePalette[i]
              })
              onChange(patch)
            }}
          />
          {!imageUseOriginalColors &&
            imagePalette.map((orig, i) => (
              <ColorRow
                key={colorKeys[i]}
                label={`Color ${i + 1}`}
                value={(colors[i] || '').trim() || orig}
                onChange={(v) => onChange({ [colorKeys[i]]: v === orig ? '' : v })}
              />
            ))}
          {!imageUseOriginalColors && (
            <p className="text-[10px] text-muted leading-snug pb-1">
              Maps each scanned colour to the picker above — best for simple flat designs.
            </p>
          )}
        </>
      )}
    </div>
  )
}
