// Typed view of the bundled snapshots written by scripts/build-data.mjs. The app reads only these files.
import type { BiziRow, EquipRow, FountainRow, OsmRows, TgoRow, WifiRow } from '../lib/sources.ts'
import bizi from './bizi.json'
import civic from './civic.json'
import fountains from './fountains.json'
import libraries from './libraries.json'
import osm from './osm.json'
import toiletsgo from './toiletsgo.json'
import wifi from './wifi.json'

export interface Snap<T> { src: string; updated: string | null; rows: T[] }
export type OsmSnap = { src: string; updated: string | null } & OsmRows
export interface Data {
  fountains: Snap<FountainRow>; wifi: Snap<WifiRow>; libraries: Snap<EquipRow>; civic: Snap<EquipRow>
  bizi: Snap<BiziRow>; toiletsgo: Snap<TgoRow>; osm: OsmSnap
}
export const DATA: Data = {
  fountains, wifi, libraries, civic, bizi, toiletsgo, osm,
} as unknown as Data

/** Newest snapshot date across all files (shown as "Data refreshed" in the credits). */
export const dataRefreshed = (d: Data = DATA): string | null =>
  [d.fountains, d.wifi, d.libraries, d.civic, d.bizi, d.toiletsgo, d.osm].map(s => s.updated).filter((x): x is string => !!x).sort().pop() ?? null
