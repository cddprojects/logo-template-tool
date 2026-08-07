const fs = require('fs')
const src = fs.readFileSync('src/renderer/src/utils/iconLibrary.ts', 'utf8')
const cats = {}
const matches = src.matchAll(/category: '([^']+)'/g)
for (const m of matches) { cats[m[1]] = (cats[m[1]] || 0) + 1 }
console.log('Icon counts per category:')
Object.entries(cats).sort().forEach(function(e) { console.log('  ' + String(e[1]).padStart(4) + '  ' + e[0]) })
console.log('Total:', Object.values(cats).reduce(function(a,b){return a+b},0))
const names = []
const nm = src.matchAll(/name: '([^']+)'/g)
for (const m of nm) names.push(m[1])
const dupes = names.filter(function(n,i){ return names.indexOf(n) !== i })
console.log('Duplicate names:', dupes.length > 0 ? dupes.join(', ') : 'NONE (clean)')
