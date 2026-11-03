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

export interface Snap<T> { src: string; updated: string | null; rows: T[] }
export type OsmSnap = { src: string; updated: string | null } & OsmRows
export interface TramSnap { src: string; updated: string | null; ends: [string, string]; line: string[]; rows: [string, string, number, number, string, string[]][] }
export interface CercaniasSnap { src: string; updated: string | null; valid: [string, string]; routes: string[]; dests: string[]; line: string[]; rows: [string, string, number, number][] }
export interface Data {
  fountains: Snap<FountainRow>; wifi: Snap<WifiRow>; libraries: Snap<EquipRow>; civic: Snap<EquipRow>
  bizi: Snap<BiziRow>; racks: Snap<RackRow>; bus: Snap<BusRow>; toiletsgo: Snap<TgoRow>; shelters: Snap<EquipRow>; osm: OsmSnap; tram: TramSnap; cercanias: CercaniasSnap
}
export const DATA: Data = {
  fountains, wifi, libraries, civic, bizi, racks, bus, toiletsgo, shelters, osm, tram, cercanias,
} as unknown as Data

/** Newest snapshot date across all files (shown as "Data refreshed" in the credits). */
export const dataRefreshed = (d: Data = DATA): string | null =>
  [d.fountains, d.wifi, d.libraries, d.civic, d.bizi, d.racks, d.bus, d.toiletsgo, d.shelters, d.osm, d.tram, d.cercanias].map(s => s.updated).filter((x): x is string => !!x).sort().pop() ?? null
