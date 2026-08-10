import React, { useCallback, useMemo, useState } from 'react'
import { ExternalLink, CheckCircle2, ClipboardCopy } from 'lucide-react'
import type {
  CanvaBusinessType,
  CanvaDesignType,
  CanvaImageReference,
  FaviconConfig,
  FaviconContent,
  IconConfig
} from '../types'
import {
  buildCanvaPrompt,
  CANVA_AI_URL,
  CANVA_BUSINESS_TYPE_OPTIONS,
  CANVA_DESIGN_TYPE_OPTIONS,
  CANVA_IMAGE_REFERENCE_OPTIONS,
  copyCanvaPromptAndReference,
  type CanvaClipboardResult
} from '../utils/canvaPrompt'
import { ColorRow, SelectRow } from './Controls'

interface CanvaPromptPanelProps {
  content: FaviconContent
  faviconConfig: FaviconConfig
  logoIcon: IconConfig | null
  appName: string
  onChange: (patch: Partial<FaviconContent>) => void
}

const COPY_LABELS: Record<CanvaClipboardResult, string> = {
  full: 'Prompt + image copied!',
  'text-only': 'Prompt copied (image blocked)',
  failed: 'Copy failed — try again'
}

export function CanvaPromptPanel({
  content,
  faviconConfig,
  logoIcon,
  appName,
  onChange
}: CanvaPromptPanelProps): JSX.Element {
  const [copyResult, setCopyResult] = useState<CanvaClipboardResult | null>(null)
  const prompt = useMemo(() => buildCanvaPrompt(content, appName), [content, appName])
  const hasLogoIcon = !!logoIcon
  const imageRef = content.canvaImageReference ?? 'none'

  const imageReferenceOptions = useMemo(
    () =>
      CANVA_IMAGE_REFERENCE_OPTIONS.map((opt) =>
        opt.value === 'logo-icon' && !hasLogoIcon
          ? { ...opt, label: "Logo's icon (no matching logo)" }
          : opt
      ),
    [hasLogoIcon]
  )

  const handleGenerate = useCallback(async () => {
    const result = await copyCanvaPromptAndReference(content, appName, faviconConfig, logoIcon)
    setCopyResult(result)
    window.setTimeout(() => setCopyResult(null), 2500)
    if (result !== 'failed') {
      window.open(CANVA_AI_URL, '_blank', 'noopener,noreferrer')
    }
  }, [content, appName, faviconConfig, logoIcon])

  const secondaryEnabled = !!(content.canvaSecondaryColor?.trim())

  return (
    <>
      <a
        href={CANVA_AI_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-surface3 text-muted hover:text-text border border-border transition-colors"
      >
        <ExternalLink size={13} />
        Open Canva AI
      </a>

      <SelectRow
        label="Business type"
        value={content.canvaBusinessType ?? 'recruitment-services'}
        options={CANVA_BUSINESS_TYPE_OPTIONS}
        onChange={(v) => onChange({ canvaBusinessType: v as CanvaBusinessType })}
      />
      <SelectRow
        label="Design type"
        value={content.canvaDesignType ?? 'icon'}
        options={CANVA_DESIGN_TYPE_OPTIONS}
        onChange={(v) => onChange({ canvaDesignType: v as CanvaDesignType })}
      />
      <SelectRow
        label="Image reference"
        value={imageRef}
        options={imageReferenceOptions}
        onChange={(v) => onChange({ canvaImageReference: v as CanvaImageReference })}
      />
      {imageRef === 'logo-icon' && !hasLogoIcon && (
        <p className="text-[10px] text-amber-400/90 leading-snug -mt-1">
          Add a logo variant with the same name as this favicon to use its icon as reference.
        </p>
      )}
      <ColorRow
        label="Primary color"
        value={content.canvaPrimaryColor ?? '#6366f1'}
        onChange={(v) => onChange({ canvaPrimaryColor: v })}
      />
      <div className="flex items-center gap-2 py-1.5 min-w-0">
        <label className="text-xs text-muted w-20 min-w-[5rem] shrink-0">Secondary</label>
        <div className="flex flex-1 min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange({ canvaSecondaryColor: '' })}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors shrink-0 ${
              !secondaryEnabled
                ? 'bg-accent text-white'
                : 'bg-surface3 text-muted hover:text-text'
            }`}
          >
            None
          </button>
          {secondaryEnabled ? (
            <ColorRow
              label=""
              value={content.canvaSecondaryColor}
              onChange={(v) => onChange({ canvaSecondaryColor: v })}
            />
          ) : (
            <button
              type="button"
              onClick={() => onChange({ canvaSecondaryColor: '#ffffff' })}
              className="px-2 py-1 rounded text-[10px] font-medium bg-surface3 text-muted hover:text-text transition-colors"
            >
              Pick color
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => { void handleGenerate() }}
        disabled={imageRef === 'logo-icon' && !hasLogoIcon}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {copyResult ? <CheckCircle2 size={14} /> : <ClipboardCopy size={14} />}
        {copyResult
          ? (copyResult === 'text-only' && imageRef === 'none' ? 'Prompt copied!' : COPY_LABELS[copyResult])
          : 'Generate with Canva'}
      </button>
      <p className="text-[10px] text-muted leading-snug">
        {imageRef === 'none'
          ? 'Copies the prompt to your clipboard, then opens Canva AI.'
          : 'Copies the prompt (with a reference note) and the selected image to your clipboard, then opens Canva AI. Paste into the chat (Ctrl+V).'}
        {' '}App name: {appName || 'version name'}.
      </p>
      <details className="text-[10px] text-muted">
        <summary className="cursor-pointer hover:text-text">Preview prompt</summary>
        <p className="mt-1.5 p-2 rounded bg-surface3 border border-border leading-snug text-text/80">{prompt}</p>
      </details>
    </>
  )
}
