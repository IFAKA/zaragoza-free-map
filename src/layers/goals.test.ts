import { describe, expect, it } from 'vitest'
import { GOALS, GOAL_IDS, MAX_SERVICES, goalById, goalOf, goalServices, serviceFor } from './goals'
import { LAYERS } from '.'

const winter = new Date(2026, 0, 15), summer = new Date(2026, 7, 15), spring = new Date(2026, 3, 15)

describe('goals', () => {
  it('every layer is in exactly one goal, and every goal service is a layer', () => {
    const all = GOALS.flatMap(g => g.layers)
    expect(new Set(all).size).toBe(all.length)
    expect([...all].sort()).toEqual(Object.keys(LAYERS).sort())
  })
  it('has no more than 4 services per goal and fits a 3-column bar', () => {
    for (const g of GOALS) expect(g.layers.length).toBeLessThanOrEqual(MAX_SERVICES)
    expect(GOAL_IDS).toEqual(['now', 'move', 'connect'])
  })
  it('every service is reachable in at most 2 taps (a goal tap, then a chip)', () => {
    expect(GOALS.flatMap(g => goalServices(g)).length).toBe(Object.keys(LAYERS).length)
  })
  it('finds the goal of a service', () => {
    expect(goalOf('bizi').id).toBe('move'); expect(goalOf('libraries').id).toBe('connect'); expect(goalOf('toilets').id).toBe('now')
  })
  it('shelter is 3rd in Ahora from November to March and last otherwise', () => {
    expect(goalServices(goalById('now'), winter)).toEqual(['toilets', 'water', 'shelter', 'pharmacy'])
    expect(goalServices(goalById('now'), summer)).toEqual(['toilets', 'water', 'pharmacy', 'shelter'])
    expect(goalServices(goalById('now'), spring)).toEqual(['toilets', 'water', 'pharmacy', 'shelter'])
    expect(goalServices(goalById('move'), winter)).toEqual(['bus', 'bizi'])
  })
  it('a goal opens on the service last used there, else its first', () => {
    expect(serviceFor(goalById('now'), {})).toBe('toilets')
    expect(serviceFor(goalById('connect'), { connect: 'charge' })).toBe('charge')
    expect(serviceFor(goalById('connect'), { connect: 'bus' })).toBe('wifi') // a remembered service that left the goal is ignored
  })
})
