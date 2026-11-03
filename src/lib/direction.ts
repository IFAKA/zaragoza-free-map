// Two directions at a tram stop or a Cercanías station: which one to show first, and how the Cercanías trains split in two.
import { CENTER, dist } from './geo'
import { alongPath } from './transit'
import type { LatLon } from './types'

/** One direction: its id, and when its next vehicle comes (minutes from now, today). null = no vehicle left. */
export interface DirOpt { id: string; soon: number | null }

/** The person is outside the centre (more than 1.5 km from Plaza del Pilar); `at` is the person, or the stop when there is no position. */
export const outsideCentre = (at: LatLon, centre: LatLon = CENTER): boolean => dist(at, centre) > 1500

/** Of the directions' far ends, the id of the one that points most towards `centre` from `stop` (angle between the two bearings); null when none does. */
export function towardCentre(stop: LatLon, ends: { id: string; at: LatLon }[], centre: LatLon = CENTER): string | null {
  const k = Math.cos(stop[0] * Math.PI / 180)
  const v = (p: LatLon) => [(p[1] - stop[1]) * k, p[0] - stop[0]]
  const c = v(centre)
  let best: string | null = null, bs = 0
  for (const e of ends) {
    const w = v(e.at), n = Math.hypot(w[0], w[1]) * Math.hypot(c[0], c[1])
    const s = n ? (w[0] * c[0] + w[1] * c[1]) / n : 0
    if (s > bs) { bs = s; best = e.id }
  }
  return best
}

/**
 * The direction to show first:
 * 1. the one this person chose last time at this stop, if it still has a vehicle;
 * 2. else the one whose next vehicle comes soonest;
 * 3. on a tie, the one that heads to the centre (`centre`, given only when the person is outside it), else the first.
 * When no direction has a vehicle, the remembered one (or the first).
 */
export function chooseDir(opts: DirOpt[], remembered?: string | null, centre?: string | null): string {
  const live = opts.filter(o => o.soon !== null)
  if (!live.length) return opts.find(o => o.id === remembered)?.id ?? opts[0].id
  const mem = live.find(o => o.id === remembered)
  if (mem) return mem.id
  const best = Math.min(...live.map(o => o.soon!))
  const tied = live.filter(o => o.soon === best)
  return tied.find(o => o.id === centre)?.id ?? tied[0].id
}

/** The direction really shown: the chosen one, unless it has no vehicle and the other has. */
export const shownDir = (opts: DirOpt[], chosen: string): string =>
  opts.find(o => o.id === chosen)?.soon === null && opts.some(o => o.soon !== null) ? opts.find(o => o.soon !== null)!.id : chosen

// ---------- Cercanías: two groups of destinations ----------
export interface RailGroup { id: 'lo' | 'hi'; /** Destination indexes (as in the timetable) that go this way. */ dests: number[]; /** The destination furthest along this way: the name of the chip. */ far: number }

/**
 * Splits the destinations of a station in the two travel directions along the line: a train whose destination is earlier on the line than this
 * station runs 'lo', one whose destination is later runs 'hi'. "Earlier" is the distance along the baked line (which runs west to east).
 * Each group is named by its furthest destination (so trains to Delicias and to Miraflores from Utebo are one group, "towards Miraflores").
 * A group with no destination (a terminus has only one way) is left out.
 */
export function railGroups(path: LatLon[], here: LatLon, dests: { i: number; at: LatLon }[]): RailGroup[] {
  const me = alongPath(path, here).at
  const groups: Record<'lo' | 'hi', { i: number; d: number }[]> = { lo: [], hi: [] }
  for (const d of dests) {
    const delta = alongPath(path, d.at).at - me
    if (Math.abs(delta) < 150) continue // this very station
    groups[delta < 0 ? 'lo' : 'hi'].push({ i: d.i, d: Math.abs(delta) })
  }
  return (['lo', 'hi'] as const).filter(id => groups[id].length).map(id => ({ id, dests: groups[id].map(x => x.i), far: groups[id].reduce((a, b) => (b.d > a.d ? b : a)).i }))
}
