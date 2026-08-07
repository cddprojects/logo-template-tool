import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { serveDesktopDownload } from './plugins/serveDesktopDownload'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRenderer = path.resolve(__dirname, '../desktopApp/src/renderer/src')
const desktopPublic = path.resolve(__dirname, '../desktopApp/src/renderer/public')
const webDownloads = path.resolve(__dirname, 'public/downloads')
const desktopDistApp = path.resolve(__dirname, '../desktopApp/dist-app')

export default defineConfig({
  // Absolute paths work reliably behind Coolify/Traefik at domain root.
  // Local Electron still uses its own electron-vite build (unaffected).
  base: '/',
  plugins: [
    react(),
    serveDesktopDownload({
      webPublicDownloads: webDownloads,
      desktopDistApp
    })
  ],
  // Fonts (and other static assets) still come from the desktop renderer public dir.
  publicDir: desktopPublic,
  resolve: {
    alias: {
      // Reuse the desktop renderer source without duplicating it.
      '@renderer': desktopRenderer
    }
  },
  server: {
    port: 5173,
    open: true,
    fs: {
      // Allow Vite to serve/import from the sibling desktopApp tree.
      allow: [path.resolve(__dirname, '..')]
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true
  }
})

