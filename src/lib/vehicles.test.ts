import { describe, expect, it } from 'vitest'
import { DATA } from '../data'
import { dist } from './geo'
import { alongPath, decodePolyline } from './transit'
import { arrowBearing, between, nextTwo, pathLength, stitch, TRAIN_KMH, TRAM_KMH, upstream } from './vehicles'
import type { LatLon } from './types'

// a straight line going north: 0.01 degree of latitude is about 1105 m
const line: LatLon[] = [[41.60, -0.9], [41.61, -0.9], [41.62, -0.9]]
const stop: LatLon = [41.61, -0.9]
const mAlong = (p: LatLon) => alongPath(line, p).at

describe('stitch', () => {
  it('chains shuffled and reversed pieces into one line from the south', () => {
    const a: LatLon[] = [[41.60, -0.9], [41.61, -0.9]], b: LatLon[] = [[41.61, -0.9], [41.62, -0.9]], c: LatLon[] = [[41.63, -0.9], [41.62, -0.9]]
    const s = stitch([c, a, b.slice().reverse()])
    expect(s[0]).toEqual([41.60, -0.9]); expect(s.at(-1)).toEqual([41.63, -0.9]); expect(s).toHaveLength(4)
  })
  it('the real tram track (about 60 pieces) becomes one line that covers every piece', () => {
    const pieces = DATA.tram.line.map(decodePolyline)
    const s = stitch(pieces)
    const total = pieces.reduce((n, p) => n + pathLength(p), 0)
    expect(pieces.length).toBeGreaterThan(40)
    expect(pathLength(s)).toBeGreaterThan(total * 0.97)
    expect(s[0][0]).toBeLessThan(s.at(-1)![0]) // south to north
  })
})

describe('upstream', () => {
  const km = TRAM_KMH * 1000 / 60 // metres per minute
  it('northbound: the vehicle is south of the stop, minutes x speed away', () => {
    const [p] = upstream(line, stop, true, [2], TRAM_KMH)
    expect(p[0]).toBeLessThan(stop[0]); expect(mAlong(stop) - mAlong(p)).toBeCloseTo(2 * km, -1)
  })
  it('southbound: the vehicle is north of the stop', () => {
    const [p] = upstream(line, stop, false, [1], TRAM_KMH)
    expect(p[0]).toBeGreaterThan(stop[0]); expect(mAlong(p) - mAlong(stop)).toBeCloseTo(km, -1)
  })
  it('0 minutes gives no marker (the stop marker shows it); two times give two, the later one further', () => {
    expect(upstream(line, stop, true, [0], TRAM_KMH)).toEqual([])
    const [a, b] = upstream(line, stop, true, [1, 3], TRAM_KMH)
    expect(dist(b, stop)).toBeGreaterThan(dist(a, stop))
  })
  it('a distance past the end of the line stays at the end', () => {
    const [p] = upstream(line, stop, true, [60], TRAM_KMH)
    expect(p).toEqual(line[0])
    const [q] = upstream(line, stop, false, [60], TRAIN_KMH)
    expect(q).toEqual(line[2])
  })
  it('a stop far from the track gives nothing', () => { expect(upstream(line, [41.61, -0.89], true, [2], TRAM_KMH)).toEqual([]) })
  it('the real tram line: a tram 5 min from a middle stop is on the track, about 1.5 km away', () => {
    const t = stitch(DATA.tram.line.map(decodePolyline))
    const row = DATA.tram.rows.find(r => r[1] === 'Plaza Aragón') ?? DATA.tram.rows[10]
    const [p] = upstream(t, [row[2], row[3]], true, [5], TRAM_KMH)
    expect(alongPath(t, p).off).toBeLessThan(2)
    expect(dist(p, [row[2], row[3]])).toBeGreaterThan(900); expect(dist(p, [row[2], row[3]])).toBeLessThan(1600)
  })
  it('Cercanías at about 50 km/h: 6 min is about 5 km', () => {
    const l = decodePolyline(DATA.cercanias.line[0])
    const r = DATA.cercanias.rows.find(x => x[1] === 'Zaragoza Delicias')!
    const [p] = upstream(l, [r[2], r[3]], true, [6], TRAIN_KMH)
    expect(dist(p, [r[2], r[3]])).toBeGreaterThan(3500); expect(dist(p, [r[2], r[3]])).toBeLessThan(5100)
  })
})

describe('nextTwo', () => { it('drops 0, sorts, keeps two', () => { expect(nextTwo([9, 0, 3, 5])).toEqual([3, 5]) }) })

describe('arrowBearing', () => {
  it('turns the arrow the opposite way when the tram direction changes, at every tram stop', () => {
    const track = stitch(DATA.tram.line.map(decodePolyline))
    const gap = (a: number, b: number) => { const x = Math.abs(a - b) % 360; return x > 180 ? 360 - x : x }
    let n = 0
    for (const r of DATA.tram.rows) {
      const at: LatLon = [r[2], r[3]]
      const [north, south] = [true, false].map(fwd => { const [p] = upstream(track, at, fwd, [3], TRAM_KMH); return p && arrowBearing(between(track, p, at), p, at) })
      if (north === undefined || south === undefined) continue
      n++
      expect(gap(north, south), r[1]).toBeGreaterThan(120)
    }
    expect(n).toBeGreaterThan(15)
  })
  it('falls back to the straight line when the track piece is a single point', () => {
    expect(arrowBearing([[41.6, -0.9]], [41.6, -0.9], [41.61, -0.9])).toBeCloseTo(0, 0)
  })
})
