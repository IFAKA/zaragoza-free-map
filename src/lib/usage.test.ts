import { describe, expect, it } from 'vitest'
import { bumpTap, parseLast, parseTaps, rankByTaps } from './usage'

const D = ['now', 'move', 'connect'] as const

describe('rankByTaps', () => {
  it('a new visitor gets the default order', () => expect(rankByTaps(D, {})).toEqual(['now', 'move', 'connect']))
  it('puts the most used first', () => expect(rankByTaps(D, { connect: 5, move: 2 })).toEqual(['connect', 'move', 'now']))
  it('ties keep the default order', () => {
    expect(rankByTaps(D, { move: 3, connect: 3 })).toEqual(['move', 'connect', 'now'])
    expect(rankByTaps(D, { now: 1, move: 1, connect: 1 })).toEqual(['now', 'move', 'connect'])
  })
  it('ignores ids it does not know', () => expect(rankByTaps(D, { tram: 99 })).toEqual(['now', 'move', 'connect']))
})

describe('taps storage', () => {
  it('counts up', () => expect(bumpTap(bumpTap({}, 'move'), 'move')).toEqual({ move: 2 }))
  it('reads damaged data as nothing', () => {
    for (const bad of [null, '', '{', 'null', '[1]', '"x"']) expect(parseTaps(bad)).toEqual({})
    expect(parseTaps('{"now":3,"move":"x","connect":-1,"a":1.9}')).toEqual({ now: 3, a: 1 })
  })
  it('reads the last-used services', () => {
    expect(parseLast('{"now":"water","move":5}')).toEqual({ now: 'water' })
    expect(parseLast('nope')).toEqual({})
  })
})
