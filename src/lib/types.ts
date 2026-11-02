import type { CitySched } from './cityHours'

export type LayerId = 'water' | 'toilets' | 'charge' | 'wifi' | 'libraries' | 'bizi' | 'racks' | 'shelter' | 'bus' | 'pharmacy'
/** Where a record comes from: the city's open data, OpenStreetMap, or the toiletsgo community list. */
export type PartKey = 'city' | 'osm' | 'tgo'
export type LatLon = [number, number]
export type IconKey = 'drop' | 'toilet' | 'charge' | 'wifi' | 'library' | 'bike' | 'lock' | 'shelter' | 'bus' | 'pharmacy'

export interface Item {
  id: string
  part: PartKey
  type: string
  name: string
  lat: number
  lon: number
  /** Snapshot date of the file this record came from (YYYY-MM-DD). */
  upd?: string
  cat?: string
  addr?: string
  phone?: string
  /** OSM-style opening hours (OpenStreetMap records). */
  hours?: string
  /** City library / civic centre posted hours, parsed (see lib/cityHours.ts). */
  sched?: CitySched
  osm?: string
  ssid?: string
  /** Year the city last updated this record (0 = not recorded). */
  yr?: number
  building?: boolean
  cust?: boolean
  /** Short extra line (e.g. district for city fountains). */
  note?: string
  /** University of Zaragoza library (has a live occupancy page). */
  buz?: boolean
  /** Always available (e.g. an outdoor charger with no opening hours): never hidden by "Open now". */
  always?: boolean
  /** Bus stop: comma list of lines ("58" or "34,N1"). */
  lines?: string
  /** Bus stop: number of the city stop (has a live times page). Rural stops have none. */
  stop?: string
  /** Pharmacy on duty: today's duty hours (free text from the city) and sector (area of the city). */
  duty?: string
  sector?: string
  /** Also a climate shelter in the city's list (a civic centre that is public and climate-controlled). */
  shelter?: boolean
}
/** Item plus per-render fields (distance in metres, open state). */
export interface RankedItem extends Item {
  d: number
  /** true = open now, false = closed now, null = unknown (or not applicable). */
  open: boolean | null
}
export interface Bilingual { en: string; es: string }
export interface LayerConfig {
  id: LayerId
  icon: IconKey
  /** CSS custom property of the marker colour, e.g. 'var(--color-water)'. */
  color: string
  label: Bilingual
  /** Short name for the tab bar (about 6 characters). */
  short: Bilingual
  hint: Bilingual
  /** Items have opening hours, so the "Open now" switch applies. */
  hours: boolean
  /** Height in px of the peek sheet when the nearest-place card needs more room than the default (extra lines, a hint). */
  peek?: number
  /** Items come from a live request (not the bundled data): the app loads them when the tab is opened and may have none. */
  live?: boolean
  cats?: string[]
  /** All items of this layer, built once from the bundled data. */
  items: Item[]
}
