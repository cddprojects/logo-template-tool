import React from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onClose
}: ConfirmDialogProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface2 shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-text-dim whitespace-pre-wrap">{message}</p>
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 rounded-lg bg-surface3 px-4 py-2 text-sm text-text-dim transition-colors hover:bg-border disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
              destructive
                ? 'bg-danger hover:bg-red-600'
                : 'bg-accent hover:bg-accent-hover'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
