import { useState, useCallback, useEffect, useRef } from 'react'

const MAX_HISTORY = 50
/** Web workspace JSON includes full version snaps — keep persisted undo smaller than desktop. */
const MAX_PERSISTED_HISTORY_WEB = 15

function isWebRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as Window & { __WEB__?: boolean }).__WEB__
}
import {
  Version,
  AssetVariant,
  LogoConfig,
  FaviconConfig,
  DEFAULT_LOGO_CONFIG,
  DEFAULT_FAVICON_CONFIG
} from '../types'
import { versionFromIgTemplate } from '../utils/templateFile'

/** A single point on the undo/redo timeline. */
interface Snap { state: Version[]; label: string; time: number }
/** Lightweight timeline entry surfaced to the History panel UI. */
export interface HistoryEntry { label: string; time: number }

/** Disk / workspace payload so undo survives app restarts. */
export interface PersistedUndoHistory {
  v: 1
  past: Snap[]
  future: Snap[]
  currentLabel: string
  currentTime: number
}

// ── History label helpers ─────────────────────────────────────────────────────

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

function summarizePaintSession(
  prev: { paintSession?: unknown } | null | undefined,
  next: { paintSession?: unknown } | null | undefined
): string | null {
  const a = prev?.paintSession ?? null
  const b = next?.paintSession ?? null
  if (sameJson(a, b)) return null
  if (!a && b) return 'Paint'
  if (a && !b) return 'Clear paint'
  return 'Paint'
}

function summarizeFaviconConfig(prev: FaviconConfig, next: FaviconConfig): string[] {
  const parts: string[] = []
  const paint = summarizePaintSession(prev, next)
  if (paint) parts.push(paint)

  if (prev.outerShape !== next.outerShape) parts.push('Outer type')
  else if (
    prev.outerShapeImageDataUrl !== next.outerShapeImageDataUrl ||
    prev.outerShapeSvgMarkup !== next.outerShapeSvgMarkup
  ) parts.push('Outer image')
  else if (
    prev.backgroundColor !== next.backgroundColor ||
    prev.transparentBg !== next.transparentBg ||
    prev.outerShapeSvgColor !== next.outerShapeSvgColor
  ) parts.push('Outer fill')
  else if (
    prev.borderWidth !== next.borderWidth ||
    prev.borderColor !== next.borderColor ||
    prev.borderRadius !== next.borderRadius
  ) parts.push('Outer border')
  else if (
    prev.shadowEnabled !== next.shadowEnabled ||
    prev.shadowColor !== next.shadowColor ||
    prev.shadowBlur !== next.shadowBlur ||
    prev.shadowSpread !== next.shadowSpread ||
    prev.shadowOffsetX !== next.shadowOffsetX ||
    prev.shadowOffsetY !== next.shadowOffsetY ||
    prev.shadowInset !== next.shadowInset
  ) parts.push('Outer shadow')

  const pc = prev.content
  const nc = next.content
  if (!sameJson(pc, nc)) {
    if (pc.type !== nc.type) parts.push(`Inner → ${nc.type}`)
    else if (
      pc.offsetX !== nc.offsetX || pc.offsetY !== nc.offsetY ||
      pc.fontSizeRatio !== nc.fontSizeRatio ||
      pc.shapeSizeRatio !== nc.shapeSizeRatio ||
      pc.lucideSizeRatio !== nc.lucideSizeRatio ||
      pc.svgMarkupSizeRatio !== nc.svgMarkupSizeRatio ||
      pc.imageSizeRatio !== nc.imageSizeRatio
    ) parts.push('Inner size/offset')
    else if (
      pc.textColor !== nc.textColor || pc.shapeColor !== nc.shapeColor ||
      pc.lucideColor !== nc.lucideColor || pc.svgColor !== nc.svgColor
    ) parts.push('Inner color')
    else if (
      pc.text !== nc.text || pc.fontFamily !== nc.fontFamily ||
      pc.fontWeight !== nc.fontWeight || pc.letterSpacing !== nc.letterSpacing
    ) parts.push('Inner text')
    else if (
      pc.contentShadowEnabled !== nc.contentShadowEnabled ||
      pc.contentShadowColor !== nc.contentShadowColor ||
      pc.contentShadowBlur !== nc.contentShadowBlur ||
      pc.contentBorderWidth !== nc.contentBorderWidth ||
      pc.contentBorderColor !== nc.contentBorderColor ||
      pc.shapeBorderRadius !== nc.shapeBorderRadius
    ) parts.push('Inner style')
    else parts.push('Inner content')
  }

  if (parts.length === 0 && !sameJson(prev, next)) parts.push('Settings')
  return parts
}

function summarizeLogoConfig(prev: LogoConfig, next: LogoConfig): string[] {
  const parts: string[] = []
  const paint = summarizePaintSession(prev.icon, next.icon)
  if (paint) parts.push(paint)

  if (
    prev.text !== next.text ||
    prev.secondaryText !== next.secondaryText ||
    prev.fontFamily !== next.fontFamily ||
    prev.fontSize !== next.fontSize ||
    prev.fontWeight !== next.fontWeight ||
    prev.textColor !== next.textColor ||
    prev.secondaryTextColor !== next.secondaryTextColor
  ) parts.push('Text')

  if (prev.layout !== next.layout || prev.gap !== next.gap) parts.push('Layout')
  if (prev.backgroundColor !== next.backgroundColor || prev.transparentBg !== next.transparentBg) {
    parts.push('Background')
  }

  const pi = prev.icon
  const ni = next.icon
  if (!sameJson(pi, ni)) {
    if ((prev.iconLinked ?? true) !== (next.iconLinked ?? true)) {
      parts.push(next.iconLinked ? 'Link favicon' : 'Unlink favicon')
    } else if (pi.sourceType !== ni.sourceType) {
      parts.push(`Icon → ${ni.sourceType}`)
    } else if (
      (pi.containerEnabled ?? false) !== (ni.containerEnabled ?? false) ||
      pi.containerShape !== ni.containerShape ||
      pi.containerType !== ni.containerType ||
      pi.containerColor !== ni.containerColor ||
      pi.containerImageDataUrl !== ni.containerImageDataUrl ||
      pi.containerSvgMarkup !== ni.containerSvgMarkup
    ) parts.push('Outer shape')
    else if (
      pi.containerBorderWidth !== ni.containerBorderWidth ||
      pi.containerBorderColor !== ni.containerBorderColor ||
      pi.containerBorderRadius !== ni.containerBorderRadius
    ) parts.push('Outer border')
    else if (
      pi.shadowEnabled !== ni.shadowEnabled ||
      pi.shadowColor !== ni.shadowColor ||
      pi.shadowBlur !== ni.shadowBlur
    ) parts.push('Outer shadow')
    else if (
      pi.primaryColor !== ni.primaryColor ||
      pi.textColor !== ni.textColor ||
      pi.shape !== ni.shape ||
      pi.shapeBorderRadius !== ni.shapeBorderRadius ||
      pi.text !== ni.text ||
      pi.lucideIconName !== ni.lucideIconName
    ) parts.push('Inner content')
    else if (
      pi.offsetX !== ni.offsetX || pi.offsetY !== ni.offsetY ||
      pi.size !== ni.size ||
      pi.shapeSizeRatio !== ni.shapeSizeRatio ||
      pi.fontSizeRatio !== ni.fontSizeRatio
    ) parts.push('Inner size/offset')
    else if (!parts.includes('Paint')) {
      parts.push('Icon')
    }
  }

  if (parts.length === 0 && !sameJson(prev, next)) parts.push('Settings')
  return parts
}

function describeVariantListChange<T extends LogoConfig | FaviconConfig>(
  kind: 'Logo' | 'Favicon',
  prev: AssetVariant<T>[],
  next: AssetVariant<T>[],
  summarize: (a: T, b: T) => string[]
): string {
  if (next.length > prev.length) {
    const added = next.find((v) => !prev.some((p) => p.id === v.id))
    return `${kind} · Add variant${added ? ` "${added.label}"` : ''}`
  }
  if (next.length < prev.length) {
    const removed = prev.find((v) => !next.some((n) => n.id === v.id))
    return `${kind} · Remove variant${removed ? ` "${removed.label}"` : ''}`
  }

  for (let i = 0; i < next.length; i++) {
    const a = prev.find((p) => p.id === next[i].id) ?? prev[i]
    const b = next[i]
    if (!a) continue
    if (a.label !== b.label) return `${kind} · Rename variant "${a.label}" → "${b.label}"`
    if (!sameJson(a.config, b.config)) {
      const details = summarize(a.config, b.config).slice(0, 2)
      const detail = details.length ? ` · ${details.join(', ')}` : ''
      return `${kind}${detail} · ${b.label}`
    }
  }

  if (!sameJson(prev.map((v) => v.id), next.map((v) => v.id))) {
    return `${kind} · Reorder variants`
  }
  return `${kind} · Edit`
}

/** Build a short, human-readable history label for a version update. */
export function describeVersionUpdate(prev: Version, next: Version): string {
  if (prev.name !== next.name) {
    return `Rename "${prev.name}" → "${next.name}"`
  }
  if (prev.description !== next.description) {
    return `Update notes · ${next.name}`
  }
  if (!sameJson(prev.favicons, next.favicons)) {
    return describeVariantListChange(
      'Favicon',
      prev.favicons,
      next.favicons,
      summarizeFaviconConfig
    )
  }
  if (!sameJson(prev.logos, next.logos)) {
    return describeVariantListChange(
      'Logo',
      prev.logos,
      next.logos,
      summarizeLogoConfig
    )
  }
  return `Edit · ${next.name}`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLogoVariant(name: string): AssetVariant<LogoConfig> {
  return {
    id: `logo_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    label: 'Dark',
    config: { ...DEFAULT_LOGO_CONFIG, text: name }
  }
}

function makeFaviconVariant(name: string): AssetVariant<FaviconConfig> {
  return {
    id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    label: 'Dark',
    config: {
      ...DEFAULT_FAVICON_CONFIG,
      content: {
        ...DEFAULT_FAVICON_CONFIG.content,
        text: name.slice(0, 2).toUpperCase()
      }
    }
  }
}

/**
 * Deep-merge a logo variant's config with the current defaults.
 * Any field added to LogoConfig/IconConfig after the template was saved will
 * receive its default value, keeping old templates forward-compatible.
 */
function migrateLogoVariant(v: AssetVariant<LogoConfig>): AssetVariant<LogoConfig> {
  const cfg = v.config ?? {}
  return {
    ...v,
    config: {
      ...DEFAULT_LOGO_CONFIG,
      ...cfg,
      icon: {
        ...DEFAULT_LOGO_CONFIG.icon,
        ...(cfg as LogoConfig).icon
      }
    }
  }
}

/**
 * Deep-merge a favicon variant's config with the current defaults.
 */
function migrateFaviconVariant(v: AssetVariant<FaviconConfig>): AssetVariant<FaviconConfig> {
  const cfg = (v.config ?? {}) as Partial<FaviconConfig>
  return {
    ...v,
    config: {
      ...DEFAULT_FAVICON_CONFIG,
      ...cfg,
      content: {
        ...DEFAULT_FAVICON_CONFIG.content,
        ...cfg.content
      }
    }
  }
}

/** Migrate from old single-logo format to variants array format, and fill in any
 *  missing fields from current defaults (forward-compatibility for old templates). */
function migrateVersion(raw: Record<string, unknown>): Version {
  const v = raw as Version & { logo?: LogoConfig; favicon?: FaviconConfig }

  const rawLogos: AssetVariant<LogoConfig>[] =
    Array.isArray(v.logos) && v.logos.length > 0
      ? v.logos
      : [{ id: 'logo_legacy', label: 'Dark', config: v.logo ?? { ...DEFAULT_LOGO_CONFIG } }]

  const rawFavicons: AssetVariant<FaviconConfig>[] =
    Array.isArray(v.favicons) && v.favicons.length > 0
      ? v.favicons
      : [{ id: 'fav_legacy', label: 'Dark', config: v.favicon ?? { ...DEFAULT_FAVICON_CONFIG } }]

  return {
    id: v.id,
    name: v.name,
    description: v.description,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    logos: rawLogos.map(migrateLogoVariant),
    favicons: rawFavicons.map(migrateFaviconVariant)
  }
}

function migrateSnap(raw: unknown): Snap | null {
  if (!raw || typeof raw !== 'object') return null
  const snap = raw as { state?: unknown; label?: unknown; time?: unknown }
  if (!Array.isArray(snap.state)) return null
  return {
    state: (snap.state as Record<string, unknown>[]).map(migrateVersion),
    label: typeof snap.label === 'string' && snap.label.trim() ? snap.label : 'Edit',
    time: typeof snap.time === 'number' && Number.isFinite(snap.time) ? snap.time : Date.now()
  }
}

function parsePersistedHistory(raw: unknown): PersistedUndoHistory | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<PersistedUndoHistory>
  if (data.v !== 1) return null
  if (!Array.isArray(data.past) || !Array.isArray(data.future)) return null
  const past = data.past.map(migrateSnap).filter((s): s is Snap => !!s)
  const future = data.future.map(migrateSnap).filter((s): s is Snap => !!s)
  return {
    v: 1,
    past: past.slice(-MAX_HISTORY),
    future: future.slice(0, MAX_HISTORY),
    currentLabel:
      typeof data.currentLabel === 'string' && data.currentLabel.trim()
        ? data.currentLabel
        : 'Opened project',
    currentTime:
      typeof data.currentTime === 'number' && Number.isFinite(data.currentTime)
        ? data.currentTime
        : Date.now()
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVersions() {
  const [versions, setVersionsState] = useState<Version[]>([])
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(false)

  // Always-current ref so callbacks never need to close over `versions` state.
  // This lets us declare all callbacks with stable identities (empty / [save] deps).
  const versionsRef = useRef<Version[]>(versions)
  versionsRef.current = versions

  // ── Undo / Redo / History timeline ────────────────────────────────────────────
  // Timeline model: pastRef (older states) + live current (versionsRef) + futureRef.
  // Each snapshot carries a label + timestamp so the History panel can list them.
  const pastRef   = useRef<Snap[]>([])
  const futureRef = useRef<Snap[]>([])
  const curLabelRef = useRef<string>('Opened project')
  const curTimeRef  = useRef<number>(Date.now())
  // Timer used to debounce rapid slider/input changes into a single history entry
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Meta mirror for the UI (only updated on structural changes, never per slider tick)
  const [historyMeta, setHistoryMeta] = useState<{ entries: HistoryEntry[]; index: number }>(
    { entries: [{ label: 'Opened project', time: Date.now() }], index: 0 }
  )

  const refreshMeta = useCallback(() => {
    const past = pastRef.current
    const fut  = futureRef.current
    const entries: HistoryEntry[] = [
      ...past.map((s) => ({ label: s.label, time: s.time })),
      { label: curLabelRef.current, time: curTimeRef.current },
      ...fut.map((s) => ({ label: s.label, time: s.time }))
    ]
    setHistoryMeta({ entries, index: past.length })
  }, [])

  const serializeHistory = useCallback((): PersistedUndoHistory => {
    const maxPersist = isWebRuntime() ? MAX_PERSISTED_HISTORY_WEB : MAX_HISTORY
    return {
      v: 1,
      past: pastRef.current.slice(-maxPersist),
      future: futureRef.current.slice(0, maxPersist),
      currentLabel: curLabelRef.current,
      currentTime: curTimeRef.current
    }
  }, [])

  const applyHistory = useCallback((raw: unknown) => {
    const restored = parsePersistedHistory(raw)
    if (restored) {
      pastRef.current = restored.past
      futureRef.current = restored.future
      curLabelRef.current = restored.currentLabel
      curTimeRef.current = restored.currentTime
    } else {
      pastRef.current = []
      futureRef.current = []
      curLabelRef.current = 'Opened project'
      curTimeRef.current = Date.now()
    }
    refreshMeta()
  }, [refreshMeta])

  const flushPersist = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (!loadedRef.current) return
    void window.api.saveVersions(versionsRef.current, serializeHistory()).then((result) => {
      if (result && result.success === false) {
        console.error('[versions] flush save failed:', result.error)
      }
    })
  }, [serializeHistory])

  // Load from file on mount + listen for template imports from main process
  useEffect(() => {
    loadedRef.current = false
    window.api.loadVersions().then(async (raw) => {
      const migrated = (raw as Record<string, unknown>[]).map(migrateVersion)
      setVersionsState(migrated)
      versionsRef.current = migrated
      const history = await window.api.loadUndoHistory()
      applyHistory(history)
      loadedRef.current = true
      setLoaded(true)
    }).catch((err) => {
      console.error('[versions] load failed:', err)
      loadedRef.current = true
      setLoaded(true)
    })

    window.api.onTemplateImported((raw) => {
      const version = migrateVersion(raw as Record<string, unknown>)
      setVersionsState((prev) => {
        if (prev.some((v) => v.id === version.id)) return prev
        const next = [...prev, version]
        versionsRef.current = next
        if (loadedRef.current) persist(next)
        return next
      })
    })

    window.api.onVersionsReloaded((raw) => {
      const migrated = (raw as Record<string, unknown>[]).map(migrateVersion)
      loadedRef.current = true
      setVersionsState(migrated)
      versionsRef.current = migrated
      setLoaded(true)
      void window.api.loadUndoHistory().then(applyHistory)
    })

    // Web: flush pending workspace+history before the tab is discarded so undo
    // survives refresh / close within the login session.
    const onPageHide = () => flushPersist()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushPersist()
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      if (loadedRef.current) {
        void window.api.saveVersions(versionsRef.current, serializeHistory())
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = useCallback((next: Version[]) => {
    if (!loadedRef.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      void window.api.saveVersions(next, serializeHistory()).then((result) => {
        if (result && result.success === false) {
          console.error('[versions] save failed:', result.error)
        }
      })
    }, 400)
  }, [serializeHistory])

  const save = useCallback(
    (next: Version[]) => {
      versionsRef.current = next
      setVersionsState(next)
      persist(next)
    },
    [persist]
  )

  // Commit a discrete structural action: push the CURRENT state into the past
  // with its existing label, then adopt the new state under `actionLabel`.
  // Uses versionsRef so this callback never needs to change identity.
  const commit = useCallback((newState: Version[], actionLabel: string) => {
    pastRef.current = [
      ...pastRef.current.slice(-(MAX_HISTORY - 1)),
      { state: versionsRef.current, label: curLabelRef.current, time: curTimeRef.current }
    ]
    futureRef.current = []
    curLabelRef.current = actionLabel
    curTimeRef.current = Date.now()
    versionsRef.current = newState
    save(newState)
    refreshMeta()
  }, [save, refreshMeta])

  // All CRUD callbacks read versionsRef.current instead of closing over `versions`,
  // giving them stable identities that only change when `save` changes (= never).
  // This prevents prop-identity churn that previously forced editor re-renders
  // (and therefore canvas redraws) on every App render.

  const createVersion = useCallback(
    (name: string, description: string): Version => {
      const current = versionsRef.current
      const version: Version = {
        id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        logos: [makeLogoVariant(name)],
        favicons: [makeFaviconVariant(name)]
      }
      commit([...current, version], `Create "${name}"`)
      return version
    },
    [commit]
  )

  // Create a new version from an uploaded raster image: the image becomes the
  // favicon inner content (no outer shape, transparent bg) and the logo icon,
  // so the user can immediately edit it (add a container, borders, paint, etc.).
  const importImageVersion = useCallback(
    (name: string, imageDataUrl: string): Version => {
      const current = versionsRef.current
      const favVariant = makeFaviconVariant(name)
      favVariant.config = {
        ...favVariant.config,
        outerShape: 'none',
        transparentBg: true,
        content: {
          ...favVariant.config.content,
          type: 'image',
          imageDataUrl,
          imageSizeRatio: 1
        }
      }
      const logoVariant = makeLogoVariant(name)
      logoVariant.config = {
        ...logoVariant.config,
        iconLinked: false,
        icon: {
          ...logoVariant.config.icon,
          sourceType: 'image',
          imageDataUrl,
          imageSizeRatio: 1,
          containerEnabled: false
        }
      }
      const version: Version = {
        id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        description: 'Imported image',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        logos: [logoVariant],
        favicons: [favVariant]
      }
      commit([...current, version], `Import "${name}"`)
      return version
    },
    [commit]
  )

  const importTemplateVersion = useCallback(
    (data: Record<string, unknown>, fallbackName: string): Version => {
      const current = versionsRef.current
      const version = migrateVersion(
        versionFromIgTemplate(data, fallbackName) as Record<string, unknown>
      )
      commit([...current, version], `Import "${version.name}"`)
      return version
    },
    [commit]
  )

  const updateVersion = useCallback(
    (id: string, updates: Partial<Version>, actionLabel?: string) => {
      const current = versionsRef.current
      const prevVersion = current.find((v) => v.id === id)
      const newState = current.map((v) =>
        v.id === id ? { ...v, ...updates, updatedAt: new Date().toISOString() } : v
      )
      const nextVersion = newState.find((v) => v.id === id)
      // Keep the ref in sync immediately so back-to-back updates (e.g. paint
      // saving logos then favicons) don't overwrite each other with a stale base.
      versionsRef.current = newState
      // Debounced history: record the state BEFORE the first change in a rapid
      // gesture (slider drag, typing) so one undo step covers the whole gesture.
      // Mid-gesture ticks only call save() — never setState on the history meta —
      // so slider drags don't add per-tick React renders to the history panel.
      const labelFor = (from: Version | undefined, to: Version | undefined): string => {
        if (actionLabel) return actionLabel
        if (from && to) return describeVersionUpdate(from, to)
        return to ? `Edit · ${to.name}` : 'Edit'
      }
      if (!historyTimerRef.current) {
        pastRef.current = [
          ...pastRef.current.slice(-(MAX_HISTORY - 1)),
          { state: current, label: curLabelRef.current, time: curTimeRef.current }
        ]
        futureRef.current = []
        curLabelRef.current = labelFor(prevVersion, nextVersion)
        curTimeRef.current = Date.now()
        save(newState)
        refreshMeta()
      } else {
        clearTimeout(historyTimerRef.current)
        // Refine the label against the gesture's starting snapshot so a paint
        // save that touches favicon then logo still describes the full change.
        const baseSnap = pastRef.current[pastRef.current.length - 1]
        const baseVersion = baseSnap?.state.find((v) => v.id === id)
        curLabelRef.current = labelFor(baseVersion ?? prevVersion, nextVersion)
        save(newState)
      }
      historyTimerRef.current = setTimeout(() => {
        historyTimerRef.current = null
        refreshMeta()
      }, 800)
    },
    [save, refreshMeta]
  )

  const deleteVersion = useCallback(
    (id: string) => {
      const current = versionsRef.current
      const target = current.find((v) => v.id === id)
      commit(current.filter((v) => v.id !== id), `Delete "${target?.name ?? 'version'}"`)
    },
    [commit]
  )

  const duplicateVersion = useCallback(
    (id: string): Version | null => {
      const current = versionsRef.current
      const source = current.find((v) => v.id === id)
      if (!source) return null
      const copy: Version = {
        ...source,
        id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: `${source.name} (copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      commit([...current, copy], `Duplicate "${source.name}"`)
      return copy
    },
    [commit]
  )

  // Reorder the versions list by moving `fromId` to occupy `toId`'s slot.
  const reorderVersions = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return
      const current = versionsRef.current
      const from = current.findIndex((v) => v.id === fromId)
      const to = current.findIndex((v) => v.id === toId)
      if (from === -1 || to === -1) return
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      commit(next, `Reorder "${moved.name}"`)
    },
    [commit]
  )

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return
    const prev = pastRef.current[pastRef.current.length - 1]
    futureRef.current = [
      { state: versionsRef.current, label: curLabelRef.current, time: curTimeRef.current },
      ...futureRef.current.slice(0, MAX_HISTORY - 1)
    ]
    pastRef.current = pastRef.current.slice(0, -1)
    curLabelRef.current = prev.label
    curTimeRef.current = prev.time
    save(prev.state)
    refreshMeta()
  }, [save, refreshMeta])

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return
    const next = futureRef.current[0]
    pastRef.current = [
      ...pastRef.current.slice(-(MAX_HISTORY - 1)),
      { state: versionsRef.current, label: curLabelRef.current, time: curTimeRef.current }
    ]
    futureRef.current = futureRef.current.slice(1)
    curLabelRef.current = next.label
    curTimeRef.current = next.time
    save(next.state)
    refreshMeta()
  }, [save, refreshMeta])

  // Jump directly to any point on the timeline (History panel).
  const jumpTo = useCallback(
    (targetIndex: number) => {
      const timeline: Snap[] = [
        ...pastRef.current,
        { state: versionsRef.current, label: curLabelRef.current, time: curTimeRef.current },
        ...futureRef.current
      ]
      const curIdx = pastRef.current.length
      if (targetIndex === curIdx || targetIndex < 0 || targetIndex >= timeline.length) return
      const tgt = timeline[targetIndex]
      pastRef.current = timeline.slice(0, targetIndex)
      futureRef.current = timeline.slice(targetIndex + 1)
      curLabelRef.current = tgt.label
      curTimeRef.current = tgt.time
      save(tgt.state)
      refreshMeta()
    },
    [save, refreshMeta]
  )

  const canUndo = historyMeta.index > 0
  const canRedo = historyMeta.index < historyMeta.entries.length - 1
  // Undo reverses the current step; redo reapplies the next future step.
  const undoLabel = canUndo ? historyMeta.entries[historyMeta.index]?.label ?? null : null
  const redoLabel = canRedo ? historyMeta.entries[historyMeta.index + 1]?.label ?? null : null

  return {
    versions,
    loaded,
    createVersion,
    importImageVersion,
    importTemplateVersion,
    updateVersion,
    deleteVersion,
    duplicateVersion,
    reorderVersions,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    history: historyMeta.entries,
    historyIndex: historyMeta.index,
    jumpTo
  }
}
