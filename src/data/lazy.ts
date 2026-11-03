// Data files that only one service needs. They are separate chunks, fetched when that service opens (the service worker keeps them for offline use).
import type { BusRoutes, Timetable } from '../lib/transit'
import type { BusBad } from '../lib/busbad'

export interface CercaniasTimes { updated: string; t: Record<string, Timetable> }

let routes: Promise<BusRoutes> | null = null
/** Bus lines: the route of each direction and its stops (see scripts/transit.mjs). Loaded once, when the Bus tab opens. */
export const loadBusRoutes = (): Promise<BusRoutes> => (routes ??= import('./busroutes.json').then(async m => {
  const r = m.default as unknown as BusRoutes
  const { closedBusStops } = await import('./index')
  const closed = closedBusStops()
  if (!closed.size) return r
  // closed stops leave every direction's stop list (the route line stays; the real detour path is not known)
  const lines = Object.fromEntries(Object.entries(r.lines).map(([k, l]) => [k, { ...l, d: l.d.map(d => ({ ...d, s: d.s.filter(c => !closed.has(String(c))) })) }]))
  return { ...r, lines }
}))

let times: Promise<CercaniasTimes> | null = null
/** Cercanías planned departures per station (see scripts/transit.mjs). Loaded once, when the Cercanías tab opens. */
export const loadCercaniasTimes = (): Promise<CercaniasTimes> => (times ??= import('./cercanias-times.json').then(m => m.default as unknown as CercaniasTimes))

let bad: Promise<BusBad> | null = null
/** Bus stops the city API never answers (see scripts/probe-bus.mjs). Loaded once, with the first bus request. */
export const loadBusBad = (): Promise<BusBad> => (bad ??= import('./busbad.json').then(m => m.default as unknown as BusBad))
