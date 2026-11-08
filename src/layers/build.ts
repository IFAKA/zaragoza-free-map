import type { Data, Heavy } from '../data'
import { cleanName, dist } from '../lib/geo'
import type { DutyRow, EquipRow, OsmRow } from '../lib/sources.ts'
import type { Item, LayerConfig, LayerId } from '../lib/types'
import { isFood } from '../lib/sources.ts'
import { seasonOf, type Season } from '../lib/season'

const BUZ_NAME = /universidad de zaragoza|unizar|universitaria|univesitaria|facultad/i
const NOT_BUZ = /colectivo/i
const near = (a: { lat: number; lon: number }, b: { lat: number; lon: number }, m: number) =>
  Math.abs(a.lat - b.lat) < m / 111000 && Math.abs(a.lon - b.lon) < m / 80000 && dist([a.lat, a.lon], [b.lat, b.lon]) < m

/** Keep the first of any group of items closer than `m` metres (earlier items win). */
export function dedupe(items: Item[], m: number): Item[] {
  const out: Item[] = []
  for (const it of items) if (!out.some(o => near(o, it, m))) out.push(it)
  return out
}
/** Drop items of `list` that are within `m` metres of any item in `base`. */
const without = (list: Item[], base: Item[], m: number) => list.filter(it => !base.some(b => near(b, it, m)))

const osmItems = (rows: OsmRow[], upd: string | undefined, f: (r: OsmRow) => Partial<Item> & Pick<Item, 'type'>): Item[] =>
  rows.map(r => ({ id: 'o' + r[0].replace('/', ''), part: 'osm' as const, name: r[1], lat: r[2], lon: r[3], osm: r[0], upd, ...f(r) }))

const equip = (rows: EquipRow[], type: 'lib' | 'civic', upd?: string): Item[] =>
  rows.map(r => ({
    id: 'c' + r[0], part: 'city' as const, type, name: r[1], addr: r[2], phone: r[3], lat: r[4], lon: r[5], yr: r[6],
    building: true, upd, ...(r[7] ? { sched: r[7] } : {}),
  }))

const SHELTER_NAME = {
  warm: { label: { en: 'Warm indoors', es: 'Refugios climáticos' }, short: { en: 'Warm', es: 'Calor' } },
  cool: { label: { en: 'Cool indoors', es: 'Refugios climáticos' }, short: { en: 'Cool', es: 'Fresco' } },
  neutral: { label: { en: 'Warm or cool indoors', es: 'Refugios climáticos' }, short: { en: 'Indoors', es: 'Refugio' } },
} as const
/** Name of the shelter layer for a season (from the device date). */
export const shelterName = (s: Season) => SHELTER_NAME[s]

// shelters share buildings with other shelters (a civic centre and a senior centre can be next door): never merged
export function buildLayers(d: Data, now: Date = new Date()): Record<LayerId, LayerConfig> {
  const o = d.osm, ou = o.updated ?? undefined
  const lib = equip(d.libraries.rows, 'lib', d.libraries.updated ?? undefined)
  const civic = equip(d.civic.rows, 'civic', d.civic.updated ?? undefined)
  // Shelters that are already civic centres: one marker (the civic one), tagged. The shelter layer lists all of the city's shelters.
  const shelterIds = new Set(d.shelters.rows.map(r => 'c' + r[0]))
  for (const it of civic) if (shelterIds.has(it.id)) it.shelter = true
  const shelters = equip(d.shelters.rows, 'civic', d.shelters.updated ?? undefined).map(it => ({ ...it, type: /^centro de convivencia/i.test(it.name) ? 'senior' : /^centro c/i.test(it.name) ? 'civic' : 'office', shelter: true }))
  const buzOsm = o.buz.map(r => ({ lat: r[2], lon: r[3] }))
  for (const it of lib) it.buz = !NOT_BUZ.test(it.name) && (BUZ_NAME.test(it.name) || buzOsm.some(b => near(b, it, 100)))

  // the id is the place (lat,lon at ~1 m), not the row number, so a saved fountain stays the same one when the city file is refreshed
  const fountains: Item[] = d.fountains.rows.map(r => ({
    id: 'f' + r[0].toFixed(5) + '_' + r[1].toFixed(5), part: 'city' as const, type: 'fountain', name: r[2], note: r[3], lat: r[0], lon: r[1], yr: r[4], upd: d.fountains.updated ?? undefined,
  }))
  const waterOsm = without(osmItems(o.water, ou, () => ({ type: 'fountain' })), fountains, 25)

  const wifiCity: Item[] = d.wifi.rows.map(r => ({
    id: 'm' + r[0], part: 'city' as const, type: 'muni', cat: 'muni', name: cleanName(r[1]), lat: r[2], lon: r[3], building: true, upd: d.wifi.updated ?? undefined, ...(r[4] ? { sched: r[4] } : {}),
  }))
  const wifiOsm = osmItems(o.wifi, ou, r => ({ type: r[4], cat: isFood(r[4]) ? 'food' : 'other', hours: r[5], ssid: r[6] }))

  const toilets = [
    ...d.toiletsgo.rows.map(r => ({ id: 't' + r[0], part: 'tgo' as const, type: tgoType(r[1]), name: r[1], addr: r[2], phone: r[3], lat: r[4], lon: r[5], upd: d.toiletsgo.updated ?? undefined, ...(r[6] ? { sched: r[6] } : {}) })),
    ...osmItems(o.toilets, ou, r => ({ type: 'toilet', hours: r[5], cust: r[6] === 'c' })),
  ]
  const chargers = osmItems(o.charge, ou, r => ({ type: 'charger', hours: r[5], always: !r[5] }))

  const L = (id: LayerId, c: Omit<LayerConfig, 'id' | 'items'>, items: Item[], m = 15): LayerConfig => ({ id, ...c, items: dedupe(items, m) })
  return {
    water: L('water', { icon: 'drop', color: 'var(--color-water)', label: { en: 'Water', es: 'Agua' }, short: { en: 'Water', es: 'Agua' }, hint: { en: 'Drinking fountains', es: 'Fuentes de agua' }, hours: false }, [...fountains, ...waterOsm]),
    toilets: L('toilets', { icon: 'toilet', color: 'var(--color-toilet)', label: { en: 'Toilets', es: 'Aseos' }, short: { en: 'Toilets', es: 'Aseos' }, hint: { en: 'Public toilets', es: 'Aseos públicos' }, hours: true }, toilets),
    // two buildings can share a street, but never a doorstep: city libraries / centres are never merged with each other
    charge: L('charge', { icon: 'charge', color: 'var(--color-charge)', label: { en: 'Charge', es: 'Cargar' }, short: { en: 'Charge', es: 'Cargar' }, hint: { en: 'Charge your phone', es: 'Cargar el móvil' }, hours: true }, [...lib, ...civic, ...chargers], 8),
    wifi: L('wifi', { icon: 'wifi', color: 'var(--color-wifi)', label: { en: 'WiFi', es: 'WiFi' }, short: { en: 'WiFi', es: 'WiFi' }, hint: { en: 'WiFi hotspots', es: 'Puntos WiFi' }, hours: true, cats: ['muni', 'food', 'other'] }, [...wifiCity, ...without(wifiOsm, wifiCity, 30)]),
    libraries: L('libraries', { icon: 'library', color: 'var(--color-library)', label: { en: 'Libraries', es: 'Bibliotecas' }, short: { en: 'Libraries', es: 'Bibliotecas' }, hint: { en: 'Quiet places to sit and read', es: 'Sitios tranquilos para leer' }, hours: true }, lib, 8),
    // Bizi tab: stations (cat 'station', live counts joined at runtime) and the street bike racks (cat 'mine'). Racks are never merged into stations.
    bizi: {
      id: 'bizi', icon: 'bike', color: 'var(--color-bike)', label: { en: 'Bizi bikes', es: 'Bizi' }, short: { en: 'Bizi', es: 'Bizi' }, hint: { en: 'Take or return a bike', es: 'Coger o dejar una bici' }, hours: false, cats: ['take', 'return', 'mine'], catDefault: 'take',
      items: [
        ...dedupe(d.bizi.rows.map(r => ({ id: 'b' + r[0], part: 'city' as const, type: 'bizi', cat: 'station', name: r[1], lat: r[2], lon: r[3], upd: d.bizi.updated ?? undefined })), 8),
      ],
    },
    shelter: L('shelter', { icon: 'shelter', color: 'var(--color-shelter)', ...shelterName(seasonOf(now)), hint: { en: 'Public buildings with climate control', es: 'Edificios públicos con clima' }, hours: true }, shelters, 0),
    bus: L('bus', { icon: 'bus', color: 'var(--color-bus)', label: { en: 'Bus stops', es: 'Paradas de bus' }, short: { en: 'Bus', es: 'Bus' }, hint: { en: 'Next buses at your stop', es: 'Próximos buses en tu parada' }, hours: false },
      [], 0), // filled by heavyItems when the bus file has loaded
    tram: L('tram', { icon: 'tram', color: 'var(--color-tram)', label: { en: 'Tram stops', es: 'Paradas de tranvía' }, short: { en: 'Tram', es: 'Tranvía' }, hint: { en: 'Line T1, both directions', es: 'Línea T1, en los dos sentidos' }, hours: false },
      d.tram.rows.map(r => ({ id: 't' + r[0], part: 'city' as const, type: 'tram', name: r[1], lat: r[2], lon: r[3], upd: d.tram.updated ?? undefined, tramIds: r[5] })), 0),
    cercanias: L('cercanias', { icon: 'train', color: 'var(--color-train)', label: { en: 'Cercanías stations', es: 'Estaciones de Cercanías' }, short: { en: 'Cercanías', es: 'Cercanías' }, hint: { en: 'Planned trains from your station', es: 'Trenes previstos en tu estación' }, hours: false },
      d.cercanias.rows.map(r => ({ id: 'z' + r[0], part: 'city' as const, type: 'train', name: r[1], code: r[0], lat: r[2], lon: r[3], upd: d.cercanias.updated ?? undefined })), 0),
    // live layer: its items come from lib/duty.ts when the tab is opened (see dutyItems), so it starts empty
    pharmacy: { id: 'pharmacy', icon: 'pharmacy', color: 'var(--color-pharmacy)', label: { en: 'Pharmacies on duty', es: 'Farmacias de guardia' }, short: { en: 'Pharmacy', es: 'Farmacia' }, hint: { en: 'Open today, day and night', es: 'Abiertas hoy, de día y de noche' }, hours: false, live: true, items: [] },
  }
}

/** Items of the two late-loading files: the bus stops and the street bike racks (never merged into Bizi stations). */
export const heavyItems = (h: Heavy): { bus: Item[]; racks: Item[] } => ({
  bus: dedupe(h.bus.rows.map(r => ({ id: 'u' + r[0], part: 'city' as const, type: 'bus', name: r[1], lines: r[2], stop: /^\d+$/.test(r[0]) ? r[0] : undefined, lat: r[3], lon: r[4], upd: h.bus.updated ?? undefined })), 0),
  racks: dedupe(h.racks.rows.map(r => ({ id: 'r' + r[0], part: 'city' as const, type: r[4] === 'c' ? 'rack_closed' : r[4] === 'g' ? 'rack_guarded' : 'rack', cat: 'mine', name: cleanName(r[1]), lat: r[2], lon: r[3], upd: h.racks.updated ?? undefined })), 10),
})

/** Items of the live pharmacy layer, from today's duty rows (lib/duty.ts). */
export const dutyItems = (rows: DutyRow[]): Item[] =>
  rows.map(r => ({ id: 'p' + r[0], part: 'city' as const, type: 'pharmacy', name: r[1], addr: r[2], phone: r[3], lat: r[4], lon: r[5], upd: r[6], duty: r[7], sector: r[8] }))

export function tgoType(n: string): string {
  if (/^(bar|caf)/i.test(n)) return 'bar'
  if (/^biblioteca/i.test(n)) return 'lib'
  if (/^centro c/i.test(n)) return 'civic'
  if (/^zona joven/i.test(n)) return 'youth'
  if (/ayuntamiento/i.test(n)) return 'townhall'
  return 'place'
}
