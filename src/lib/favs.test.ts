import { beforeEach, describe, expect, it } from 'vitest'
import { LABEL_MAX, cleanLabel, favTitle, filterKind, getLabels, isStopLayer, parseLabels, setLabel, favKey, getFavs, isFav, parseFavs, removeFav, getSnap, nearestFavs, restoreFav, splitFav, toggleFav, touchFav } from './favs'

describe('favs', () => {
  beforeEach(() => { for (const k of [...getFavs()]) { const [l, id] = splitFav(k); toggleFav(l, id) } })
  it('adds, finds and removes a place', () => {
    toggleFav('bus', 'u688')
    expect(isFav('bus', 'u688')).toBe(true)
    expect(isFav('tram', 'u688')).toBe(false) // ids are per layer
    toggleFav('bus', 'u688')
    expect(isFav('bus', 'u688')).toBe(false)
  })
  it('puts a new favourite at the front', () => { toggleFav('tram', 't1'); toggleFav('bus', 'u2'); expect(getFavs()).toEqual(['bus:u2', 'tram:t1']) })
  it('moves an opened favourite to the front', () => {
    toggleFav('bus', 'a'); toggleFav('bus', 'b'); toggleFav('bus', 'c') // c b a
    touchFav('bus', 'a'); expect(getFavs()).toEqual(['bus:a', 'bus:c', 'bus:b'])
    touchFav('bus', 'a'); expect(getFavs()).toEqual(['bus:a', 'bus:c', 'bus:b'])
    touchFav('bus', 'zz'); expect(getFavs()).toHaveLength(3)
  })
  it('restores a removed favourite in the same place', () => {
    toggleFav('bus', 'a'); toggleFav('bus', 'b'); toggleFav('bus', 'c') // c b a
    const i = removeFav('bus:b'); expect(i).toBe(1); expect(getFavs()).toEqual(['bus:c', 'bus:a'])
    restoreFav('bus:b', i); expect(getFavs()).toEqual(['bus:c', 'bus:b', 'bus:a'])
    restoreFav('bus:b', 0); expect(getFavs()).toHaveLength(3)
    expect(removeFav('bus:nope')).toBe(-1)
  })
  it('has no cap', () => {
    for (let i = 0; i < 40; i++) toggleFav('bus', 'u' + i)
    expect(getFavs()).toHaveLength(40)
  })
  it('picks the nearest favourites, ties by recency, no position by recency', () => {
    const at = (id: string, lat: number, lon: number) => ({ id, item: { lat, lon } })
    const list = [at('a', 41.70, -0.88), at('b', 41.66, -0.88), at('c', 41.66, -0.88), at('d', 41.60, -0.88)] // recency order a b c d
    const ids = (x: { id: string }[]) => x.map(f => f.id)
    expect(ids(nearestFavs(list, [41.661, -0.88], 2))).toEqual(['b', 'c'])
    expect(ids(nearestFavs(list, [41.59, -0.88], 2))).toEqual(['d', 'b'])
    expect(ids(nearestFavs(list, null, 2))).toEqual(['a', 'b'])
  })
  it('splits a key', () => expect(splitFav(favKey('bus', 'u688'))).toEqual(['bus', 'u688']))
  it('reads saved text safely', () => {
    expect(parseFavs(null)).toEqual([])
    expect(parseFavs('nonsense')).toEqual([])
    expect(parseFavs('{"a":1}')).toEqual([])
    expect(parseFavs('["bus:u1","bus:u1",3,"bad"]')).toEqual(['bus:u1'])
  })
  it('keeps a copy of a saved pharmacy, without any duty fields', () => {
    const it = { id: 'p1', part: 'city' as const, type: 'pharmacy', name: 'Farmacia X', addr: 'Calle 1', phone: '976', lat: 41.6, lon: -0.9, duty: '24 h', sector: 'S' }
    toggleFav('pharmacy', 'p1', it)
    const s = getSnap('pharmacy:p1')
    expect(s).toMatchObject({ id: 'p1', type: 'pharmacy', name: 'Farmacia X', addr: 'Calle 1', lat: 41.6 })
    expect(s?.duty).toBeUndefined()
    expect(getSnap('pharmacy:nope')).toBeNull()
  })
  it('keeps labels in their own map, trimmed and capped; empty clears', () => {
    setLabel('bus:a', '  Home   stop '); expect(getLabels()['bus:a']).toBe('Home stop')
    setLabel('bus:a', 'x'.repeat(50)); expect(getLabels()['bus:a']).toHaveLength(LABEL_MAX)
    expect(getFavs()).not.toContain('bus:a') // the key list is untouched
    setLabel('bus:a', '   '); expect(getLabels()['bus:a']).toBeUndefined()
    expect(cleanLabel('  a  b ')).toBe('a b')
  })
  it('reads saved labels safely', () => {
    expect(parseLabels(null)).toEqual({})
    expect(parseLabels('nope')).toEqual({})
    expect(parseLabels('[1]')).toEqual({})
    expect(parseLabels('{"bus:a":" Home ","bus:b":3,"bus:c":"  "}')).toEqual({ 'bus:a': 'Home' })
  })
  it('shows the label instead of the name', () => { expect(favTitle('Plaza', 'Home')).toBe('Home'); expect(favTitle('Plaza', undefined)).toBe('Plaza'); expect(favTitle('Plaza', '')).toBe('Plaza') })
  it('splits stops from places', () => {
    const l = ['bus', 'tram', 'cercanias', 'libraries', 'toilets'].map(id => ({ layer: { id } }))
    const ids = (x: typeof l) => x.map(f => f.layer.id)
    expect(ids(filterKind(l, 'stops'))).toEqual(['bus', 'tram', 'cercanias'])
    expect(ids(filterKind(l, 'places'))).toEqual(['libraries', 'toilets'])
    expect(filterKind(l, 'all')).toHaveLength(5)
    expect(isStopLayer('bizi')).toBe(false)
  })
  it('orders every favourite nearest first', () => {
    const at = (id: string, lat: number) => ({ id, item: { lat, lon: -0.88 } })
    expect(nearestFavs([at('a', 41.70), at('b', 41.60), at('c', 41.66)], [41.66, -0.88], 3).map(f => f.id)).toEqual(['c', 'a', 'b'])
  })
})
