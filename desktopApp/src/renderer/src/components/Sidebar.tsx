import React, { useState, useRef } from 'react'
import { Plus, Trash2, Copy, Layers, ChevronRight, Save, FolderOpen, Search, X, GripVertical, Upload } from './Icons'
import type { Version } from '../types'

interface SidebarProps {
  versions: Version[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onImport: () => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onReorder: (fromId: string, toId: string) => void
}

export function Sidebar({
  versions,
  selectedId,
  onSelect,
  onCreate,
  onImport,
  onDelete,
  onDuplicate,
  onReorder
}: SidebarProps): JSX.Element {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Drag-to-reorder state (disabled while searching, since the list is filtered).
  const dragIdRef = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const canReorder = !query.trim()

  const handleDrop = (targetId: string) => {
    const from = dragIdRef.current
    dragIdRef.current = null
    setDragOverId(null)
    if (from && from !== targetId) onReorder(from, targetId)
  }

  const filteredVersions = query.trim()
    ? versions.filter(v => v.name.toLowerCase().includes(query.toLowerCase()))
    : versions

  const handleExportTemplate = async (e: React.MouseEvent, v: Version) => {
    e.stopPropagation()
    setExportingId(v.id)
    try {
      await window.api.exportTemplate(v)
    } finally {
      setExportingId(null)
    }
  }

  const handleOpenFolder = () => {
    window.api.openTemplatesFolder()
  }

  return (
    <aside className="flex flex-col w-56 shrink-0 bg-surface border-r border-border h-full overflow-hidden">
      {/* Header */}
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

      {/* Search bar */}
      <div className="px-2 py-1.5 border-b border-border">
        <div className="flex items-center gap-1.5 px-2 h-7 rounded-md bg-surface2 border border-transparent focus-within:border-accent/50 transition-colors">
          <Search size={11} className="text-muted shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search versions…"
            className="flex-1 min-w-0 bg-transparent text-xs text-text placeholder-muted outline-none"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); searchRef.current?.focus() }}
              className="text-muted hover:text-text transition-colors"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Version list */}
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

        {filteredVersions.length === 0 && versions.length > 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
            <Search size={18} className="text-muted" />
            <p className="text-xs text-muted">No versions match<br /><span className="text-text-dim">"{query}"</span></p>
          </div>
        )}

        {filteredVersions.map((v) => {
          const isSelected = v.id === selectedId
          const isHovered = v.id === hoveredId

          return (
            <div
              key={v.id}
              draggable={canReorder}
              onDragStart={(e) => { dragIdRef.current = v.id; e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => { if (canReorder && dragIdRef.current) { e.preventDefault(); if (dragOverId !== v.id) setDragOverId(v.id) } }}
              onDragEnd={() => { dragIdRef.current = null; setDragOverId(null) }}
              onDrop={(e) => { e.preventDefault(); handleDrop(v.id) }}
              className={`group relative flex items-center pl-1 pr-3 py-2.5 cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-accent-dim border-l-2 border-accent'
                  : 'hover:bg-surface2 border-l-2 border-transparent'
              } ${dragOverId === v.id ? 'ring-1 ring-inset ring-accent/70' : ''}`}
              onClick={() => onSelect(v.id)}
              onMouseEnter={() => setHoveredId(v.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Drag handle */}
              {canReorder && (
                <GripVertical
                  size={12}
                  className="shrink-0 mr-0.5 text-muted/40 group-hover:text-muted cursor-grab active:cursor-grabbing"
                />
              )}

              {/* Version badge */}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mr-2.5 ${
                  isSelected ? 'bg-accent text-white' : 'bg-surface3 text-text-dim'
                }`}
                style={{
                  background: isSelected
                    ? (v.logos?.[0]?.config?.icon?.primaryColor ?? undefined)
                    : undefined,
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

              {/* Action buttons on hover */}
              {(isHovered || isSelected) && (
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-surface opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleExportTemplate(e, v)}
                    title="Save"
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
                      onDelete(v.id)
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

      {/* Footer */}
      <div className="border-t border-border px-3 py-2 flex items-center justify-between">
        <p className="text-xs text-muted">
          {query
            ? `${filteredVersions.length} / ${versions.length}`
            : `${versions.length} version${versions.length !== 1 ? 's' : ''}`
          }
        </p>
        <button
          onClick={handleOpenFolder}
          title={
            typeof window !== 'undefined' &&
            !!(window as Window & { __WEB__?: boolean }).__WEB__
              ? 'Browse template library'
              : 'Open templates folder'
          }
          className="flex items-center gap-1 text-[10px] text-muted hover:text-accent transition-colors"
        >
          <FolderOpen size={11} />
          Templates
        </button>
      </div>
    </aside>
  )
}
