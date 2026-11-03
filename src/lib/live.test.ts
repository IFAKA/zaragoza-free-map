import { beforeEach, describe, expect, it } from 'vitest'
import { BAD_STOP_MS, busAlternatives, clearBad, loadBus, loadTram, markBad, parseBus, parseMins, parseTram, pickNotice, prettyDest } from './live'

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

describe('bus fallback to a neighbour stop', () => {
  const ok = { destinos: [{ linea: '35', destino: 'CENTRO', primero: '4 minutos.', segundo: '' }] }
  const empty = { destinos: [] }
  const alts = [{ stop: '10', name: 'Neighbour A', d: 120 }, { stop: '11', name: 'Neighbour B', d: 200 }, { stop: '12', name: 'Neighbour C', d: 250 }]
  const bad = () => Promise.reject(new Error('HTTP 400'))
  const mk = (answers: Record<string, unknown>) => {
    const calls: string[] = []
    const get = (url: string) => { const id = /tuzsa-(\d+)/.exec(url)![1]; calls.push(id); const a = answers[id]; return a instanceof Function ? a() : Promise.resolve(a) }
    return { calls, get }
  }
  beforeEach(() => clearBad())

  it('uses one request when the stop works', async () => {
    const { calls, get } = mk({ 1: ok })
    const l = await loadBus('1', undefined, get, () => 0, alts)
    expect(calls).toEqual(['1']); expect(l?.via).toBeUndefined()
  })
  it('asks the next stop when the first fails, and labels it', async () => {
    const { calls, get } = mk({ 1: bad, 10: ok })
    const l = await loadBus('1', undefined, get, () => 0, alts)
    expect(calls).toEqual(['1', '10']); expect(l?.via).toEqual({ name: 'Neighbour A', d: 120 }); expect(l?.arrivals[0].line).toBe('35')
  })
  it('also tries a neighbour when the stop has no arrivals', async () => {
    const { get } = mk({ 1: empty, 10: bad, 11: ok })
    expect((await loadBus('1', undefined, get, () => 0, alts))?.via?.name).toBe('Neighbour B')
  })
  it('never makes more than 3 requests and returns null when all fail', async () => {
    const { calls, get } = mk({ 1: bad, 10: bad, 11: bad, 12: ok })
    expect(await loadBus('1', undefined, get, () => 0, alts)).toBeNull()
    expect(calls).toEqual(['1', '10', '11'])
  })
  it('keeps the empty answer of the stop when nobody has arrivals', async () => {
    const { get } = mk({ 1: empty, 10: empty, 11: empty })
    const l = await loadBus('1', undefined, get, () => 0, alts)
    expect(l?.arrivals).toEqual([]); expect(l?.via).toBeUndefined()
  })
  it('stops when aborted', async () => {
    const ctl = new AbortController(); ctl.abort()
    const { calls, get } = mk({ 1: bad, 10: ok })
    expect(await loadBus('1', ctl.signal, get, () => 0, alts)).toBeNull(); expect(calls).toEqual([])
  })
  it('remembers failed stops for 10 minutes', async () => {
    const t = { v: 0 }
    const { calls, get } = mk({ 1: bad, 10: ok })
    await loadBus('1', undefined, get, () => t.v, alts)
    t.v = 30_000
    await loadBus('1', undefined, get, () => t.v, alts) // stop 1 is skipped now
    expect(calls).toEqual(['1', '10', '10'])
    t.v = BAD_STOP_MS + 1
    await loadBus('1', undefined, get, () => t.v, alts)
    expect(calls).toEqual(['1', '10', '10', '1', '10'])
  })
  it('does not remember a timeout or offline as a bad stop', async () => {
    const { calls, get } = mk({ 1: () => Promise.reject(new Error('Failed to fetch')) })
    await loadBus('1', undefined, get, () => 0, []); await loadBus('1', undefined, get, () => 0, [])
    expect(calls).toEqual(['1', '1'])
  })
  it('skips known-bad neighbours without using a request', async () => {
    markBad('10', 0)
    const { calls, get } = mk({ 1: bad, 11: ok, 12: ok })
    expect((await loadBus('1', undefined, get, () => 0, alts))?.via?.name).toBe('Neighbour B')
    expect(calls).toEqual(['1', '11'])
  })
})

describe('busAlternatives', () => {
  const rows = [
    ['263', 'Av. Valencia 38', '35,38,N4,41', 41.6463, -0.897181],
    ['264', 'Av. Valencia 39', '35,38', 41.6464, -0.8975],
    ['300', 'Other street', '99', 41.6463, -0.8972],
    ['301', 'Far', '35', 41.7, -0.9],
    ['1', 'Mago de Oz', 'TRA', 41.62497, -0.936381],
    ['r4', 'Rural', '35', 41.6464, -0.8976],
  ] as const
  it('picks near stops that share a line, nearest first, skipping rural and itself', () => {
    const a = busAlternatives('263', '35,38,N4,41', [41.6463, -0.897181], [41.6463, -0.897181], rows)
    expect(a.map(x => x.stop)).toEqual(['264'])
    expect(a[0].d).toBeGreaterThan(0)
  })
})
