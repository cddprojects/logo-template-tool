/**
 * One-time script: downloads all Google Font woff2 files to
 * src/renderer/public/fonts/ and generates a self-contained fonts.css.
 *
 * Run once:  node scripts/download-fonts.js
 */

const https = require('https')
const fs    = require('fs')
const path  = require('path')

const FONTS_DIR = path.join(__dirname, '../src/renderer/public/fonts')

const GOOGLE_CSS_URL =
  'https://fonts.googleapis.com/css2?' +
  [
    // ── Modern sans-serif ──────────────────────────────────────────────────────
    'family=Inter:wght@300;400;500;600;700;800;900',
    'family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900',
    'family=Manrope:wght@300;400;500;600;700;800',
    'family=Figtree:wght@300;400;500;600;700;800;900',
    'family=Outfit:wght@300;400;500;600;700;800;900',
    'family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800',
    'family=Space+Grotesk:wght@300;400;500;600;700',
    'family=Rubik:wght@300;400;500;600;700;800;900',
    'family=Work+Sans:wght@300;400;500;600;700;800;900',
    'family=Quicksand:wght@300;400;500;600;700',
    'family=Mulish:wght@300;400;500;600;700;800;900',
    'family=Nunito+Sans:opsz,wght@6..12,300;6..12,400;6..12,500;6..12,600;6..12,700;6..12,800;6..12,900',
    'family=Lexend:wght@300;400;500;600;700;800;900',
    'family=Karla:wght@300;400;500;600;700;800',
    'family=Cabin:wght@400;500;600;700',
    'family=Exo+2:wght@300;400;500;600;700;800;900',
    'family=Comfortaa:wght@300;400;500;600;700',
    // ── Classic sans-serif ────────────────────────────────────────────────────
    'family=Poppins:wght@300;400;500;600;700;800;900',
    'family=Montserrat:wght@300;400;500;600;700;800;900',
    'family=Raleway:wght@300;400;500;600;700;800;900',
    'family=Josefin+Sans:wght@300;400;600;700',
    'family=Barlow:wght@300;400;500;600;700;800;900',
    'family=Lato:wght@300;400;700;900',
    'family=Open+Sans:wght@300;400;500;600;700;800',
    'family=Nunito:wght@300;400;500;600;700;800;900',
    'family=Source+Sans+3:wght@300;400;500;600;700;800;900',
    'family=Ubuntu:wght@300;400;500;700',
    // ── Serif ─────────────────────────────────────────────────────────────────
    'family=Playfair+Display:wght@400;500;600;700;800;900',
    'family=Merriweather:wght@300;400;700;900',
    'family=Libre+Baskerville:wght@400;700',
    'family=Cormorant+Garamond:wght@300;400;500;600;700',
    'family=Lora:wght@400;500;600;700',
    'family=EB+Garamond:wght@400;500;600;700;800',
    'family=Bitter:wght@300;400;500;600;700;800;900',
    'family=Roboto+Slab:wght@100;300;400;500;600;700;800;900',
    'family=PT+Serif:wght@400;700',
    'family=Crimson+Text:wght@400;600;700',
    'family=Noto+Serif:wght@100;200;300;400;500;600;700;800;900',
    'family=Spectral:wght@200;300;400;500;600;700;800',
    'family=Arvo:wght@400;700',
    'family=Alegreya:wght@400;500;700;800;900',
    'family=Vollkorn:wght@400;500;600;700;800;900',
    'family=Cardo:wght@400;700',
    'family=Domine:wght@400;500;600;700',
    'family=Libre+Caslon+Text:wght@400;700',
    'family=Tinos:wght@400;700',
    'family=Old+Standard+TT:wght@400;700',
    // ── Display / stylistic ───────────────────────────────────────────────────
    'family=Bebas+Neue',
    'family=Cinzel:wght@400;500;600;700;800;900',
    'family=Abril+Fatface',
    'family=Fredoka:wght@300;400;500;600;700',
    'family=Lobster',
    'family=Pacifico',
    'family=Righteous',
    'family=Oswald:wght@200;300;400;500;600;700',
    'family=Anton',
    'family=Russo+One',
    'family=Lilita+One',
    'family=Squada+One',
    // ── Handwriting / cursive / script ────────────────────────────────────────
    'family=Dancing+Script:wght@400;500;600;700',
    'family=Satisfy',
    'family=Sacramento',
    'family=Caveat:wght@400;500;600;700',
    'family=Permanent+Marker',
    'family=Great+Vibes',
    'family=Parisienne',
    'family=Alex+Brush',
    'family=Kaushan+Script',
    'family=Pinyon+Script',
    // ── Monospace ─────────────────────────────────────────────────────────────
    'family=JetBrains+Mono:wght@300;400;500;600;700;800',
    'family=Fira+Code:wght@300;400;500;600;700',
    'family=Roboto:wght@300;400;500;700;900',
    'family=Roboto+Mono:wght@300;400;500;600;700',
    'family=Inconsolata:wght@300;400;500;600;700;800;900',
    'family=Space+Mono:wght@400;700',
    'family=Source+Code+Pro:wght@300;400;500;600;700;800;900',
    'family=Geist:wght@300;400;500;600;700;800;900',
  ].join('&') +
  '&display=swap'

// Pretend to be a modern browser so Google returns woff2 format
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url)
    https.get({ hostname: opts.hostname, path: opts.pathname + opts.search, headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location, headers))
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function main() {
  fs.mkdirSync(FONTS_DIR, { recursive: true })

  console.log('Fetching Google Fonts CSS…')
  const cssBuffer = await get(GOOGLE_CSS_URL, { 'User-Agent': BROWSER_UA })
  let css = cssBuffer.toString('utf-8')

  // Extract all woff2 URLs
  const urlRe = /url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g
  const urls = [...new Set([...css.matchAll(urlRe)].map(m => m[1]))]
  console.log(`Found ${urls.length} font files to download.`)

  let done = 0
  await Promise.all(urls.map(async (url) => {
    const filename = url.split('/').pop().split('?')[0]
    const dest = path.join(FONTS_DIR, filename)
    if (fs.existsSync(dest)) { done++; return }
    try {
      const buf = await get(url)
      fs.writeFileSync(dest, buf)
    } catch (e) {
      console.warn(`  WARN: failed to download ${filename}: ${e.message}`)
    }
    done++
    if (done % 20 === 0) console.log(`  ${done}/${urls.length}…`)
  }))

  // Rewrite Google CDN URLs → local relative paths
  const localCss = css.replace(
    /url\(https:\/\/fonts\.gstatic\.com[^)]*\/([^/)]+)\)/g,
    (_, filename) => `url(./${filename})`
  )

  fs.writeFileSync(path.join(FONTS_DIR, 'fonts.css'), localCss, 'utf-8')
  console.log(`\nDone! ${urls.length} files saved to src/renderer/public/fonts/`)
  console.log('fonts.css written — commit both to the repo.')
}

main().catch(e => { console.error(e); process.exit(1) })
