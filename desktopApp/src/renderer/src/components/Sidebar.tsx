import React, { useMemo, useRef, useState } from 'react'
import {
  Plus,
  Trash2,
  Copy,
  Layers,
  ChevronRight,
  Save,
  FolderOpen,
  Search,
  X,
  GripVertical,
  Upload
} from './Icons'
import { ConfirmDialog } from './ConfirmDialog'
import { TemplateSortSelect } from './TemplateSortSelect'
import type { Version } from '../types'
import {
  applyVersionSort,
  loadVersionSortPreference,
  saveVersionSortPreference,
  VERSION_SORT_OPTIONS,
  type VersionSortKey
} from '../utils/templateSort'

type BulkAction = '' | 'export' | 'duplicate' | 'delete'

interface SidebarProps {
  versions: Version[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onImport: () => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onReorder: (fromId: string, toId: string) => void
  templateDropActive?: boolean
}

export function Sidebar({
  versions,
  selectedId,
  onSelect,
  onCreate,
  onImport,
  onDelete,
  onDuplicate,
  onReorder,
  templateDropActive = false
}: SidebarProps): JSX.Element {
  const isWebApp =
    typeof window !== 'undefined' &&
    !!(window as Window & { __WEB__?: boolean }).__WEB__
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<VersionSortKey>(() => loadVersionSortPreference())
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [bulkAction, setBulkAction] = useState<BulkAction>('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const dragIdRef = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const canReorder = !query.trim() && sortKey === 'manual'

  const displayVersions = useMemo(() => {
    const filtered = query.trim()
      ? versions.filter((v) => v.name.toLowerCase().includes(query.toLowerCase()))
      : versions
    return applyVersionSort(filtered, sortKey)
  }, [query, versions, sortKey])

  const handleSortChange = (next: string) => {
    const key = next as VersionSortKey
    setSortKey(key)
    saveVersionSortPreference(key)
  }

  const allFilteredChecked =
    displayVersions.length > 0 && displayVersions.every((v) => checkedIds.has(v.id))
  const someFilteredChecked = displayVersions.some((v) => checkedIds.has(v.id))

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
      if (allFilteredChecked) {
        displayVersions.forEach((v) => next.delete(v.id))
      } else {
        displayVersions.forEach((v) => next.add(v.id))
      }
      return next
    })
  }

  const handleDrop = (targetId: string) => {
    const from = dragIdRef.current
    dragIdRef.current = null
    setDragOverId(null)
    if (from && from !== targetId) onReorder(from, targetId)
  }

  const exportVersion = async (v: Version) => {
    setExportingId(v.id)
    try {
      await window.api.exportTemplate(v)
    } finally {
      setExportingId(null)
    }
  }

  const handleExportTemplate = async (e: React.MouseEvent, v: Version) => {
    e.stopPropagation()
    if (isWebApp) {
      window.dispatchEvent(new CustomEvent('web:save-template', { detail: v }))
      return
    }
    await exportVersion(v)
  }

  const requestDelete = (ids: string[]) => {
    if (!ids.length) return
    setPendingDeleteIds(ids)
  }

  const confirmDelete = () => {
    if (!pendingDeleteIds?.length) return
    pendingDeleteIds.forEach((id) => onDelete(id))
    setCheckedIds((prev) => {
      const next = new Set(prev)
      pendingDeleteIds.forEach((id) => next.delete(id))
      return next
    })
    setPendingDeleteIds(null)
  }

  const applyBulkAction = async () => {
    const ids = [...checkedIds].filter((id) => versions.some((v) => v.id === id))
    if (!ids.length || !bulkAction) return

    if (bulkAction === 'delete') {
      requestDelete(ids)
      return
    }

    setBulkBusy(true)
    try {
      if (bulkAction === 'duplicate') {
        ids.forEach((id) => onDuplicate(id))
      } else if (bulkAction === 'export') {
        for (let i = 0; i < ids.length; i++) {
          const v = versions.find((item) => item.id === ids[i])
          if (v) await exportVersion(v)
          if (i < ids.length - 1) await new Promise((r) => setTimeout(r, 150))
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
    if (pendingDeleteIds.length === 1) {
      const v = versions.find((item) => item.id === pendingDeleteIds[0])
      return `Delete version “${v?.name ?? 'Untitled'}”?\n\nThis can be undone with Ctrl+Z.`
    }
    return `Delete ${pendingDeleteIds.length} versions?\n\nThis can be undone with Ctrl+Z.`
  }, [pendingDeleteIds, versions])

  const handleOpenFolder = () => {
    window.api.openTemplatesFolder()
  }

  return (
    <>
      <aside
        className={`flex flex-col w-56 shrink-0 bg-surface border-r h-full overflow-hidden transition-colors ${
          templateDropActive ? 'border-accent bg-accent/5' : 'border-border'
        }`}
      >
        <div className="flex items-center justify-between px-3 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-accent" />
            <span className="text-xs font-semibold text-text-dim uppercase tracking-wider">
              Versions
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onImport}
              title="Import an existing favicon/logo image to edit"
              className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-white hover:bg-accent transition-colors"
            >
              <Upload size={13} />
            </button>
            <button
              onClick={onCreate}
              title="New version"
              className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-white hover:bg-accent transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {templateDropActive && (
          <div className="mx-2 mt-2 px-2 py-1.5 rounded-md border border-dashed border-accent/60 bg-accent/10 text-[10px] text-accent text-center">
            Drop .igtemplate here to import
          </div>
        )}

        <div className="space-y-1.5 border-b border-border px-2 py-1.5">
          <div className="flex items-center gap-1.5 px-2 h-7 rounded-md bg-surface2 border border-transparent focus-within:border-accent/50 transition-colors">
            <Search size={11} className="text-muted shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search versions…"
              className="flex-1 min-w-0 bg-transparent text-xs text-text placeholder-muted outline-none"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('')
                  searchRef.current?.focus()
                }}
                className="text-muted hover:text-text transition-colors"
              >
                <X size={10} />
              </button>
            )}
          </div>
          <TemplateSortSelect
            id="versions-sort"
            value={sortKey}
            onChange={handleSortChange}
            options={VERSION_SORT_OPTIONS}
            ariaLabel="Sort versions"
            className="h-7 w-full rounded-md border border-border bg-surface2 px-2 py-0.5 text-[10px] text-text outline-none focus:border-accent"
          />
        </div>

        {isWebApp && displayVersions.length > 0 && (
          <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
            <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={allFilteredChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someFilteredChecked && !allFilteredChecked
                }}
                onChange={toggleSelectAll}
                className="h-3.5 w-3.5 rounded border-border bg-surface3 accent-accent"
                title="Select all"
              />
              <span className="text-[10px] text-muted">All</span>
            </label>
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value as BulkAction)}
              className="min-w-0 flex-1 rounded-md border border-border bg-surface2 px-1.5 py-1 text-[10px] text-text outline-none focus:border-accent"
            >
              <option value="">Action…</option>
              <option value="export">Save to library</option>
              <option value="duplicate">Duplicate</option>
              <option value="delete">Delete</option>
            </select>
            <button
              type="button"
              disabled={!bulkAction || checkedIds.size === 0 || bulkBusy}
              onClick={() => void applyBulkAction()}
              className="shrink-0 rounded-md bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {versions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-surface2 flex items-center justify-center">
                <Layers size={18} className="text-muted" />
              </div>
              <p className="text-xs text-muted leading-relaxed">
                No versions yet.
                <br />
                Click <span className="text-accent">+</span> to create one.
              </p>
            </div>
          )}

          {displayVersions.length === 0 && versions.length > 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
              <Search size={18} className="text-muted" />
              <p className="text-xs text-muted">
                No versions match
                <br />
                <span className="text-text-dim">"{query}"</span>
              </p>
            </div>
          )}

          {displayVersions.map((v) => {
            const isSelected = v.id === selectedId
            const isHovered = v.id === hoveredId
            const isChecked = checkedIds.has(v.id)

            return (
              <div
                key={v.id}
                draggable={canReorder}
                onDragStart={(e) => {
                  dragIdRef.current = v.id
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  if (canReorder && dragIdRef.current) {
                    e.preventDefault()
                    if (dragOverId !== v.id) setDragOverId(v.id)
                  }
                }}
                onDragEnd={() => {
                  dragIdRef.current = null
                  setDragOverId(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  handleDrop(v.id)
                }}
                className={`group relative flex items-center pl-1 pr-3 py-2.5 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-accent-dim border-l-2 border-accent'
                    : 'hover:bg-surface2 border-l-2 border-transparent'
                } ${dragOverId === v.id ? 'ring-1 ring-inset ring-accent/70' : ''}`}
                onClick={() => onSelect(v.id)}
                onMouseEnter={() => setHoveredId(v.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {isWebApp && (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleChecked(v.id)}
                    className="mr-1 h-3.5 w-3.5 shrink-0 rounded border-border bg-surface3 accent-accent"
                    aria-label={`Select ${v.name}`}
                  />
                )}

                {canReorder && (
                  <GripVertical
                    size={12}
                    className="shrink-0 mr-0.5 text-muted/40 group-hover:text-muted cursor-grab active:cursor-grabbing"
                  />
                )}

                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mr-2.5 bg-surface3 text-white"
                  style={{
                    fontSize: v.name.length > 3 ? '9px' : '11px'
                  }}
                >
                  {v.name.slice(0, 3).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${isSelected ? 'text-text' : 'text-text-dim'}`}
                  >
                    {v.name}
                  </p>
                  {v.description && (
                    <p className="text-xs text-muted truncate mt-0.5">{v.description}</p>
                  )}
                </div>

                {isSelected && <ChevronRight size={12} className="text-accent shrink-0" />}

                {(isHovered || isSelected) && (
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-surface opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleExportTemplate(e, v)}
                      title={isWebApp ? 'Save to template library' : 'Save to templates folder'}
                      disabled={exportingId === v.id}
                      className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-accent hover:bg-surface3 disabled:opacity-40"
                    >
                      <Save size={10} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDuplicate(v.id)
                      }}
                      title="Duplicate"
                      className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-text hover:bg-surface3"
                    >
                      <Copy size={10} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        requestDelete([v.id])
                      }}
                      title="Delete"
                      className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-danger hover:bg-surface3"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="border-t border-border px-3 py-2 flex items-center justify-between">
          <p className="text-xs text-muted">
            {isWebApp && checkedIds.size > 0
              ? `${checkedIds.size} selected`
              : query
                ? `${displayVersions.length} / ${versions.length}`
                : `${versions.length} version${versions.length !== 1 ? 's' : ''}`}
          </p>
          <button
            onClick={handleOpenFolder}
            title={isWebApp ? 'Browse template library' : 'Open templates folder'}
            className="flex items-center gap-1 text-[10px] text-muted hover:text-accent transition-colors"
          >
            <FolderOpen size={11} />
            Templates
          </button>
        </div>
      </aside>

      {pendingDeleteIds && (
        <ConfirmDialog
          title={pendingDeleteIds.length === 1 ? 'Delete version?' : 'Delete versions?'}
          message={deleteConfirmMessage}
          confirmLabel="Delete"
          destructive
          onConfirm={confirmDelete}
          onClose={() => setPendingDeleteIds(null)}
        />
      )}
    </>
  )
}
