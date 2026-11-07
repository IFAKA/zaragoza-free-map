import { beforeEach, describe, expect, it } from 'vitest'
import { FAV_MAX, canFav, favKey, getFavs, isFav, parseFavs, removeFav, restoreFav, splitFav, toggleFav, touchFav } from './favs'

describe('favs', () => {
  beforeEach(() => { for (const k of [...getFavs()]) { const [l, id] = splitFav(k); toggleFav(l, id) } })
  it('adds, finds and removes a place', () => {
    expect(toggleFav('bus', 'u688')).toBe(true)
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
