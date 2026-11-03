import { describe, expect, it } from 'vitest'
import { bearingAt } from './pathBearing'

describe('bearingAt', () => {
  it('gives the way the route runs at the point nearest the stop, not the way to a far point', () => {
    const path: [number, number][] = [[41.0, -0.9], [41.0, -0.89], [41.01, -0.89]] // east, then north
    expect(Math.round(bearingAt([path], [41.0001, -0.895])!)).toBe(90)
    expect(Math.round(bearingAt([path], [41.005, -0.8899])!)).toBe(0)
  })
  it('is null without a line', () => expect(bearingAt([], [41, -0.9])).toBeNull())
})
