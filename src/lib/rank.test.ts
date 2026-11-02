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
