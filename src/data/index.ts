// Typed view of the bundled snapshots written by scripts/build-data.mjs. The app reads only these files.
import type { BiziRow, BusRow, EquipRow, FountainRow, OsmRows, RackRow, TgoRow, WifiRow } from '../lib/sources.ts'
import bizi from './bizi.json'
import bus from './bus.json'
import cercanias from './cercanias.json'
import civic from './civic.json'
import fountains from './fountains.json'
import libraries from './libraries.json'
import osm from './osm.json'
import racks from './racks.json'
import shelters from './shelters.json'
import tram from './tram.json'
import toiletsgo from './toiletsgo.json'
import wifi from './wifi.json'
import detours from './detours.json'

export interface Snap<T> { src: string; updated: string | null; rows: T[] }
export type OsmSnap = { src: string; updated: string | null } & OsmRows
export interface TramSnap { src: string; updated: string | null; ends: [string, string]; line: string[]; rows: [string, string, number, number, string, string[]][] }
export interface CercaniasSnap { src: string; updated: string | null; valid: [string, string]; routes: string[]; dests: string[]; line: string[]; rows: [string, string, number, number][] }
export interface Data {
  fountains: Snap<FountainRow>; wifi: Snap<WifiRow>; libraries: Snap<EquipRow>; civic: Snap<EquipRow>
  bizi: Snap<BiziRow>; racks: Snap<RackRow>; bus: Snap<BusRow>; toiletsgo: Snap<TgoRow>; shelters: Snap<EquipRow>; osm: OsmSnap; tram: TramSnap; cercanias: CercaniasSnap
}
/** Bus stops that cannot be used now (road closed by works, see detours.json). They are left out of the map, the nearest-stop pick and the route view until the end date. */
export const closedBusStops = (now = new Date().toISOString().slice(0, 10)): Set<string> =>
  new Set(detours.closedStops.until >= now ? detours.closedStops.ids : [])
const closed = closedBusStops()
const busOpen = { ...bus, rows: (bus.rows as unknown as BusRow[]).filter(r => !closed.has(String(r[0]))) }
export const DATA: Data = {
  fountains, wifi, libraries, civic, bizi, racks, bus: busOpen, toiletsgo, shelters, osm, tram, cercanias,
} as unknown as Data

/** Newest snapshot date across all files (shown as "Data refreshed" in the credits). */
export const dataRefreshed = (d: Data = DATA): string | null =>
  [d.fountains, d.wifi, d.libraries, d.civic, d.bizi, d.racks, d.bus, d.toiletsgo, d.shelters, d.osm, d.tram, d.cercanias].map(s => s.updated).filter((x): x is string => !!x).sort().pop() ?? null
