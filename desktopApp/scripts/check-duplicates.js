const fs = require('fs')
const src = fs.readFileSync('src/renderer/src/utils/iconLibrary.ts', 'utf8')

const newNames = [
  'OmegaGlyph','MathIntegral','MathPi','MathFunction','MathSymbols',
  'Atom2','Dna2','Sphere','Prism','Hexagons','YinYang','Polygon',
  'VectorPath','VectorBezier','VectorBezier2','VectorSpline',
  'Transform','Perspective','Geometry','Circles',
  'TopologyComplex','TopologyRing','TopologyStar','TopologyFull',
  'HomeSignal','HomeCheck','Timezone','ClockPlay','ClockPause',
  'ClockCheck','ClockStop','ClockRecord','UsersGroup',
  'DesktopCode','DesktopShare','DesktopAnalytics','Webhook',
  'PresentationAnalytics','ClipboardData','ReportAnalytics',
  'CalendarEvent','VideoMeet','TeamChat','CodeRepo'
]

newNames.forEach(function(n) {
  const pattern = new RegExp("name: '" + n + "'")
  if (pattern.test(src)) console.log('DUPLICATE:', n)
  else console.log('OK:', n)
})
