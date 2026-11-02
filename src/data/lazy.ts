// Data files that only one service needs. They are separate chunks, fetched when that service opens (the service worker keeps them for offline use).
import type { BusRoutes, Timetable } from '../lib/transit'

export interface CercaniasTimes { updated: string; t: Record<string, Timetable> }

let routes: Promise<BusRoutes> | null = null
/** Bus lines: the route of each direction and its stops (see scripts/transit.mjs). Loaded once, when the Bus tab opens. */
export const loadBusRoutes = (): Promise<BusRoutes> => (routes ??= import('./busroutes.json').then(m => m.default as unknown as BusRoutes))

let times: Promise<CercaniasTimes> | null = null
/** Cercanías planned departures per station (see scripts/transit.mjs). Loaded once, when the Cercanías tab opens. */
export const loadCercaniasTimes = (): Promise<CercaniasTimes> => (times ??= import('./cercanias-times.json').then(m => m.default as unknown as CercaniasTimes))
