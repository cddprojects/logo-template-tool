/** Where a gradient's 0% / 100% edges are measured. Missing marker = object. */
export type GradientEdge = 'section' | 'object' | 'canvas'

const EDGE_SUFFIX_RE = /@edge=(section|object|canvas)\s*$/i

export function isGradientCss(color: string): boolean {
  const v = color.trim()
  return v.startsWith('linear-gradient(') || v.startsWith('radial-gradient(')
}

/** CSS gradient without the persisted @edge= marker (for previews / canvas paint). */
export function stripGradientEdge(color: string): string {
  return color.replace(EDGE_SUFFIX_RE, '').trimEnd()
}

export function parseGradientEdge(color: string): GradientEdge {
  const m = color.match(EDGE_SUFFIX_RE)
  if (!m) return 'object'
  const edge = m[1]!.toLowerCase()
  if (edge === 'section' || edge === 'canvas') return edge
  return 'object'
}

/** Attach or clear @edge= on a gradient. Object omits the marker. */
export function withGradientEdge(color: string, edge: GradientEdge): string {
  const base = stripGradientEdge(color)
  if (!isGradientCss(base)) return color
  if (edge === 'object') return base
  return `${base}@edge=${edge}`
}
