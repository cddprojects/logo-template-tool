/**
 * Extract inner SVG content from react-icons components.
 * Run: node scripts/extract-icons.js
 */
const ReactDOMServer = require('react-dom/server')
const { createElement } = require('react')

function extractSvgInner(lib, name) {
  try {
    const mod = require(lib)
    const Comp = mod[name]
    if (!Comp) return null
    const svg = ReactDOMServer.renderToStaticMarkup(createElement(Comp, { size: 24 }))
    // Strip outer <svg ...> wrapper (keep inner paths only)
    // Also strip the Tabler "transparent bounding box" path: <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    let inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
    inner = inner.replace(/<path[^>]*stroke="none"[^>]*fill="none"[^>]*\/>/g, '')
    inner = inner.replace(/<path[^>]*fill="none"[^>]*stroke="none"[^>]*\/>/g, '')
    return inner.trim()
  } catch (e) {
    return null
  }
}

const wantedIcons = [
  // ── Abstract ─ Tabler (24x24 stroke, matches Lucide exactly) ─────────────────
  // Math & science
  { lib: 'react-icons/tb', name: 'TbMathIntegral',   display: 'MathIntegral',    kw: ['integral', 'calculus', 'math', 'area', 's curve'],          cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbMathPi',         display: 'MathPi',          kw: ['pi', 'math', 'circle', 'constant', 'greek'],                  cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbMathFunction',   display: 'MathFunction',    kw: ['function', 'math', 'formula', 'f(x)', 'equation'],            cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbMathSymbols',    display: 'MathSymbols',     kw: ['symbols', 'math', 'operators', 'formula'],                    cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbOmega',          display: 'OmegaTabler',     kw: ['omega', 'greek', 'letter', 'math', 'last'],                   cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbAtom2',          display: 'Atom2',           kw: ['atom', 'nucleus', 'science', 'orbital', 'particle'],          cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbDna2',           display: 'Dna2',            kw: ['dna', 'helix', 'genetics', 'biology', 'double'],              cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbRadiation',      display: 'Radiation',       kw: ['radiation', 'nuclear', 'hazard', 'symbol', 'warning'],        cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbSphere',         display: 'Sphere',          kw: ['sphere', '3d', 'globe', 'ball', 'round'],                     cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbPrism',          display: 'Prism',           kw: ['prism', '3d', 'triangle', 'optics', 'shape'],                 cat: 'Abstract' },
  // Graph / topology
  { lib: 'react-icons/tb', name: 'TbTopologyComplex', display: 'TopologyComplex', kw: ['topology', 'network', 'nodes', 'complex', 'graph'],          cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbTopologyRing',   display: 'TopologyRing',    kw: ['topology', 'ring', 'network', 'circular', 'loop'],            cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbTopologyStar',   display: 'TopologyStar',    kw: ['topology', 'star', 'network', 'hub', 'central'],              cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbTopologyFull',   display: 'TopologyFull',    kw: ['topology', 'full mesh', 'network', 'connected', 'all'],        cat: 'Abstract' },
  // Pattern / geometry
  { lib: 'react-icons/tb', name: 'TbHexagons',       display: 'Hexagons',        kw: ['hexagons', 'honeycomb', 'pattern', 'tile', 'grid'],           cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbYinYang',        display: 'YinYang',         kw: ['yin yang', 'balance', 'duality', 'harmony', 'circle'],        cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbPolygon',        display: 'Polygon',         kw: ['polygon', 'shape', 'vector', 'multi', 'geometric'],           cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbVector',         display: 'VectorPath',      kw: ['vector', 'path', 'points', 'anchor', 'design'],              cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbVectorBezier',   display: 'VectorBezier',    kw: ['bezier', 'curve', 'path', 'vector', 'smooth'],               cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbVectorBezier2',  display: 'VectorBezier2',   kw: ['bezier', 'curve', 'control point', 'path', 'handle'],        cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbVectorSpline',   display: 'VectorSpline',    kw: ['spline', 'curve', 'smooth', 'path', 'bezier'],               cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbTransform',      display: 'Transform',       kw: ['transform', 'scale', 'rotate', 'move', 'modify'],            cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbPerspective',    display: 'Perspective',     kw: ['perspective', 'vanishing', '3d', 'depth', 'grid'],           cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbGeometry',       display: 'Geometry',        kw: ['geometry', 'shapes', 'math', 'figure', 'diagram'],           cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbCircles',        display: 'Circles',         kw: ['circles', 'multiple', 'rings', 'overlap', 'bubbles'],        cat: 'Abstract' },
  { lib: 'react-icons/tb', name: 'TbCirclesDivide',  display: 'CirclesDivide',   kw: ['circles', 'divide', 'split', 'two', 'half'],                 cat: 'Abstract' },
  // Remix Icons abstract additions (24x24 stroke)
  { lib: 'react-icons/ri', name: 'RiFlowChart',      display: 'FlowChart',       kw: ['flow', 'chart', 'diagram', 'process', 'arrows'],             cat: 'Abstract' },
  { lib: 'react-icons/ri', name: 'RiOrganizationChart', display: 'OrgChart',     kw: ['org chart', 'hierarchy', 'tree', 'nodes', 'structure'],      cat: 'Abstract' },
  { lib: 'react-icons/ri', name: 'RiFunctionLine',   display: 'FunctionLine',    kw: ['function', 'math', 'formula', 'curve', 'fx'],                cat: 'Abstract' },
  { lib: 'react-icons/ri', name: 'RiBubbleChartLine', display: 'BubbleChart',   kw: ['bubble', 'chart', 'data', 'scatter', 'circles'],             cat: 'Abstract' },
  { lib: 'react-icons/ri', name: 'RiDonutChartLine', display: 'DonutChart',     kw: ['donut', 'chart', 'ring', 'data', 'proportion'],              cat: 'Abstract' },
  { lib: 'react-icons/ri', name: 'RiFocusLine',      display: 'FocusZoom',       kw: ['focus', 'zoom', 'lens', 'center', 'magnify'],                cat: 'Abstract' },
  { lib: 'react-icons/ri', name: 'RiGridLine',       display: 'GridLine',        kw: ['grid', 'lines', 'pattern', 'structure', 'align'],            cat: 'Abstract' },
  { lib: 'react-icons/ri', name: 'RiShape2Line',     display: 'ShapeAlt',        kw: ['shape', 'mixed', 'objects', 'forms', 'design'],              cat: 'Abstract' },
  { lib: 'react-icons/ri', name: 'RiSymbolsLine',    display: 'Symbols',         kw: ['symbols', 'characters', 'unicode', 'special', 'marks'],      cat: 'Abstract' },
  { lib: 'react-icons/ri', name: 'RiSpiralLine',     display: 'SpiralLine',      kw: ['spiral', 'swirl', 'coil', 'rotate', 'vortex'],               cat: 'Abstract' },

  // ── Remote Work ─ Tabler ──────────────────────────────────────────────────────
  { lib: 'react-icons/tb', name: 'TbHomeWifi',       display: 'HomeWifi',        kw: ['home', 'wifi', 'wfh', 'remote', 'internet', 'connected'],    cat: 'Remote Work' },
  { lib: 'react-icons/tb', name: 'TbHomeSignal',     display: 'HomeSignal',      kw: ['home', 'signal', 'remote', 'wfh', 'connected', 'network'],   cat: 'Remote Work' },
  { lib: 'react-icons/tb', name: 'TbHomeUser',       display: 'HomeUser',        kw: ['home', 'user', 'remote', 'wfh', 'work from home', 'worker'], cat: 'Remote Work' },
  { lib: 'react-icons/tb', name: 'TbTimezone',       display: 'Timezone',        kw: ['timezone', 'world', 'clock', 'remote', 'time zone', 'global'], cat: 'Remote Work' },
  { lib: 'react-icons/tb', name: 'TbClockPlay',      display: 'ClockPlay',       kw: ['start', 'timer', 'clock', 'begin', 'work', 'time track'],    cat: 'Remote Work' },
  { lib: 'react-icons/tb', name: 'TbClockPause',     display: 'ClockPause',      kw: ['pause', 'break', 'timer', 'clock', 'rest', 'stop'],          cat: 'Remote Work' },
  { lib: 'react-icons/tb', name: 'TbClockCheck',     display: 'ClockCheck',      kw: ['clock', 'done', 'complete', 'time', 'deadline', 'finished'], cat: 'Remote Work' },
  { lib: 'react-icons/tb', name: 'TbUsersGroup',     display: 'UsersGroup',      kw: ['team', 'group', 'users', 'remote', 'distributed', 'squad'],  cat: 'Remote Work' },
  { lib: 'react-icons/tb', name: 'TbDeviceDesktopCode', display: 'DesktopCode', kw: ['desktop', 'code', 'dev', 'remote', 'development', 'setup'],  cat: 'Remote Work' },
  { lib: 'react-icons/tb', name: 'TbDeviceDesktopShare', display: 'DesktopShare', kw: ['screen share', 'desktop', 'remote', 'share', 'present'],   cat: 'Remote Work' },
  { lib: 'react-icons/tb', name: 'TbDeviceLaptopCode', display: 'LaptopCode',   kw: ['laptop', 'code', 'developer', 'remote', 'wfh', 'coding'],    cat: 'Remote Work' },
  { lib: 'react-icons/tb', name: 'TbWebhook',        display: 'Webhook',         kw: ['webhook', 'api', 'integration', 'trigger', 'remote', 'dev'], cat: 'Remote Work' },
  { lib: 'react-icons/tb', name: 'TbHomeCheck',      display: 'HomeCheck',       kw: ['home', 'check', 'verified', 'wfh', 'remote', 'approved'],    cat: 'Remote Work' },
  // Remix Icons remote work
  { lib: 'react-icons/ri', name: 'RiUserVoiceLine',  display: 'UserVoice',       kw: ['voice', 'speak', 'call', 'remote', 'present', 'audio'],      cat: 'Remote Work' },
  { lib: 'react-icons/ri', name: 'RiComputerLine',   display: 'Computer',        kw: ['computer', 'desktop', 'setup', 'remote', 'workstation', 'pc'], cat: 'Remote Work' },
  { lib: 'react-icons/ri', name: 'RiWirelessChargingLine', display: 'Wireless', kw: ['wireless', 'charging', 'remote', 'connect', 'cable-free'],   cat: 'Remote Work' },
  { lib: 'react-icons/ri', name: 'RiMic2Line',       display: 'Mic2',            kw: ['microphone', 'voice', 'remote', 'podcast', 'record', 'call'], cat: 'Remote Work' },
  { lib: 'react-icons/ri', name: 'RiTeamLine',       display: 'Team',            kw: ['team', 'group', 'remote', 'distributed', 'collaborate', 'squad'], cat: 'Remote Work' },
  { lib: 'react-icons/ri', name: 'RiCustomerService2Line', display: 'CustomerService', kw: ['support', 'headset', 'customer', 'remote', 'service', 'agent'], cat: 'Remote Work' },
]

// Extract and print
wantedIcons.forEach(function(item) {
  const inner = extractSvgInner(item.lib, item.name)
  if (!inner) {
    console.log('// SKIP (not found):', item.lib, item.name)
    return
  }
  const escaped = inner.replace(/'/g, "\\'")
  console.log(
    '  { name: \'' + item.display + '\', lucide: \'\', ' +
    'svg: \'' + escaped + '\', ' +
    'keywords: ' + JSON.stringify(item.kw) + ', ' +
    'category: \'' + item.cat + '\' },'
  )
})
