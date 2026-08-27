import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { TemplateSortSelect } from '@renderer/components/TemplateSortSelect'
import { Search, X } from '@renderer/components/Icons'
import {
  loadTemplateSortPreference,
  saveTemplateSortPreference,
  sortTemplates,
  type TemplateSortKey
} from '@renderer/utils/templateSort'
import { downloadIgTemplate, pause } from '@renderer/utils/templateFile'
import {
  copyTemplate,
  createTemplate,
  deleteTemplate,
  getAuthUser,
  getTemplate,
  importTemplateIntoEditor,
  listTemplates,
  type ServerTemplate
} from '../platform/auth'

type BulkAction = '' | 'open' | 'export' | 'copy' | 'delete'

interface TemplatesPanelProps {
  onClose: () => void
}

export function TemplatesPanel({ onClose }: TemplatesPanelProps): JSX.Element {
  const [templates, setTemplates] = useState<ServerTemplate[]>([])
  const [tab, setTab] = useState<'mine' | 'others'>('mine')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [bulkAction, setBulkAction] = useState<BulkAction>('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<TemplateSortKey>(() => loadTemplateSortPreference())
  const searchRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await listTemplates()
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setTemplates(result.templates)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const isAdmin = getAuthUser()?.role === 'admin'
  const mine = useMemo(() => templates.filter((t) => t.isOwn), [templates])
  const others = useMemo(() => templates.filter((t) => !t.isOwn), [templates])
  const list = tab === 'mine' ? mine : others

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((t) => {
      const name = t.name.toLowerCase()
      const owner = t.ownerEmail.toLowerCase()
      return name.includes(q) || owner.includes(q)
    })
  }, [list, query])

  const sortedList = useMemo(
    () => sortTemplates(filteredList, sortKey),
    [filteredList, sortKey]
  )

  const handleSortChange = (next: TemplateSortKey) => {
    setSortKey(next)
    saveTemplateSortPreference(next)
  }

  const allListChecked =
    sortedList.length > 0 && sortedList.every((t) => checkedIds.has(t.id))
  const someListChecked = sortedList.some((t) => checkedIds.has(t.id))

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (allListChecked) {
        sortedList.forEach((t) => next.delete(t.id))
      } else {
        sortedList.forEach((t) => next.add(t.id))
      }
      return next
    })
  }

  useEffect(() => {
    setCheckedIds(new Set())
    setBulkAction('')
    setQuery('')
  }, [tab])

  const selectedTemplates = useMemo(
    () => list.filter((t) => checkedIds.has(t.id)),
    [checkedIds, list]
  )

  const canCopy = (t: ServerTemplate) => !t.isOwn
  const canDelete = (t: ServerTemplate) => t.isOwn || isAdmin

  const importTemplate = async (t: ServerTemplate): Promise<boolean> => {
    const result = await getTemplate(t.id)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    importTemplateIntoEditor(result.data, t.name)
    return true
  }

  const handleOpen = async (t: ServerTemplate) => {
    setBusyId(t.id)
    setError(null)
    const ok = await importTemplate(t)
    setBusyId(null)
    if (ok) onClose()
  }

  const handleOpenMany = async (items: ServerTemplate[]) => {
    setBulkBusy(true)
    setError(null)
    let opened = 0
    try {
      for (const t of items) {
        setBusyId(t.id)
        const ok = await importTemplate(t)
        setBusyId(null)
        if (!ok) break
        opened++
      }
      if (opened > 0) {
        setCheckedIds(new Set())
        setBulkAction('')
        onClose()
      }
    } finally {
      setBulkBusy(false)
      setBusyId(null)
    }
  }

  const handleExport = async (t: ServerTemplate) => {
    setBusyId(t.id)
    setError(null)
    const result = await getTemplate(t.id)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    downloadIgTemplate(result.data, t.name)
  }

  const handleCopy = async (t: ServerTemplate) => {
    setBusyId(t.id)
    setError(null)
    const result = await copyTemplate(t.id)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setTab('mine')
    await refresh()
  }

  const runDelete = async (ids: string[]) => {
    setBulkBusy(true)
    setError(null)
    try {
      for (const id of ids) {
        const result = await deleteTemplate(id)
        if (!result.ok) {
          setError(result.error)
          break
        }
      }
      setCheckedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
      await refresh()
    } finally {
      setBulkBusy(false)
      setPendingDeleteIds(null)
    }
  }

  const requestDelete = (ids: string[]) => {
    if (!ids.length) return
    setPendingDeleteIds(ids)
  }

  const applyBulkAction = async () => {
    const items = selectedTemplates
    if (!items.length || !bulkAction) return

    if (bulkAction === 'delete') {
      const ids = items.filter(canDelete).map((t) => t.id)
      if (!ids.length) {
        setError('None of the selected templates can be deleted.')
        return
      }
      requestDelete(ids)
      return
    }

    setBulkBusy(true)
    setError(null)
    try {
      if (bulkAction === 'open') {
        await handleOpenMany(items)
        return
      }
      if (bulkAction === 'export') {
        for (let i = 0; i < items.length; i++) {
          await handleExport(items[i])
          if (i < items.length - 1) await pause()
        }
      } else if (bulkAction === 'copy') {
        const copyable = items.filter(canCopy)
        if (!copyable.length) {
          setError('Copy is only available for templates owned by others.')
          return
        }
        for (const t of copyable) {
          await handleCopy(t)
        }
      }
      setCheckedIds(new Set())
      setBulkAction('')
    } finally {
      setBulkBusy(false)
    }
  }

  const deleteConfirmMessage = useMemo(() => {
    if (!pendingDeleteIds?.length) return ''
    const names = pendingDeleteIds
      .map((id) => templates.find((t) => t.id === id)?.name ?? 'Untitled')
      .slice(0, 5)
    if (pendingDeleteIds.length === 1) {
      return `Delete template “${names[0]}”?\n\nThis cannot be undone.`
    }
    const extra =
      pendingDeleteIds.length > 5 ? `\n…and ${pendingDeleteIds.length - 5} more.` : ''
    return `Delete ${pendingDeleteIds.length} templates?\n\n${names.map((n) => `• ${n}`).join('\n')}${extra}\n\nThis cannot be undone.`
  }, [pendingDeleteIds, templates])

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      for (const file of [...files]) {
        const text = await file.text()
        const data = JSON.parse(text) as {
          name?: string
          description?: string
          logos?: unknown
          favicons?: unknown
        }
        const name = data.name || file.name.replace(/\.igtemplate$/i, '')
        const result = await createTemplate({
          name,
          description: data.description,
          logos: data.logos,
          favicons: data.favicons
        })
        if (!result.ok) {
          setError(result.error)
          break
        }
      }
      setTab('mine')
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setUploading(false)
    }
  }

  const bulkActionOptions = useMemo(() => {
    const options: { value: BulkAction; label: string }[] = [
      { value: 'open', label: 'Open all in editor' },
      { value: 'export', label: 'Export .igtemplate' }
    ]
    if (tab === 'others') {
      options.push({ value: 'copy', label: 'Copy to my folder' })
    }
    options.push({ value: 'delete', label: 'Delete' })
    return options
  }, [tab])

  return (
    <>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
        <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">Templates</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-xs text-muted hover:bg-surface3 hover:text-text"
            >
              Close
            </button>
          </div>

          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <button
              type="button"
              onClick={() => setTab('mine')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === 'mine' ? 'bg-accent text-white' : 'text-muted hover:bg-surface3 hover:text-text'
              }`}
            >
              My templates ({mine.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('others')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === 'others' ? 'bg-accent text-white' : 'text-muted hover:bg-surface3 hover:text-text'
              }`}
            >
              Others ({others.length})
            </button>
            <label className="ml-auto cursor-pointer rounded-md border border-border px-2.5 py-1 text-xs text-text-dim hover:border-accent hover:text-accent">
              {uploading ? 'Uploading…' : 'Upload'}
              <input
                type="file"
                accept=".igtemplate,application/json"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  void handleUploadFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          </div>

          <div className="space-y-2 border-b border-border px-4 py-2">
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface2 px-2.5 py-1.5 focus-within:border-accent/50">
              <Search size={12} className="shrink-0 text-muted" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === 'mine' ? 'Search my templates…' : 'Search by name or owner…'}
                className="min-w-0 flex-1 bg-transparent text-xs text-text placeholder:text-muted outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    searchRef.current?.focus()
                  }}
                  className="text-muted hover:text-text"
                  aria-label="Clear search"
                >
                  <X size={11} />
                </button>
              )}
            </div>
            <TemplateSortSelect
              id="templates-panel-sort"
              showLabel
              value={sortKey}
              onChange={handleSortChange}
              className="min-w-[11rem] max-w-full rounded-md border border-border bg-surface2 px-2 py-1.5 text-[10px] text-text outline-none focus:border-accent"
            />
          </div>

          {list.length > 0 && (
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allListChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someListChecked && !allListChecked
                  }}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-border bg-surface3 accent-accent"
                />
                <span className="text-[10px] text-muted">All</span>
              </label>
              <select
                value={bulkAction}
                onChange={(e) => setBulkAction(e.target.value as BulkAction)}
                className="min-w-0 flex-1 rounded-md border border-border bg-surface2 px-2 py-1 text-[10px] text-text outline-none focus:border-accent"
              >
                <option value="">Action…</option>
                {bulkActionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!bulkAction || checkedIds.size === 0 || bulkBusy}
                onClick={() => void applyBulkAction()}
                className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {error && (
              <p className="mx-2 mb-2 rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                {error}
              </p>
            )}
            {loading ? (
              <p className="px-2 py-6 text-center text-xs text-muted">Loading…</p>
            ) : list.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted">
                {tab === 'mine'
                  ? 'No templates yet. Export a version or upload a .igtemplate file.'
                  : 'No templates from other users.'}
              </p>
            ) : sortedList.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted">
                No templates match &ldquo;{query}&rdquo;
              </p>
            ) : (
              <ul className="space-y-0.5">
                {sortedList.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface2"
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.has(t.id)}
                      onChange={() => toggleChecked(t.id)}
                      className="h-3.5 w-3.5 shrink-0 rounded border-border bg-surface3 accent-accent"
                      aria-label={`Select ${t.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-text">{t.name}</p>
                      <p className="truncate text-[10px] text-muted">
                        {t.isOwn ? 'You' : t.ownerEmail}
                        {' · '}
                        {t.updatedAt?.slice(0, 10)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === t.id || bulkBusy}
                      onClick={() => void handleOpen(t)}
                      className="rounded-md px-2 py-1 text-[11px] text-accent hover:bg-accent-dim disabled:opacity-40"
                      title="Open in editor"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      disabled={busyId === t.id || bulkBusy}
                      onClick={() => void handleExport(t)}
                      className="rounded-md px-2 py-1 text-[11px] text-text-dim hover:bg-surface3 hover:text-text disabled:opacity-40"
                      title="Download .igtemplate"
                    >
                      Export
                    </button>
                    {!t.isOwn && (
                      <button
                        type="button"
                        disabled={busyId === t.id || bulkBusy}
                        onClick={() => void handleCopy(t)}
                        className="rounded-md px-2 py-1 text-[11px] text-text-dim hover:bg-surface3 hover:text-text disabled:opacity-40"
                        title="Copy into my folder"
                      >
                        Copy
                      </button>
                    )}
                    {canDelete(t) && (
                      <button
                        type="button"
                        disabled={busyId === t.id || bulkBusy}
                        onClick={() => requestDelete([t.id])}
                        className="rounded-md px-2 py-1 text-[11px] text-danger hover:bg-surface3 disabled:opacity-40"
                        title={t.isOwn ? 'Delete' : 'Delete (admin)'}
                      >
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(checkedIds.size > 0 || query.trim()) && (
            <div className="border-t border-border px-4 py-2 text-[10px] text-muted">
              {checkedIds.size > 0 && `${checkedIds.size} selected`}
              {checkedIds.size > 0 && query.trim() && ' · '}
              {query.trim() &&
                `${sortedList.length} / ${list.length} shown`}
            </div>
          )}
        </div>
      </div>

      {pendingDeleteIds && (
        <ConfirmDialog
          title={pendingDeleteIds.length === 1 ? 'Delete template?' : 'Delete templates?'}
          message={deleteConfirmMessage}
          confirmLabel="Delete"
          destructive
          busy={bulkBusy}
          onConfirm={() => void runDelete(pendingDeleteIds)}
          onClose={() => !bulkBusy && setPendingDeleteIds(null)}
        />
      )}
    </>
  )
}
