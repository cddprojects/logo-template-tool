/** Visual style lock for AI image gen and AI icon search. */
export type AiVisualStyle = 'any' | 'colored-shape' | 'outline' | 'vector-art'

export const AI_VISUAL_STYLES: { value: AiVisualStyle; label: string; hint: string }[] = [
  { value: 'any', label: 'Any', hint: 'No style lock' },
  { value: 'colored-shape', label: 'Colored shape', hint: 'Flat filled colored shapes' },
  { value: 'outline', label: 'Outline', hint: 'Stroke-only outline icons' },
  { value: 'vector-art', label: 'Vector art', hint: 'Detailed flat vector illustration' }
]

/** Prompt fragment appended to Pollinations / image generation. */
export function imagePromptForStyle(style: AiVisualStyle): string {
  switch (style) {
    case 'colored-shape':
      return 'flat design, solid filled colored geometric shapes, minimal, no outlines, no gradients, simple icon symbol'
    case 'outline':
      return 'outline icon, stroke only, no fill, clean vector outline, transparent background, monochrome'
    case 'vector-art':
      return 'flat vector art illustration, bold shapes, clean edges, graphic design icon, vibrant colors'
    default:
      return ''
  }
}

/** Extra search terms biased toward Iconify results for that style. */
export function searchQuerySuffixForStyle(style: AiVisualStyle): string {
  switch (style) {
    case 'colored-shape':
      return 'color flat'
    case 'outline':
      return 'outline'
    case 'vector-art':
      return 'vector flat illustration'
    default:
      return ''
  }
}

/** Instruction for Gemini keyword extraction so searches stay on-style. */
export function styleKeywordHint(style: AiVisualStyle): string {
  switch (style) {
    case 'colored-shape':
      return 'Prefer terms that find flat filled multi-color icons (not outline-only).'
    case 'outline':
      return 'Prefer terms that find stroke/outline icons (not filled color icons).'
    case 'vector-art':
      return 'Prefer terms that find detailed flat vector / illustration icons.'
    default:
      return ''
  }
}

export function withImageStyle(prompt: string, style: AiVisualStyle): string {
  const frag = imagePromptForStyle(style)
  if (!frag) return prompt
  return `${prompt.trim()}, ${frag}`
}

export function withSearchStyle(query: string, style: AiVisualStyle): string {
  const suffix = searchQuerySuffixForStyle(style)
  if (!suffix) return query
  const q = query.trim()
  if (!q) return suffix
  // Avoid doubling the same suffix
  if (q.toLowerCase().includes(suffix.toLowerCase())) return q
  return `${q} ${suffix}`
}
