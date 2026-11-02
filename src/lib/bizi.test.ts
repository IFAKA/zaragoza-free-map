import { beforeEach, describe, expect, it } from 'vitest'
import { FRESH_MS, isFresh, joinBizi, loadBizi, parseStamp, readBiziCache, withCounts, type CbNetwork } from './bizi'
import type { Item } from './types'

const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
beforeEach(() => store.clear())

const NOW = Date.parse('2026-11-02T21:15:00Z')
const places = [
  { id: 'b1', name: '8-Puerta del Sol', lat: 41.654185, lon: -0.870531 },
  { id: 'b2', name: '30-Pta. Sancho: Gargallo', lat: 41.66151, lon: -0.901678 },
  { id: 'b3', name: '99-Moved station', lat: 41.7, lon: -0.9 },
  { id: 'b4', name: '77-No match at all', lat: 41.6, lon: -0.8 },
]
const feed = (stamp = '2026-11-02T21:14:30.810753+00:00Z'): CbNetwork => ({ network: { stations: [
  { name: '8-Puerta del Sol', latitude: 41.654185, longitude: -0.870531, free_bikes: 0, empty_slots: 22, timestamp: stamp, extra: { ebikes: 0, renting: true, returning: true } },
  { name: '30-Pta. Sancho: Gargallo', latitude: 41.66152, longitude: -0.90168, free_bikes: 8, empty_slots: 11, timestamp: stamp, extra: { ebikes: 3, renting: true, returning: true } },
  { name: '99-Moved a lot', latitude: 41.72, longitude: -0.91, free_bikes: 4, empty_slots: 6, timestamp: stamp, extra: { ebikes: 9, renting: false, returning: true } },
] } })

describe('joinBizi', () => {
  it('reads the odd CityBikes stamp (+00:00Z)', () => {
    expect(parseStamp('2026-11-02T21:14:30.810753+00:00Z')).toBe(Date.parse('2026-11-02T21:14:30.810Z'))
    expect(parseStamp(undefined)).toBeNaN()
  })
  it('joins by position (< 40 m), else by the number in the name', () => {
    const r = joinBizi(feed(), places, NOW)!
    expect(r.counts.b1).toEqual([0, 22, 0])
    expect(r.counts.b2).toEqual([8, 11, 3])
    expect(r.counts.b3).toEqual([0, 6, 0]) // by number 99; not renting = no bikes to take
    expect(r.counts.b4).toBeUndefined()
    expect(r.at).toBe(NOW)
  })
  it('a feed whose newest stamp is older than 5 minutes is not live', () => {
    expect(joinBizi(feed('2026-11-02T21:09:00.000000+00:00Z'), places, NOW)).toBeNull()
    expect(joinBizi(feed('2026-11-02T21:11:00.000000+00:00Z'), places, NOW)).not.toBeNull()
    expect(joinBizi({}, places, NOW)).toBeNull()
  })
})
describe('freshness and cache', () => {
  it('isFresh is true up to 5 minutes', () => {
    expect(isFresh(NOW - FRESH_MS, NOW)).toBe(true)
    expect(isFresh(NOW - FRESH_MS - 1, NOW)).toBe(false)
  })
  it('a good answer is used and saved with its time', async () => {
    const r = await loadBizi(places, () => NOW, async () => feed())
    expect(r?.counts.b2[0]).toBe(8)
    expect(readBiziCache(NOW + 60_000)?.at).toBe(NOW)
  })
  it('a failed fetch falls back to the saved counts only while they are fresh', async () => {
    await loadBizi(places, () => NOW, async () => feed())
    const fail = async () => { throw new Error('offline') }
    expect((await loadBizi(places, () => NOW + 4 * 60_000, fail))?.at).toBe(NOW)
    expect(await loadBizi(places, () => NOW + 6 * 60_000, fail)).toBeNull()
  })
  it('an empty or stale answer never counts as live', async () => {
    expect(await loadBizi(places, () => NOW, async () => ({}))).toBeNull()
    expect(await loadBizi(places, () => NOW, async () => feed('2026-11-02T20:00:00.000000+00:00Z'))).toBeNull()
  })
})
describe('withCounts', () => {
  it('adds counts to stations only', () => {
    const items = [{ id: 'b1' }, { id: 'r1' }] as Item[]
    expect(withCounts(items, { b1: [2, 3, 1] })).toEqual([{ id: 'b1', bikes: 2, docks: 3, ebikes: 1 }, { id: 'r1' }])
    expect(withCounts(items, null)).toBe(items)
  })
})
