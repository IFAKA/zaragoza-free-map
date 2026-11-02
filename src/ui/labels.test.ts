import { describe, expect, it } from 'vitest'
import { biziLine, fmtHours } from './labels'
import { DICT } from '../lib/i18n'

describe('fmtHours', () => {
  it('turns OpenStreetMap hours into Spanish', () => {
    expect(fmtHours('es', 'Mo-Fr 08:30-21:30; Sa-Su off')).toBe('Lu-Vi 08:30-21:30; Sá-Do cerrado')
  })
  it('keeps English day names and spells out off', () => {
    expect(fmtHours('en', 'Mo-Fr 08:30-21:30; Sa-Su off; PH off')).toBe('Mo-Fr 08:30-21:30; Sa-Su closed; holidays closed')
  })
})

describe('biziLine', () => {
  const en = (k: keyof typeof DICT.en) => DICT.en[k]
  it('writes bikes and free docks, singular and plural', () => {
    expect(biziLine(en, { bikes: 5, docks: 12, ebikes: 2 })).toBe('5 bikes · 12 free docks')
    expect(biziLine(en, { bikes: 1, docks: 1, ebikes: 0 })).toBe('1 bike · 1 free dock')
    expect(biziLine(en, { bikes: 0, docks: 0, ebikes: 0 })).toBe('0 bikes · 0 free docks')
  })
  it('the card version names the electric ones, only when there are some', () => {
    expect(biziLine(en, { bikes: 5, docks: 12, ebikes: 2 }, true)).toBe('5 bikes (2 electric) · 12 free docks')
    expect(biziLine(en, { bikes: 5, docks: 12, ebikes: 0 }, true)).toBe('5 bikes · 12 free docks')
  })
  it('is empty without live counts', () => expect(biziLine(en, {})).toBe(''))
})
