const fs = require('fs')
const src = fs.readFileSync('src/renderer/src/utils/iconLibrary.ts', 'utf8')
const lines = src.split('\n')
let lastAbstract = -1, lastRemote = -1
lines.forEach(function(l, i) {
  if (l.indexOf("category: 'Abstract'") !== -1) lastAbstract = i
  if (l.indexOf("category: 'Remote Work'") !== -1) lastRemote = i
})
console.log('Last Abstract line:', lastAbstract + 1, '|', lines[lastAbstract].trim())
console.log('Last RemoteWork line:', lastRemote + 1, '|', lines[lastRemote].trim())
console.log('Total lines:', lines.length)
