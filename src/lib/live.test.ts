import { describe, expect, it } from 'vitest'
import { loadBus, loadTram, parseBus, parseMins, parseTram, pickNotice, prettyDest } from './live'

describe('parseMins', () => {
  it('reads minutes from the city text', () => {
    expect(parseMins('3 minutos.')).toBe(3)
    expect(parseMins('27 minutos.')).toBe(27)
    expect(parseMins('1 minuto.')).toBe(1)
    expect(parseMins(5)).toBe(5)
    expect(parseMins('Ahora')).toBe(0)
  })
  it('skips values with no estimate', () => {
    for (const v of ['Sin estimacion', 'Sin estimación.', '', undefined, null, NaN, -1]) expect(parseMins(v)).toBeNull()
  })
})

describe('prettyDest', () => {
  it('title-cases and strips trailing punctuation', () => {
    expect(prettyDest('VALDESPARTERA,')).toBe('Valdespartera')
    expect(prettyDest('PLAZA DEL PILAR.')).toBe('Plaza del Pilar')
  })
})

describe('parseBus', () => {
  it('builds rows with up to two times', () => {
    const l = parseBus({ destinos: [{ linea: '56', destino: 'VALDESPARTERA,', primero: '3 minutos.', segundo: '27 minutos.' }, { linea: '34', destino: 'CENTRO', primero: '1 minuto.', segundo: 'Sin estimacion' }] }, 100)!
    expect(l.arrivals).toEqual([{ line: '34', dest: 'Centro', mins: [1] }, { line: '56', dest: 'Valdespartera', mins: [3, 27] }])
    expect(l.at).toBe(100)
  })
  it('drops a line with no estimate at all', () => {
    expect(parseBus({ destinos: [{ linea: '56', destino: 'X', primero: 'Sin estimacion', segundo: '' }] }, 1)!.arrivals).toEqual([])
  })
  it('handles missing or empty destinos', () => {
    expect(parseBus({ destinos: [] }, 1)!.arrivals).toEqual([])
    expect(parseBus({ lastUpdated: 'x' }, 1)).toBeNull()
    expect(parseBus(null, 1)).toBeNull()
  })
})

describe('tram', () => {
  const msgs = ['.www.tranviasdezaragoza.es     Telefono Atencion al Cliente: 900 920 700', '.PUEDE CONSULTAR EL NIVEL DE OCUPACION EN TIEMPO REAL CON EL CODIGO QR DE PARADA.', '03/11 HUELGA TRABAJADORES/AS. SERVICIOS MINIMOS DEL 90% CONSULTE TELEINDICADOR DE PARADA']
  it('picks the service notice and ignores the boilerplate', () => {
    expect(pickNotice(msgs)).toBe('03/11 Huelga trabajadores/as. Servicios minimos del 90% consulte teleindicador de parada')
    expect(pickNotice(msgs.slice(0, 2))).toBeNull()
    expect(pickNotice(undefined)).toBeNull()
  })
  it('merges both platforms, soonest first', () => {
    const a = { destinos: [{ linea: 'L1', destino: 'MAGO DE OZ', minutos: 3 }, { linea: 'L1', destino: 'MAGO DE OZ', minutos: 8 }], mensajes: msgs }
    const b = { destinos: [{ linea: 'L1', destino: 'PARQUE GOYA', minutos: 2 }] }
    const l = parseTram([a, null, b], 5)!
    expect(l.arrivals).toEqual([{ line: 'L1', dest: 'Parque Goya', mins: [2] }, { line: 'L1', dest: 'Mago de Oz', mins: [3, 8] }])
    expect(l.notice).toMatch(/^03\/11 Huelga/)
  })
  it('is null when no platform answered', () => { expect(parseTram([null, { status: 404 }], 1)).toBeNull() })
})

describe('loaders', () => {
  it('use the stop number in the URL', async () => {
    let url = ''
    await loadBus('688', undefined, async u => { url = u; return { destinos: [] } })
    expect(url).toMatch(/poste-autobus\/tuzsa-688\.json$/)
  })
  it('give null on 404, errors and rural stops', async () => {
    expect(await loadBus('999999', undefined, async () => ({ status: 404 }))).toBeNull()
    expect(await loadBus('688', undefined, async () => { throw new Error('HTTP 404') })).toBeNull()
    let called = false
    expect(await loadBus('r4', undefined, async () => { called = true; return {} })).toBeNull()
    expect(called).toBe(false)
    expect(await loadTram(['101'], undefined, async () => { throw new Error('x') })).toBeNull()
    expect(await loadTram([])).toBeNull()
  })
  it('tram keeps the platform that answered', async () => {
    const l = await loadTram(['101', '102'], undefined, async u => { if (u.includes('102')) throw new Error('x'); return { destinos: [{ linea: 'L1', destino: 'A', minutos: 4 }] } })
    expect(l!.arrivals).toHaveLength(1)
  })
})
