/**
 * Web entry — runs in the browser instead of Electron.
 *
 * Order matters:
 *   1. installWebApi() — invent window.api so shared App.tsx can call the same
 *      methods as desktop (saveVersions, export, templates, …) but against HTTP.
 *   2. Mount WebShell — login gate + template library modals + shared <App />.
 *   3. Hide splash; handle Vite “chunk missing after deploy” with one reload.
 *
 * Shared UI code lives under desktopApp/src/renderer (imported as @renderer).
 */
import { installWebApi } from './platform/api'

// Must run before the shared App touches window.api.
installWebApi()

import React from 'react'
import ReactDOM from 'react-dom/client'
import { WebShell } from './components/WebShell'
import {
  chunkReloadsExhausted,
  hideStartupSplash,
  markWebAppBooted,
  retryAfterStaleChunk
} from '@renderer/utils/lazyWithRetry'
import '@renderer/index.css'

// After a deploy, stale tabs may request removed Vite chunks — reload once (bounded).
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  if (retryAfterStaleChunk()) return
  const sub = document.querySelector('#splash .splash-sub')
  if (sub) {
    sub.textContent = 'Update available — hard refresh (Ctrl+Shift+R)'
  }
})

function boot(): void {
  try {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <WebShell />
      </React.StrictMode>
    )
    markWebAppBooted()
  } catch (error) {
    console.error('[web] failed to mount app:', error)
    if (chunkReloadsExhausted()) {
      const sub = document.querySelector('#splash .splash-sub')
      if (sub) {
        sub.textContent = 'Failed to load app — hard refresh (Ctrl+Shift+R)'
      }
    }
  } finally {
    hideStartupSplash()
    requestAnimationFrame(hideStartupSplash)
    window.setTimeout(hideStartupSplash, 250)
  }
}

boot()
