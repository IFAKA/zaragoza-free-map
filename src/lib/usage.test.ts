import { describe, expect, it } from 'vitest'
import { bumpTap, parseTaps, rankByTaps } from './usage'

const D = ['toilets', 'tram', 'wifi'] as const

describe('rankByTaps', () => {
  it('a new visitor gets the default order', () => expect(rankByTaps(D, {})).toEqual(['toilets', 'tram', 'wifi']))
  it('puts the most used first', () => expect(rankByTaps(D, { wifi: 5, tram: 2 })).toEqual(['wifi', 'tram', 'toilets']))
  it('ties keep the default order', () => {
    expect(rankByTaps(D, { tram: 3, wifi: 3 })).toEqual(['tram', 'wifi', 'toilets'])
    expect(rankByTaps(D, { toilets: 1, tram: 1, wifi: 1 })).toEqual(['toilets', 'tram', 'wifi'])
  })
  it('ignores ids it does not know', () => expect(rankByTaps(D, { bus: 99 })).toEqual(['toilets', 'tram', 'wifi']))
})

describe('taps storage', () => {
  it('counts up', () => expect(bumpTap(bumpTap({}, 'tram'), 'tram')).toEqual({ tram: 2 }))
  it('reads damaged data as nothing', () => {
    for (const bad of [null, '', '{', 'null', '[1]', '"x"']) expect(parseTaps(bad)).toEqual({})
    expect(parseTaps('{"tram":3,"bus":"x","wifi":-1,"a":1.9}')).toEqual({ tram: 3, a: 1 })
  })
})
