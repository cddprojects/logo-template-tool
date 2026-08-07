const ReactDOMServer = require('react-dom/server')
const { createElement } = require('react')

const tests = [
  ['react-icons/tb', 'TbHome'],
  ['react-icons/hi2', 'HiOutlineHome'],
  ['react-icons/pi', 'PiHouse'],
  ['react-icons/bs', 'BsHouseDoor'],
  ['react-icons/fi', 'FiHome'],
  ['react-icons/md', 'MdHome'],
  ['react-icons/ri', 'RiHomeLine'],
]

tests.forEach(function([lib, name]) {
  try {
    const mod = require(lib)
    const Comp = mod[name]
    if (!Comp) { console.log(lib, name, 'NOT FOUND'); return }
    const svg = ReactDOMServer.renderToStaticMarkup(createElement(Comp, { size: 24 }))
    const vbMatch = svg.match(/viewBox="([^"]+)"/)
    const vb = vbMatch ? vbMatch[1] : 'no-viewBox'
    const style = svg.includes('stroke-width') ? 'STROKE' : 'FILL'
    console.log(lib.padEnd(22) + name.padEnd(25) + vb.padEnd(20) + style)
  } catch(e) {
    console.log(lib, 'ERROR:', e.message.slice(0, 60))
  }
})
