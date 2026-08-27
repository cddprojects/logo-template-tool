import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const CHUNK_RELOAD_KEY = 'imggen:chunk-reload-count'
const CHUNK_RELOAD_MAX = 2

export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\d]+ failed/i.test(
    msg
  )
}

/** True for the deployed browser app — not Electron (desktop build). */
export function isBrowserWebBuild(): boolean {
  return (
    typeof window !== 'undefined' &&
    !navigator.userAgent.includes('Electron') &&
    (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  )
}

function chunkReloadCount(): number {
  try {
    const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY)
    const n = raw ? parseInt(raw, 10) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

/** Whether stale-chunk auto-reload has already been attempted too many times this session. */
export function chunkReloadsExhausted(): boolean {
  return isBrowserWebBuild() && chunkReloadCount() >= CHUNK_RELOAD_MAX
}

/**
 * After a deploy, cached entry HTML/JS may reference removed Vite chunks.
 * Reload up to CHUNK_RELOAD_MAX times per tab session (web only).
 * Returns true if a reload was triggered.
 */
export function retryAfterStaleChunk(): boolean {
  if (!isBrowserWebBuild()) return false
  const count = chunkReloadCount()
  if (count >= CHUNK_RELOAD_MAX) return false
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(count + 1))
  } catch {
    // sessionStorage blocked — still try one reload
  }
  window.location.reload()
  return true
}

export function reloadOnceOnChunkLoadFailure(error: unknown): boolean {
  if (!isBrowserWebBuild() || !isChunkLoadError(error)) return false
  return retryAfterStaleChunk()
}

/** Clear reload counter after a lazy chunk loads successfully. */
export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
  } catch {
    // ignore
  }
}

type ModuleDefault<T> = { default: T }

/** React.lazy wrapper that reloads once on stale chunk errors (web deploys). */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<ModuleDefault<T>>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory()
      clearChunkReloadFlag()
      return mod
    } catch (error) {
      if (reloadOnceOnChunkLoadFailure(error)) {
        return { default: (() => null) as unknown as T }
      }
      throw error
    }
  })
}
