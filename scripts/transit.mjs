// Builds the transit data files: src/data/busroutes.json, tram.json, cercanias.json (stations and line, small) and cercanias-times.json (the timetable, loaded when the Cercanías tab opens). Called by build-data.mjs (`npm run data`), or alone: `npm run data:transit`.
// Sources (checked 2026-11-02): the city's WFS layers MU3_* (CORS open) and the Renfe Cercanías GTFS zip. Needs the `unzip` command (it streams the 288 MB stop_times file, nothing is unpacked to disk).
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import readline from 'node:readline'
import { cleanName } from '../src/lib/geo.ts'
import { encodePolyline, orderAlong, simplify } from '../src/lib/transit.ts'

const WFS = 'https://idezar-sig.zaragoza.es/servicios/geoserver/movilidad/wfs?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326&typeNames=movilidad:'
export const RENFE_ZIP = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip'
const TOL = 2.5 // metres: line simplification
const today = new Date().toISOString().slice(0, 10)

async function wfs(layer) {
  const r = await fetch(WFS + layer)
  if (!r.ok) throw new Error(`${layer}: HTTP ${r.status}`)
  return (await r.json()).features
}
const ll = c => [c[1], c[0]] // GeoJSON [lon, lat] -> [lat, lon]
const parts = geom => (geom.type === 'MultiLineString' ? geom.coordinates : [geom.coordinates]).map(p => p.map(ll))
const enc = pts => encodePolyline(simplify(pts, TOL))
const round = (n, d = 5) => +n.toFixed(d)

// ---------- bus: the lines (both directions) and their stops, in route order ----------
export async function buildBusRoutes() {
  const [lines, stops] = await Promise.all([wfs('MU3_lineas_bus'), wfs('MU3_paradas_BUS')])
  const usual = lines.filter(f => f.properties.tipo === 'Línea habitual') // not the festival (Verbena) or extension variants
  const used = new Set()
  const out = {}
  for (const f of usual) {
    const p = f.properties, line = String(p.rt_shrt_nm).trim(), dir = +p.direction_
    const pieces = parts(f.geometry).map(a => simplify(a, TOL)).filter(a => a.length > 1)
    const path = pieces.flat()
    const names = String(p.rt_long_nm).split(' - ').map(s => cleanName(s))
    const two = names.length >= 2 && !/^circular/i.test(p.rt_long_nm)
    const mine = new Map()
    for (const s of stops) {
      const q = s.properties
      if (String(q.short_name).trim() !== line || +q.direction_ !== dir) continue
      mine.set(+q.cod_poste, { id: +q.cod_poste, name: String(q.stop_name).replace(/\s+/g, ' ').trim(), lat: round(s.geometry.coordinates[1], 6), lon: round(s.geometry.coordinates[0], 6) })
    }
    const ordered = orderAlong(path, [...mine.values()])
    for (const s of ordered) used.add(s.id)
    const entry = (out[line] ??= { n: names.join(' - '), d: [] })
    entry.d[dir] = { ...(two ? { to: dir === 0 ? names.at(-1) : names[0] } : {}), p: pieces.map(a => encodePolyline(a)), s: ordered.map(s => s.id) }
  }
  for (const l of Object.values(out)) l.d = l.d.filter(Boolean)
  const table = {}
  for (const s of stops) { const c = +s.properties.cod_poste; if (used.has(c) && !table[c]) table[c] = [String(s.properties.stop_name).replace(/\s+/g, ' ').trim(), round(s.geometry.coordinates[1], 6), round(s.geometry.coordinates[0], 6)] }
  const lineNames = Object.keys(out).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  return { src: 'Ayuntamiento de Zaragoza, geoserver movilidad (MU3_lineas_bus, MU3_paradas_BUS)', updated: today, stops: table, lines: Object.fromEntries(lineNames.map(k => [k, out[k]])) }
}

// ---------- tram: stops and the track ----------
export async function buildTram() {
  const [lines, stops] = await Promise.all([wfs('MU3_lineas_tranvia'), wfs('MU3_paradas_tranvia')])
  const main = lines.filter(f => f.properties.direction !== 'Conexiones') // depot links are not the passenger line
  const dirs = [...new Set(main.map(f => f.properties.direction))]
  const first = dirs[0] ?? ''
  const track = main.filter(f => f.properties.direction === first).flatMap(f => parts(f.geometry))
  // a stop has one point per platform (and the city spells La Chimenea twice): one stop per name, at the middle of its points
  const byName = new Map()
  for (const s of stops) {
    const name = String(s.properties.stop_name).trim(), key = name.toLowerCase()
    const pts = s.geometry.type === 'MultiPoint' ? s.geometry.coordinates : [s.geometry.coordinates]
    const e = byName.get(key) ?? { name, code: s.properties.codigo, lines: s.properties.lineas, pts: [] }
    e.pts.push(...pts)
    byName.set(key, e)
  }
  const rows = [...byName.values()].map(e => [String(e.code).toLowerCase().replace(/[^a-z0-9]+/g, '_'), e.name.replace(/^La chimenea$/, 'La Chimenea'), round(e.pts.reduce((a, p) => a + p[1], 0) / e.pts.length, 6), round(e.pts.reduce((a, p) => a + p[0], 0) / e.pts.length, 6), e.lines]).sort((a, b) => a[1].localeCompare(b[1], 'es'))
  const ends = first.split(/\s*→\s*/)
  return { src: 'Ayuntamiento de Zaragoza, geoserver movilidad (MU3_lineas_tranvia, MU3_paradas_tranvia)', updated: today, ends, line: track.map(enc), rows }
}

// ---------- Cercanías (Renfe GTFS, Zaragoza nucleus) ----------
const BOX = { la: [41.45, 41.95], lo: [-1.3, -0.6] }
const inBox = (la, lo) => la >= BOX.la[0] && la <= BOX.la[1] && lo >= BOX.lo[0] && lo <= BOX.lo[1]
const csv = text => text.split(/\r?\n/).slice(1).filter(Boolean).map(l => l.split(',').map(s => s.trim()))
const unzipText = (zip, file) => new Promise((res, rej) => {
  const c = spawn('unzip', ['-p', zip, file]); const b = []
  c.stdout.on('data', d => b.push(d)); c.on('error', rej); c.on('close', () => res(Buffer.concat(b).toString('utf8')))
})
const hm = t => { const [h, m] = t.split(':'); return +h * 60 + +m }
const dow = d => (new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T12:00:00Z`).getUTCDay() + 6) % 7 // 0 = Monday
const typeOf = day => (day <= 3 ? 'wd' : day === 4 ? 'fri' : day === 5 ? 'sat' : 'sun')

export async function buildCercanias(zipPath) {
  if (!zipPath) {
    const dir = mkdtempSync(join(tmpdir(), 'renfe-'))
    const r = await fetch(RENFE_ZIP)
    if (!r.ok) throw new Error('Renfe GTFS: HTTP ' + r.status)
    zipPath = join(dir, 'fomento_transit.zip')
    writeFileSync(zipPath, Buffer.from(await r.arrayBuffer()))
  }
  const stops = new Map(csv(await unzipText(zipPath, 'stops.txt')).map(r => [r[0], r]))
  const box = new Set([...stops.values()].filter(r => inBox(+r[2], +r[3])).map(r => r[0]))
  const routes = new Map(csv(await unzipText(zipPath, 'routes.txt')).map(r => [r[0], r]))
  const trips = new Map(csv(await unzipText(zipPath, 'trips.txt')).map(r => [r[2], r]))
  const cal = new Map(csv(await unzipText(zipPath, 'calendar.txt')).map(r => [r[0], r]))
  // the Zaragoza nucleus is number 70 (route ids 70T....). Regional lines that share a station are not Cercanías and are left out.
  const mine = id => { const t = trips.get(id); const r = t && routes.get(t[0]); return r && /^70T/.test(r[0]) && /^C\d/.test(r[1]) ? r : null }
  const info = new Map()
  const c = spawn('unzip', ['-p', zipPath, 'stop_times.txt'])
  const rl = readline.createInterface({ input: c.stdout })
  let head = true
  for await (const line of rl) {
    if (head) { head = false; continue }
    const [t, , dep, s, q] = line.split(',').map(x => x.trim())
    if (!mine(t)) continue
    let i = info.get(t)
    if (!i) { i = { z: [], f: null, l: null }; info.set(t, i) }
    const seq = +q
    if (!i.f || seq < i.f[0]) i.f = [seq, s]
    if (!i.l || seq > i.l[0]) i.l = [seq, s]
    if (box.has(s)) i.z.push([s, dep])
  }
  const dests = [], destOf = id => { const n = stops.get(id)?.[1] ?? id; let k = dests.indexOf(n); if (k < 0) k = dests.push(n) - 1; return k }
  const byDate = new Map() // date -> stop -> [[min, dest]]
  const used = new Set(), shapes = new Set(), routeNames = new Set()
  for (const [t, i] of info) {
    if (!i.z.length) continue
    const tr = trips.get(t), r = routes.get(tr[0]), d = cal.get(tr[1])[8]
    routeNames.add(r[1]); if (tr[6]) shapes.add(tr[6])
    const day = byDate.get(d) ?? new Map(); byDate.set(d, day)
    for (const [s, dep] of i.z) {
      // the last stop of a trip is not a departure there
      if (s === i.l[1]) continue
      used.add(s)
      const list = day.get(s) ?? []; list.push([hm(dep), destOf(i.l[1])]); day.set(s, list)
    }
  }
  // one reference day per day type: the most common whole-network plan among the dates of the feed (the first day is a partial day, so it counts only if nothing else exists)
  const dates = [...byDate.keys()].sort()
  const sig = d => JSON.stringify([...byDate.get(d)].sort().map(([s, l]) => [s, l.sort((a, b) => a[0] - b[0] || a[1] - b[1])]))
  const groups = { wd: new Map(), fri: new Map(), sat: new Map(), sun: new Map() }
  for (const d of dates.slice(1)) { const g = groups[typeOf(dow(d))], s = sig(d); g.set(s, (g.get(s) ?? 0) + 1) }
  const pick = type => { const g = groups[type]; return [...g].sort((a, b) => b[1] - a[1])[0]?.[0] }
  const t = {}
  for (const s of used) t[s] = { wd: [], fri: [], sat: [], sun: [] }
  for (const type of Object.keys(groups)) {
    const best = pick(type); if (!best) continue
    for (const [s, list] of JSON.parse(best)) if (t[s]) t[s][type] = list.flat()
  }
  const rows = [...used].map(id => stops.get(id)).sort((a, b) => a[1].localeCompare(b[1], 'es')).map(r => [r[0], r[1], +(+r[2]).toFixed(6), +(+r[3]).toFixed(6)])
  // the track: the shapes of the Zaragoza trips, cut to the Zaragoza box
  const pts = new Map()
  for (const row of csv(await unzipText(zipPath, 'shapes.txt'))) if (shapes.has(row[0])) { const a = pts.get(row[0]) ?? []; a.push([+row[3], +row[1], +row[2]]); pts.set(row[0], a) }
  const line = [...pts.values()].map(a => a.sort((x, y) => x[0] - y[0]).map(p => [p[1], p[2]])).filter(a => a.length > 1).map(a => enc(a))
  return {
    src: 'Renfe Cercanías, GTFS (ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip), Zaragoza nucleus', updated: today,
    valid: [dates[0], dates.at(-1)].map(d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`),
    routes: [...routeNames].sort(), dests, rows, t, line: [...new Set(line)],
  }
}

/** Write the four files. `only` = 'bus' | 'tram' | 'cercanias' | undefined (all). */
export async function writeTransit(outDir, only, zip) {
  const w = (name, data) => { writeFileSync(join(outDir, name), JSON.stringify(data)); console.log('wrote', name, JSON.stringify(data).length, 'bytes') }
  if (!only || only === 'bus') w('busroutes.json', await buildBusRoutes())
  if (!only || only === 'tram') w('tram.json', await buildTram())
  if (!only || only === 'cercanias') { const { t, ...stations } = await buildCercanias(zip); w('cercanias.json', stations); w('cercanias-times.json', { updated: stations.updated, t }) }
}
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const { dirname, resolve } = await import('node:path'), { fileURLToPath } = await import('node:url')
  const zi = process.argv.indexOf('--zip') // optional local copy of the Renfe zip
  await writeTransit(resolve(dirname(fileURLToPath(import.meta.url)), '../src/data'), process.argv[2]?.startsWith('--') ? undefined : process.argv[2], zi > 0 ? process.argv[zi + 1] : undefined)
}
