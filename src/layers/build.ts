import type { Data } from '../data'
import { cleanName, dist } from '../lib/geo'
import type { EquipRow, OsmRow } from '../lib/sources.ts'
import type { Item, LayerConfig, LayerId } from '../lib/types'
import { isFood } from '../lib/sources.ts'

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

export function buildLayers(d: Data): Record<LayerId, LayerConfig> {
  const o = d.osm, ou = o.updated ?? undefined
  const lib = equip(d.libraries.rows, 'lib', d.libraries.updated ?? undefined)
  const civic = equip(d.civic.rows, 'civic', d.civic.updated ?? undefined)
  const buzOsm = o.buz.map(r => ({ lat: r[2], lon: r[3] }))
  for (const it of lib) it.buz = !NOT_BUZ.test(it.name) && (BUZ_NAME.test(it.name) || buzOsm.some(b => near(b, it, 100)))

  const fountains: Item[] = d.fountains.rows.map((r, i) => ({
    id: 'f' + i, part: 'city' as const, type: 'fountain', name: r[2], note: r[3], lat: r[0], lon: r[1], yr: r[4], upd: d.fountains.updated ?? undefined,
  }))
  const waterOsm = without(osmItems(o.water, ou, () => ({ type: 'fountain' })), fountains, 25)

  const wifiCity: Item[] = d.wifi.rows.map(r => ({
    id: 'm' + r[0], part: 'city' as const, type: 'muni', cat: 'muni', name: cleanName(r[1]), lat: r[2], lon: r[3], building: true, upd: d.wifi.updated ?? undefined,
  }))
  const wifiOsm = osmItems(o.wifi, ou, r => ({ type: r[4], cat: isFood(r[4]) ? 'food' : 'other', hours: r[5], ssid: r[6] }))

  const toilets = [
    ...d.toiletsgo.rows.map(r => ({ id: 't' + r[0], part: 'tgo' as const, type: tgoType(r[1]), name: r[1], addr: r[2], phone: r[3], lat: r[4], lon: r[5], upd: d.toiletsgo.updated ?? undefined })),
    ...osmItems(o.toilets, ou, r => ({ type: 'toilet', hours: r[5], cust: r[6] === 'c' })),
  ]
  const chargers = osmItems(o.charge, ou, r => ({ type: 'charger', hours: r[5], always: !r[5] }))

  const L = (id: LayerId, c: Omit<LayerConfig, 'id' | 'items'>, items: Item[], m = 15): LayerConfig => ({ id, ...c, items: dedupe(items, m) })
  return {
    water: L('water', { icon: 'drop', color: 'var(--color-water)', label: { en: 'Water', es: 'Agua' }, hint: { en: 'Drinking fountains', es: 'Fuentes de agua' }, hours: false }, [...fountains, ...waterOsm]),
    toilets: L('toilets', { icon: 'toilet', color: 'var(--color-toilet)', label: { en: 'Toilets', es: 'Aseos' }, hint: { en: 'Free public toilets', es: 'Aseos gratis' }, hours: true }, toilets),
    // two buildings can share a street, but never a doorstep: city libraries / centres are never merged with each other
    charge: L('charge', { icon: 'charge', color: 'var(--color-charge)', label: { en: 'Charge', es: 'Cargar' }, hint: { en: 'Charge your phone', es: 'Cargar el móvil' }, hours: true }, [...lib, ...civic, ...chargers], 8),
    wifi: L('wifi', { icon: 'wifi', color: 'var(--color-wifi)', label: { en: 'WiFi', es: 'WiFi' }, hint: { en: 'Free WiFi', es: 'WiFi gratis' }, hours: true, cats: ['muni', 'food', 'other'] }, [...wifiCity, ...without(wifiOsm, wifiCity, 30)]),
    libraries: L('libraries', { icon: 'library', color: 'var(--color-library)', label: { en: 'Libraries', es: 'Bibliotecas' }, hint: { en: 'Quiet and free', es: 'Tranquilas y gratis' }, hours: true }, lib, 8),
    bizi: L('bizi', { icon: 'bike', color: 'var(--color-bike)', label: { en: 'Bizi bikes', es: 'Bizi' }, hint: { en: 'Cheap bike share', es: 'Bici compartida barata' }, hours: false },
      d.bizi.rows.map(r => ({ id: 'b' + r[0], part: 'city' as const, type: 'bizi', name: r[1], lat: r[2], lon: r[3], upd: d.bizi.updated ?? undefined })), 8),
  }
}

export function tgoType(n: string): string {
  if (/^(bar|caf)/i.test(n)) return 'bar'
  if (/^biblioteca/i.test(n)) return 'lib'
  if (/^centro c/i.test(n)) return 'civic'
  if (/^zona joven/i.test(n)) return 'youth'
  if (/ayuntamiento/i.test(n)) return 'townhall'
  return 'place'
}
