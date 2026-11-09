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

/** The key of a line in the routes file for a name from the live API: the city writes circulars "CI4" there and "Ci4" in its route data. */
export const lineKey = (r: BusRoutes | null | undefined, name: string): string | undefined => (r?.lines[name] ? name : r ? Object.keys(r.lines).find(k => k.toLowerCase() === name.toLowerCase()) : undefined)

/** Index of the stop in an ordered list of post numbers: the exact post, else the nearest stop within `tol` metres (80), else -1. */
export function stopIndex(order: number[], stops: BusRoutes['stops'], post: string | undefined, at: LatLon, tol = 80): number {
  const i = post ? order.indexOf(+post) : -1
  if (i >= 0) return i
  const [kn, ke] = mpd(at[0])
  let best = -1, bd = tol
  order.forEach((c, k) => { const s = stops[c]; if (!s) return; const d = Math.hypot((s[2] - at[1]) * ke, (s[1] - at[0]) * kn); if (d < bd) { bd = d; best = k } })
  return best
}

/**
 * The direction of a line to show first for a stop, and the stop's place in it. A stop is usually on one side of the street, so only one direction has it;
 * when both do (a terminus, a loop), the one with more stops still to come wins, as the more useful ride. The stop's own post beats a merely near stop.
 */
export function pickDirection(line: BusLine, stops: BusRoutes['stops'], post: string | undefined, at: LatLon): { dir: number; idx: number } {
  let best = { dir: 0, idx: -1 }, bestScore = -1
  line.d.forEach((d, dir) => {
    const idx = stopIndex(d.s, stops, post, at)
    // the stop's own post counts above a merely near stop; then more stops to come
    const score = idx < 0 ? -1 : (post && d.s[idx] === +post ? 1000 : 0) + d.s.length - 1 - idx
    if (score > bestScore) { bestScore = score; best = { dir, idx } }
  })
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
 * `accept` keeps only some destinations (one direction). Looks at today's plan, at yesterday's trains that run after midnight (24:10 is 00:10 the next morning), and, when today has fewer than `n` left, at tomorrow's plan.
 */
export function nextDepartures(tt: Timetable, now: { day: number; min: number }, n = 3, accept?: (dest: number) => boolean): Departure[] {
  const out: Departure[] = []
  const push = (list: number[], shift: number, tomorrow: boolean) => {
    for (let i = 0; i < list.length; i += 2) {
      const abs = list[i] + shift // minutes counted from midnight today
      if (abs >= now.min && abs < now.min + 1440 && (!accept || accept(list[i + 1]))) out.push({ inMin: abs - now.min, at: hhmm(abs), dest: list[i + 1], tomorrow })
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

/**
 * A route piece (encoded polyline) with the parts that run along a closed street cut out: the road is shut, so the old drawing would be wrong.
 * Returns the remaining pieces (a cut splits one piece in two); the gap is the detour, whose real path is not known.
 */
export function cutClosed(pieces: string[], way: LatLon[], radius: number): string[] {
  const out: string[] = []
  for (const enc of pieces) {
    const pts = decodePolyline(enc)
    let cur: LatLon[] = []
    const flush = () => { if (cur.length > 1) out.push(encodePolyline(cur)); cur = [] }
    const closed = (q: LatLon) => alongPath(way, q).off < radius
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) { // test along each segment too, a long straight segment can run inside the closed street with both ends outside it
        const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot((b[0] - a[0]) * 111_000, (b[1] - a[1]) * 83_000) / 15)
        let cutMid = false
        for (let k = 1; k < n; k++) if (closed([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n])) { cutMid = true; break }
        if (cutMid) { flush(); if (!closed(b)) cur.push(b); continue }
      }
      if (closed(pts[i])) flush(); else cur.push(pts[i])
    }
    flush()
  }
  return out
}

/** Joins route pieces that share an end (the city stores a route as unordered pieces) into chains of points. */
function chains(pieces: string[]): LatLon[][] {
  const left = pieces.map(decodePolyline).filter(p => p.length > 1)
  const near = (a: LatLon, b: LatLon) => Math.hypot((a[0] - b[0]) * 111_000, (a[1] - b[1]) * 83_000) < 20
  const out: LatLon[][] = []
  while (left.length) {
    let c = left.shift()!
    for (let grew = true; grew;) {
      grew = false
      for (let i = 0; i < left.length; i++) {
        const p = left[i], end = c[c.length - 1], st = c[0]
        const next = near(end, p[0]) ? [...c, ...p.slice(1)] : near(end, p[p.length - 1]) ? [...c, ...[...p].reverse().slice(1)]
          : near(st, p[p.length - 1]) ? [...p, ...c.slice(1)] : near(st, p[0]) ? [...[...p].reverse(), ...c.slice(1)] : null
        if (next) { c = next; left.splice(i, 1); grew = true; break }
      }
    }
    out.push(c)
  }
  return out
}

/**
 * Replaces the stretch of a route between the stops `from` and `to` with `detour` (the road a closed street is bypassed by).
 * Returns the pieces with the chain that holds both stops mended into one continuous line, or null when no piece chain holds both
 * (then the route is left alone). The direction of the chain is kept.
 */
export function spliceDetour(pieces: string[], from: LatLon, to: LatLon, detour: LatLon[]): string[] | null {
  if (detour.length < 2) return null
  const all = chains(pieces)
  const k = all.findIndex(c => alongPath(c, from).off < 60 && alongPath(c, to).off < 60)
  if (k < 0) return null
  let pts = all[k]
  const flip = alongPath(pts, from).at > alongPath(pts, to).at
  if (flip) pts = [...pts].reverse()
  const cum = [0]
  for (let i = 1; i < pts.length; i++) { const [kn, ke] = mpd(pts[i][0]); cum.push(cum[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) * kn, (pts[i][1] - pts[i - 1][1]) * ke)) }
  const a = alongPath(pts, from).at, b = alongPath(pts, to).at
  let out = [...pts.filter((_, i) => cum[i] < a), ...detour, ...pts.filter((_, i) => cum[i] > b)]
  if (flip) out = out.reverse()
  return [...all.filter((_, i) => i !== k).map(encodePolyline), encodePolyline(out)]
}
