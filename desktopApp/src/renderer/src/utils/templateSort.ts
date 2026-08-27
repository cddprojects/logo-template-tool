export type TemplateSortKey =
  | 'name-asc'
  | 'name-desc'
  | 'updatedAt-desc'
  | 'updatedAt-asc'
  | 'createdAt-desc'
  | 'createdAt-asc'

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

const STORAGE_KEY = 'imggen:template-sort'

export function isTemplateSortKey(value: string): value is TemplateSortKey {
  return (SORT_KEYS as string[]).includes(value)
}

export function loadTemplateSortPreference(): TemplateSortKey {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && isTemplateSortKey(stored)) return stored
  } catch {
    /* ignore */
  }
  return 'updatedAt-desc'
}

export function saveTemplateSortPreference(key: TemplateSortKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, key)
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
