export function isIgTemplateFile(file: File): boolean {
  return /\.igtemplate$/i.test(file.name)
}

/** Build a new editor version from parsed .igtemplate JSON. */
export function versionFromIgTemplate(
  data: Record<string, unknown>,
  fallbackName: string
): {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  logos: unknown[]
  favicons: unknown[]
} {
  const now = new Date().toISOString()
  return {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: (data.name as string) || fallbackName || 'Imported template',
    description: (data.description as string) || '',
    createdAt: now,
    updatedAt: now,
    logos: (data.logos as unknown[]) ?? [],
    favicons: (data.favicons as unknown[]) ?? []
  }
}

/** Serialize a version / template payload as a .igtemplate file (JSON). */
export function buildIgTemplatePayload(data: {
  name?: string
  description?: string
  logos?: unknown
  favicons?: unknown
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    name: data.name,
    description: data.description,
    logos: data.logos,
    favicons: data.favicons
  }
}

export function igTemplateFileName(name?: string): string {
  const safe = String(name ?? 'template').replace(/[^a-z0-9_\-. ]/gi, '-')
  return `${safe}.igtemplate`
}

/** Small pause between multiple browser downloads. */
export function pause(ms = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Download a .igtemplate file in the browser / Electron renderer. */
export function downloadIgTemplate(
  data: {
    name?: string
    description?: string
    logos?: unknown
    favicons?: unknown
  },
  nameOverride?: string
): void {
  const payload = buildIgTemplatePayload(data)
  const filename = igTemplateFileName(nameOverride ?? data.name)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}
