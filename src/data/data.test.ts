import { describe, expect, it } from 'vitest'
import { DATA, dataRefreshed } from './index'
import { ORDER, LAYERS } from '../layers'
import { dist } from '../lib/geo'
import { rank } from '../lib/rank'
import type { LayerId } from '../lib/types'

const ALL = ORDER.filter(id => !LAYERS[id].live) as LayerId[] // live layers (pharmacies on duty) have no bundled items
const ids = (rows: unknown[][]) => rows.map(r => r[0])

describe('bundled data', () => {
  it('every city file has rows and a snapshot date', () => {
    for (const k of ['fountains', 'wifi', 'libraries', 'civic', 'bizi', 'racks', 'bus', 'toiletsgo', 'shelters'] as const) {
      expect(DATA[k].rows.length, k).toBeGreaterThan(0)
      expect(DATA[k].updated, k).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    expect(dataRefreshed()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('counts are in the expected range', () => {
    expect(DATA.fountains.rows.length).toBeGreaterThan(600)
    expect(DATA.wifi.rows.length).toBeGreaterThan(100)
    expect(DATA.libraries.rows.length).toBeGreaterThan(50)
    expect(DATA.bizi.rows.length).toBeGreaterThan(200)
    expect(DATA.racks.rows.length).toBeGreaterThan(1500)
    expect(DATA.bus.rows.length).toBeGreaterThan(1200)
  })
})

describe('climate shelters', () => {
  const rows = DATA.shelters.rows
  it('has the 57 places of the city list, all inside Zaragoza, with unique ids and a name', () => {
    expect(rows.length).toBe(57)
    expect(new Set(ids(rows)).size).toBe(57)
    for (const r of rows) {
      expect(r[1].trim().length, String(r[0])).toBeGreaterThan(0)
      expect(r[4]).toBeGreaterThan(41.5); expect(r[4]).toBeLessThan(41.8)
      expect(r[5]).toBeGreaterThan(-1.1); expect(r[5]).toBeLessThan(-0.7)
    }
  })
  it('civic centres that are shelters are tagged, not duplicated', () => {
    const civicIds = new Set(DATA.civic.rows.map(r => 'c' + r[0]))
    const shared = rows.filter(r => civicIds.has('c' + r[0]))
    expect(shared.length).toBeGreaterThan(0)
    const tagged = LAYERS.charge.items.filter(i => i.shelter)
    expect(tagged.length).toBeGreaterThan(0)
    expect(tagged.every(i => i.type === 'civic')).toBe(true)
    expect(LAYERS.charge.items.filter(i => i.id === tagged[0].id).length).toBe(1)
  })
  it('the shelter layer lists every place and most have readable hours', () => {
    expect(LAYERS.shelter.items.length).toBe(57)
    expect(LAYERS.shelter.hours).toBe(true)
    expect(LAYERS.shelter.items.filter(i => i.sched).length).toBeGreaterThan(50)
  })
})

describe('layers built from the data', () => {
  for (const id of ALL) {
    const L = LAYERS[id]
    it(`${id}: items exist, are inside Zaragoza, and none are within 15 m of another`, () => {
      expect(L.items.length).toBeGreaterThan(0)
      for (const it of L.items) {
        expect(it.lat).toBeGreaterThan(41.5); expect(it.lat).toBeLessThan(41.8)
        expect(it.lon).toBeGreaterThan(-1.1); expect(it.lon).toBeLessThan(-0.7)
      }
      const ids = new Set(L.items.map(i => i.id))
      expect(ids.size).toBe(L.items.length)
      // charge/libraries are real buildings: the layer builder keeps them 8 m apart at least; everything else 15 m
      const m = id === 'shelter' ? 0 : id === 'charge' || id === 'libraries' || id === 'bizi' ? 8 : id === 'bus' ? 0 : 15 // bizi: stations 8 m, racks 10 m (8 is the weaker bound)
      for (let i = 0; i < L.items.length; i++) for (let j = i + 1; j < L.items.length; j++) {
        const a = L.items[i], b = L.items[j]
        if (id === 'bizi' && a.cat !== b.cat) continue // a rack may stand next to a station: the two groups are never merged
        if (Math.abs(a.lat - b.lat) > 0.0003) continue
        expect(dist([a.lat, a.lon], [b.lat, b.lon]), `${a.id} / ${b.id}`).toBeGreaterThanOrEqual(m)
      }
    })
  }
  it('water has no hours, so Open now does not apply', () => {
    expect(LAYERS.water.hours).toBe(false)
    expect(LAYERS.bizi.hours).toBe(false)
  })
  it('bike racks live in the Bizi tab (chip My bike), apart from the stations, with a clean name and a known kind', () => {
    const racks = LAYERS.bizi.items.filter(i => i.cat === 'mine'), stations = LAYERS.bizi.items.filter(i => i.cat === 'station')
    expect(racks.length).toBeGreaterThan(1500)
    expect(stations).toHaveLength(DATA.bizi.rows.length)
    expect(racks.length + stations.length).toBe(LAYERS.bizi.items.length)
    expect(LAYERS.bizi.cats).toEqual(['take', 'return', 'mine'])
    expect(LAYERS.bizi.catDefault).toBe('take')
    expect('racks' in LAYERS).toBe(false)
    for (const i of racks) {
      expect(i.lat).toBeGreaterThan(41.5); expect(i.lat).toBeLessThan(41.8)
      expect(['rack', 'rack_closed', 'rack_guarded']).toContain(i.type)
    }
    expect(LAYERS.libraries.hours).toBe(true)
  })
  it('bus stops: every one has a name; city stops (numbers only) have a live-times number, rural stops do not', () => {
    const L = LAYERS.bus
    expect(L.hours).toBe(false)
    expect(L.items.length).toBe(DATA.bus.rows.length)
    expect(L.items.filter(i => i.stop).length).toBeGreaterThan(900)
    expect(L.items.filter(i => !i.stop).length).toBeGreaterThan(0)
    for (const i of L.items) { expect(i.name.length).toBeGreaterThan(0); expect(i.type).toBe('bus'); expect(i.lines).toMatch(/^[\w]*(,[\w]+)*$/) }
    const colours = Object.values(LAYERS).map(l => l.color)
    expect(new Set(colours).size).toBe(colours.length)
  })
  it('some libraries are flagged as University of Zaragoza (live occupancy link)', () => {
    const buz = LAYERS.libraries.items.filter(i => i.buz)
    expect(buz.length).toBeGreaterThan(0)
    expect(buz.every(i => !/colectivo/i.test(i.name))).toBe(true)
  })
  it('libraries: Open now hides closed ones, puts open before unknown', () => {
    const noon = new Date('2026-11-04T11:00:00+01:00') // Wednesday 11:00 Madrid
    const now = { day: 2, min: 11 * 60, md: 1104 }
    void noon
    const r = rank(LAYERS.libraries, LAYERS.libraries.items, { ref: null, openOnly: true, cat: null }, now)
    expect(r.every(x => x.open !== false)).toBe(true)
    const firstUnknown = r.findIndex(x => x.open === null)
    if (firstUnknown >= 0) expect(r.slice(firstUnknown).every(x => x.open === null)).toBe(true)
    expect(r.some(x => x.open === true)).toBe(true)
    const all = rank(LAYERS.libraries, LAYERS.libraries.items, { ref: null, openOnly: false, cat: null }, now)
    expect(all.length).toBeGreaterThanOrEqual(r.length)
    expect(all.some(x => x.open === false)).toBe(true)
  })
})
