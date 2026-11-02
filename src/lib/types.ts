export type LayerId = 'water' | 'toilets' | 'charge' | 'wifi' | 'libraries' | 'bizi'
export type PartKey = 'city' | 'osm' | 'tgo'
export type LatLon = [number, number]

export interface Item {
  id: string
  part: PartKey
  type: string
  name: string
  lat: number
  lon: number
  cat?: string
  addr?: string
  phone?: string
  hours?: string
  osm?: string
  ssid?: string
  yr?: number
  building?: boolean
  cust?: boolean
  bikes?: number | null
  docks?: number | null
  est?: string
}
/** Item plus per-render fields (distance in metres, open state). */
export interface RankedItem extends Item {
  d: number
  open: boolean | null
}
export type PartState = 'load' | 'ok' | 'fail'
export interface PartData {
  items: Item[]
  state: PartState
  live: boolean
  ts?: number
}
export interface Bilingual { en: string; es: string }
export interface PartConfig {
  k: PartKey
  load: () => Promise<Item[]>
  snap?: () => Item[]
}
export interface LayerConfig {
  id: LayerId
  icon: string
  color: string
  label: Bilingual
  hint: Bilingual
  hours: boolean
  more?: boolean
  cats?: string[]
  nearKey?: 'nearest' | 'nearestBikes'
  usable?: (it: Item) => boolean
  parts: PartConfig[]
}
