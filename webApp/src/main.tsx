import { installWebApi } from './platform/api'

// Must run before the shared App touches window.api.
installWebApi()

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@renderer/App'
import '@renderer/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

requestAnimationFrame(() => {
  window.__hideSplash?.()
})
