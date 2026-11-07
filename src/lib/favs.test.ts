import { beforeEach, describe, expect, it } from 'vitest'
import { FAV_MAX, canFav, favKey, getFavs, isFav, parseFavs, splitFav, toggleFav } from './favs'

describe('favs', () => {
  beforeEach(() => { for (const k of [...getFavs()]) { const [l, id] = splitFav(k); toggleFav(l, id) } })
  it('adds, finds and removes a place', () => {
    expect(toggleFav('bus', 'u688')).toBe(true)
    expect(isFav('bus', 'u688')).toBe(true)
    expect(isFav('tram', 'u688')).toBe(false) // ids are per layer
    toggleFav('bus', 'u688')
    expect(isFav('bus', 'u688')).toBe(false)
  })
  it('keeps the order of saving', () => { toggleFav('tram', 't1'); toggleFav('bus', 'u2'); expect(getFavs()).toEqual(['tram:t1', 'bus:u2']) })
  it('stops at the cap', () => {
    for (let i = 0; i < FAV_MAX; i++) expect(toggleFav('bus', 'u' + i)).toBe(true)
    expect(toggleFav('bus', 'ux')).toBe(false)
    expect(getFavs()).toHaveLength(FAV_MAX)
  })
  it('splits a key', () => expect(splitFav(favKey('bus', 'u688'))).toEqual(['bus', 'u688']))
  it('reads saved text safely', () => {
    expect(parseFavs(null)).toEqual([])
    expect(parseFavs('nonsense')).toEqual([])
    expect(parseFavs('{"a":1}')).toEqual([])
    expect(parseFavs('["bus:u1","bus:u1",3,"bad"]')).toEqual(['bus:u1'])
  })
  it('never stars fountains or live pharmacies', () => {
    expect(canFav({ id: 'water' }, { type: 'fountain' })).toBe(false)
    expect(canFav({ id: 'pharmacy', live: true }, { type: 'pharmacy' })).toBe(false)
    expect(canFav({ id: 'bus' }, { type: 'bus' })).toBe(true)
  })
})
