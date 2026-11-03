// Asks the city live-times API for every city bus stop and writes src/data/busbad.json: the stops that always fail (HTTP 400/500/404).
// The app skips those stops without a request. Run alone: `npm run data:busprobe` (about 6 min); build-data.mjs runs it too.
// A stop is bad only when 3 tries in a row (1.5 s apart) fail with a server error. Offline or timeouts are "unknown": the old verdict is kept.
// Only HTTP errors count. A 200 with no `destinos` (night hours) is fine.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodeBad, encodeBad, probeStop } from '../src/lib/busbad.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASE = 'https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano/poste-autobus/tuzsa-'
const WORKERS = 6, DELAY_MS = 80, TIMEOUT_MS = 10_000

export async function probeBus({ out = ROOT + 'src/data', log = ROOT + 'logs/probe-bus.log' } = {}) {
  const t0 = Date.now()
  const stops = JSON.parse(readFileSync(out + '/bus.json', 'utf8')).rows.map(r => r[0]).filter(id => /^\d+$/.test(id))
  const old = existsSync(out + '/busbad.json') ? decodeBad(JSON.parse(readFileSync(out + '/busbad.json', 'utf8')).bad) : new Set()
  const fetchFn = async u => { const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) }); await r.arrayBuffer(); return r }
  const res = new Map()
  const pool = async ids => { let next = 0; await Promise.all(Array.from({ length: WORKERS }, async () => {
    while (next < ids.length) {
      const id = ids[next++]
      res.set(id, await probeStop(BASE + id + '.json', fetchFn))
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  })) }
  await pool(stops)
  await pool(stops.filter(id => res.get(id) === 'unknown')) // timeouts get one more round
  const count = { ok: 0, bad: 0, gone: 0, unknown: 0 }
  const bad = []
  for (const id of stops) {
    const p = res.get(id); count[p]++
    if (p === 'bad' || p === 'gone' || (p === 'unknown' && old.has(id))) bad.push(+id)
  }
  const date = new Date().toISOString().slice(0, 10)
  if (count.unknown > stops.length * 0.2) { // mostly offline: do not overwrite a good file with a guess
    const msg = `probe-bus: ${count.unknown}/${stops.length} unknown (offline?), file not written`
    console.error(msg); process.exitCode = 1; return { count, written: false }
  }
  writeFileSync(out + '/busbad.json', '{"src":"city","updated":"' + date + '","total":' + stops.length + ',"bad":' + JSON.stringify(encodeBad(bad)) + '}\n')
  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  const line = `probe-bus ${date}: total ${stops.length}, ok ${count.ok}, bad ${count.bad}, 404 ${count.gone}, unknown ${count.unknown} (old verdict kept), listed ${bad.length}, ${secs}s`
  mkdirSync(log.replace(/\/[^/]*$/, ''), { recursive: true }); appendFileSync(log, line + '\n' + bad.length + ' listed: ' + bad.join(',') + '\n')
  console.log(line)
  return { count, written: true }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await probeBus()
