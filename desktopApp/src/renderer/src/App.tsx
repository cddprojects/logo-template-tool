import React, { useState, useEffect, useCallback, useRef, Component, Suspense } from 'react'
import { ImageIcon, Smile, Pencil, LayoutGrid, Settings, AlertTriangle, RefreshCw, Undo2, Redo2, FolderDown, X, History, Download } from './components/Icons'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { HistoryPanel } from './components/HistoryPanel'
import { VersionModal } from './components/VersionModal'
import { SettingsModal } from './components/SettingsModal'
import { DownloadDesktopModal } from './components/DownloadDesktopModal'
import { GroupExportModal, type GroupExportOptions } from './components/GroupExportModal'
import { useVersions } from './hooks/useVersions'
import type { Version, AssetVariant, LogoConfig, FaviconConfig } from './types'
import { initFontLoading } from './utils/fontLoader'
import { isIgTemplateFile } from './utils/templateFile'
import { isBrowserWebBuild, lazyWithRetry } from './utils/lazyWithRetry'

// Lazy-load the heavy editors so they don't block the initial paint.
const LogoEditor = lazyWithRetry(() => import('./components/LogoEditor').then((m) => ({ default: m.LogoEditor })))
const FaviconEditor = lazyWithRetry(() => import('./components/FaviconEditor').then((m) => ({ default: m.FaviconEditor })))

type Tab = 'logo' | 'favicon'

declare global {
  interface Window {
    api: {
      exportGroup: (
        files: { filename: string; dataUrl: string }[],
        folderName?: string
      ) => Promise<{ success: boolean; folderPath?: string; error?: string }>
      onApiRenderRequest: (cb: (payload: unknown) => void) => void
      sendApiRenderResponse: (response: unknown) => void
      [key: string]: unknown
    }
  }
}

// ── Error boundary ────────────────────────────────────────────────────────────
interface EBState { error: Error | null }
class EditorErrorBoundary extends Component<{ children: React.ReactNode; onReset: () => void }, EBState> {
  state: EBState = { error: null }
  static getDerivedStateFromError(e: Error): EBState { return { error: e } }
  render() {
    if (this.state.error) {
      const chunkStale =
        isBrowserWebBuild() &&
        /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\d]+ failed/i.test(
          this.state.error.message
        )
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle size={32} className="text-yellow-400" />
          <div>
            <p className="text-sm font-semibold text-text mb-1">
              {chunkStale ? 'App update available' : 'Rendering error'}
            </p>
            <p className="text-xs text-muted max-w-md">
              {chunkStale
                ? 'A new version was deployed. Refresh the page to load the latest files.'
                : null}
            </p>
            <p className="text-xs text-muted font-mono bg-surface3 rounded px-3 py-2 max-w-md break-all mt-2">
              {this.state.error.message}
            </p>
          </div>
          <button
            onClick={() => {
              if (chunkStale) {
                window.location.reload()
                return
              }
              this.setState({ error: null })
              this.props.onReset()
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent-hover"
          >
            <RefreshCw size={12} /> {chunkStale ? 'Refresh page' : 'Retry'}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App(): JSX.Element {
  const {
    versions, loaded, createVersion, importImageVersion, importTemplateVersion, updateVersion,
    deleteVersion, duplicateVersion, reorderVersions,
    undo, redo, canUndo, canRedo, undoLabel, redoLabel,
    history, historyIndex, jumpTo
  } = useVersions()

  const [selectedId, setSelectedId] = useState<string | null>(() => versions[0]?.id ?? null)

  // Auto-select the first version once data finishes loading.
  // Also kick off font loading: used fonts first, rest during idle time.
  useEffect(() => {
    if (!loaded) return
    if (selectedId === null && versions.length > 0) setSelectedId(versions[0].id)
    initFontLoading(versions)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // If the selected version was removed by an undo, fall back to the first one
  useEffect(() => {
    if (loaded && selectedId && !versions.find((v) => v.id === selectedId)) {
      setSelectedId(versions[0]?.id ?? null)
    }
  }, [versions, selectedId, loaded])

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  // Bridge: the REST API server (main process) asks the renderer to draw to a
  // Canvas (DOM only), then sends the result back over IPC.
  useEffect(() => {
    window.api.onApiRenderRequest(async (raw) => {
      const { requestId, type, config, options } = raw as {
        requestId: string
        type: 'favicon' | 'logo'
        config: FaviconConfig | LogoConfig
        options: { format?: string; resolution?: number; scale?: number }
      }
      try {
        // Import renderer on first API call — not on app start.
        const { renderFavicon, renderLogo, generateFaviconSvg, generateLogoSvg } = await import('./utils/renderer')
        const fmt = (options.format ?? 'png').toLowerCase()

        if (type === 'favicon') {
          const faviconCfg = config as FaviconConfig
          if (fmt === 'svg') {
            const svg = await generateFaviconSvg(faviconCfg)
            window.api.sendApiRenderResponse({ requestId, success: true, data: svg, mimeType: 'image/svg+xml' })
          } else if (fmt === 'ico') {
            const sizes = [16, 32, 48, 256]
            const dataUrls = await Promise.all(sizes.map(async (sz) => {
              const c = document.createElement('canvas')
              await renderFavicon(c, { ...faviconCfg, size: sz })
              return c.toDataURL('image/png')
            }))
            window.api.sendApiRenderResponse({
              requestId, success: true,
              data: JSON.stringify(dataUrls),
              mimeType: 'image/x-icon-raw'
            })
          } else {
            const resolution = Math.min(Math.max(Number(options.resolution) || 256, 8), 1024)
            const c = document.createElement('canvas')
            await renderFavicon(c, { ...faviconCfg, size: resolution })
            window.api.sendApiRenderResponse({
              requestId, success: true,
              data: c.toDataURL('image/png'),
              mimeType: 'image/png'
            })
          }
        } else {
          const logoCfg = config as LogoConfig
          if (fmt === 'svg') {
            const svg = await generateLogoSvg(logoCfg)
            window.api.sendApiRenderResponse({ requestId, success: true, data: svg, mimeType: 'image/svg+xml' })
          } else {
            const scale = Math.min(Math.max(Number(options.scale) || 2, 1), 4)
            const c = document.createElement('canvas')
            await renderLogo(c, logoCfg, scale)
            window.api.sendApiRenderResponse({
              requestId, success: true,
              data: c.toDataURL('image/png'),
              mimeType: 'image/png'
            })
          }
        }
      } catch (err) {
        window.api.sendApiRenderResponse({ requestId, success: false, error: String(err) })
      }
    })
  // Register once on mount — the handler calls window.api which is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [activeTab, setActiveTab] = useState<Tab>('logo')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingVersion, setEditingVersion] = useState<Version | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showDownloadDesktop, setShowDownloadDesktop] = useState(false)
  const isWebApp =
    typeof window !== 'undefined' &&
    !!(window as Window & { __WEB__?: boolean }).__WEB__
  const [groupExporting, setGroupExporting] = useState(false)
  const [showGroupExport, setShowGroupExport] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // ── Toast notifications ───────────────────────────────────────────────────
  type ToastType = 'error' | 'success' | 'info'
  const [toast, setToast] = useState<{ msg: string; type: ToastType; id: number } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, type: ToastType = 'info', durationMs = 5000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ msg, type, id: Date.now() })
    toastTimerRef.current = setTimeout(() => setToast(null), durationMs)
  }, [])

  const handleGroupExport = useCallback(async (opts: GroupExportOptions) => {
    // Use the ref so we never read `selected` before it is declared below.
    const sel = selectedRef.current
    if (!sel) return
    if (!opts.logos && !opts.favicons) return
    setShowGroupExport(false)
    setGroupExporting(true)
    try {
      const [
        { renderLogo, renderFavicon, generateLogoSvg, generateFaviconSvg },
        { resolveLogoEffectiveIcon },
        {
          groupExportFileName,
          exportPixelSizeFromVariantLabel,
          svgStringToDataUrl,
          buildFaviconIcoDataUrl
        }
      ] = await Promise.all([
        import('./utils/renderer'),
        import('./components/LogoEditor'),
        import('./utils/exporter'),
      ])
      const files: { filename: string; dataUrl: string }[] = []

      if (opts.logos && opts.logoFormats.length > 0) {
        for (let i = 0; i < sel.logos.length; i++) {
          const logoVariant = sel.logos[i]
          const cfg = logoVariant.config

          // Sync only when a favicon variant shares the exact same label.
          const matchingFavicon = sel.favicons.find((f) => f.label === logoVariant.label)
          const effectiveIcon = resolveLogoEffectiveIcon(
            cfg,
            matchingFavicon?.config?.content,
            matchingFavicon?.config,
            !!matchingFavicon
          )
          const faviconIconSource =
            (cfg.iconLinked ?? true) && matchingFavicon?.config
              ? matchingFavicon.config
              : undefined
          const exportConfig = { ...cfg, icon: effectiveIcon }

          if (opts.logoFormats.includes('png')) {
            const canvas = document.createElement('canvas')
            await renderLogo(canvas, exportConfig, 4, true, faviconIconSource)
            files.push({
              filename: groupExportFileName('logo', i, logoVariant.label, 'png'),
              dataUrl: canvas.toDataURL('image/png')
            })
          }
          if (opts.logoFormats.includes('svg')) {
            const svg = await generateLogoSvg(exportConfig)
            files.push({
              filename: groupExportFileName('logo', i, logoVariant.label, 'svg'),
              dataUrl: svgStringToDataUrl(svg)
            })
          }
        }
      }

      if (opts.favicons && opts.faviconFormats.length > 0) {
        for (let i = 0; i < sel.favicons.length; i++) {
          const variant = sel.favicons[i]
          const favSize = exportPixelSizeFromVariantLabel(variant.label) ?? 512

          if (opts.faviconFormats.includes('png')) {
            const canvas = document.createElement('canvas')
            await renderFavicon(canvas, { ...variant.config, size: favSize })
            files.push({
              filename: groupExportFileName('favicon', i, variant.label, 'png'),
              dataUrl: canvas.toDataURL('image/png')
            })
          }
          if (opts.faviconFormats.includes('svg')) {
            const svg = await generateFaviconSvg(variant.config)
            files.push({
              filename: groupExportFileName('favicon', i, variant.label, 'svg'),
              dataUrl: svgStringToDataUrl(svg)
            })
          }
          if (opts.faviconFormats.includes('ico')) {
            const icoDataUrl = await buildFaviconIcoDataUrl(variant.config, variant.label)
            files.push({
              filename: groupExportFileName('favicon', i, variant.label, 'ico'),
              dataUrl: icoDataUrl
            })
          }
        }
      }

      if (!files.length) {
        showToast('Nothing selected to export', 'info')
        return
      }

      const result = await window.api.exportGroup(files, sel.name)
      if (result.success) {
        showToast(
          isWebApp
            ? `Downloaded ${files.length} files as zip`
            : `Exported ${files.length} files to folder`,
          'success'
        )
      } else if (result.error) {
        showToast(`Export failed: ${result.error}`, 'error')
        console.error('Group export error:', result.error)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Export failed: ${msg}`, 'error')
      console.error('Group export failed:', err)
    } finally {
      setGroupExporting(false)
    }
  // selectedRef and showToast are stable refs/callbacks — no dependencies needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handler = () => setShowSettings(true)
    window.addEventListener('open-ai-settings', handler)
    return () => window.removeEventListener('open-ai-settings', handler)
  }, [])

  const selected = versions.find((v) => v.id === selectedId) ?? null

  // Always-current ref so onChange callbacks below don't need to close over
  // `selected` (which changes on every version update, causing prop identity
  // churn that forced both editors to re-render on every slider tick).
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const handleCreate = (name: string, description: string) => {
    const v = createVersion(name, description)
    setSelectedId(v.id)
    setShowCreateModal(false)
  }

  const handleEdit = (name: string, description: string) => {
    if (editingVersion) {
      const label =
        editingVersion.name !== name
          ? `Rename "${editingVersion.name}" → "${name}"`
          : editingVersion.description !== description
            ? `Update notes · ${name}`
            : undefined
      updateVersion(editingVersion.id, { name, description }, label)
      setEditingVersion(null)
    }
  }

  const handleDelete = (id: string) => {
    deleteVersion(id)
    if (selectedId === id) {
      const remaining = versions.filter((v) => v.id !== id)
      setSelectedId(remaining[0]?.id ?? null)
    }
  }

  const handleDuplicate = (id: string) => {
    const copy = duplicateVersion(id)
    if (copy) setSelectedId(copy.id)
  }

  const [templateDropActive, setTemplateDropActive] = useState(false)

  const handleAppDragOver = (e: React.DragEvent) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setTemplateDropActive(true)
  }

  const handleAppDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setTemplateDropActive(false)
  }

  const handleAppDrop = async (e: React.DragEvent) => {
    setTemplateDropActive(false)
    const file = [...e.dataTransfer.files].find(isIgTemplateFile)
    if (!file) return
    e.preventDefault()
    try {
      const data = JSON.parse(await file.text()) as Record<string, unknown>
      const baseName = file.name.replace(/\.igtemplate$/i, '') || 'Imported template'
      const version = importTemplateVersion(data, baseName)
      setSelectedId(version.id)
    } catch {
      /* invalid template file */
    }
  }

  // Import an existing favicon/logo image file as a new, editable version.
  const importInputRef = useRef<HTMLInputElement>(null)
  const handleImport = () => importInputRef.current?.click()
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-importing the same file
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const baseName = file.name.replace(/\.[^./\\]+$/, '').slice(0, 40) || 'Imported'
      const v = importImageVersion(baseName, dataUrl)
      setSelectedId(v.id)
    }
    reader.readAsDataURL(file)
  }

  // useCallback + selectedRef: stable identity that never changes after mount.
  // Combined with the versionsRef fix in useVersions, updateVersion is also
  // stable, so these handlers never change → editors never get new onChange props.
  const handleLogosChange = useCallback((logos: AssetVariant<LogoConfig>[]) => {
    const sel = selectedRef.current
    if (sel) updateVersion(sel.id, { logos })
  }, [updateVersion])

  const handleFaviconsChange = useCallback((favicons: AssetVariant<FaviconConfig>[]) => {
    const sel = selectedRef.current
    if (sel) updateVersion(sel.id, { favicons })
  }, [updateVersion])

  return (
    <div className="flex flex-col h-screen bg-bg text-text overflow-hidden">
      <TitleBar />

      {!loaded ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted">Loading versions…</p>
          </div>
        </div>
      ) : (
        <div
          className="flex flex-1 min-h-0"
          onDragOver={handleAppDragOver}
          onDragLeave={handleAppDragLeave}
          onDrop={(e) => { void handleAppDrop(e) }}
        >
          {/* Sidebar */}
          <Sidebar
            versions={versions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreate={() => setShowCreateModal(true)}
            onImport={handleImport}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onReorder={reorderVersions}
            templateDropActive={templateDropActive}
          />
          <input
            ref={importInputRef}
            type="file"
            accept="image/*,.svg"
            onChange={handleImportFile}
            className="hidden"
          />

          {/* Main area */}
          <div className="flex flex-col flex-1 min-w-0">
            {selected ? (
              <>
                {/* Top bar with tabs */}
                <div className="flex items-center gap-0 px-4 border-b border-border bg-surface shrink-0">
                  {/* Version info */}
                  <div className="flex items-center gap-2 mr-6 py-3">
                    <span className="text-sm font-semibold text-text">{selected.name}</span>
                    {selected.description && (
                      <span className="text-xs text-muted">{selected.description}</span>
                    )}
                    <button
                      onClick={() => setEditingVersion(selected)}
                      className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-text hover:bg-surface3 transition-colors"
                      title="Edit version name"
                    >
                      <Pencil size={11} />
                    </button>
                  </div>

                  {/* Tabs */}
                  <Tab
                    active={activeTab === 'logo'}
                    icon={<ImageIcon size={13} />}
                    label="Logo"
                    onClick={() => setActiveTab('logo')}
                  />
                  <Tab
                    active={activeTab === 'favicon'}
                    icon={<Smile size={13} />}
                    label="Favicon"
                    onClick={() => setActiveTab('favicon')}
                  />

                  {/* Undo / Redo + Group Export + Settings */}
                  <div className="ml-auto flex items-center gap-1 relative">
                    <button
                      onClick={() => setShowGroupExport(true)}
                      disabled={!selected || groupExporting}
                      title={isWebApp ? 'Export all variants as a zip' : 'Export all variants to a folder'}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-muted hover:text-text hover:bg-surface3 disabled:hover:bg-transparent disabled:hover:text-muted"
                    >
                      {groupExporting
                        ? <RefreshCw size={14} className="animate-spin" />
                        : <FolderDown size={14} />}
                    </button>
                    <button
                      onClick={undo}
                      disabled={!canUndo}
                      title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-muted hover:text-text hover:bg-surface3 disabled:hover:bg-transparent disabled:hover:text-muted"
                    >
                      <Undo2 size={14} />
                    </button>
                    <button
                      onClick={redo}
                      disabled={!canRedo}
                      title={redoLabel ? `Redo: ${redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-muted hover:text-text hover:bg-surface3 disabled:hover:bg-transparent disabled:hover:text-muted"
                    >
                      <Redo2 size={14} />
                    </button>
                    <button
                      onClick={() => setShowHistory((s) => !s)}
                      title="History"
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        showHistory ? 'text-accent bg-surface3' : 'text-muted hover:text-text hover:bg-surface3'
                      }`}
                    >
                      <History size={14} />
                    </button>
                    {isWebApp && (
                      <button
                        onClick={() => setShowDownloadDesktop(true)}
                        title="Download desktop app"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface3 transition-colors"
                      >
                        <Download size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => setShowSettings(true)}
                      title="AI Settings"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface3 transition-colors"
                    >
                      <Settings size={14} />
                    </button>

                    {showHistory && (
                      <HistoryPanel
                        entries={history}
                        index={historyIndex}
                        onJump={jumpTo}
                        onClose={() => setShowHistory(false)}
                      />
                    )}
                  </div>
                </div>

                {/* Editor — both stay mounted; CSS hides the inactive one so that
                    LogoEditor never renders while the user is on the Favicon tab. */}
                <EditorErrorBoundary onReset={() => setActiveTab(activeTab)}>
                  <Suspense fallback={<div className="flex flex-1 items-center justify-center text-xs text-muted">Loading editor…</div>}>
                    <div style={{ display: activeTab === 'logo' ? 'contents' : 'none' }}>
                      <LogoEditor
                        versionName={selected.name}
                        variants={selected.logos}
                        faviconVariants={selected.favicons}
                        onChange={handleLogosChange}
                        onFaviconChange={handleFaviconsChange}
                        onOpenSettings={() => setShowSettings(true)}
                        isActive={activeTab === 'logo'}
                      />
                    </div>
                    <div style={{ display: activeTab === 'favicon' ? 'contents' : 'none' }}>
                      <FaviconEditor
                        versionName={selected.name}
                        variants={selected.favicons}
                        logoVariants={selected.logos}
                        onChange={handleFaviconsChange}
                        onLogoChange={handleLogosChange}
                        onOpenSettings={() => setShowSettings(true)}
                        isActive={activeTab === 'favicon'}
                      />
                    </div>
                  </Suspense>
                </EditorErrorBoundary>
              </>
            ) : (
              <EmptyState onNew={() => setShowCreateModal(true)} />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <VersionModal onConfirm={handleCreate} onClose={() => setShowCreateModal(false)} />
      )}
      {editingVersion && (
        <VersionModal
          initial={{ name: editingVersion.name, description: editingVersion.description }}
          onConfirm={handleEdit}
          onClose={() => setEditingVersion(null)}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showGroupExport && (
        <GroupExportModal
          onClose={() => setShowGroupExport(false)}
          onConfirm={(opts) => { void handleGroupExport(opts) }}
        />
      )}
      {showDownloadDesktop && (
        <DownloadDesktopModal onClose={() => setShowDownloadDesktop(false)} />
      )}

      {/* Toast notifications */}
      {toast && (
        <div
          key={toast.id}
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium max-w-md w-max border animate-fade-in ${
            toast.type === 'error'
              ? 'bg-red-950 border-red-800 text-red-200'
              : toast.type === 'success'
              ? 'bg-green-950 border-green-800 text-green-200'
              : 'bg-surface2 border-border text-text'
          }`}
          style={{ animation: 'fadeSlideUp 0.2s ease-out' }}
        >
          <span className="leading-snug whitespace-pre-wrap break-words">{toast.msg}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-1 mt-0.5 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface TabProps {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}

function Tab({ active, icon, label, onClick }: TabProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-muted hover:text-text-dim hover:border-border'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function EmptyState({ onNew }: { onNew: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-5 text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-surface2 border border-border flex items-center justify-center">
        <LayoutGrid size={28} className="text-muted" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-text mb-1">No version selected</h2>
        <p className="text-sm text-muted max-w-xs">
          Create a version to start designing your logo and favicon with consistent styles.
        </p>
      </div>
      <button
        onClick={onNew}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-accent hover:bg-accent-hover transition-colors"
      >
        Create First Version
      </button>
    </div>
  )
}
