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
  openCanvaWithPromptAndReference,
  type CanvaOpenResult
} from '../utils/canvaPrompt'
import { ColorRow, SelectRow } from './Controls'

interface CanvaPromptPanelProps {
  content: FaviconContent
  faviconConfig: FaviconConfig
  logoIcon: IconConfig | null
  appName: string
  onChange: (patch: Partial<FaviconContent>) => void
}

const OPEN_LABELS: Record<CanvaOpenResult, string> = {
  filled: 'Prompt filled — paste the image',
  login: 'Sign in to Canva, then click Generate again',
  opened: 'Canva opened — prompt and image are on the clipboard',
  failed: 'Could not open Canva — try again'
}

export function CanvaPromptPanel({
  content,
  faviconConfig,
  logoIcon,
  appName,
  onChange
}: CanvaPromptPanelProps): JSX.Element {
  const isWebApp =
    typeof window !== 'undefined' &&
    !!(window as Window & { __WEB__?: boolean }).__WEB__
  const [openResult, setOpenResult] = useState<CanvaOpenResult | null>(null)
  const prompt = useMemo(() => buildCanvaPrompt(content, appName), [content, appName])
  const hasLogoIcon = !!logoIcon
  const imageRef = content.canvaImageReference ?? 'none'
  const hasReference = imageRef !== 'none'

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
    const result = await openCanvaWithPromptAndReference(content, appName, faviconConfig, logoIcon)
    setOpenResult(result)
    window.setTimeout(() => setOpenResult(null), 4500)
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
        {openResult ? <CheckCircle2 size={14} /> : <ClipboardCopy size={14} />}
        {openResult
          ? openResult === 'opened' && isWebApp
            ? 'Copied prompt + image — paste in Canva'
            : OPEN_LABELS[openResult]
          : 'Generate with Canva'}
      </button>
      <p className="text-[10px] text-muted leading-snug">
        {isWebApp
          ? hasReference
            ? 'Copies the prompt and reference image together, then opens Canva AI. Paste in the prompt box for the text, or into the image slot for the reference (Ctrl+V).'
            : 'Copies the prompt, then opens Canva AI. Paste into the prompt box (Ctrl+V) and press Send.'
          : hasReference
            ? 'Opens Canva AI and fills the prompt. The reference image is on the clipboard — paste it (Ctrl+V), then press Send.'
            : 'Opens Canva AI and fills the prompt. Press Send in Canva.'}
        {' '}App name (from Logo): {appName}.
      </p>
      <details className="text-[10px] text-muted">
        <summary className="cursor-pointer hover:text-text">Preview prompt</summary>
        <p className="mt-1.5 p-2 rounded bg-surface3 border border-border leading-snug text-text/80">{prompt}</p>
      </details>
    </>
  )
}
