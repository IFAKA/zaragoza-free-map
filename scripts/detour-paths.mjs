// Draws the detours listed in src/data/detours.json ("reroutes") as street paths: OSRM routes through the stops that sit on the streets the
// news names, and the result is written to src/data/detourpaths.json (an encoded polyline per "line:direction"). The app splices it into the route.
// Run alone: `npm run data:detours` (needs internet). On any failure the old file is kept. Remove a line from "reroutes" when its works end.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { alongPath, encodePolyline } from '../src/lib/transit.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = f => JSON.parse(readFileSync(ROOT + 'src/data/' + f, 'utf8'))

/** Cuts out-and-back spurs and small loops (a waypoint on the far side of a road makes OSRM drive to it and back). */
export function noSpurs(line, tolM = 8, minLoopM = 40) {
  const d = (a, b) => Math.hypot((a[0] - b[0]) * 111_000, (a[1] - b[1]) * 83_000)
  const out = [], run = [] // run[i] = metres driven up to out[i]
  for (const p of line) {
    let k = -1
    for (let i = 0; i < out.length - 1; i++) if (d(out[i], p) < tolM && run[out.length - 1] - run[i] > minLoopM) { k = i; break }
    if (k >= 0) { out.length = k + 1; run.length = k + 1 } // back at an earlier point after a real detour away: drop what was driven since
    else { run.push(out.length ? run[out.length - 1] + d(out[out.length - 1], p) : 0); out.push(p) }
  }
  return out
}

export async function detourPaths() {
  const det = read('detours.json'), bus = read('bus.json'), routes = read('busroutes.json')
  const at = new Map(bus.rows.map(r => [String(r[0]), [r[3], r[4]]]))
  for (const [c, s] of Object.entries(routes.stops)) at.set(c, [s[1], s[2]])
  const out = {}
  for (const [key, r] of Object.entries(det.reroutes ?? {})) {
    const ids = [r.from, ...r.via, r.to], pts = ids.map(i => at.get(i))
    if (pts.some(p => !p)) { console.error(key, 'unknown stop in', ids.join(',')); continue }
    const url = 'https://router.project-osrm.org/route/v1/driving/' + pts.map(p => p[1] + ',' + p[0]).join(';') + '?overview=full&geometries=geojson&continue_straight=false'
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'zaragoza-free-map data build' }, signal: AbortSignal.timeout(30_000) })
      const j = await res.json()
      const raw = j.routes?.[0]?.geometry?.coordinates?.map(([lo, la]) => [la, lo]), line = raw && noSpurs(raw)
      if (!line?.length) { console.error(key, 'no route', j.code); continue }
      const way = det.closedStops.way
      const inside = line.filter(p => alongPath(way, p).off < det.closedStops.radius).length
      if (inside) console.error(key, 'WARNING: path runs', inside, 'points along the closed street')
      out[key] = encodePolyline(line)
      console.log(key, line.length, 'points', Math.round(j.routes[0].distance), 'm')
    } catch (e) { console.error(key, 'failed', String(e)) }
    await new Promise(r => setTimeout(r, 1100)) // the demo server asks for no more than about 1 request a second
  }
  if (!Object.keys(out).length) { console.error('detour-paths: nothing computed, file kept'); return false }
  writeFileSync(ROOT + 'src/data/detourpaths.json', JSON.stringify({ src: det.rerouteSrc, updated: new Date().toISOString().slice(0, 10), paths: out }) + '\n')
  return true
}
if (import.meta.url === new URL(process.argv[1], 'file://').href) await detourPaths()
