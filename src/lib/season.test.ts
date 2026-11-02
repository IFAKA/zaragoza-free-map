import { describe, expect, it } from 'vitest'
import { seasonOf } from './season'
import { layerOrder } from '../layers'

describe('seasonOf (device date)', () => {
  it('1 Nov to 31 Mar is warm', () => {
    for (const d of ['2026-11-01', '2026-12-25', '2027-01-15', '2027-03-31']) expect(seasonOf(new Date(d + 'T12:00:00')), d).toBe('warm')
  })
  it('1 Jun to 30 Sep is cool', () => {
    for (const d of ['2026-06-01', '2026-07-20', '2026-09-30']) expect(seasonOf(new Date(d + 'T12:00:00')), d).toBe('cool')
  })
  it('April, May and October are neutral', () => {
    for (const d of ['2026-04-01', '2026-05-31', '2026-10-31']) expect(seasonOf(new Date(d + 'T12:00:00')), d).toBe('neutral')
  })
  it('the shelter tab comes first in the warm months and last otherwise', () => {
    expect(layerOrder(new Date('2026-12-01T12:00:00'))[0]).toBe('shelter')
    expect(layerOrder(new Date('2026-07-01T12:00:00')).at(-1)).toBe('shelter')
    expect(layerOrder(new Date('2026-12-01T12:00:00')).length).toBe(layerOrder(new Date('2026-07-01T12:00:00')).length)
  })
})
