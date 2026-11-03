// Data files that only one service needs. They are separate chunks, fetched when that service opens (the service worker keeps them for offline use).
import { cutClosed, decodePolyline, spliceDetour, type BusRoutes, type Timetable } from '../lib/transit'
import detours from './detours.json'
import detourpaths from './detourpaths.json'
import type { BusBad } from '../lib/busbad'

export interface CercaniasTimes { updated: string; t: Record<string, Timetable> }

/** The drawn route of one direction with its detour (detours.json "reroutes", paths in detourpaths.json) in place of the closed stretch; null when it has none. */
function reroute(r: BusRoutes, line: string, dir: number, p: string[]): string[] | null {
  const key = `${line}:${dir}`
  const spec = (detours.reroutes as Record<string, { from: string; to: string }>)[key]
  const path = (detourpaths.paths as Record<string, string>)[key]
  const a = spec && r.stops[spec.from], b = spec && r.stops[spec.to]
  return a && b && path ? spliceDetour(p, [a[1], a[2]], [b[1], b[2]], decodePolyline(path)) : null
}

let routes: Promise<BusRoutes> | null = null
/** Bus lines: the route of each direction and its stops (see scripts/transit.mjs). Loaded once, when the Bus tab opens. */
export const loadBusRoutes = (): Promise<BusRoutes> => (routes ??= import('./busroutes.json').then(async m => {
  const r = m.default as unknown as BusRoutes
  const { closedBusStops } = await import('./index')
  const closed = closedBusStops()
  if (!closed.size) return r
  // closed stops leave every direction's stop list (the route line stays; the real detour path is not known)
  const cut = (detours.lines as Record<string, unknown>)
  const way = detours.closedStops.way as [number, number][]
  // the drawing also loses the stretch along the closed street, for the lines that are detoured (its real detour path is not known)
  const lines = Object.fromEntries(Object.entries(r.lines).map(([k, l]) => [k, { ...l, d: l.d.map((d, i) => ({ ...d, s: d.s.filter(c => !closed.has(String(c))), p: reroute(r, k, i, d.p) ?? (k in cut ? cutClosed(d.p, way, detours.closedStops.radius) : d.p) })) }]))
  return { ...r, lines }
}))

let times: Promise<CercaniasTimes> | null = null
/** Cercanías planned departures per station (see scripts/transit.mjs). Loaded once, when the Cercanías tab opens. */
export const loadCercaniasTimes = (): Promise<CercaniasTimes> => (times ??= import('./cercanias-times.json').then(m => m.default as unknown as CercaniasTimes))

let bad: Promise<BusBad> | null = null
/** Bus stops the city API never answers (see scripts/probe-bus.mjs). Loaded once, with the first bus request. */
export const loadBusBad = (): Promise<BusBad> => (bad ??= import('./busbad.json').then(m => m.default as unknown as BusBad))
