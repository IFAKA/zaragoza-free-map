import { describe, expect, it } from 'vitest'
import { seasonOf } from './season'
import { defaultLayer, layerOrder } from '../layers'

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
  it('every layer is one tab, once; bus and pharmacy come first (after shelter in the cold months)', () => {
    const warm = layerOrder(new Date('2026-12-01T12:00:00')), hot = layerOrder(new Date('2026-07-01T12:00:00'))
    expect(warm.slice(0, 3)).toEqual(['shelter', 'bus', 'pharmacy'])
    expect(hot.slice(0, 2)).toEqual(['bus', 'pharmacy'])
    for (const o of [warm, hot]) { expect(new Set(o).size).toBe(10); expect(o).toHaveLength(10) }
  })
  it('the default layer stays toilets, or shelter in the cold months', () => {
    expect(defaultLayer(new Date('2026-07-01T12:00:00'))).toBe('toilets')
    expect(defaultLayer(new Date('2026-12-01T12:00:00'))).toBe('shelter')
  })
  it('the shelter tab comes first in the warm months and last otherwise', () => {
    expect(layerOrder(new Date('2026-12-01T12:00:00'))[0]).toBe('shelter')
    expect(layerOrder(new Date('2026-07-01T12:00:00')).at(-1)).toBe('shelter')
    expect(layerOrder(new Date('2026-12-01T12:00:00')).length).toBe(layerOrder(new Date('2026-07-01T12:00:00')).length)
  })
})
