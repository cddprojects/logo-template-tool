import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const CHUNK_RELOAD_KEY = 'chunk-load-reload'

function isChunkLoadError(error: unknown): boolean {
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

/**
 * After a deploy, cached entry HTML/JS may reference removed Vite chunks.
 * Reload once so the browser picks up the new asset manifest (web only).
 */
export function retryAfterStaleChunk(): void {
  if (!isBrowserWebBuild()) return
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
  } catch {
    // sessionStorage blocked — still try reload
  }
  window.location.reload()
}

export function reloadOnceOnChunkLoadFailure(error: unknown): boolean {
  if (!isBrowserWebBuild() || !isChunkLoadError(error)) return false
  retryAfterStaleChunk()
  return true
}

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
