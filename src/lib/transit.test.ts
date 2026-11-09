import { describe, expect, it } from 'vitest'
import busroutes from '../data/busroutes.json'
import cercanias from '../data/cercanias.json'
import times from '../data/cercanias-times.json'
import tram from '../data/tram.json'
import { alongPath, chipSplit, dayType, decodePolyline, lineKey, encodePolyline, nextDepartures, orderAlong, pickDirection, pointAt, simplify, stopIndex, type BusRoutes, type Timetable } from './transit'
import type { LatLon } from './types'

describe('polyline', () => {
  it('round-trips to 5 decimals', () => {
    const pts: LatLon[] = [[41.65184, -0.87956], [41.65201, -0.8794], [41.6499, -0.88123]]
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts)
  })
  it('is empty for no points', () => { expect(decodePolyline('')).toEqual([]) })
})

describe('simplify', () => {
  it('drops collinear points and keeps corners', () => {
    const line: LatLon[] = [[41.65, -0.88], [41.651, -0.88], [41.652, -0.88], [41.652, -0.879], [41.652, -0.878]]
    expect(simplify(line, 2)).toEqual([[41.65, -0.88], [41.652, -0.88], [41.652, -0.878]])
  })
  it('keeps short lines', () => { expect(simplify([[41, -1], [41.1, -1]], 2)).toHaveLength(2) })
})

describe('order along a route', () => {
  const path: LatLon[] = [[41.65, -0.9], [41.65, -0.89], [41.65, -0.88]]
  it('measures distance along the path', () => {
    const a = alongPath(path, [41.6501, -0.895]), b = alongPath(path, [41.6501, -0.885])
    expect(b.at).toBeGreaterThan(a.at)
    expect(a.off).toBeLessThan(20)
  })
  it('sorts stops in the order the bus meets them', () => {
    const stops = [{ id: 'c', lat: 41.6501, lon: -0.881 }, { id: 'a', lat: 41.6501, lon: -0.899 }, { id: 'b', lat: 41.6499, lon: -0.89 }]
    expect(orderAlong(path, stops).map(s => s.id)).toEqual(['a', 'b', 'c'])
  })
  it('gives a point and a bearing on the line (east = 90)', () => {
    const r = pointAt(path, 0.5)!
    expect(r.pt[1]).toBeCloseTo(-0.89, 3)
    expect(Math.round(r.bearing)).toBe(90)
  })
})

describe('pickDirection', () => {
  const stops: BusRoutes['stops'] = { 10: ['A', 41.65, -0.9], 11: ['B', 41.65, -0.89], 12: ['C', 41.65, -0.88], 20: ['C2', 41.6502, -0.88] }
  const line = { n: '1', d: [{ to: 'East', p: [], s: [10, 11, 12] }, { to: 'West', p: [], s: [20, 11, 10] }] }
  it('picks the only direction that has the stop', () => { expect(pickDirection(line, stops, '12', [41.65, -0.88])).toEqual({ dir: 0, idx: 2 }) })
  it('picks the direction with more stops to come when both have it', () => { expect(pickDirection(line, stops, '11', [41.65, -0.89])).toEqual({ dir: 0, idx: 1 }) })
  it('uses the nearest stop (within 80 m) when the post is not on the line', () => { expect(pickDirection(line, stops, '99', [41.6502, -0.8801])).toEqual({ dir: 1, idx: 0 }) })
  it('is dir 0 and no stop when nothing is near', () => { expect(pickDirection(line, stops, undefined, [41.7, -0.8])).toEqual({ dir: 0, idx: -1 }) })
})

describe('chipSplit', () => {
  it('shows all lines when they fit', () => { expect(chipSplit(['1', '2', '3'], 6)).toEqual({ shown: ['1', '2', '3'], more: 0 }) })
  it('keeps one slot for the +N chip', () => {
    const r = chipSplit(['1', '2', '3', '4', '5', '6', '7', '8'], 6)
    expect(r.shown).toHaveLength(5)
    expect(r.more).toBe(3)
  })
})

describe('stopIndex', () => {
  const stops: BusRoutes['stops'] = { 10: ['A', 41.65, -0.9], 11: ['B', 41.65, -0.89], 12: ['C', 41.65, -0.88] }
  it('finds the exact post', () => { expect(stopIndex([10, 11, 12], stops, '11', [0, 0])).toBe(1) })
  it('falls back to the nearest stop within 80 m', () => { expect(stopIndex([10, 11, 12], stops, '99', [41.6501, -0.8801])).toBe(2) })
  it('is -1 when nothing is near', () => { expect(stopIndex([10, 11, 12], stops, undefined, [41.7, -0.8])).toBe(-1) })
})

// Timetable: weekday trains at 06:00 -> dest 0, 23:50 -> dest 1, and 24:10 (00:10 after midnight) -> dest 1. Sunday: 09:00 only.
const tt: Timetable = { wd: [360, 0, 1430, 1, 1450, 1], fri: [360, 0, 1430, 1], sat: [600, 0], sun: [540, 0] }
describe('dayType', () => {
  it('maps Monday-Thursday, Friday, Saturday, Sunday', () => { expect([0, 3, 4, 5, 6].map(dayType)).toEqual(['wd', 'wd', 'fri', 'sat', 'sun']) })
})
describe('nextDepartures', () => {
  it('lists today\'s next trains with minutes and clock time', () => {
    const r = nextDepartures(tt, { day: 1, min: 300 }, 2) // Tuesday 05:00
    expect(r.map(d => [d.at, d.inMin, d.dest, d.tomorrow])).toEqual([['06:00', 60, 0, false], ['23:50', 1130, 1, false]])
  })
  it('counts trains after midnight on the same service day', () => {
    const r = nextDepartures(tt, { day: 1, min: 1435 }, 3) // Tuesday 23:55: the 24:10 train is at 00:10
    expect(r[0]).toMatchObject({ at: '00:10', inMin: 15, dest: 1, tomorrow: false })
  })
  it('after midnight, yesterday\'s late trains still run', () => {
    const r = nextDepartures(tt, { day: 2, min: 5 }, 1) // Wednesday 00:05, Tuesday's 24:10 train
    expect(r[0]).toMatchObject({ at: '00:10', inMin: 5 })
  })
  it('with no more trains today, shows the first train of tomorrow', () => {
    const r = nextDepartures(tt, { day: 4, min: 1431 }, 3) // Friday 23:51: nothing left on Friday's plan, Saturday starts at 10:00
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ at: '10:00', tomorrow: true, dest: 0 })
    expect(r[0].inMin).toBe(1440 + 600 - 1431)
  })
  it('uses the Sunday plan on Sunday and the Monday plan after it', () => {
    expect(nextDepartures(tt, { day: 6, min: 0 }, 1)[0]).toMatchObject({ at: '09:00', inMin: 540 })
    expect(nextDepartures(tt, { day: 6, min: 600 }, 1)[0]).toMatchObject({ at: '06:00', tomorrow: true })
  })
  it('is empty with no timetable', () => { expect(nextDepartures({ wd: [], fri: [], sat: [], sun: [] }, { day: 1, min: 0 })).toEqual([]) })
})

describe('baked transit files', () => {
  it('bus routes: every stop of a line is in the stop table, and routes decode', () => {
    const b = busroutes as unknown as BusRoutes
    expect(Object.keys(b.lines).length).toBeGreaterThan(40)
    for (const l of Object.values(b.lines)) {
      expect(l.d.length).toBeGreaterThan(0)
      for (const d of l.d) {
        expect(d.p.length).toBeGreaterThan(0)
        for (const c of d.s) expect(b.stops[c]).toBeTruthy()
        for (const p of d.p) expect(decodePolyline(p).length).toBeGreaterThan(1)
      }
    }
  })
  it('tram: stops in the city, a track to draw', () => {
    expect(tram.rows.length).toBeGreaterThanOrEqual(30)
    for (const r of tram.rows) { expect(r[2]).toBeGreaterThan(41.5); expect(r[2]).toBeLessThan(41.8) }
    expect(tram.line.length).toBeGreaterThan(0)
    expect(tram.ends).toHaveLength(2)
  })
  it('cercanias: every station has a timetable with sorted times', () => {
    expect(cercanias.rows.length).toBeGreaterThanOrEqual(4)
    for (const r of cercanias.rows) {
      const t = (times.t as unknown as Record<string, Timetable>)[r[0]]
      expect(t.wd.length).toBeGreaterThan(0)
      for (const list of Object.values(t)) for (let i = 2; i < list.length; i += 2) expect(list[i]).toBeGreaterThanOrEqual(list[i - 2])
    }
    expect(cercanias.valid[0] <= cercanias.valid[1]).toBe(true)
  })
})

import { cutClosed as _cut, spliceDetour as _splice } from './transit'
describe('cutClosed', () => {
  const way: [number, number][] = [[41.6, -0.9], [41.6, -0.89]]
  it('cuts the part along a closed street and splits the route', () => {
    const route = encodePolyline([[41.59, -0.91], [41.6, -0.905], [41.6, -0.895], [41.61, -0.88], [41.62, -0.87]])
    const out = _cut([route], way, 25)
    expect(out.length).toBe(2)
  })
  it('leaves a route far from the closed street alone', () => {
    const route = encodePolyline([[41.7, -0.91], [41.7, -0.9]])
    expect(_cut([route], way, 25)).toEqual([route])
  })
})

describe('spliceDetour', () => {
  const route = [encodePolyline([[41.6, -0.92], [41.6, -0.9]]), encodePolyline([[41.6, -0.88], [41.6, -0.9]]), encodePolyline([[41.6, -0.88], [41.6, -0.86]])] // unordered, one reversed
  it('joins the pieces and replaces the stretch between two stops with the detour', () => {
    const out = _splice(route, [41.6, -0.91], [41.6, -0.87], [[41.6, -0.91], [41.61, -0.9], [41.61, -0.88], [41.6, -0.87]])
    expect(out).not.toBeNull()
    const pts = out!.flatMap(decodePolyline)
    expect(pts.some(p => p[0] === 41.61)).toBe(true) // the detour is in
    expect(pts.some(p => p[0] === 41.6 && p[1] === -0.9)).toBe(false) // the old stretch is out
  })
  it('does nothing when the stops are not on the route', () => {
    expect(_splice(route, [41.7, -0.91], [41.7, -0.87], [[41.7, -0.91], [41.7, -0.87]])).toBeNull()
  })
})

describe('lineKey', () => {
  const r = { src: '', updated: null, stops: {}, lines: { Ci4: { n: 'Circular 4', d: [] }, '24': { n: '24', d: [] } } } as BusRoutes
  it('finds a circular the live API spells in capitals', () => { expect(lineKey(r, 'CI4')).toBe('Ci4') })
  it('keeps an exact name and returns nothing for an unknown line', () => { expect(lineKey(r, '24')).toBe('24'); expect(lineKey(r, 'X9')).toBeUndefined(); expect(lineKey(null, '24')).toBeUndefined() })
})
