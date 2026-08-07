import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'

const DOWNLOAD_URL = '/downloads/Image-Generator.exe'

function findLatestDesktopExe(desktopDistApp: string): string | null {
  if (!fs.existsSync(desktopDistApp)) return null
  const files = fs
    .readdirSync(desktopDistApp)
    .filter((n) => n.toLowerCase().endsWith('.exe'))
    .map((n) => {
      const full = path.join(desktopDistApp, n)
      return { full, name: n, mtime: fs.statSync(full).mtimeMs }
    })
    .filter((f) => fs.statSync(f.full).isFile())

  const portable = files.filter((f) => /^image generator/i.test(f.name))
  const list = portable.length ? portable : files
  if (!list.length) return null
  list.sort((a, b) => b.mtime - a.mtime)
  return list[0].full
}

/**
 * Serves /downloads/Image-Generator.exe from:
 * 1) webApp/public/downloads/Image-Generator.exe (synced)
 * 2) latest desktopApp/dist-app/*.exe (dev convenience)
 * and copies the file into dist/downloads on production build.
 */
export function serveDesktopDownload(opts: {
  webPublicDownloads: string
  desktopDistApp: string
}): Plugin {
  const synced = path.join(opts.webPublicDownloads, 'Image-Generator.exe')

  const resolveExe = () => {
    if (fs.existsSync(synced)) return synced
    return findLatestDesktopExe(opts.desktopDistApp)
  }

  return {
    name: 'serve-desktop-download',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== DOWNLOAD_URL) return next()

        const exe = resolveExe()
        if (!exe || !fs.existsSync(exe)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end('Desktop build not found. Run: npm run sync:desktop')
          return
        }

        const st = fs.statSync(exe)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Content-Length', String(st.size))
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="Image-Generator.exe"'
        )
        res.setHeader('Cache-Control', 'no-cache')

        if (req.method === 'HEAD') {
          res.end()
          return
        }

        fs.createReadStream(exe).pipe(res)
      })
    },
    closeBundle() {
      const exe = resolveExe()
      if (!exe || !fs.existsSync(exe)) {
        console.warn(
          '[serve-desktop-download] No desktop exe to copy into dist/downloads'
        )
        return
      }
      const outDir = path.resolve(opts.webPublicDownloads, '../../dist/downloads')
      fs.mkdirSync(outDir, { recursive: true })
      const outFile = path.join(outDir, 'Image-Generator.exe')
      fs.copyFileSync(exe, outFile)
      console.log(`[serve-desktop-download] Copied exe → ${outFile}`)
    }
  }
}
