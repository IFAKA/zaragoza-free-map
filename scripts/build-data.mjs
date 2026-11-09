// Generates every data file the app ships: src/data/*.json. Run with `npm run data` (Node 22.18+; it imports the .ts helpers directly).
//   node scripts/build-data.mjs            all sources
//   node scripts/build-data.mjs --no-osm   skip Overpass (keeps the existing src/data/osm.json)
//   node scripts/build-data.mjs --transit-only    rebuild only busroutes.json, tram.json, cercanias.json (see scripts/transit.mjs; --no-transit skips them)
//   node scripts/build-data.mjs --hours-only      rebuild only the files that carry opening hours: wifi, libraries, civic, shelters, toiletsgo
//   node scripts/build-data.mjs --post-only       rebuild only src/data/post.json (post offices)
//   node scripts/build-data.mjs --shelters-only   rebuild only src/data/shelters.json (add --shelters PATH to read a local GeoJSON)
// The app itself makes NO runtime data requests: it only reads these files. Re-run (the refresh-data workflow does) to update.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeTransit } from './transit.mjs'
import { probeBus } from './probe-bus.mjs'
import { routeCheck } from './route-check.mjs'
import { biziRows, busRows, rackRows, cityEquipRows, cityWifiRows, fountainRows, parseTgo, shelterRows, postRows, splitOsm, emptyOsm, OSM_QUERY } from '../src/lib/sources.ts'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data')
const skipOsm = process.argv.includes('--no-osm')
const fi = process.argv.indexOf('--fountains') // optional local copy of the Zenodo file (if Zenodo blocks the request)
const fountainsFile = fi > 0 ? process.argv[fi + 1] : null
const si = process.argv.indexOf('--shelters') // optional local copy of the climate shelters GeoJSON
const sheltersFile = si > 0 ? process.argv[si + 1] : null
const POST_URL = `https://www.zaragoza.es/sede/servicio/equipamiento/basic/oficinas-de-correos.geojson?srsname=wgs84`
const SHELTERS_URL = 'https://www.zaragoza.es/contenidos/datosabiertos/islas_calor/refugios_climaticos_wgs84v2.geojson'
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
// The city server sometimes answers with an empty body or a 5xx: try each request up to 3 times.
async function get(url, as = 'json', ms = 60000, init) {
  for (let n = 1; ; n++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(ms), ...init })
      if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`)
      return as === 'json' ? await r.json() : await r.text()
    } catch (e) {
      if (n >= 3) throw e
      console.warn(`retry ${n} for ${url}: ${e}`)
      await new Promise(res => setTimeout(res, 1500 * n))
    }
  }
}
function write(name, src, rows, extra = {}) {
  const body = '{' + [`"src":${JSON.stringify(src)}`, `"updated":${JSON.stringify(today)}`, ...Object.entries(extra).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`), '"rows":[\n' + rows.map(r => JSON.stringify(r)).join(',\n') + '\n]'].join(',') + '}\n'
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/${name}.json`, body)
  console.log(`${name}.json: ${rows.length} rows, ${(body.length / 1024).toFixed(1)} kB`)
}
const must = (name, rows) => { if (!rows.length) throw new Error(`${name}: 0 rows, refusing to overwrite the committed file`); return rows }

// WiFi points (`internal_id`) and the toiletsgo places are records of the city equipment catalogue: their opening hours are in equipamiento/{id}.json.
async function equipHours(ids) {
  const out = {}
  const queue = [...new Set(ids.map(String))]
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let id; (id = queue.pop());) {
      try { const j = await get(`${ZGZ}equipamiento/${id}.json`); out[id] = { title: j.title, horario: j.horario } }
      catch (e) { console.warn(`equipment ${id}: no record (${e}), its hours stay unknown`) }
    }
  }))
  return out
}
const TGO_URL = 'https://raw.githubusercontent.com/IFAKA/toiletsgo/HEAD/src/data.ts'
const tgoIds = text => [...text.matchAll(/\bid:\s*(\d+)\s*,\s*name:/g)].map(m => m[1])

const getShelters = () => (sheltersFile ? JSON.parse(readFileSync(sheltersFile, 'utf8')) : get(SHELTERS_URL))
if (process.argv.includes('--shelters-only')) {
  write('shelters', 'city', must('shelters', shelterRows(await getShelters())))
  process.exit(0)
}

if (process.argv.includes('--post-only')) {
  write('post', 'city', must('post', postRows(await get(POST_URL))))
  process.exit(0)
}

if (process.argv.includes('--hours-only')) {
  const [wifi, libs, civic, tgo, shelters] = await Promise.all([get(`${ZGZ}punto-wifi.json?rows=500&srsname=wgs84`), get(catalog('title==Biblioteca*')), get(catalog('title==Centro Cívico*')), get(TGO_URL, 'text'), getShelters()])
  const hours = await equipHours([...(wifi.result || []).map(r => r.internal_id).filter(Boolean), ...tgoIds(tgo)])
  write('wifi', 'city', must('wifi', cityWifiRows(wifi, hours)))
  write('libraries', 'city', must('libraries', cityEquipRows(libs)))
  write('civic', 'city', must('civic', cityEquipRows(civic)))
  write('shelters', 'city', must('shelters', shelterRows(shelters)))
  write('toiletsgo', 'toiletsgo', must('toiletsgo', parseTgo(tgo, hours)))
  process.exit(0)
}

if (process.argv.includes('--transit-only')) { await writeTransit(OUT); process.exit(0) }

const [wifi, libs, civic, post, bizi, racks, bus, fount, tgo, shelters] = await Promise.all([
  get(`${ZGZ}punto-wifi.json?rows=500&srsname=wgs84`),
  get(catalog('title==Biblioteca*')),
  get(catalog('title==Centro Cívico*')),
  get(POST_URL),
  // Bizi is the flakiest city endpoint (sometimes an empty body for hours): if it fails, keep the committed file instead of failing the whole refresh
  get(`${ZGZ}urbanismo-infraestructuras/estacion-bicicleta.json?rows=500&srsname=wgs84`).catch(e => { console.warn('bizi: source failed, keeping the committed bizi.json:', String(e)); return null }),
  getAll(`${ZGZ}urbanismo-infraestructuras/equipamiento/aparcamiento-bicicleta.json?srsname=wgs84`),
  getAll(`${ZGZ}urbanismo-infraestructuras/transporte-urbano/poste-autobus.json?srsname=wgs84`),
  fountainsFile ? JSON.parse(readFileSync(fountainsFile, 'utf8')) : get('https://zenodo.org/records/8141704/files/fuentes.json?download=1', 'json', 60000, { headers: { 'user-agent': 'Mozilla/5.0 (zgz-free-services data build)' } }),
  get(TGO_URL, 'text'),
  getShelters(),
])
const hours = await equipHours([...(wifi.result || []).map(r => r.internal_id).filter(Boolean), ...tgoIds(tgo)])
write('wifi', 'city', must('wifi', cityWifiRows(wifi, hours)))
write('libraries', 'city', must('libraries', cityEquipRows(libs)))
write('civic', 'city', must('civic', cityEquipRows(civic)))
write('post', 'city', must('post', postRows(post)))
if (bizi) write('bizi', 'city', must('bizi', biziRows(bizi)))
write('racks', 'city', must('racks', rackRows(racks)))
write('bus', 'city', must('bus', busRows(bus)))
const f = fountainRows(fount)
write('fountains', 'city', must('fountains', f.rows), { dropped: f.dropped })
write('shelters', 'city', must('shelters', shelterRows(shelters)))
write('toiletsgo', 'toiletsgo', must('toiletsgo', parseTgo(tgo, hours)))

// bus routes, tram and Cercanías: if a source fails, keep the committed files and say so
if (!process.argv.includes('--no-transit')) await writeTransit(OUT).catch(e => { console.error('transit: source failed, keeping the committed files:', String(e)); process.exitCode = 1 })
// bus stops the live-times API never answers (about 1 min; --no-busprobe skips it; also runs alone: npm run data:busprobe)
if (!process.argv.includes('--no-busprobe')) await probeBus({ out: OUT }).catch(e => { console.error('busprobe failed, keeping the committed file:', String(e)); process.exitCode = 1 })
if (!skipOsm) await routeCheck({ out: OUT }).catch(e => console.error('route-check failed, keeping the committed file:', String(e)))

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
