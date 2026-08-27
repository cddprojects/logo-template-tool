import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { TemplateSortSelect } from '@renderer/components/TemplateSortSelect'
import type { Version } from '@renderer/types'
import {
  loadTemplateSortPreference,
  saveTemplateSortPreference,
  sortTemplates,
  type TemplateSortKey
} from '@renderer/utils/templateSort'
import {
  createTemplate,
  listTemplates,
  updateTemplate,
  type ServerTemplate
} from '../platform/auth'

interface TemplateSaveModalProps {
  version: Version
  onClose: () => void
}

export function TemplateSaveModal({ version, onClose }: TemplateSaveModalProps): JSX.Element {
  const [templates, setTemplates] = useState<ServerTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(version.name || 'Untitled')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<TemplateSortKey>(() => loadTemplateSortPreference())

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await listTemplates()
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setTemplates(result.templates.filter((t) => t.isOwn))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const sortedList = useMemo(
    () => sortTemplates(templates, sortKey),
    [templates, sortKey]
  )

  const handleSortChange = (next: TemplateSortKey) => {
    setSortKey(next)
    saveTemplateSortPreference(next)
  }

  const handleSave = async () => {
    const trimmed = name.trim() || 'Untitled'
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: trimmed,
        description: version.description ?? '',
        logos: version.logos ?? [],
        favicons: version.favicons ?? []
      }
      const result = selectedId
        ? await updateTemplate(selectedId, payload)
        : await createTemplate(payload)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const selectTemplate = (t: ServerTemplate) => {
    setSelectedId((prev) => (prev === t.id ? null : t.id))
    setName(t.name)
  }

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text">Save to template library</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded px-2 py-1 text-xs text-muted hover:bg-surface3 hover:text-text disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <div className="space-y-3 border-b border-border px-4 py-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted">
              Template name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-surface2 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
              placeholder="Template name"
            />
          </label>
          <p className="text-[10px] text-muted">
            {selectedId
              ? 'Updating the selected template below.'
              : 'Saving as a new template. Click an existing template below to replace it instead.'}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <span className="text-[10px] font-medium text-muted">Your templates</span>
          <TemplateSortSelect
            id="template-save-sort"
            value={sortKey}
            onChange={handleSortChange}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {error && (
            <p className="mx-2 mb-2 rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          )}
          {loading ? (
            <p className="px-2 py-6 text-center text-xs text-muted">Loading…</p>
          ) : sortedList.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted">
              No templates yet — this will create your first one.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sortedList.map((t) => {
                const selected = selectedId === t.id
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => selectTemplate(t)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                        selected ? 'bg-accent-dim ring-1 ring-accent/40' : 'hover:bg-surface2'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-text">{t.name}</p>
                        <p className="truncate text-[10px] text-muted">
                          Modified {t.updatedAt?.slice(0, 10)} · Created {t.createdAt?.slice(0, 10)}
                        </p>
                      </div>
                      {selected && (
                        <span className="shrink-0 text-[10px] font-medium text-accent">Replace</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md px-3 py-1.5 text-xs text-muted hover:bg-surface3 hover:text-text disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => void handleSave()}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {saving ? 'Saving…' : selectedId ? 'Update template' : 'Save as new'}
          </button>
        </div>
      </div>
    </div>
  )
}
