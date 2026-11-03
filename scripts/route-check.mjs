// Compares our bus routes (src/data/busroutes.json, from the city's fixed drawing) with the routes volunteers keep in OpenStreetMap, and writes
// src/data/routecheck.json: for each line, the share of our route that OSM does not follow. A high share means the road changed (works, detour).
// OSM is not official and can be late or wrong: the app only says "may have changed", never "is". Overpass is often busy: on any failure the old file is kept.
// Run alone: `npm run data:routecheck`. build-data.mjs runs it too.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { alongPath, decodePolyline } from '../src/lib/transit.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOSTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
const Q = '[out:json][timeout:90];relation["type"="route"]["route"="bus"](41.54,-1.06,41.76,-0.76);out geom;'
const TOL_M = 60, MIN_OFF = 0.3

/** Share (0..1) of `ours` (a polyline sampled every ~40 m) that lies farther than TOL_M from every path in `theirs`. */
export function offShare(ours, theirs) {
  const pts = []
  for (let i = 1; i < ours.length; i++) {
    const a = ours[i - 1], b = ours[i], n = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) * 111_000, (b[1] - a[1]) * 83_000) / 40))
    for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n])
  }
  if (!pts.length || !theirs.length) return null
  const off = pts.filter(p => theirs.every(w => alongPath(w, p).off > TOL_M)).length
  return off / pts.length
}

async function overpass() {
  for (const h of HOSTS) {
    try {
      const r = await fetch(h, { method: 'POST', body: new URLSearchParams({ data: Q }), headers: { 'user-agent': 'zaragoza-free-map data build', accept: 'application/json' }, signal: AbortSignal.timeout(100_000) })
      if (r.ok) return await r.json()
    } catch { /* try the next host */ }
  }
  return null
}

export async function routeCheck({ out = ROOT + 'src/data' } = {}) {
  const feed = await overpass()
  if (!feed) { console.error('route-check: Overpass unavailable, file kept'); return false }
  const ways = new Map() // line ref -> the ways (as paths) of its OSM route relations
  for (const rel of feed.elements ?? []) {
    const ref = rel.tags?.ref; if (!ref) continue
    const list = ways.get(ref) ?? []
    for (const m of rel.members ?? []) if (m.type === 'way' && m.geometry?.length > 1) list.push(m.geometry.map(g => [g.lat, g.lon]))
    ways.set(ref, list)
  }
  const routes = JSON.parse(readFileSync(out + '/busroutes.json', 'utf8'))
  const lines = {}
  for (const [ref, line] of Object.entries(routes.lines)) {
    const theirs = ways.get(ref); if (!theirs?.length) continue // OSM has no route for this line: nothing to compare
    const shares = line.d.map(d => offShare(d.p.flatMap(p => decodePolyline(p)), theirs)).filter(x => x !== null)
    if (shares.length && Math.max(...shares) >= MIN_OFF) lines[ref] = Math.round(Math.max(...shares) * 100)
  }
  const file = out + '/routecheck.json'
  writeFileSync(file, JSON.stringify({ src: 'OpenStreetMap route relations (ODbL), compared with the city route drawing', updated: new Date().toISOString().slice(0, 10), lines }) + '\n')
  console.log('route-check: lines that differ:', JSON.stringify(lines))
  return existsSync(file)
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) await routeCheck()
