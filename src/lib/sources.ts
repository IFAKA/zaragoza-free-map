// Pure readers for the raw upstream formats. Used by scripts/build-data.mjs (at data-refresh time only) and by tests.
// The running app never calls these: it imports the JSON they produced (src/data/*.json).
// Relative imports carry the .ts extension because Node runs this file directly.
import { parseCityHorario, type CitySched } from './cityHours.ts'
import { BBOX, okCoord } from './geo.ts'
import { utm30ToLatLon } from './utm.ts'

const inCity = (la: number, lo: number) => la > 41.5 && la < 41.8 && lo > -1.1 && lo < -0.7

// ---------- City open data (zaragoza.es/sede) ----------
interface CityRecord {
  id: number | string; title?: string; calle?: string; tel?: string | { tel?: string }; lastUpdated?: string; horario?: string
  geometry?: { coordinates?: [number, number] }
}
export interface CityResponse { result?: CityRecord[] }
const yearOf = (s?: string) => { const m = /^(\d{4})-/.exec(s || ''); return m ? +m[1] : 0 }

/** [id, title, lat, lon] */
export type WifiRow = [number | string, string, number, number]
export function cityWifiRows(j: CityResponse | undefined): WifiRow[] {
  const out: WifiRow[] = []
  for (const r of j?.result || []) {
    const c = r.geometry?.coordinates
    if (c && okCoord(c[1], c[0]) && inCity(c[1], c[0])) out.push([r.id, r.title || '', +c[1].toFixed(6), +c[0].toFixed(6)])
  }
  return out
}
/** [id, title, address, phone, lat, lon, year of last update, parsed hours or 0] */
export type EquipRow = [number | string, string, string, string, number, number, number, CitySched | 0]
export function cityEquipRows(j: CityResponse | undefined): EquipRow[] {
  const out: EquipRow[] = []
  for (const r of j?.result || []) {
    const c = r.geometry?.coordinates
    if (!c || !okCoord(c[1], c[0]) || !inCity(c[1], c[0])) continue
    const tel = r.tel && typeof r.tel === 'object' ? r.tel.tel : r.tel
    out.push([r.id, String(r.title || '').trim(), String(r.calle || '').replace(/\s+/g, ' ').trim(), tel ? String(tel) : '',
      +c[1].toFixed(6), +c[0].toFixed(6), yearOf(r.lastUpdated), parseCityHorario(r.horario) || 0])
  }
  return out
}
/** Bizi stations: location only. Live bikes and docks are dropped on purpose (the app makes no runtime calls). [id, title, lat, lon] */
export type BiziRow = [string, string, number, number]
export function biziRows(j: CityResponse | undefined): BiziRow[] {
  const out: BiziRow[] = []
  for (const r of j?.result || []) {
    const c = r.geometry?.coordinates
    if (c && okCoord(c[1], c[0]) && inCity(c[1], c[0])) out.push([String(r.id), String(r.title || '').trim(), +c[1].toFixed(6), +c[0].toFixed(6)])
  }
  return out
}

// ---------- City fountains (Zenodo 8141704, EPSG:25830) ----------
/** [lat, lon, street, district, year of last update (0 = not recorded)] */
export type FountainRow = [number, number, string, string, number]
const BROKEN = /anulad|arranc|sin agua|no funciona|sin grifo|falta/i
const SMALL = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'a', 'e'])
const title = (s: string) => s.toLowerCase().split(/\s+/).map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/[a-záéíóúüñ]/, c => c.toUpperCase()))).join(' ')
export function fountainStreet(v: string | null | undefined): string {
  if (!v) return ''
  return title(v.replace(/\(\d+\)/g, '').replace(/\s+/g, ' ').trim().replace(/^(\S+)\s+\1\b/i, '$1'))
}
interface Feature { properties: Record<string, string | null>; geometry: { coordinates: [number, number] } }
export function fountainRows(src: { data?: { features?: Feature[] } }): { rows: FountainRow[]; dropped: number } {
  const rows: FountainRow[] = []
  let dropped = 0
  for (const f of src.data?.features || []) {
    const p = f.properties
    if (BROKEN.test(p.OBSERVAC || '')) { dropped++; continue }
    const [lat, lon] = utm30ToLatLon(f.geometry.coordinates[0], f.geometry.coordinates[1])
    if (!inCity(lat, lon)) { dropped++; continue }
    const yr = /(\d{4})/.exec(String(p.FECHAACT || '').split(' ')[0])?.[1]
    rows.push([+lat.toFixed(6), +lon.toFixed(6), fountainStreet(p.VIAL), p.DISTRITO || '', yr ? +yr : 0])
  }
  return { rows, dropped }
}

// ---------- toiletsgo ----------
/** [id, name, address, phone, lat, lon] */
export type TgoRow = [number, string, string, string, number, number]
/** Parse the RAW array in toiletsgo's src/data.ts: {id, name, address, tel, utm:[E,N]}. Rows outside Zaragoza are dropped. */
export function parseTgo(text: string): TgoRow[] {
  const re = /\{\s*id:\s*(\d+)\s*,\s*name:\s*'((?:[^'\\]|\\.)*)'\s*,\s*address:\s*'((?:[^'\\]|\\.)*)'\s*,\s*tel:\s*(null|'[^']*')\s*,\s*utm:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/g
  const un = (s: string) => s.replace(/\\(.)/g, '$1')
  const rows: TgoRow[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const [lat, lon] = utm30ToLatLon(+m[5], +m[6])
    if (!inCity(lat, lon)) continue
    rows.push([+m[1], un(m[2]), un(m[3]), m[4] === 'null' ? '' : m[4].slice(1, -1), +lat.toFixed(6), +lon.toFixed(6)])
  }
  return rows
}

// ---------- OpenStreetMap (Overpass) ----------
const FOOD = new Set(['cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'ice_cream'])
export const OSM_QUERY = '[out:json][timeout:90];(' +
  `nwr["internet_access"="wlan"]["internet_access:fee"="no"]${BBOX};` +
  `nwr["amenity"="drinking_water"]${BBOX};` +
  `nwr["amenity"="toilets"]["fee"!="yes"]${BBOX};` +
  `nwr["amenity"="device_charging_station"]${BBOX};` +
  `nwr["amenity"="library"]["operator"~"Universidad de Zaragoza|Unizar",i]${BBOX};` +
  `nwr["amenity"="library"]["name"~"Universidad de Zaragoza|Unizar|Universitaria",i]${BBOX};` +
  ');out center tags;'
export interface OsmElement { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }
/** [osm ref like "node/12", name, lat, lon, type, opening_hours, extra]. extra: wifi = ssid, toilets = "c" when customers only. */
export type OsmRow = [string, string, number, number, string, string, string]
export interface OsmRows { wifi: OsmRow[]; water: OsmRow[]; toilets: OsmRow[]; charge: OsmRow[]; buz: OsmRow[] }
export const emptyOsm = (): OsmRows => ({ wifi: [], water: [], toilets: [], charge: [], buz: [] })

export function splitOsm(elements: OsmElement[] | undefined): OsmRows {
  const out = emptyOsm()
  for (const el of elements || []) {
    if (!el || !['node', 'way', 'relation'].includes(el.type) || !Number.isFinite(el.id)) continue
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon
    if (lat == null || lon == null || !okCoord(lat, lon)) continue
    const g = el.tags || {}
    const row = (type: string, hours = '', extra = ''): OsmRow => [el.type + '/' + el.id, g.name || '', +lat.toFixed(6), +lon.toFixed(6), type, hours, extra]
    if (g.internet_access === 'wlan' && g['internet_access:fee'] === 'no') {
      out.wifi.push(row(g.amenity || g.tourism || g.shop || g.leisure || g.office || 'place', g.opening_hours || '', g['internet_access:ssid'] || ''))
    }
    if (g.amenity === 'drinking_water' && g.access !== 'private' && g.drinking_water !== 'no') out.water.push(row('fountain'))
    if (g.amenity === 'toilets' && g.fee !== 'yes' && g.access !== 'private') out.toilets.push(row('toilet', g.opening_hours || '', g.access === 'customers' ? 'c' : ''))
    if (g.amenity === 'device_charging_station') out.charge.push(row('charger', g.opening_hours || ''))
    if (g.amenity === 'library' && /universidad de zaragoza|unizar|universitaria/i.test((g.operator || '') + ' ' + (g.name || ''))) out.buz.push(row('library'))
  }
  return out
}
export const isFood = (type: string) => FOOD.has(type)
