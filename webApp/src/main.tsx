import { installWebApi } from './platform/api'

// Must run before the shared App touches window.api.
installWebApi()

import React from 'react'
import ReactDOM from 'react-dom/client'
import { WebShell } from './components/WebShell'
import { retryAfterStaleChunk } from '@renderer/utils/lazyWithRetry'
import '@renderer/index.css'

// After a deploy, stale tabs may request removed Vite chunks — reload once (bounded).
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  retryAfterStaleChunk()
})

// Successful lazy imports clear the counter; do not clear on every page load
// (that would allow infinite reload loops when disk cache keeps stale chunks).

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WebShell />
  </React.StrictMode>
)

requestAnimationFrame(() => {
  window.__hideSplash?.()
})
