import React, { useState } from 'react'
import { X, Eye, EyeOff, Key } from './Icons'
import { getStoredApiKey, storeApiKey } from '../utils/iconUtils'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps): JSX.Element {
  const [apiKey, setApiKey] = useState(getStoredApiKey)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    storeApiKey(apiKey.trim())
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 800)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm mx-4 bg-surface2 border border-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Key size={14} className="text-accent" />
            <h2 className="text-sm font-semibold text-text">AI Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface3 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Gemini key — for SVG icon generation */}
          <div>
            <label className="block text-xs text-muted mb-1.5">Google Gemini API Key <span className="text-muted/60">(SVG icon generation)</span></label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza..."
                className="w-full pr-9 px-3 py-2 rounded-lg bg-surface3 border border-border text-sm text-text font-mono placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="block text-[11px] text-accent hover:text-accent-hover mt-1 transition-colors">
              Get free key from Google AI Studio →
            </a>
          </div>

          {/* Image generation — Pollinations.ai, no key needed */}
          <div className="rounded-lg bg-surface3 border border-border px-3 py-2.5 text-[11px] text-muted leading-relaxed">
            <p className="text-text font-medium mb-1">Image generation — no key needed</p>
            <p>Uses <span className="text-accent">Pollinations.ai</span> with the FLUX model — completely free, no account or API key required.</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm text-text-dim bg-surface3 hover:bg-border transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                saved ? 'bg-success text-white' : 'bg-accent hover:bg-accent-hover text-white'
              }`}
            >
              {saved ? 'Saved!' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
