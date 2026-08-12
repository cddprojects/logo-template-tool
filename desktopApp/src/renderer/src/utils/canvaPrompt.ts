import type {
  CanvaBusinessType,
  CanvaDesignType,
  CanvaImageReference,
  FaviconConfig,
  FaviconContent,
  IconConfig
} from '../types'
import { drawIcon, renderFavicon } from './renderer'

export const CANVA_AI_URL = 'https://www.canva.com/ai'

export const CANVA_BUSINESS_TYPE_OPTIONS: { label: string; value: CanvaBusinessType }[] = [
  { label: 'Recruitment Services', value: 'recruitment-services' },
  { label: 'Dropshipping', value: 'dropshipping' },
  { label: 'Fraud Recovery Services', value: 'fraud-recovery-services' },
  { label: 'Investment/Stock', value: 'investment-stock' }
]

export const CANVA_DESIGN_TYPE_OPTIONS: { label: string; value: CanvaDesignType }[] = [
  { label: 'Vector', value: 'vector' },
  { label: 'Abstract', value: 'abstract' },
  { label: 'Vector art', value: 'vector-art' },
  { label: 'Icon', value: 'icon' }
]

export const CANVA_IMAGE_REFERENCE_OPTIONS: { label: string; value: CanvaImageReference }[] = [
  { label: 'None', value: 'none' },
  { label: 'Favicon', value: 'favicon' },
  { label: "Favicon's Inner content", value: 'favicon-inner' },
  { label: "Logo's icon", value: 'logo-icon' }
]

const BUSINESS_LABELS: Record<CanvaBusinessType, string> = {
  'recruitment-services': 'Recruitment Services',
  dropshipping: 'Dropshipping',
  'fraud-recovery-services': 'Fraud Recovery Services',
  'investment-stock': 'Investment/Stock'
}

const DESIGN_LABELS: Record<CanvaDesignType, string> = {
  vector: 'vector',
  abstract: 'abstract',
  'vector-art': 'vector art',
  icon: 'icon'
}

export function canvaBusinessLabel(type: CanvaBusinessType): string {
  return BUSINESS_LABELS[type] ?? BUSINESS_LABELS['recruitment-services']
}

export function canvaDesignLabel(type: CanvaDesignType): string {
  return DESIGN_LABELS[type] ?? DESIGN_LABELS.icon
}

export function canvaImageReference(content: FaviconContent): CanvaImageReference {
  return content.canvaImageReference ?? 'none'
}

/** Logo "App name" field — never the version name from the sidebar. */
export function resolveCanvaAppName(
  logoVariants: { label?: string; config?: { text?: string | null } | null }[],
  activeFaviconLabel?: string
): string {
  const matched = activeFaviconLabel
    ? logoVariants.find((v) => v.label === activeFaviconLabel)
    : undefined
  const fromMatch = matched?.config?.text?.trim()
  if (fromMatch) return fromMatch
  const fromAny = logoVariants.find((v) => v.config?.text?.trim())?.config?.text?.trim()
  return fromAny || 'App'
}

export function buildCanvaPrompt(content: FaviconContent, appName: string): string {
  const businessType = canvaBusinessLabel(content.canvaBusinessType ?? 'recruitment-services')
  const designType = canvaDesignLabel(content.canvaDesignType ?? 'icon')
  const primaryColor = content.canvaPrimaryColor?.trim() || '#6366f1'
  const secondaryColor = content.canvaSecondaryColor?.trim() ?? ''
  const name = appName.trim() || 'App'

  const secondaryClause = secondaryColor
    ? ` (and the secondary color used should be ${secondaryColor})`
    : ''

  let prompt = `Generate a ${designType} favicon with 1:1 aspect ratio, 512px, transparent background for ${businessType} website which is named ${name} so that it suits perfectly. The primary color used should be ${primaryColor}${secondaryClause}. Do not include an outer shape, container frame, background plate, border, or shadow wrapper — only the inner icon or symbol on a transparent background.`

  if (canvaImageReference(content) !== 'none') {
    prompt += ' Attached is the image used for reference.'
  }

  return prompt
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to encode reference image'))
    }, 'image/png')
  })
}

const REF_SIZE = 512

/** PNG reference for pasting into Canva AI (512×512). Returns null when reference is None. */
export async function buildCanvaReferenceImageBlob(
  content: FaviconContent,
  faviconConfig: FaviconConfig,
  logoIcon?: IconConfig | null
): Promise<Blob | null> {
  const ref = canvaImageReference(content)
  if (ref === 'none') return null

  const canvas = document.createElement('canvas')
  canvas.width = REF_SIZE
  canvas.height = REF_SIZE

  switch (ref) {
    case 'favicon':
      await renderFavicon(canvas, { ...faviconConfig, size: REF_SIZE })
      break
    case 'favicon-inner':
      await renderFavicon(canvas, {
        ...faviconConfig,
        size: REF_SIZE,
        transparentBg: true,
        outerShape: 'none',
        outerShapeImageDataUrl: '',
        outerShapeSvgMarkup: '',
        borderWidth: 0,
        borderColor: 'transparent',
        shadowEnabled: false,
        shadowInset: false,
        shadowReserveOnly: true
      })
      break
    case 'logo-icon': {
      if (!logoIcon) throw new Error('No matching logo icon for reference')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas unavailable')
      ctx.clearRect(0, 0, REF_SIZE, REF_SIZE)
      await drawIcon(ctx, logoIcon, 0, 0, REF_SIZE)
      break
    }
  }

  return canvasToBlob(canvas)
}

export type CanvaClipboardResult = 'full' | 'text-only' | 'failed'

/** Copy prompt text and an optional reference image together when the browser allows it. */
export async function copyCanvaPromptAndReference(
  content: FaviconContent,
  appName: string,
  faviconConfig: FaviconConfig,
  logoIcon?: IconConfig | null
): Promise<CanvaClipboardResult> {
  const prompt = buildCanvaPrompt(content, appName)
  const ref = canvaImageReference(content)

  if (ref === 'none') {
    try {
      await navigator.clipboard.writeText(prompt)
      return 'text-only'
    } catch {
      return 'failed'
    }
  }

  try {
    const imageBlob = await buildCanvaReferenceImageBlob(content, faviconConfig, logoIcon)
    if (imageBlob && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([prompt], { type: 'text/plain' }),
          'image/png': imageBlob
        })
      ])
      return 'full'
    }
  } catch {
    // Fall through to text-only.
  }

  try {
    await navigator.clipboard.writeText(prompt)
    return 'text-only'
  } catch {
    return 'failed'
  }
}
