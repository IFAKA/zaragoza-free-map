import { describe, expect, it } from 'vitest'
import { DICT, initialLang } from './i18n'
import { LAYERS, ORDER } from '../layers'

// words that are the same in both languages on purpose (names, units, loan words)
const SAME = new Set(['subtitle', 'srcOsm', 'langEn', 'langEs', 'ssid', 'minWalk'])

describe('language', () => {
  it('is Spanish unless the user chose otherwise, whatever the browser says', () => {
    expect(initialLang()).toBe('es')
  })
  it('has every string in both languages, and Spanish is not left in English', () => {
    const keys = Object.keys(DICT.en)
    expect(Object.keys(DICT.es).sort()).toEqual(keys.sort())
    for (const k of keys) {
      expect(DICT.es[k as keyof typeof DICT.es].trim(), k).not.toBe('')
      if (!SAME.has(k) && DICT.en[k as keyof typeof DICT.en].length > 12) expect(DICT.es[k as keyof typeof DICT.es], k).not.toBe(DICT.en[k as keyof typeof DICT.en])
    }
  })
  it('names every tab in Spanish', () => {
    for (const id of ORDER) expect(LAYERS[id].label.es.length, id).toBeGreaterThan(0)
    expect(DICT.es.settings).toBe('Ajustes')
  })
})
