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
  it('every layer is listed once, goal by goal (Now, Getting around, Connect)', () => {
    const warm = layerOrder(new Date('2026-12-01T12:00:00')), hot = layerOrder(new Date('2026-07-01T12:00:00'))
    expect(hot).toEqual(['toilets', 'water', 'pharmacy', 'shelter', 'bus', 'bizi', 'wifi', 'charge', 'libraries'])
    expect(warm).toEqual(['toilets', 'water', 'shelter', 'pharmacy', 'bus', 'bizi', 'wifi', 'charge', 'libraries'])
    for (const o of [warm, hot]) { expect(new Set(o).size).toBe(9); expect(o).not.toContain('racks') }
  })
  it('a first-time visitor always lands on toilets, in any season', () => {
    expect(defaultLayer()).toBe('toilets')
  })
  it('the shelter chip is 3rd in Now in the warm months and last in Now otherwise', () => {
    expect(layerOrder(new Date('2026-12-01T12:00:00'))[2]).toBe('shelter')
    expect(layerOrder(new Date('2026-07-01T12:00:00'))[3]).toBe('shelter')
  })
})
