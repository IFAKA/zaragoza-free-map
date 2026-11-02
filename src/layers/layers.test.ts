import { describe, expect, it } from 'vitest'
import { biziItems, cityEquipItems, cityWifiItems, cityWifiRows } from './city'
import { OSM_QUERY, splitOsm, type OsmElement } from './osm'
import { parseTgo, tgoItems, tgoType } from './tgo'
import { LAYERS } from './index'
import { rank, nearestOf } from '../lib/rank'
import { WIFI_SNAPSHOT } from './wifi-snapshot'

describe('city normalisers', () => {
  it('wifi: swaps lon/lat, cleans names, dedupes same coordinate', () => {
    const rows = cityWifiRows({ result: [
      { id: 1, title: 'SEDE CASA DE AMPARO', geometry: { coordinates: [-0.88, 41.65] } },
      { id: 2, title: 'SEDE OTRA', geometry: { coordinates: [-0.88, 41.65] } },
      { id: 3, title: 'sin geometria' },
    ] })
    const items = cityWifiItems(rows)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'm1', name: 'Casa de Amparo', lat: 41.65, lon: -0.88, part: 'city', cat: 'muni' })
    expect(cityWifiItems(WIFI_SNAPSHOT).length).toBeGreaterThan(40)
  })
  it('libraries and civic centres: tel object, year, building flag', () => {
    const it = cityEquipItems({ result: [{ id: 20360, title: 'Biblioteca CAI ', calle: 'Calle  X ', tel: { tel: '976 290 521' }, lastUpdated: '2023-09-26T12:48:29', geometry: { coordinates: [-0.885, 41.65] } }] }, 'lib')[0]
    expect(it).toMatchObject({ id: 'c20360', name: 'Biblioteca CAI', addr: 'Calle X', phone: '976 290 521', yr: 2023, building: true, type: 'lib', lat: 41.65, lon: -0.885 })
  })
  it('bizi: bikes and docks', () => {
    const it = biziItems({ result: [{ id: '279', title: '193- Pza. La Ermita', estado: 'IN_SERVICE', bicisDisponibles: 7, anclajesDisponibles: 12, geometry: { coordinates: [-0.91, 41.63] } }, { id: 'x', title: 'bad' }] })
    expect(it).toHaveLength(1)
    expect(it[0]).toMatchObject({ bikes: 7, docks: 12, est: 'IN_SERVICE', type: 'bizi' })
    expect(biziItems(undefined)).toEqual([])
  })
})

describe('splitOsm', () => {
  const els: OsmElement[] = [
    { type: 'node', id: 1, lat: 41.65, lon: -0.88, tags: { amenity: 'drinking_water' } },
    { type: 'node', id: 2, lat: 41.66, lon: -0.87, tags: { amenity: 'toilets', fee: 'yes' } },
    { type: 'node', id: 3, lat: 41.66, lon: -0.87, tags: { amenity: 'toilets', fee: 'no', opening_hours: 'Mo-Fr 09:00-14:00', access: 'customers' } },
    { type: 'way', id: 4, center: { lat: 41.67, lon: -0.86 }, tags: { amenity: 'device_charging_station', name: 'Cargador' } },
    { type: 'node', id: 5, lat: 41.65, lon: -0.89, tags: { amenity: 'cafe', name: 'Café X', internet_access: 'wlan', 'internet_access:fee': 'no', 'internet_access:ssid': 'cafex' } },
    { type: 'node', id: 6, tags: { amenity: 'drinking_water' } },
    { type: 'node', id: 7, lat: 41.65, lon: -0.89, tags: { amenity: 'drinking_water', access: 'private' } },
  ]
  const r = splitOsm(els)
  it('splits by tag and survives junk', () => {
    expect(r.water.map(i => i.id)).toEqual(['on1'])
    expect(r.toilets.map(i => i.id)).toEqual(['on3'])
    expect(r.toilets[0]).toMatchObject({ cust: true, hours: 'Mo-Fr 09:00-14:00', osm: 'node/3' })
    expect(r.charge[0]).toMatchObject({ id: 'ow4', lat: 41.67, name: 'Cargador', osm: 'way/4' })
    expect(r.wifi[0]).toMatchObject({ cat: 'food', ssid: 'cafex', type: 'cafe' })
  })
  it('never crashes on empty or missing', () => {
    expect(splitOsm([])).toEqual({ wifi: [], water: [], toilets: [], charge: [] })
    expect(splitOsm(undefined)).toEqual({ wifi: [], water: [], toilets: [], charge: [] })
  })
  it('one combined query with the Zaragoza bbox', () => {
    expect(OSM_QUERY).toContain('41.54,-1.06,41.76,-0.76')
    expect(OSM_QUERY.match(/nwr\[/g)).toHaveLength(4)
  })
})

describe('toiletsgo', () => {
  const sample = `const RAW = [
  {id:5026,  name:'Ayuntamiento de Zaragoza. Plaza del Pilar',     address:'Pza. del Pilar, 18',  tel:'976721100',    utm:[676840.38, 4613965.9]},
  {id:11871, name:'Bar D\\'Ovela',  address:'C/ Santiago, 25', tel:null,           utm:[676836.25, 4613851.26]},
  {id:9, name:'Far away', address:'x', tel:null, utm:[300000, 4000000]},
]`
  it('parses RAW rows, converts UTM, handles escapes, drops rows outside the city', () => {
    const rows = parseTgo(sample)
    expect(rows).toHaveLength(2)
    expect(rows[0][4]).toBeCloseTo(41.6578, 3)
    expect(rows[1][1]).toBe("Bar D'Ovela")
    expect(rows[1][3]).toBe('')
    const items = tgoItems(rows)
    expect(items[0]).toMatchObject({ id: 't5026', part: 'tgo', type: 'townhall', phone: '976721100' })
  })
  it('types', () => { expect(['Bar X', 'Cafetería Y', 'Biblioteca Z', 'Centro Cívico Q', 'Zona Joven W', 'Cementerio'].map(tgoType)).toEqual(['bar', 'bar', 'lib', 'civic', 'youth', 'place']) })
})

describe('rank', () => {
  const mk = (id: string, lat: number, hours = '') => ({ id, part: 'osm' as const, type: 'toilet', name: id, lat, lon: -0.8773, hours })
  const items = [mk('far', 41.70), mk('near', 41.657), mk('closed', 41.656, 'Mo-Su 00:00-00:01'), mk('unknown', 41.658, 'weird hours')]
  it('sorts by distance, open-now keeps unknown hours and drops known-closed', () => {
    const cfg = LAYERS.toilets
    const noon = { day: 2, min: 12 * 60 }
    expect(rank(cfg, items, { ref: [41.656, -0.8773], openOnly: false, cat: null }, noon).map(i => i.id)).toEqual(['closed', 'near', 'unknown', 'far'])
    const open = rank(cfg, items, { ref: [41.656, -0.8773], openOnly: true, cat: null }, noon)
    expect(open.map(i => i.id)).toEqual(['near', 'unknown', 'far'])
    expect(open.find(i => i.id === 'unknown')!.open).toBeNull()
  })
  it('bizi nearest skips empty stations when live', () => {
    const st = (id: string, lat: number, bikes: number) => ({ id, part: 'city' as const, type: 'bizi', name: id, lat, lon: -0.8773, bikes, docks: 3, est: 'IN_SERVICE' })
    const arr = rank(LAYERS.bizi, [st('empty', 41.6561, 0), st('ok', 41.66, 4)], { ref: null, openOnly: false, cat: null })
    expect(nearestOf(LAYERS.bizi, arr, true)!.id).toBe('ok')
    expect(nearestOf(LAYERS.bizi, arr, false)!.id).toBe('empty')
  })
  it('empty layer is fine', () => { expect(nearestOf(LAYERS.water, [], true)).toBeNull() })
})
