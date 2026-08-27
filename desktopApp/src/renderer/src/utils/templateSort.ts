export type TemplateSortKey =
  | 'name-asc'
  | 'name-desc'
  | 'updatedAt-desc'
  | 'updatedAt-asc'
  | 'createdAt-desc'
  | 'createdAt-asc'

export type VersionSortKey = TemplateSortKey | 'manual'

export interface TemplateSortable {
  name: string
  createdAt: string
  updatedAt: string
}

const SORT_KEYS: TemplateSortKey[] = [
  'name-asc',
  'name-desc',
  'updatedAt-desc',
  'updatedAt-asc',
  'createdAt-desc',
  'createdAt-asc'
]

export const TEMPLATE_SORT_OPTIONS: { value: TemplateSortKey; label: string }[] = [
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
  { value: 'updatedAt-desc', label: 'Modified (newest)' },
  { value: 'updatedAt-asc', label: 'Modified (oldest)' },
  { value: 'createdAt-desc', label: 'Created (newest)' },
  { value: 'createdAt-asc', label: 'Created (oldest)' }
]

export const VERSION_SORT_OPTIONS: { value: VersionSortKey; label: string }[] = [
  { value: 'manual', label: 'Manual order' },
  ...TEMPLATE_SORT_OPTIONS
]

const TEMPLATE_STORAGE_KEY = 'imggen:template-sort'
const VERSION_STORAGE_KEY = 'imggen:version-sort'

export function isTemplateSortKey(value: string): value is TemplateSortKey {
  return (SORT_KEYS as string[]).includes(value)
}

export function loadTemplateSortPreference(): TemplateSortKey {
  try {
    const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY)
    if (stored && isTemplateSortKey(stored)) return stored
  } catch {
    /* ignore */
  }
  return 'updatedAt-desc'
}

export function saveTemplateSortPreference(key: TemplateSortKey): void {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, key)
  } catch {
    /* ignore */
  }
}

export function isVersionSortKey(value: string): value is VersionSortKey {
  return value === 'manual' || isTemplateSortKey(value)
}

export function loadVersionSortPreference(): VersionSortKey {
  try {
    const stored = localStorage.getItem(VERSION_STORAGE_KEY)
    if (stored && isVersionSortKey(stored)) return stored
  } catch {
    /* ignore */
  }
  return 'manual'
}

export function saveVersionSortPreference(key: VersionSortKey): void {
  try {
    localStorage.setItem(VERSION_STORAGE_KEY, key)
  } catch {
    /* ignore */
  }
}

export function sortTemplates<T extends TemplateSortable>(items: T[], sortKey: TemplateSortKey): T[] {
  const sorted = [...items]
  sorted.sort((a, b) => {
    let cmp = 0
    if (sortKey.startsWith('name-')) {
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    } else if (sortKey.startsWith('updatedAt-')) {
      cmp = a.updatedAt.localeCompare(b.updatedAt)
    } else {
      cmp = a.createdAt.localeCompare(b.createdAt)
    }
    return sortKey.endsWith('-asc') ? cmp : -cmp
  })
  return sorted
}

export function applyVersionSort<T extends TemplateSortable>(
  items: T[],
  sortKey: VersionSortKey
): T[] {
  if (sortKey === 'manual') return items
  return sortTemplates(items, sortKey)
}
