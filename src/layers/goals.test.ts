import { describe, expect, it } from 'vitest'
import { SERVICES, serviceOrder } from './goals'
import { LAYERS } from '.'

const winter = new Date(2026, 0, 15), summer = new Date(2026, 7, 15), spring = new Date(2026, 3, 15)

describe('services', () => {
  it('every layer is a service exactly once, and every service is a layer', () => {
    expect(new Set(SERVICES).size).toBe(SERVICES.length)
    expect([...SERVICES].sort()).toEqual(Object.keys(LAYERS).sort())
  })
  it('the default order is Aseos, Agua, Farmacias, Refugio, Bus, Tranvía, Bizi, Cercanías, Wifi, Charge, Libraries, Post', () => {
    expect(serviceOrder(summer)).toEqual(['toilets', 'water', 'pharmacy', 'shelter', 'bus', 'tram', 'bizi', 'cercanias', 'wifi', 'charge', 'libraries', 'post'])
    expect(serviceOrder(spring)).toEqual(serviceOrder(summer))
  })
  it('shelter is 3rd from November to March and 4th otherwise', () => {
    expect(serviceOrder(winter).slice(0, 4)).toEqual(['toilets', 'water', 'shelter', 'pharmacy'])
    expect(serviceOrder(winter)).toHaveLength(SERVICES.length)
    expect(serviceOrder(summer)[3]).toBe('shelter')
  })
})
