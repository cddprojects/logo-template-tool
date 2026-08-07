/**
 * Extract inner SVG content from Tabler Icons (react-icons/tb).
 * Tabler uses 24x24 stroke-based SVG — identical style to Lucide.
 * Run: node scripts/extract-tabler.js
 */
const ReactDOMServer = require('react-dom/server')
const { createElement } = require('react')
const tb = require('react-icons/tb')

function extractTabler(name, display, kw, cat) {
  const Comp = tb[name]
  if (!Comp) { console.log('// SKIP (not found): ' + name); return }
  const svg = ReactDOMServer.renderToStaticMarkup(createElement(Comp, { size: 24 }))
  // Strip outer <svg ...> wrapper
  let inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
  // Strip Tabler's transparent bounding-box path
  inner = inner.replace(/<path[^>]*\bd="M0 0h24v24H0z"[^>]*\/>/g, '')
  inner = inner.trim()
  const escaped = inner.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  process.stdout.write(
    '  { name: \'' + display + '\', lucide: \'\', ' +
    'svg: \'' + escaped + '\', ' +
    'keywords: ' + JSON.stringify(kw) + ', category: \'' + cat + '\' },\n'
  )
}

// ── Abstract ──────────────────────────────────────────────────────────────────
console.log('  // ── Extra Abstract icons from Tabler Icons (react-icons/tb) ────────────────')
extractTabler('TbOmega',          'OmegaGlyph',      ['omega','greek','letter','math','last','end','symbol'],              'Abstract')
extractTabler('TbMathIntegral',   'MathIntegral',    ['integral','calculus','math','area','s curve','sum'],               'Abstract')
extractTabler('TbMathPi',         'MathPi',          ['pi','math','constant','greek','symbol'],                           'Abstract')
extractTabler('TbMathFunction',   'MathFunction',    ['function','math','formula','f(x)','equation'],                     'Abstract')
extractTabler('TbMathSymbols',    'MathSymbols',     ['symbols','math','operators','plus minus','formula'],               'Abstract')
extractTabler('TbAtom2',          'Atom2',           ['atom','nucleus','science','orbital','variant'],                    'Abstract')
extractTabler('TbDna2',           'Dna2',            ['dna','helix','genetics','biology','double strand'],                'Abstract')
extractTabler('TbSphere',         'Sphere',          ['sphere','3d','ball','round','planet'],                             'Abstract')
extractTabler('TbPrism',          'Prism',           ['prism','3d','optics','light','geometric'],                         'Abstract')
extractTabler('TbHexagons',       'Hexagons',        ['hexagons','honeycomb','pattern','tile','tessellate'],              'Abstract')
extractTabler('TbYinYang',        'YinYang',         ['yin yang','balance','duality','harmony','circle'],                 'Abstract')
extractTabler('TbPolygon',        'Polygon',         ['polygon','shape','vector','multi-sided','geometric'],              'Abstract')
extractTabler('TbVector',         'VectorPath',      ['vector','path','anchor','points','design'],                       'Abstract')
extractTabler('TbVectorBezier',   'VectorBezier',    ['bezier','curve','path','vector','smooth handle'],                  'Abstract')
extractTabler('TbVectorBezier2',  'VectorBezier2',   ['bezier','curve','control point','path','handle'],                 'Abstract')
extractTabler('TbVectorSpline',   'VectorSpline',    ['spline','curve','smooth','path','bezier arc'],                    'Abstract')
extractTabler('TbTransform',      'Transform',       ['transform','scale','rotate','modify','warp'],                     'Abstract')
extractTabler('TbPerspective',    'Perspective',     ['perspective','vanishing point','3d','depth','foreshorten'],       'Abstract')
extractTabler('TbGeometry',       'Geometry',        ['geometry','shapes','math','figure','diagram'],                    'Abstract')
extractTabler('TbCircles',        'Circles',         ['circles','multiple','rings','overlap','bubbles'],                 'Abstract')
extractTabler('TbTopologyComplex','TopologyComplex', ['topology','network','nodes','complex','graph structure'],          'Abstract')
extractTabler('TbTopologyRing',   'TopologyRing',    ['topology','ring','network','circular','loop network'],            'Abstract')
extractTabler('TbTopologyStar',   'TopologyStar',    ['topology','star','hub','central','network'],                      'Abstract')
extractTabler('TbTopologyFull',   'TopologyFull',    ['topology','full mesh','all connected','network','graph'],         'Abstract')

// ── Remote Work ───────────────────────────────────────────────────────────────
console.log('  // ── Extra Remote Work icons from Tabler Icons (react-icons/tb) ─────────────')
extractTabler('TbHomeSignal',          'HomeSignal',     ['home','signal','remote','wfh','connected','bars'],         'Remote Work')
extractTabler('TbHomeCheck',           'HomeCheck',      ['home','verified','wfh','remote','approved','done'],        'Remote Work')
extractTabler('TbTimezone',            'Timezone',       ['timezone','world clock','remote','global','time zone'],    'Remote Work')
extractTabler('TbClockPlay',           'ClockPlay',      ['start','timer','begin work','track time','clock'],        'Remote Work')
extractTabler('TbClockPause',          'ClockPause',     ['pause','break','rest','timer','clock'],                   'Remote Work')
extractTabler('TbClockCheck',          'ClockCheck',     ['done','deadline','finished','clock','time'],              'Remote Work')
extractTabler('TbClockStop',           'ClockStop',      ['stop','end work','timer','clock','finish'],               'Remote Work')
extractTabler('TbClockRecord',         'ClockRecord',    ['record','time track','log','clock','working hours'],      'Remote Work')
extractTabler('TbUsersGroup',          'UsersGroup',     ['team','group','squad','distributed','remote team'],       'Remote Work')
extractTabler('TbDeviceDesktopCode',   'DesktopCode',    ['desktop','code','dev setup','remote','development'],      'Remote Work')
extractTabler('TbDeviceDesktopShare',  'DesktopShare',   ['screen share','desktop','present','remote','mirror'],     'Remote Work')
extractTabler('TbDeviceDesktopAnalytics','DesktopAnalytics',['analytics','dashboard','desktop','metrics','remote'], 'Remote Work')
extractTabler('TbWebhook',             'Webhook',        ['webhook','api','trigger','integration','automation'],     'Remote Work')
extractTabler('TbPresentationAnalytics','PresentationAnalytics',['analytics','present','data','remote','report'],   'Remote Work')
extractTabler('TbClipboardData',       'ClipboardData',  ['clipboard','data','report','remote','metrics','notes'],  'Remote Work')
extractTabler('TbReportAnalytics',     'ReportAnalytics',['report','analytics','remote','data','chart'],            'Remote Work')
extractTabler('TbCalendarEvent',       'CalendarEvent',  ['event','meeting','calendar','remote','schedule'],        'Remote Work')
extractTabler('TbBrandZoom',           'VideoMeet',      ['video','meeting','zoom','conference','remote call'],      'Remote Work')
extractTabler('TbBrandSlack',          'TeamChat',       ['chat','slack','team','async','remote','message'],        'Remote Work')
extractTabler('TbBrandGithub',         'CodeRepo',       ['git','repo','code','remote','developer','version'],      'Remote Work')
