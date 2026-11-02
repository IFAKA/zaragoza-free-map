// Pure helpers for the transit layers (bus routes, tram, Cercanías). Used by scripts/transit.mjs (build) and by the app (decode, next trains).
import type { LatLon } from './types'

// ---------- line geometry: Google polyline (1e5 = 1.1 m), simplified at build time ----------
const enc = (v: number) => {
  let n = v < 0 ? ~(v << 1) : v << 1, s = ''
  while (n >= 0x20) { s += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5 }
  return s + String.fromCharCode(n + 63)
}
export function encodePolyline(pts: LatLon[]): string {
  let la = 0, lo = 0, out = ''
  for (const p of pts) {
    const a = Math.round(p[0] * 1e5), o = Math.round(p[1] * 1e5)
    out += enc(a - la) + enc(o - lo); la = a; lo = o
  }
  return out
}
export function decodePolyline(s: string): LatLon[] {
  const out: LatLon[] = []
  let i = 0, la = 0, lo = 0
  const next = () => {
    let sh = 0, r = 0, b: number
    do { b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5 } while (b >= 0x20)
    return r & 1 ? ~(r >> 1) : r >> 1
  }
  while (i < s.length) { la += next(); lo += next(); out.push([la / 1e5, lo / 1e5]) }
  return out
}

/** Metres per degree at a latitude, as [north-south, east-west]. */
const mpd = (lat: number): [number, number] => [110540, 111320 * Math.cos(lat * Math.PI / 180)]

/** Douglas-Peucker: drops points that lie within `tol` metres of the line between their neighbours (collinear points go first). */
export function simplify(pts: LatLon[], tol: number): LatLon[] {
  if (pts.length < 3) return pts
  const [kn, ke] = mpd(pts[0][0])
  const xy = pts.map(p => [p[1] * ke, p[0] * kn] as const)
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let worst = -1, wd = 0
    const [ax, ay] = xy[a], [bx, by] = xy[b], dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
      if (d > wd) { wd = d; worst = i }
    }
    if (worst > 0 && wd > tol) { keep[worst] = 1; stack.push([a, worst], [worst, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

/** Distance in metres along `path` of the point on it that is nearest to `p`, and how far `p` is from the path. */
export function alongPath(path: LatLon[], p: LatLon): { at: number; off: number } {
  const [kn, ke] = mpd(p[0])
  const X = (q: LatLon) => [q[1] * ke, q[0] * kn] as const
  const [px, py] = X(p)
  let run = 0, best = { at: 0, off: Infinity }
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = X(path[i - 1]), [bx, by] = X(path[i])
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), len2 = len * len
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
    const off = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    if (off < best.off) best = { at: run + t * len, off }
    run += len
  }
  return best
}
/** Stops in the order a bus meets them along its route. */
export function orderAlong<T extends { lat: number; lon: number }>(path: LatLon[], stops: T[]): T[] {
  return stops.map(s => ({ s, a: alongPath(path, [s.lat, s.lon]).at })).sort((x, y) => x.a - y.a).map(x => x.s)
}
/** A point at fraction `f` (0..1) of the length of `path`, and the compass bearing of the line there (degrees, 0 = north). */
export function pointAt(path: LatLon[], f: number): { pt: LatLon; bearing: number } | null {
  if (path.length < 2) return null
  const [kn, ke] = mpd(path[0][0])
  const segs: number[] = []
  let total = 0
  for (let i = 1; i < path.length; i++) { const l = Math.hypot((path[i][1] - path[i - 1][1]) * ke, (path[i][0] - path[i - 1][0]) * kn); segs.push(l); total += l }
  let want = f * total
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const t = segs[i] ? Math.min(1, want / segs[i]) : 0, a = path[i], b = path[i + 1]
      const pt: LatLon = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      const bearing = (Math.atan2((b[1] - a[1]) * ke, (b[0] - a[0]) * kn) * 180 / Math.PI + 360) % 360
      return { pt, bearing }
    }
    want -= segs[i]
  }
  return null
}

// ---------- bus routes (src/data/busroutes.json, loaded when the Bus tab opens) ----------
export interface BusDirection {
  /** Where this direction goes ("Oliver"), taken from the city's route name; unset when the route has no two ends (circular and night lines). */
  to?: string
  /** The line drawn on the map: one encoded polyline per piece. */
  p: string[]
  /** The stops in the order the bus meets them (city post numbers, see `stops`). */
  s: number[]
}
export interface BusLine { n: string; d: BusDirection[] }
export interface BusRoutes { src: string; updated: string | null; stops: Record<string, [string, number, number]>; lines: Record<string, BusLine> }

/** Index of the stop in an ordered list of post numbers: the exact post, else the nearest stop within 80 m, else -1. */
export function stopIndex(order: number[], stops: BusRoutes['stops'], post: string | undefined, at: LatLon): number {
  const i = post ? order.indexOf(+post) : -1
  if (i >= 0) return i
  const [kn, ke] = mpd(at[0])
  let best = -1, bd = 80
  order.forEach((c, k) => { const s = stops[c]; if (!s) return; const d = Math.hypot((s[2] - at[1]) * ke, (s[1] - at[0]) * kn); if (d < bd) { bd = d; best = k } })
  return best
}

/** Split a line's chips: the lines to show on at most `rows` rows of `perRow`, and how many are left for a "+N" chip. */
export function chipSplit(lines: string[], max: number): { shown: string[]; more: number } {
  return lines.length <= max ? { shown: lines, more: 0 } : { shown: lines.slice(0, max - 1), more: lines.length - (max - 1) }
}

// ---------- Cercanías: the baked timetable (src/data/cercanias.json) ----------
export type DayType = 'wd' | 'fri' | 'sat' | 'sun'
/** 0 = Monday ... 6 = Sunday. Monday to Thursday share one plan, Friday has its own (a few more trains), then Saturday and Sunday. */
export const dayType = (day: number): DayType => (day <= 3 ? 'wd' : day === 4 ? 'fri' : day === 5 ? 'sat' : 'sun')
/** Per day type: [minute of the day, destination index, ...] sorted by minute. A minute of 1440 or more is after midnight, on the same service day. */
export type Timetable = Record<DayType, number[]>
export interface Departure {
  /** Minutes from now. */
  inMin: number
  /** Clock time, HH:MM. */
  at: string
  dest: number
  /** The first train of the next day (no more trains today). */
  tomorrow: boolean
}
const hhmm = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0') }

/**
 * The next `n` trains from a baked timetable. `now.day` is 0 = Monday, `now.min` minutes since midnight (Madrid).
 * Looks at today's plan, at yesterday's trains that run after midnight (24:10 is 00:10 the next morning), and, when today has fewer than `n` left, at tomorrow's plan.
 */
export function nextDepartures(tt: Timetable, now: { day: number; min: number }, n = 3): Departure[] {
  const out: Departure[] = []
  const push = (list: number[], shift: number, tomorrow: boolean) => {
    for (let i = 0; i < list.length; i += 2) {
      const abs = list[i] + shift // minutes counted from midnight today
      if (abs >= now.min && abs < now.min + 1440) out.push({ inMin: abs - now.min, at: hhmm(abs), dest: list[i + 1], tomorrow })
    }
  }
  const late: number[] = [] // yesterday's trains that run after midnight
  const yesterday = tt[dayType((now.day + 6) % 7)]
  for (let i = 0; i < yesterday.length; i += 2) if (yesterday[i] >= 1440) late.push(yesterday[i], yesterday[i + 1])
  push(late, -1440, false)
  push(tt[dayType(now.day)], 0, false)
  const today = out.length
  if (today < n) push(tt[dayType((now.day + 1) % 7)], 1440, true)
  return out.sort((a, b) => a.inMin - b.inMin).slice(0, n)
}
