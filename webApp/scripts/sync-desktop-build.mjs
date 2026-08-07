/**
 * Copy the latest desktop portable .exe into webApp/public/downloads/
 * so the web app can serve it at /downloads/Image-Generator.exe
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const distApp = path.join(root, 'desktopApp', 'dist-app')
const outDir = path.join(root, 'webApp', 'public', 'downloads')
const outFile = path.join(outDir, 'Image-Generator.exe')

function findLatestExe() {
  if (!fs.existsSync(distApp)) return null
  const candidates = []

  for (const name of fs.readdirSync(distApp)) {
    const full = path.join(distApp, name)
    const st = fs.statSync(full)
    if (st.isFile() && name.toLowerCase().endsWith('.exe')) {
      candidates.push({ full, mtime: st.mtimeMs, name })
    }
  }

  // Prefer portable "Image Generator *.exe" over helper exes in subfolders.
  const portable = candidates.filter((c) => /^image generator/i.test(c.name))
  const list = portable.length ? portable : candidates
  if (!list.length) return null
  list.sort((a, b) => b.mtime - a.mtime)
  return list[0]
}

const latest = findLatestExe()
if (!latest) {
  console.error(
    '[sync:desktop] No .exe found in desktopApp/dist-app.\n' +
      'Build one first:  npm run build:win --prefix desktopApp'
  )
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })
fs.copyFileSync(latest.full, outFile)
const mb = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(1)
console.log(`[sync:desktop] ${latest.name} → webApp/public/downloads/Image-Generator.exe (${mb} MB)`)
