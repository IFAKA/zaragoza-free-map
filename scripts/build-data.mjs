// Generates every data file the app ships: src/data/*.json. Run with `npm run data` (Node 22.18+; it imports the .ts helpers directly).
//   node scripts/build-data.mjs            all sources
//   node scripts/build-data.mjs --no-osm   skip Overpass (keeps the existing src/data/osm.json)
// The app itself makes NO runtime data requests: it only reads these files. Re-run (the refresh-data workflow does) to update.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { biziRows, rackRows, cityEquipRows, cityWifiRows, fountainRows, parseTgo, splitOsm, emptyOsm, OSM_QUERY } from '../src/lib/sources.ts'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data')
const skipOsm = process.argv.includes('--no-osm')
const fi = process.argv.indexOf('--fountains') // optional local copy of the Zenodo file (if Zenodo blocks the request)
const fountainsFile = fi > 0 ? process.argv[fi + 1] : null
const today = new Date().toISOString().slice(0, 10)
const ZGZ = 'https://www.zaragoza.es/sede/servicio/'
const catalog = q => `${ZGZ}equipamiento/catalog.json?q=${encodeURIComponent(q)}&rows=500&srsname=wgs84`
const EPS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

// AparcaBicis has 2,000+ records and rows max 500 per call: page through it.
async function getAll(url) {
  const result = []
  for (let start = 0; ; start += 500) {
    const j = await get(`${url}&rows=500&start=${start}`)
    result.push(...(j.result || []))
    if (!j.result?.length || result.length >= j.totalCount) return { result }
  }
}
async function get(url, as = 'json', ms = 60000, init) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), ...init })
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`)
  return as === 'json' ? r.json() : r.text()
}
function write(name, src, rows, extra = {}) {
  const body = '{' + [`"src":${JSON.stringify(src)}`, `"updated":${JSON.stringify(today)}`, ...Object.entries(extra).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`), '"rows":[\n' + rows.map(r => JSON.stringify(r)).join(',\n') + '\n]'].join(',') + '}\n'
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/${name}.json`, body)
  console.log(`${name}.json: ${rows.length} rows, ${(body.length / 1024).toFixed(1)} kB`)
}
const must = (name, rows) => { if (!rows.length) throw new Error(`${name}: 0 rows, refusing to overwrite the committed file`); return rows }

const [wifi, libs, civic, bizi, racks, fount, tgo] = await Promise.all([
  get(`${ZGZ}punto-wifi.json?rows=500&srsname=wgs84`),
  get(catalog('title==Biblioteca*')),
  get(catalog('title==Centro Cívico*')),
  get(`${ZGZ}urbanismo-infraestructuras/estacion-bicicleta.json?rows=500&srsname=wgs84`),
  getAll(`${ZGZ}urbanismo-infraestructuras/equipamiento/aparcamiento-bicicleta.json?srsname=wgs84`),
  fountainsFile ? JSON.parse(readFileSync(fountainsFile, 'utf8')) : get('https://zenodo.org/records/8141704/files/fuentes.json?download=1', 'json', 60000, { headers: { 'user-agent': 'Mozilla/5.0 (zgz-free-services data build)' } }),
  get('https://raw.githubusercontent.com/IFAKA/toiletsgo/HEAD/src/data.ts', 'text'),
])
write('wifi', 'city', must('wifi', cityWifiRows(wifi)))
write('libraries', 'city', must('libraries', cityEquipRows(libs)))
write('civic', 'city', must('civic', cityEquipRows(civic)))
write('bizi', 'city', must('bizi', biziRows(bizi)))
write('racks', 'city', must('racks', rackRows(racks)))
const f = fountainRows(fount)
write('fountains', 'city', must('fountains', f.rows), { dropped: f.dropped })
write('toiletsgo', 'toiletsgo', must('toiletsgo', parseTgo(tgo)))

if (skipOsm) console.log('osm: skipped (--no-osm), keeping', existsSync(`${OUT}/osm.json`) ? 'the existing file' : 'nothing (run without --no-osm somewhere Overpass works)')
else {
  let last
  // Overpass answers 406 to clients without a User-Agent / Accept header, and 429 when busy: identify ourselves and retry the list.
  const OVERPASS_HEADERS = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': 'zaragoza-free-map data refresh (https://github.com/IFAKA/zaragoza-free-map)' }
  for (const ep of [...EPS, ...EPS]) {
    if (last) await new Promise(r => setTimeout(r, 15000))
    try {
      const j = await get(ep, 'json', 120000, { method: 'POST', headers: OVERPASS_HEADERS, body: 'data=' + encodeURIComponent(OSM_QUERY) })
      if (!Array.isArray(j.elements)) throw new Error('bad response')
      const o = splitOsm(j.elements)
      const n = o.wifi.length + o.water.length + o.toilets.length + o.charge.length
      if (n < 50) throw new Error('suspiciously small result: ' + n)
      mkdirSync(OUT, { recursive: true })
      writeFileSync(`${OUT}/osm.json`, JSON.stringify({ src: 'osm', updated: today, ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v])) }).replace(/\],"/g, '],\n"') + '\n')
      console.log('osm.json:', Object.entries(o).map(([k, v]) => `${k} ${v.length}`).join(', '))
      last = null
      break
    } catch (e) { last = e; console.warn('overpass endpoint failed:', ep, String(e)) }
  }
  if (last) { console.error('osm: all endpoints failed; keeping the existing osm.json'); process.exitCode = 1 }
}
if (!existsSync(`${OUT}/osm.json`)) writeFileSync(`${OUT}/osm.json`, JSON.stringify({ src: 'osm', updated: null, ...emptyOsm() }) + '\n')
