import { describe, expect, it } from 'vitest'
import { biziRows, busRows, rackRows, cityEquipRows, cityWifiRows, fountainRows, fountainStreet, parseTgo, splitOsm, type OsmElement } from './sources'

describe('city normalisers', () => {
  it('wifi: swaps lon/lat and skips records without geometry', () => {
    const rows = cityWifiRows({ result: [{ id: 1, title: 'SEDE X', geometry: { coordinates: [-0.88, 41.65] } }, { id: 2, title: 'none' }] })
    expect(rows).toEqual([[1, 'SEDE X', 41.65, -0.88]])
  })
  it('libraries: tel object, year, parsed hours', () => {
    const r = cityEquipRows({ result: [{ id: 20360, title: 'Biblioteca CAI ', calle: 'Calle  X ', tel: { tel: '976 290 521' }, lastUpdated: '2023-09-26T12:48:29', horario: 'Lunes a viernes 9 - 13:30 h', geometry: { coordinates: [-0.885, 41.65] } }] })[0]
    expect(r.slice(0, 7)).toEqual([20360, 'Biblioteca CAI', 'Calle X', '976 290 521', 41.65, -0.885, 2023])
    expect(r[7]).toEqual({ r: 'Mo-Fr 09:00-13:30; Sa-Su off' })
  })
  it('bizi keeps the location only', () => {
    const r = biziRows({ result: [{ id: '279', title: '193- Pza. La Ermita', geometry: { coordinates: [-0.91, 41.63] } }, { id: 'x', title: 'bad' }] })
    expect(r).toEqual([['279', '193- Pza. La Ermita', 41.63, -0.91]])
  })
  it('bike racks keep location and kind, drop capacity', () => {
    const r = rackRows({ result: [
      { id: 1, title: 'RIOJA', tipo: 'Abierto', plazas: 4, geometry: { coordinates: [-0.9, 41.65] } },
      { id: 2, title: 'ISLA  DE LANZAROTE', tipo: 'Cerrado', geometry: { coordinates: [-0.91, 41.66] } },
      { id: 3, title: 'X', tipo: 'Vigilado', geometry: { coordinates: [-0.92, 41.67] } },
      { id: 4, title: 'far away', tipo: 'Abierto', geometry: { coordinates: [2.1, 41.4] } },
    ] })
    expect(r).toEqual([['1', 'RIOJA', 41.65, -0.9, 'o'], ['2', 'ISLA DE LANZAROTE', 41.66, -0.91, 'c'], ['3', 'X', 41.67, -0.92, 'g']])
  })
  it('bus stops: number and lines are taken out of the title, rural stops keep a prefix', () => {
    const r = busRows({ result: [
      { id: 'tuzsa-688', title: '(688) P. Reyes De Aragón N.º 24 Líneas: 58', geometry: { coordinates: [-0.9072975810322448, 41.62702649728611] } },
      { id: 'tuzsa-36', title: '(36) Av. Academia General Militar / Maz (Dir. Centro) Líneas: 35, N2, 29', geometry: { coordinates: [-0.87108, 41.68499] } },
      { id: 'rural-36', title: '(36) C.E. Grande Covián Líneas: 102, 201', geometry: { coordinates: [-0.85932, 41.66455] } },
      { id: 'tuzsa-9', title: '(9) Sin líneas', geometry: { coordinates: [-0.9, 41.65] } },
      { id: 'tuzsa-688', title: '(688) repeated id', geometry: { coordinates: [-0.9, 41.65] } },
      { id: 'tuzsa-1', title: '(1) far away Líneas: 1', geometry: { coordinates: [2.1, 41.4] } },
    ] })
    expect(r).toEqual([
      ['688', 'P. Reyes De Aragón N.º 24', '58', 41.627026, -0.907298],
      ['36', 'Av. Academia General Militar / Maz (Dir. Centro)', '35,N2,29', 41.68499, -0.87108],
      ['r36', 'C.E. Grande Covián', '102,201', 41.66455, -0.85932],
      ['9', 'Sin líneas', '', 41.65, -0.9],
    ])
  })
  it('fountain street names', () => {
    expect(fountainStreet('CALLE CALLE MAYOR (3)')).toBe('Calle Mayor')
    expect(fountainStreet(null)).toBe('')
  })
  it('fountains: out-of-service and out-of-city records are dropped', () => {
    const f = (v: string | null, e: number, n: number) => ({ properties: { VIAL: 'CALLE X', OBSERVAC: v, DISTRITO: 'Centro', FECHAACT: '2023-01-01' }, geometry: { coordinates: [e, n] as [number, number] } })
    const r = fountainRows({ data: { features: [f(null, 676000, 4614000), f('Fuente anulada', 676000, 4614000), f(null, 0, 0)] } })
    expect(r.rows).toHaveLength(1)
    expect(r.dropped).toBe(2)
  })
})

describe('parseTgo', () => {
  it('reads RAW rows and converts UTM', () => {
    const txt = "{ id: 5, name: 'Bar Pepe', address: 'C/ X', tel: null, utm: [676000, 4614000] }, { id: 6, name: 'Far', address: '', tel: '976 1', utm: [1, 2] }"
    const r = parseTgo(txt)
    expect(r).toHaveLength(1)
    expect(r[0][0]).toBe(5)
    expect(r[0][4]).toBeGreaterThan(41.5)
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
    { type: 'node', id: 7, lat: 41.64, lon: -0.9, tags: { amenity: 'library', name: 'Biblioteca Universitaria' } },
  ]
  it('splits by tag and drops private, fee and coordinate-less records', () => {
    const o = splitOsm(els)
    expect(o.water).toHaveLength(1)
    expect(o.toilets).toHaveLength(1)
    expect(o.toilets[0][6]).toBe('c')
    expect(o.charge[0][0]).toBe('way/4')
    expect(o.wifi[0].slice(1, 7)).toEqual(['Café X', 41.65, -0.89, 'cafe', '', 'cafex'])
    expect(o.buz).toHaveLength(1)
  })
})
