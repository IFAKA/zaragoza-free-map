// Pure readers for the raw upstream formats. Used by scripts/build-data.mjs (at data-refresh time only) and by tests.
// The running app never calls these: it imports the JSON they produced (src/data/*.json).
// Relative imports carry the .ts extension because Node runs this file directly.
import { htmlLines, parseCityHorario, type CitySched } from './cityHours.ts'
import { BBOX, okCoord } from './geo.ts'
import { utm30ToLatLon } from './utm.ts'

const inCity = (la: number, lo: number) => la > 41.5 && la < 41.8 && lo > -1.1 && lo < -0.7

// ---------- City open data (zaragoza.es/sede) ----------
interface CityRecord {
  id: number | string; internal_id?: string; title?: string; calle?: string; tel?: string | { tel?: string }; lastUpdated?: string; horario?: string
  geometry?: { coordinates?: [number, number] }
}
export interface CityResponse { result?: CityRecord[] }
const yearOf = (s?: string) => { const m = /^(\d{4})-/.exec(s || ''); return m ? +m[1] : 0 }

/** Raw `horario` text of city equipment records, by record id (fetched from equipamiento/{id}.json by the build script). */
export type EquipHours = Record<string, { title?: string; horario?: string } | undefined>
/**
 * Hours of one city equipment record. Same reader as libraries and civic centres, so anything it does not fully understand stays unknown (null).
 * Senior centres write one sentence ("De 10 a 21 h.", every day), read the way the climate-shelter list is read.
 */
export function equipSched(rec: { title?: string; horario?: string } | undefined): CitySched | null {
  if (!rec?.horario) return null
  const direct = parseCityHorario(rec.horario)
  if (direct) return direct
  // a side note in brackets about one room ("(La sala de estudio permanecerá cerrada de 14 a 15h)"), read the way the shelter list is read; a note about booking or limits keeps the hours unknown
  const bare = rec.horario.replace(/\([^)]*\)/g, m => (/cita|previa|solo|excepto|salvo|unicamente/i.test(m.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) ? m : ' '))
  if (bare !== rec.horario) { const s = parseCityHorario(bare); if (s) return s }
  return /^centro de convivencia para mayores/i.test(rec.title || '') ? parseCityHorario(shelterHours(rec.horario)) : null
}
/** [id, title, lat, lon, parsed hours (only when the linked city record publishes readable hours)].
 *  Each WiFi point is a city building: `internal_id` is the id of its record in the equipment catalogue, which holds the building's opening hours. */
export type WifiRow = [number | string, string, number, number, CitySched?]
export function cityWifiRows(j: CityResponse | undefined, hours: EquipHours = {}): WifiRow[] {
  const out: WifiRow[] = []
  for (const r of j?.result || []) {
    const c = r.geometry?.coordinates
    if (!c || !okCoord(c[1], c[0]) || !inCity(c[1], c[0])) continue
    const row: WifiRow = [r.id, r.title || '', +c[1].toFixed(6), +c[0].toFixed(6)]
    const s = r.internal_id ? equipSched(hours[r.internal_id]) : null
    if (s) row[4] = s
    out.push(row)
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
/** Post offices (city GeoJSON, CRS84): same row shape as city equipment. The city's hours are mostly a link to Correos, which the reader leaves unknown (0). */
export function postRows(j: ShelterCollection | undefined): EquipRow[] {
  return cityEquipRows({ result: (j?.features || []).map(f => {
    const p = f.properties || {}
    return { id: p.id as number, title: String(p.title ?? '').replace(/^Oficina de Correos\s+/i, 'Correos '), calle: p.streetAddress as string, tel: p.telephone as string, lastUpdated: p.lastUpdated as string, horario: String(p.openingHours ?? ''), geometry: f.geometry }
  }) })
}
/**
 * Climate shelters (city GeoJSON, CRS84): same row shape as city equipment, so the same hours reader applies.
 * The city's HTML has a few broken entities ("S&aacute,bado": comma instead of semicolon); they are repaired before reading.
 * Free-text hours that the reader does not fully understand stay "unknown" (0): never guessed.
 */
export interface ShelterCollection { features?: { properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }[] }
export function shelterRows(j: ShelterCollection | undefined): EquipRow[] {
  const fix = (h: unknown) => String(h ?? '').replace(/&([a-z]+),/gi, '&$1;').replace(/&nbsp;?,?/g, ' ')
  return cityEquipRows({ result: (j?.features || []).map(f => {
    const p = f.properties || {}
    return { id: p.id as number, title: p.title as string, calle: p.streetAddress as string, tel: p.telephone as string, lastUpdated: p.lastUpdated as string, horario: shelterHours(fix(p.openingHours)), geometry: f.geometry }
  }) })
}
/**
 * Senior-centre hours are one free sentence ("Todos los días del año, de 10 a 21 h. Cerrado fines de semana de julio y agosto").
 * Try the library/civic reader first. If it gives up, split the sentence into an hours part and a closure part and feed those back to it.
 * Anything still not understood returns "" (hours unknown).
 */
export function shelterHours(raw: string): string {
  const html = raw.replace(/\([^)]*\)/g, ' ') // side notes such as "(solo abierta Cafetería)" or a study-room break
  if (parseCityHorario(html)) return html
  const flat = htmlLines(html).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
  const [open, ...rest] = flat.split(/\bcerrado\b/i)
  const closed = rest.join(' ').toLowerCase()
  let h = open.replace(/[\s.,;:]+$/, '').replace(/^\s*(?:todos los dias(?: del)?(?: ano)?|de lunes a domingos?)\s*[,:]?\s*/i, 'lunes a domingo ').trim()
  if (/^de\s+\d/i.test(h)) h = 'lunes a domingo ' + h
  const lines = [h]
  if (/julio y agosto/.test(closed)) lines.push('Fines de semana de julio y agosto.')
  const out = '<ul>' + lines.map(l => `<li>${l}</li>`).join('') + '</ul>'
  return parseCityHorario(out) ? out : ''
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

/** AparcaBicis (street racks for your own bike): [id, street, lat, lon, kind]. kind: o = open, c = closed, g = guarded. Capacity is dropped. */
export type RackRow = [string, string, number, number, 'o' | 'c' | 'g']
export function rackRows(j: (CityResponse & { result?: (CityRecord & { tipo?: string })[] }) | undefined): RackRow[] {
  const out: RackRow[] = [], seen = new Set<string>()
  for (const r of j?.result || []) {
    if (seen.has(String(r.id))) continue // the city feed repeats a few ids
    seen.add(String(r.id))
    const c = r.geometry?.coordinates
    if (!c || !okCoord(c[1], c[0]) || !inCity(c[1], c[0])) continue
    const t = String(r.tipo || '').toLowerCase()
    out.push([String(r.id), String(r.title || '').replace(/\s+/g, ' ').trim(), +c[1].toFixed(6), +c[0].toFixed(6), t.startsWith('cerr') ? 'c' : t.startsWith('vigil') ? 'g' : 'o'])
  }
  return out
}

/**
 * Bus stops: [stop id, name, lines, lat, lon]. Lines is a comma list like "58" or "34,N1".
 * City stops (TUZSA, id "tuzsa-688") keep the plain number "688"; it names the third-party live times page (busUrl in ui/labels.ts).
 * Rural stops (id "rural-4", lines 1xx/2xx/5xx) have no live page and keep "r4". Their numbers repeat the city ones, so the prefix matters.
 * The city title is "(688) P. Reyes De Aragón N.º 24 Líneas: 58": the number and the lines are taken out of it.
 */
export type BusRow = [string, string, string, number, number]
export function busRows(j: CityResponse | undefined): BusRow[] {
  const out: BusRow[] = [], seen = new Set<string>()
  for (const r of j?.result || []) {
    const c = r.geometry?.coordinates
    if (!c || !okCoord(c[1], c[0]) || !inCity(c[1], c[0])) continue
    const raw = String(r.title || '').replace(/\s+/g, ' ').trim()
    const num = /^(?:tuzsa|rural)-(\d+)$/.exec(String(r.id))
    if (!num) continue
    const id = (String(r.id).startsWith('rural') ? 'r' : '') + num[1]
    if (seen.has(id)) continue
    seen.add(id)
    const m = /^(?:\(\d+\)\s*)?(.*?)\s*(?:Líneas?:\s*(.*))?$/i.exec(raw)
    const lines = (m?.[2] ?? '').split(/[,\s]+/).filter(Boolean).join(',')
    out.push([id, (m?.[1] ?? raw).trim(), lines, +c[1].toFixed(6), +c[0].toFixed(6)])
  }
  return out
}

/**
 * Pharmacies ON DUTY today (city `farmacia` endpoint: only the pharmacies with a `guardia` today).
 * This list changes every day, so the app loads it live (see lib/duty.ts); this reader runs in the browser.
 * [id, name, address, phone, lat, lon, duty date YYYY-MM-DD, duty hours text, sector]. Records without a duty are dropped.
 */
export type DutyRow = [number | string, string, string, string, number, number, string, string, string]
export interface DutyRecord extends CityRecord { telefonos?: string; guardia?: { fecha?: string; turno?: string; horario?: string; sector?: string } }
export function dutyRows(j: { result?: DutyRecord[] } | undefined): DutyRow[] {
  const out: DutyRow[] = []
  const clean = (s?: string) => String(s ?? '').replace(/\s+/g, ' ').trim()
  for (const r of j?.result || []) {
    const c = r.geometry?.coordinates, g = r.guardia
    const date = /^(\d{4}-\d{2}-\d{2})/.exec(g?.fecha || '')?.[1]
    if (!g || !date || !c || !okCoord(c[1], c[0]) || !inCity(c[1], c[0])) continue
    out.push([r.id, clean(r.title), clean(r.calle), clean(r.telefonos), +c[1].toFixed(6), +c[0].toFixed(6), date, clean(g.horario), clean(g.sector)])
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
/** [id, name, address, phone, lat, lon, parsed hours]. Every id is a record of the city equipment catalogue; the hours are that record's, when readable. */
export type TgoRow = [number, string, string, string, number, number, CitySched?]
/** Parse the RAW array in toiletsgo's src/data.ts: {id, name, address, tel, utm:[E,N]}. Rows outside Zaragoza are dropped. */
export function parseTgo(text: string, hours: EquipHours = {}): TgoRow[] {
  const re = /\{\s*id:\s*(\d+)\s*,\s*name:\s*'((?:[^'\\]|\\.)*)'\s*,\s*address:\s*'((?:[^'\\]|\\.)*)'\s*,\s*tel:\s*(null|'[^']*')\s*,\s*utm:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/g
  const un = (s: string) => s.replace(/\\(.)/g, '$1')
  const rows: TgoRow[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const [lat, lon] = utm30ToLatLon(+m[5], +m[6])
    if (!inCity(lat, lon)) continue
    const row: TgoRow = [+m[1], un(m[2]), un(m[3]), m[4] === 'null' ? '' : m[4].slice(1, -1), +lat.toFixed(6), +lon.toFixed(6)]
    const s = equipSched(hours[m[1]])
    if (s) row[6] = s
    rows.push(row)
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
  `nwr["amenity"="post_box"]${BBOX};` +
  `nwr["amenity"="library"]["operator"~"Universidad de Zaragoza|Unizar",i]${BBOX};` +
  `nwr["amenity"="library"]["name"~"Universidad de Zaragoza|Unizar|Universitaria",i]${BBOX};` +
  ');out center tags;'
export interface OsmElement { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }
/** [osm ref like "node/12", name, lat, lon, type, opening_hours, extra]. extra: wifi = ssid, toilets = "c" when customers only, mailbox = collection times (when the post is taken, not opening hours). */
export type OsmRow = [string, string, number, number, string, string, string]
export interface OsmRows { wifi: OsmRow[]; water: OsmRow[]; toilets: OsmRow[]; charge: OsmRow[]; post: OsmRow[]; buz: OsmRow[] }
export const emptyOsm = (): OsmRows => ({ wifi: [], water: [], toilets: [], charge: [], post: [], buz: [] })

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
    if (g.amenity === 'post_box' && g.access !== 'private') out.post.push(row('postbox', g.opening_hours || '', g.collection_times || ''))
    if (g.amenity === 'library' && /universidad de zaragoza|unizar|universitaria/i.test((g.operator || '') + ' ' + (g.name || ''))) out.buz.push(row('library'))
  }
  return out
}
export const isFood = (type: string) => FOOD.has(type)
