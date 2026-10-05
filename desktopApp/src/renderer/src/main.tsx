/**
 * Desktop renderer entry.
 *
 * 1) Mount the shared React <App /> into #root.
 * 2) StrictMode double-invokes effects in dev (helps catch bugs; not in prod).
 * 3) After the first paint frame, hide the HTML splash that shows before React.
 *
 * Web uses webApp/src/main.tsx instead (installs window.api, then WebShell).
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Dismiss the inline splash screen once React has taken over.
requestAnimationFrame(() => {
  ;(window as Window & { __hideSplash?: () => void }).__hideSplash?.()
})
