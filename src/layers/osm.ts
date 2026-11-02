import { fetchJson, memo } from '../lib/cache'
import { BBOX, okCoord } from '../lib/geo'
import type { Item, LayerId } from '../lib/types'

const FOOD = new Set(['cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'ice_cream'])
const EPS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
/** One request for every OSM layer; elements are split by tag afterwards. */
export const OSM_QUERY = '[out:json][timeout:60];(' +
  `nwr["internet_access"="wlan"]["internet_access:fee"="no"]${BBOX};` +
  `nwr["amenity"="drinking_water"]${BBOX};` +
  `nwr["amenity"="toilets"]["fee"!="yes"]${BBOX};` +
  `nwr["amenity"="device_charging_station"]${BBOX};` +
  ');out center tags;'

export interface OsmElement { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }
export type OsmSplit = Record<'wifi' | 'water' | 'toilets' | 'charge', Item[]>

export function splitOsm(elements: OsmElement[] | undefined): OsmSplit {
  const out: OsmSplit = { wifi: [], water: [], toilets: [], charge: [] }
  for (const el of elements || []) {
    if (!el || !['node', 'way', 'relation'].includes(el.type) || !Number.isFinite(el.id)) continue
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon
    if (lat == null || lon == null || !okCoord(lat, lon)) continue
    const g = el.tags || {}
    const base = (type: string, extra: Partial<Item> = {}): Item => ({
      id: 'o' + el.type[0] + el.id, part: 'osm', type, name: g.name || '', lat, lon,
      hours: g.opening_hours || '', osm: el.type + '/' + el.id, ...extra,
    })
    if (g.internet_access === 'wlan' && g['internet_access:fee'] === 'no') {
      const k = g.amenity || g.tourism || g.shop || g.leisure || g.office || 'place'
      out.wifi.push(base(k, { cat: FOOD.has(g.amenity) ? 'food' : 'other', ssid: g['internet_access:ssid'] || '' }))
    }
    if (g.amenity === 'drinking_water' && g.access !== 'private' && g.drinking_water !== 'no') out.water.push(base('fountain', { hours: '' }))
    if (g.amenity === 'toilets' && g.fee !== 'yes' && g.access !== 'private') out.toilets.push(base('toilet', { cust: g.access === 'customers' }))
    if (g.amenity === 'device_charging_station') out.charge.push(base('charger'))
  }
  return out
}

export const osmAll = memo(async (): Promise<OsmSplit> => {
  for (const ep of EPS) {
    try {
      const j = await fetchJson<{ elements?: OsmElement[] }>(ep + '?data=' + encodeURIComponent(OSM_QUERY), 40000)
      if (!j || !Array.isArray(j.elements)) throw new Error('bad response')
      return splitOsm(j.elements)
    } catch { /* try next endpoint */ }
  }
  throw new Error('overpass unavailable')
})
export const osmPart = (id: Exclude<LayerId, 'libraries' | 'bizi'>) => async () => (await osmAll())[id]
