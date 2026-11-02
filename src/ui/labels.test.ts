import { describe, expect, it } from 'vitest'
import { fmtHours } from './labels'

describe('fmtHours', () => {
  it('turns OpenStreetMap hours into Spanish', () => {
    expect(fmtHours('es', 'Mo-Fr 08:30-21:30; Sa-Su off')).toBe('Lu-Vi 08:30-21:30; Sá-Do cerrado')
  })
  it('keeps English day names and spells out off', () => {
    expect(fmtHours('en', 'Mo-Fr 08:30-21:30; Sa-Su off; PH off')).toBe('Mo-Fr 08:30-21:30; Sa-Su closed; holidays closed')
  })
})
