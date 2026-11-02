import { fetchJson, memo } from '../lib/cache'
import { cleanName, okCoord } from '../lib/geo'
import type { Item } from '../lib/types'

const ZGZ = 'https://www.zaragoza.es/sede/servicio/'
interface CityRecord {
  id: number | string; title?: string; calle?: string; tel?: string | { tel?: string }; lastUpdated?: string
  geometry?: { coordinates?: [number, number] }
  bicisDisponibles?: number; anclajesDisponibles?: number; estado?: string
}
export interface CityResponse { result?: CityRecord[] }

const catalog = (q: string) => `${ZGZ}equipamiento/catalog.json?q=${encodeURIComponent(q)}&rows=500&srsname=wgs84`
export const cityWifiRaw = memo(() => fetchJson<CityResponse>(`${ZGZ}punto-wifi.json?rows=500&srsname=wgs84`, 20000))
export const cityLibRaw = memo(() => fetchJson<CityResponse>(catalog('title==Biblioteca*'), 20000))
export const cityCivicRaw = memo(() => fetchJson<CityResponse>(catalog('title==Centro Cívico*'), 20000))
export const biziRaw = memo(() => fetchJson<CityResponse>(`${ZGZ}urbanismo-infraestructuras/estacion-bicicleta.json?rows=500&srsname=wgs84`, 20000))
export const resetCity = () => [cityWifiRaw, cityLibRaw, cityCivicRaw, biziRaw].forEach(m => m.reset())

const yearOf = (s?: string) => { const m = /^(\d{4})-/.exec(s || ''); return m ? +m[1] : 0 }

export type WifiRow = [number | string, string, number, number]
export function cityWifiRows(j: CityResponse): WifiRow[] {
  const out: WifiRow[] = []
  for (const r of j.result || []) {
    const c = r.geometry?.coordinates
    if (c) out.push([r.id, r.title || '', c[1], c[0]])
  }
  return out
}
/** Municipal WiFi points: one item per distinct coordinate. */
export function cityWifiItems(rows: WifiRow[]): Item[] {
  const g = new Map<string, Item>()
  for (const [id, title, lat, lon] of rows) {
    if (!okCoord(lat, lon)) continue
    const k = lat.toFixed(5) + ',' + lon.toFixed(5)
    if (!g.has(k)) g.set(k, { id: 'm' + id, part: 'city', type: 'muni', cat: 'muni', name: cleanName(title), lat, lon, building: true })
  }
  return [...g.values()]
}
/** equipamiento catalog (libraries, civic centres) -> items. */
export function cityEquipItems(j: CityResponse | undefined, type: 'lib' | 'civic'): Item[] {
  const out: Item[] = []
  for (const r of j?.result || []) {
    const c = r.geometry?.coordinates
    if (!c || !okCoord(c[1], c[0])) continue
    const tel = r.tel && typeof r.tel === 'object' ? r.tel.tel : r.tel
    out.push({
      id: 'c' + r.id, part: 'city', type, name: String(r.title || '').trim(),
      addr: String(r.calle || '').replace(/\s+/g, ' ').trim(), phone: tel ? String(tel) : '',
      lat: c[1], lon: c[0], yr: yearOf(r.lastUpdated), building: true,
    })
  }
  return out
}
export function biziItems(j: CityResponse | undefined): Item[] {
  const out: Item[] = []
  for (const r of j?.result || []) {
    const c = r.geometry?.coordinates
    if (!c || !okCoord(c[1], c[0])) continue
    out.push({
      id: 'b' + r.id, part: 'city', type: 'bizi', name: String(r.title || '').trim(), lat: c[1], lon: c[0],
      bikes: Number.isFinite(r.bicisDisponibles) ? (r.bicisDisponibles as number) : null,
      docks: Number.isFinite(r.anclajesDisponibles) ? (r.anclajesDisponibles as number) : null,
      est: r.estado || '',
    })
  }
  return out
}
