/** Browser-side Iconify search (mirrors desktopApp main-process logic). */

type IconResult = { id: string; name: string; prefix: string; svg: string }

const COLOUR_GROUPS: string[][] = [
  ['icon-park', 'marketeq'],
  ['streamline-color', 'streamline-sharp-color', 'streamline-flex-color'],
  ['streamline-plump-color', 'streamline-freehand-color'],
  ['streamline-ultimate-color', 'streamline-cyber-color'],
  ['fluent-emoji-flat', 'twemoji']
]

const OUTLINE_GROUPS: string[][] = [
  ['lucide', 'tabler', 'iconoir', 'feather'],
  ['ph', 'system-uicons'],
  ['heroicons', 'flowbite'],
  ['mdi-light', 'material-symbols', 'ic', 'mdi'],
  ['solar', 'mingcute', 'hugeicons', 'guidance'],
  ['ri', 'carbon'],
  ['icon-park-outline', 'lets-icons', 'mage', 'majesticons'],
  ['cil', 'clarity'],
  ['streamline-plump'],
  ['pepicons-print', 'pepicons-pop', 'pepicons-pencil', 'lineicons', 'simple-line-icons', 'la']
]

const VECTOR_GROUPS: string[][] = [
  ['streamline-plump-color', 'streamline-freehand-color'],
  ['streamline-ultimate-color', 'streamline-cyber-color'],
  ['streamline-flex-color', 'streamline-sharp-color', 'streamline-color'],
  ['glyphs-poly'],
  ['icon-park', 'marketeq'],
  ['fluent-emoji-flat', 'twemoji'],
  ['game-icons']
]

const ANY_COLOUR_FLAT = COLOUR_GROUPS.flat()
const PAGE = 20
const FETCH = 40

async function fetchText(url: string, timeoutMs = 12_000): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function searchIds(q: string, limit = 20, prefixes?: string, off = 0): Promise<string[]> {
  let qs = prefixes
    ? `https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=${limit}&prefixes=${prefixes}`
    : `https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=${limit}`
  if (off > 0) qs += `&start=${off}`
  const body = await fetchText(qs)
  if (!body) return []
  try {
    return (JSON.parse(body) as { icons?: string[] }).icons ?? []
  } catch {
    return []
  }
}

function dedup(lists: string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const id of list) {
      if (!seen.has(id)) {
        seen.add(id)
        out.push(id)
      }
    }
  }
  return out
}

function nameStem(id: string): string {
  const name = (id.split(':')[1] || id).toLowerCase()
  return name
    .replace(/-(outline|solid|fill|filled|bold|line|linear|duotone|twotone|two-tone|alt|sharp|round|rounded)\d*$/g, '')
    .replace(/-\d+$/g, '')
}

function diversify(ids: string[], limit: number): string[] {
  const buckets = new Map<string, string[]>()
  for (const id of ids) {
    const prefix = id.split(':')[0] || 'other'
    if (!buckets.has(prefix)) buckets.set(prefix, [])
    buckets.get(prefix)!.push(id)
  }
  const queues = [...buckets.values()]
  const out: string[] = []
  const usedStems = new Set<string>()
  let i = 0
  while (out.length < limit && queues.some((q) => q.length > 0)) {
    const q = queues[i % queues.length]
    if (q.length > 0) {
      const idx = q.findIndex((id) => !usedStems.has(nameStem(id)))
      if (idx >= 0) {
        const id = q.splice(idx, 1)[0]
        usedStems.add(nameStem(id))
        out.push(id)
      } else {
        q.shift()
      }
    }
    i++
    if (i > ids.length * 4) break
  }
  const rest = dedup([ids.filter((id) => !out.includes(id))])
  for (const id of rest) {
    if (out.length >= limit) break
    out.push(id)
  }
  return out
}

async function searchGrouped(q: string, gList: string[][], pageStart: number): Promise<string[]> {
  const page = Math.max(0, Math.floor(pageStart / FETCH))
  const perPack = 20
  const deep = page * perPack
  const hits = await Promise.all(gList.map((g) => searchIds(q, perPack, g.join(','), deep)))
  return diversify(dedup(hits), PAGE)
}

export async function iconifySearch(
  query: string,
  start = 0,
  style = 'any'
): Promise<{ success: boolean; icons?: IconResult[]; nextStart?: number; error?: string }> {
  try {
    const styleMode = String(style || 'any')
    const groups: string[][] | null =
      styleMode === 'colored-shape'
        ? COLOUR_GROUPS
        : styleMode === 'outline'
          ? OUTLINE_GROUPS
          : styleMode === 'vector-art'
            ? VECTOR_GROUPS
            : null

    let ids: string[] = []

    if (groups) {
      ids = await searchGrouped(query, groups, start)
    } else {
      const [colourIds, allIds] = await Promise.all([
        searchIds(query, FETCH, ANY_COLOUR_FLAT.join(','), start),
        searchIds(query, FETCH, undefined, start)
      ])
      ids = diversify(dedup([colourIds, allIds]), PAGE)
    }

    if (ids.length === 0) {
      const words = query
        .split(/[\s,]+/)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length > 2)
      if (groups) {
        const wordHits = await Promise.all(words.slice(0, 3).map((w) => searchGrouped(w, groups, start)))
        ids = diversify(dedup(wordHits), PAGE)
      } else {
        const [colourWord, allWord] = await Promise.all([
          Promise.all(words.map((w) => searchIds(w, 16, ANY_COLOUR_FLAT.join(','), start))),
          Promise.all(words.map((w) => searchIds(w, 16, undefined, start)))
        ])
        ids = diversify(dedup([...colourWord, ...allWord]), PAGE)
      }
    }

    if (ids.length === 0) {
      const firstWord = query.split(/[\s,]+/).find((w) => w.length > 2) ?? query
      if (groups) {
        ids = await searchGrouped(firstWord, groups, start)
      } else {
        ids = diversify(await searchIds(firstWord, FETCH, undefined, start), PAGE)
      }
    }

    if (ids.length === 0) return { success: true, icons: [], nextStart: start }

    const results = await Promise.all(
      ids.slice(0, PAGE).map(async (id): Promise<IconResult | null> => {
        const [prefix, name] = id.split(':')
        const svg = await fetchText(
          `https://api.iconify.design/${prefix}/${name}.svg?width=48&height=48`
        )
        if (!svg || !svg.trimStart().startsWith('<svg')) return null
        return { id, name, prefix, svg }
      })
    )

    return {
      success: true,
      icons: results.filter(Boolean) as IconResult[],
      nextStart: start + FETCH
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function iconifyFetch(
  id: string
): Promise<{ success: boolean; svg?: string; error?: string }> {
  const [prefix, name] = id.split(':')
  const svg = await fetchText(
    `https://api.iconify.design/${prefix}/${name}.svg?width=512&height=512`,
    10_000
  )
  if (!svg || !svg.trimStart().startsWith('<svg')) {
    return { success: false, error: 'Failed to fetch icon SVG' }
  }
  return { success: true, svg }
}
