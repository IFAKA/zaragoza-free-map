// Approximate vehicle positions for the tram and Cercanías. There is NO real position data: the city's tram API gives minutes to a stop,
// and the Renfe live feed cannot be read from a browser. So a vehicle is placed on the track, upstream of the stop, at (minutes x average speed).
// Honest by design: the map marks these as "approx." and nothing is drawn without minutes.
import { dist } from './geo'
import { bearingAt } from './pathBearing'
import { alongPath, pointAt } from './transit'
import type { LatLon } from './types'

/** Tram average speed in km/h, stops included. The baked line is 12.8 km long; the commercial speed of line 1 is commonly quoted near 19 km/h, so 18 is a little careful. An estimate, not measured. */
export const TRAM_KMH = 18
/** Cercanías average speed in km/h, stops included. A typical commuter-train average with stops (the baked C1 line is 16.5 km); an estimate, not measured. */
export const TRAIN_KMH = 50
/** No marker for a train further away than this many minutes: it is not on the line yet, and a marker at the end would be a guess. */
export const TRAIN_MAX_MIN = 30

const mpd = (lat: number): [number, number] => [110540, 111320 * Math.cos(lat * Math.PI / 180)]
const near = (a: LatLon, b: LatLon) => dist(a, b) < 12 // metres: two track pieces that meet

/** Chains track pieces (end to end, in any order and any way round) into one ordered line. Pieces that do not touch the chain are dropped. Starts at the end with the lowest latitude. */
export function stitch(pieces: LatLon[][]): LatLon[] {
  const left = pieces.filter(p => p.length > 1).map(p => p.slice())
  if (!left.length) return []
  // start at the piece end that touches no other piece (an end of the line); the southern one if there are two
  const ends = left.flatMap((p, i) => [{ i, rev: false, pt: p[0] }, { i, rev: true, pt: p[p.length - 1] }])
  const free = ends.filter(e => !ends.some(o => o.i !== e.i && near(o.pt, e.pt))).sort((a, b) => a.pt[0] - b.pt[0])
  const start = free[0] ?? ends[0]
  let chain = start.rev ? left[start.i].reverse() : left[start.i]
  left.splice(start.i, 1)
  for (;;) {
    const tail = chain[chain.length - 1]
    const k = left.findIndex(p => near(p[0], tail) || near(p[p.length - 1], tail))
    if (k < 0) break
    const p = left.splice(k, 1)[0]
    chain = chain.concat(near(p[0], tail) ? p.slice(1) : p.reverse().slice(1))
  }
  return chain
}

/** The point `m` metres along `path` (clamped to its two ends). */
export function pointAtMetres(path: LatLon[], m: number): LatLon | null {
  const total = pathLength(path)
  if (!total) return null
  return pointAt(path, Math.max(0, Math.min(1, m / total)))?.pt ?? null
}
export function pathLength(path: LatLon[]): number {
  if (path.length < 2) return 0
  const [kn, ke] = mpd(path[0][0])
  let t = 0
  for (let i = 1; i < path.length; i++) t += Math.hypot((path[i][1] - path[i - 1][1]) * ke, (path[i][0] - path[i - 1][0]) * kn)
  return t
}

/**
 * Where vehicles that arrive at `stop` in `mins` minutes are now: that many minutes x `kmh` back along `path`, on the side they come from.
 * `forward` = the vehicles travel towards the end of `path` (so they come from its start side). Minutes of 0 (or less) give no point: the stop marker shows them.
 * A distance longer than the line is held at the line's end. `off` is how far the stop is from the track; a stop more than 60 m away gives nothing.
 */
export function upstream(path: LatLon[], stop: LatLon, forward: boolean, mins: number[], kmh: number): LatLon[] {
  if (path.length < 2) return []
  const here = alongPath(path, stop)
  if (here.off > 60) return []
  const total = pathLength(path)
  const out: LatLon[] = []
  for (const mn of mins) {
    if (!(mn > 0)) continue
    const d = mn * kmh * 1000 / 60
    const p = pointAtMetres(path, Math.max(0, Math.min(total, forward ? here.at - d : here.at + d)))
    if (p) out.push(p)
  }
  return out
}

/** The next two positive minutes, soonest first, from any lists of minutes. */
export const nextTwo = (mins: number[]): number[] => mins.filter(n => n > 0).sort((a, b) => a - b).slice(0, 2)

/** A vehicle marker for the map. `id` is stable, so a marker slides to its new place at the next refresh. */
export interface Vehicle {
  id: string; pos: LatLon; color: string; icon: 'tram' | 'train'
  /** Compass bearing the vehicle travels (degrees, 0 = north): towards its stop. */
  bearing: number
  /** True for the start of the direction, shown when no vehicle can be placed: a fixed place, not an estimate. */
  start?: boolean
  /** The track between the vehicle and the stop, so the dotted line follows the rails instead of cutting across. */
  via?: LatLon[]
  /** The stop they are heading for, and a key that changes with the stop or direction: the map frames both when the key changes and a vehicle is out of view. */
  stop: LatLon; fit: string
}

/** Compass bearing (degrees, 0 = north) of the straight line from `a` to `b`. */
export function bearingTo(a: LatLon, b: LatLon): number {
  const [kn, ke] = mpd(a[0])
  return (Math.atan2((b[1] - a[1]) * ke, (b[0] - a[0]) * kn) * 180 / Math.PI + 360) % 360
}

/** The part of `path` between the points nearest to `a` and `b` (vertices only), in the order a to b. */
export function between(path: LatLon[], a: LatLon, b: LatLon): LatLon[] {
  const nearest = (p: LatLon) => path.reduce((k, q, i) => (dist(p, q) < dist(p, path[k]) ? i : k), 0)
  const i = nearest(a), j = nearest(b)
  return i <= j ? path.slice(i, j + 1) : path.slice(j, i + 1).reverse()
}

/**
 * The way the vehicle runs through its stop: the direction of the part of `via` (vehicle to stop) that is nearest the stop.
 * The last point of `via` is only the vertex nearest the stop and can lie just past it, which turned both directions' arrows the same way.
 */
export function arrowBearing(via: LatLon[] | undefined, pos: LatLon, stop: LatLon): number {
  return via && via.length > 1 ? bearingAt([via], stop) ?? bearingTo(pos, stop) : bearingTo(pos, stop)
}
