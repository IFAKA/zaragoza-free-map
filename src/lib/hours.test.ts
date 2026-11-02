import { describe, expect, it } from 'vitest'
import { openState, parseHours } from './hours'

const H = (h: number, m = 0) => h * 60 + m
describe('openState', () => {
  const s = 'Mo-Fr 09:00-14:00; Sa 10:00-13:00'
  it('weekday inside and outside hours', () => {
    expect(openState(s, 0, H(10))).toBe(true)
    expect(openState(s, 4, H(14))).toBe(false)
    expect(openState(s, 2, H(8, 59))).toBe(false)
  })
  it('saturday and unlisted sunday', () => {
    expect(openState(s, 5, H(11))).toBe(true)
    expect(openState(s, 5, H(13, 30))).toBe(false)
    expect(openState(s, 6, H(11))).toBe(false)
  })
  it('24/7', () => { expect(openState('24/7', 3, H(3))).toBe(true) })
  it('split day, comma days, off, later rule wins', () => {
    const x = 'Mo,We 09:00-13:00,17:00-20:00; Tu off'
    expect(openState(x, 0, H(18))).toBe(true)
    expect(openState(x, 0, H(15))).toBe(false)
    expect(openState(x, 1, H(10))).toBe(false)
    expect(openState('Mo-Su 08:00-20:00; We off', 2, H(10))).toBe(false)
  })
  it('overnight spills into next day', () => {
    const x = 'Fr 22:00-02:00'
    expect(openState(x, 4, H(23))).toBe(true)
    expect(openState(x, 5, H(1))).toBe(true)
    expect(openState(x, 5, H(3))).toBe(false)
  })
  it('rule without days applies every day', () => { expect(openState('08:00-22:00', 6, H(9))).toBe(true) })
  it('unknown formats give null, never false', () => {
    for (const x of ['Mo-Fr sunrise-sunset', 'PH off', 'Mo-Fr 09:00-14:00; PH off', 'Jan-Mar 09:00-10:00', 'by appointment', '', undefined]) {
      expect(openState(x, 0, H(10))).toBeNull()
    }
  })
  it('parseHours rejects bad times', () => { expect(parseHours('Mo 25:00-26:00')).toBeNull() })
})
