import { describe, expect, it } from 'vitest'
import { rankOrAll } from './rank'
import type { Item, LayerConfig } from './types'

const H = (h: number, m = 0) => h * 60 + m
const cfg = { hours: true } as LayerConfig
const item = (id: string, lat: number): Item => ({ id, part: 'city', type: 'civic', name: id, lat, lon: -0.88, hours: 'Mo-Fr 08:30-21:30' } as Item)
const items = [item('far', 41.7), item('near', 41.64)]
const ref = { ref: [41.64, -0.88] as [number, number], openOnly: true, cat: null }

describe('rankOrAll', () => {
  it('open now keeps only open places and does not flag allClosed', () => {
    const r = rankOrAll(cfg, items, ref, { day: 0, min: H(12), md: 701 })
    expect(r.arr.map(i => i.id)).toEqual(['near', 'far'])
    expect(r.allClosed).toBe(false)
  })
  it('everything closed shows all places by distance and flags it', () => {
    const r = rankOrAll(cfg, items, ref, { day: 0, min: H(23), md: 701 })
    expect(r.arr.map(i => i.id)).toEqual(['near', 'far'])
    expect(r.arr.every(i => i.open === false)).toBe(true)
    expect(r.allClosed).toBe(true)
  })
  it('switch off or a layer without hours never flags', () => {
    expect(rankOrAll(cfg, items, { ...ref, openOnly: false }, { day: 0, min: H(23), md: 701 }).allClosed).toBe(false)
    expect(rankOrAll({ hours: false } as LayerConfig, items, ref, { day: 0, min: H(23), md: 701 }).allClosed).toBe(false)
  })
})

describe('Bizi chips', () => {
  const cfgB = { hours: false, cats: ['take', 'return', 'mine'] } as LayerConfig
  const st = (id: string, lat: number, bikes?: number, docks?: number): Item => ({ id, part: 'city', type: 'bizi', cat: 'station', name: id, lat, lon: -0.88, bikes, docks } as Item)
  const rack = { id: 'r', part: 'city', type: 'rack', cat: 'mine', name: 'r', lat: 41.641, lon: -0.88 } as Item
  const all = [st('empty', 41.64, 0, 10), st('full', 41.65, 5, 0), st('mid', 41.7, 2, 3), rack]
  const o = (cat: string) => ({ ref: [41.64, -0.88] as [number, number], openOnly: true, cat })
  it('take: only stations with bikes, nearest first', () => expect(rankOrAll(cfgB, all, o('take')).arr.map(i => i.id)).toEqual(['full', 'mid']))
  it('return: only stations with free docks', () => expect(rankOrAll(cfgB, all, o('return')).arr.map(i => i.id)).toEqual(['empty', 'mid']))
  it('my bike: the racks', () => expect(rankOrAll(cfgB, all, o('mine')).arr.map(i => i.id)).toEqual(['r']))
  it('no counts known: every station passes take and return', () => {
    const none = [st('a', 41.64), st('b', 41.65), rack]
    expect(rankOrAll(cfgB, none, o('take')).arr.map(i => i.id)).toEqual(['a', 'b'])
    expect(rankOrAll(cfgB, none, o('return')).arr.map(i => i.id)).toEqual(['a', 'b'])
  })
  it('no station has a bike: all stations show by distance and it is flagged (like allClosed)', () => {
    const r = rankOrAll(cfgB, [st('a', 41.64, 0, 5), st('b', 41.65, 0, 5), rack], o('take'))
    expect(r.arr.map(i => i.id)).toEqual(['a', 'b'])
    expect(r.allOut).toBe(true)
    expect(rankOrAll(cfgB, all, o('take')).allOut).toBe(false)
  })
})
