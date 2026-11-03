import { describe, expect, it } from 'vitest'
import tram from '../data/tram.json'
import { tramDir, tramKey } from './tramdir'

const rows = tram.rows as unknown as Parameters<typeof tramDir>[2]
const lat = (name: string) => rows.find(r => tramKey(r[1]) === tramKey(name))![2]

describe('tram direction from the baked stops', () => {
  it('matches the city API names to stop names', () => {
    expect(tramKey('AVENIDA ACADEMIA')).toBe(tramKey('Avenida de la Academia'))
    expect(tramKey('MAGO DE OZ')).toBe(tramKey('Mago de Oz'))
    expect(tramKey('Un americano en París')).toBe(tramKey('UN AMERICANO EN PARIS'))
  })
  it('Mago de Oz is south of the centre and Avenida Academia north of it (real coordinates)', () => {
    const pilar = lat('Plaza del Pilar - Murallas')
    expect(lat('Mago de Oz')).toBeLessThan(pilar)
    expect(lat('Avenida de la Academia')).toBeGreaterThan(pilar)
  })
  it('gives north / south from any stop', () => {
    expect(tramDir('Mago De Oz', 'Plaza del Pilar - Murallas', rows)).toBe('s')
    expect(tramDir('Avenida Academia', 'Plaza del Pilar - Murallas', rows)).toBe('n')
    expect(tramDir('Mago De Oz', 'Argualas', rows)).toBe('s')
    expect(tramDir('Avenida Academia', 'Argualas', rows)).toBe('n')
    expect(tramDir('Mago De Oz', 'Parque Goya', rows)).toBe('s')
  })
  it('says nothing when it cannot tell', () => {
    expect(tramDir('Nowhere', 'Argualas', rows)).toBeNull()
    expect(tramDir('Argualas', 'Argualas', rows)).toBeNull()
    expect(tramDir('Mago De Oz', 'Unknown stop', rows)).toBeNull()
  })
})
