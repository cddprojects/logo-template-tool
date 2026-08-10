import React, { useCallback, useEffect, useMemo, useState } from 'react'
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

  const handleOpen = async (t: ServerTemplate) => {
    setBusyId(t.id)
    setError(null)
    const result = await getTemplate(t.id)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    importTemplateIntoEditor(result.data, t.name)
    onClose()
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

  const handleDelete = async (t: ServerTemplate) => {
    if (!confirm(`Delete template “${t.name}”?`)) return
    setBusyId(t.id)
    setError(null)
    const result = await deleteTemplate(t.id)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await refresh()
  }

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

  return (
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
                ? 'No templates yet. Save a version or upload a .igtemplate file.'
                : 'No templates from other users.'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {list.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface2"
                >
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
                    disabled={busyId === t.id}
                    onClick={() => void handleOpen(t)}
                    className="rounded-md px-2 py-1 text-[11px] text-accent hover:bg-accent-dim disabled:opacity-40"
                    title="Open in editor"
                  >
                    Open
                  </button>
                  {!t.isOwn && (
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => void handleCopy(t)}
                      className="rounded-md px-2 py-1 text-[11px] text-text-dim hover:bg-surface3 hover:text-text disabled:opacity-40"
                      title="Copy into my folder"
                    >
                      Copy
                    </button>
                  )}
                  {(t.isOwn || isAdmin) && (
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => void handleDelete(t)}
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
      </div>
    </div>
  )
}
