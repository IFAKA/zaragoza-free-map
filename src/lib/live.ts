import { dist } from './geo'
import type { LatLon } from './types'
import { tramKey } from './tramdir'
import { decodeBad } from './busbad'
import { loadBusBad } from '../data/lazy'
// Live arrival times for the nearest bus or tram stop. Read straight from the city's open API (CORS *, no key, updates about every 30 s).
// Any failure (offline, 404, timeout, odd data) gives null: the card then shows only the link-out, never an error.
export const LIVE_BASE = 'https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano/'
export const LIVE_REFRESH_MS = 30_000
export const LIVE_TIMEOUT_MS = 8_000

export interface Arrival { line: string; dest: string; mins: number[] }
/** `via` is set when the times come from a neighbour stop because the asked stop did not answer. */
export interface Live { arrivals: Arrival[]; notice: string | null; at: number; via?: { name: string; d: number; stop?: string; side?: 'before' | 'after' } }
export type Get = (url: string, signal?: AbortSignal) => Promise<unknown>

/** "VALDESPARTERA," -> "Valdespartera"; "PLAZA DEL PILAR" -> "Plaza del Pilar". */
export const prettyDest = (s: string): string =>
  s.replace(/[\s.,;:]+$/, '').trim().toLowerCase().replace(/(^|[\s\-(/])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/ (De|Del|La|Las|Los|El|Y|Al)(?= )/g, x => x.toLowerCase())

/** "3 minutos." -> 3, "Ahora"/"Llegando" -> 0, "Sin estimacion" or empty -> null. A number is taken as is. */
export function parseMins(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v) : null
  const s = String(v ?? '').trim().toLowerCase()
  const n = /^(\d+)\s*(min|m\b|minuto)/.exec(s)
  if (n) return +n[1]
  return /^(ahora|llegando|inminente|en la parada)/.test(s) ? 0 : null
}


/** Group rows by line + destination, soonest first, at most 2 times per row. */
function group(rows: { line: string; dest: string; mins: number | null }[]): Arrival[] {
  const out: Arrival[] = []
  for (const r of rows) {
    if (r.mins === null || !r.line) continue
    let a = out.find(x => x.line === r.line && x.dest === r.dest)
    if (!a) out.push(a = { line: r.line, dest: r.dest, mins: [] })
    a.mins.push(r.mins)
  }
  for (const a of out) a.mins = a.mins.sort((x, y) => x - y).slice(0, 2)
  return out.sort((a, b) => a.mins[0] - b.mins[0])
}

interface BusJson { destinos?: { linea?: string; destino?: string; primero?: string; segundo?: string }[] }
export function parseBus(j: unknown, now: number): Live | null {
  const ds = (j as BusJson | null)?.destinos
  if (!Array.isArray(ds)) return null
  const rows = ds.flatMap(d => [d.primero, d.segundo].map(v => ({ line: String(d.linea ?? '').trim(), dest: prettyDest(String(d.destino ?? '')), mins: parseMins(v) })))
  return { arrivals: group(rows), notice: null, at: now }
}

/** A message is a service notice when it talks about a strike, an incident or a service change; the phone and website boilerplate is ignored. */
export const NOTICE_RE = /huelga|servicio|incidencia|interrump|corte|obras|desv[ií]o|retraso|suspend/i
export const pickNotice = (msgs: unknown): string | null => {
  if (!Array.isArray(msgs)) return null
  const m = msgs.map(x => String(x ?? '').replace(/^[.\s]+/, '').trim()).find(x => x && !/www\.|tel[eé]fono|c[oó]digo qr|ocupaci[oó]n/i.test(x) && NOTICE_RE.test(x))
  if (!m) return null
  // the city writes notices in capitals: make it a normal sentence
  return m.replace(/\s+/g, ' ').toLowerCase().replace(/(^|[.!?]\s+|^\d\d\/\d\d\s+)(\p{L})/gu, (_a, pre: string, c: string) => pre + c.toUpperCase())
}

interface TramJson { destinos?: { linea?: string; destino?: string; minutos?: unknown }[]; mensajes?: unknown }
export function parseTram(js: unknown[], now: number): Live | null {
  const rows: { line: string; dest: string; mins: number | null }[] = []
  let notice: string | null = null, any = false
  for (const j of js) {
    const t = j as TramJson | null
    if (!t || !Array.isArray(t.destinos)) continue
    any = true
    for (const d of t.destinos) rows.push({ line: String(d.linea ?? '').trim(), dest: prettyDest(String(d.destino ?? '')), mins: parseMins(d.minutos) })
    notice ??= pickNotice(t.mensajes)
  }
  return any ? { arrivals: group(rows), notice, at: now } : null
}

// One shared request per URL for 3 s, so the card and the route view do not ask the city twice. Each caller can still abort on its own.
const recent = new Map<string, { at: number; p: Promise<unknown> }>()
const SHARE_MS = 3_000

function defaultGet(url: string, signal?: AbortSignal): Promise<unknown> {
  const t = Date.now()
  let hit = recent.get(url)
  if (!hit || t - hit.at >= SHARE_MS) {
    const p = fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(LIVE_TIMEOUT_MS) }).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    })
    hit = { at: t, p }
    recent.set(url, hit)
    p.catch(() => { if (recent.get(url) === hit) recent.delete(url) })
  }
  if (!signal) return hit.p
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((res, rej) => {
    signal.addEventListener('abort', () => rej(signal.reason), { once: true })
    hit!.p.then(res, rej)
  })
}

// Stops (and tram platforms) the city server answers with HTTP 400 "(500)Internal Server Error" (about 10%, a known city bug) are remembered for 10 minutes, so a refresh does not ask them again.
export const BAD_STOP_MS = 10 * 60_000
const badStops = new Map<string, number>()
export const markBad = (stop: string, at: number) => { badStops.set(stop, at) }
export const isBad = (stop: string, at: number) => { const t = badStops.get(stop); if (t === undefined) return false; if (at - t >= BAD_STOP_MS) { badStops.delete(stop); return false } return true }
export const clearBad = () => badStops.clear()

// Stops the build-time probe (scripts/probe-bus.mjs) found always failing: never asked at all. The list is a small lazy chunk, loaded on the first bus request.
// It is a snapshot: rerun `npm run data:busprobe` to refresh it. The runtime memory above still catches stops that start failing later.
let baked: ReadonlySet<string> = new Set()
export const setBakedBad = (s: ReadonlySet<string>) => { baked = s }
export const ensureBakedBad = (): Promise<void> => loadBusBad().then(b => { baked = decodeBad(b.bad) }, () => {})
/** True for a stop in the baked list, or one that failed lately (10 min memory). Costs no request. */
export const skipStop = (stop: string, at: number) => baked.has(stop) || isBad(stop, at)

/** Keeps only the arrivals of one line (the route view asks for "its" line). No line given: unchanged. */
export const onlyLine = (l: Live | null, line?: string): Live | null => (l && line ? { ...l, arrivals: l.arrivals.filter(a => a.line === line) } : l)

/** Same place name on both sides, ignoring case, accents and small words ("PLAZA ARAGON" and "Plaza de Aragón"); also true when one name holds the other. */
const sameEnd = (a: string, b: string): boolean => { const x = tramKey(a), y = tramKey(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)) }
/** The arrivals that go towards `to` (the end of the chosen direction), when the API's destination text clearly names it. If none matches, all are kept: the API's own destination is shown. */
export function towardEnd(arrivals: Arrival[], to?: string): Arrival[] {
  if (!to) return arrivals
  const hit = arrivals.filter(a => sameEnd(a.dest, to))
  return hit.length ? hit : arrivals
}

/** `side` is set for a stop of the same line route: 'before' = the bus passes it before the asked stop, 'after' = after it. */
export interface BusAlt { stop: string; name: string; d: number; side?: 'before' | 'after' }
const FALLBACK_REACH_M = 400, FALLBACK_TRIES = 2, ROUTE_TRIES = 3

/**
 * Other stops of the same line, in the chosen direction, to ask when the asked stop gives nothing (route view). `order` = the stops in route order, `idx` = the asked one.
 * Nearest along the route first, the stops before it ahead of those after it: before 1, before 2, after 1, before 3, after 2, after 3.
 */
export function routeAlternatives(order: { post: string; name: string; lat: number; lon: number }[], idx: number, origin: LatLon, reach = 3, skip: (stop: string) => boolean = st => baked.has(st)): BusAlt[] {
  if (idx < 0) return []
  const mk = (k: number, side: 'before' | 'after'): BusAlt[] => { const s = order[k]; return s && /^\d+$/.test(s.post) && k !== idx ? [{ stop: s.post, name: s.name, d: dist(origin, [s.lat, s.lon]), side }] : [] }
  // the order of tries (nearest along the route first, before the stop ahead of after), then known-bad stops are dropped and the budget is cut: it goes to stops that can answer
  const picks: [number, 'before' | 'after'][] = [[1, 'before'], [2, 'before'], [1, 'after'], [3, 'before'], [2, 'after'], [3, 'after'], [4, 'before'], [4, 'after'], [5, 'before'], [5, 'after']]
  const seen = new Set<string>()
  return picks.flatMap(([k, side]) => mk(side === 'before' ? idx - k : idx + k, side))
    .filter(a => !skip(a.stop) && !seen.has(a.stop) && !!seen.add(a.stop)).slice(0, reach * 2)
}

/** The closest city stops that share a line with this one (a neighbour on the same street), nearest first; `d` is the distance from `origin` (the person). */
export function busAlternatives(stop: string, lines: string, at: LatLon, origin: LatLon, rows: readonly (readonly [string, string, string, number, number])[], max = 4, skip: (stop: string) => boolean = st => baked.has(st)): BusAlt[] {
  const mine = new Set(lines.split(',').map(x => x.trim()).filter(x => x && x !== 'TRA'))
  if (!mine.size) return []
  return rows
    .filter(r => r[0] !== stop && /^\d+$/.test(r[0]) && !skip(r[0]) && r[2].split(',').some(l => mine.has(l.trim())))
    .map(r => ({ stop: r[0], name: r[1], d: dist(origin, [r[3], r[4]]), gap: dist(at, [r[3], r[4]]) }))
    .filter(r => r.gap <= FALLBACK_REACH_M)
    .sort((a, b) => a.gap - b.gap).slice(0, max)
    .map(({ stop: st, name, d }) => ({ stop: st, name, d }))
}

/**
 * Live times for a city bus stop number ("688"). Null on any failure. Rural stops (id "r4") have no live data.
 * When the stop fails or has no arrivals, up to 2 neighbours from `alts` (3 for route stops, see routeAlternatives) are asked one after the other (so at most 3 or 4 requests, and only 1 when the stop works).
 * A stop that failed is skipped for 10 minutes. If a neighbour answers with arrivals the result carries `via`.
 */
export async function loadBus(stop: string, signal?: AbortSignal, get: Get = defaultGet, now: () => number = Date.now, alts: BusAlt[] = [], line?: string): Promise<Live | null> {
  if (!/^\d+$/.test(stop)) return null
  await ensureBakedBad()
  const ask = async (id: string): Promise<Live | null> => {
    if (signal?.aborted || skipStop(id, now())) return null
    try { return onlyLine(parseBus(await get(`${LIVE_BASE}poste-autobus/tuzsa-${id}.json`, signal), now()), line) } catch (e) { if (/^HTTP [45]\d\d/.test(String((e as Error)?.message))) markBad(id, now()); return null } // only a server answer counts as bad, not offline or a timeout
  }
  const first = await ask(stop)
  if (first && first.arrivals.length) return first
  let n = 0
  const tries = alts.some(a => a.side) ? ROUTE_TRIES : FALLBACK_TRIES
  for (const a of alts) {
    if (n >= tries || signal?.aborted) break
    if (skipStop(a.stop, now())) continue
    n++
    const r = await ask(a.stop)
    if (r && r.arrivals.length) return { ...r, via: { name: a.name, d: a.d, stop: a.stop, ...(a.side ? { side: a.side } : {}) } }
  }
  return first
}

/** Live times for a tram stop (one request per platform, so both directions show). Null when none answered. */
export async function loadTram(ids: string[], signal?: AbortSignal, get: Get = defaultGet, now: () => number = Date.now): Promise<Live | null> {
  if (!ids.length) return null
  // a platform the city answers with HTTP 400 / 404 (no data) is not asked again for 10 minutes: it counts as "no data" and the console stays quiet
  const js = await Promise.all(ids.map(id => {
    const key = 'tram' + id
    if (isBad(key, now())) return null
    return get(`${LIVE_BASE}parada-tranvia/${id}.json`, signal).catch(e => { if (/^HTTP (400|404)\b/.test(String((e as Error)?.message))) markBad(key, now()); return null })
  }))
  return parseTram(js, now())
}
