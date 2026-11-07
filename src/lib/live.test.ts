import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeBad, encodeBad, probeStop } from './busbad'
import { BAD_STOP_MS, busAlternatives, clearBad, loadBus, loadTram, markBad, onlyLine, parseBus, routeAlternatives, towardEnd, parseMins, parseTram, pickNotice, prettyDest, setBakedBad } from './live'

// the real baked list holds stops these tests use (263, 1): tests set their own
const baked = vi.hoisted(() => ({ bad: [] as (number | [number, number])[] }))
vi.mock('../data/lazy', () => ({ loadBusBad: () => Promise.resolve({ src: 'test', updated: null, total: 0, bad: baked.bad }) }))

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

describe('no-data answers (HTTP 400 / 404) are remembered', () => {
  beforeEach(() => clearBad())
  const ok = { destinos: [{ linea: 'L1', destino: 'A', minutos: 4 }] }
  it('tram: a platform that answered 400 is not asked again for 10 minutes', async () => {
    let t = 1_000, n = 0
    const get = async (u: string) => { n++; if (u.includes('1101')) throw new Error('HTTP 400'); return ok }
    const a = await loadTram(['1101', '1102'], undefined, get, () => t)
    expect(a!.arrivals).toHaveLength(1)
    expect(n).toBe(2)
    t += 30_000
    await loadTram(['1101', '1102'], undefined, get, () => t)
    expect(n).toBe(3) // only 1102 was asked again
    t += BAD_STOP_MS
    await loadTram(['1101', '1102'], undefined, get, () => t)
    expect(n).toBe(5) // after 10 minutes both are asked
  })
  it('tram: 404 counts too, a timeout or offline does not', async () => {
    let n = 0
    await loadTram(['1'], undefined, async () => { n++; throw new Error('HTTP 404') }, () => 5)
    await loadTram(['1'], undefined, async () => { n++; throw new Error('HTTP 404') }, () => 6)
    expect(n).toBe(1)
    clearBad()
    await loadTram(['2'], undefined, async () => { n++; throw new Error('timeout') }, () => 5)
    await loadTram(['2'], undefined, async () => { n++; throw new Error('timeout') }, () => 6)
    expect(n).toBe(3)
  })
  it('tram: every platform bad gives null without a request', async () => {
    let n = 0
    const get = async () => { n++; throw new Error('HTTP 400') }
    expect(await loadTram(['1101', '1102'], undefined, get, () => 1)).toBeNull()
    expect(await loadTram(['1101', '1102'], undefined, get, () => 2)).toBeNull()
    expect(n).toBe(2)
  })
  it('bus: a stop that answered 400 is not asked again for 10 minutes', async () => {
    let t = 1_000, n = 0
    const get = async () => { n++; throw new Error('HTTP 400') }
    expect(await loadBus('479', undefined, get, () => t)).toBeNull()
    t += 30_000
    expect(await loadBus('479', undefined, get, () => t)).toBeNull()
    expect(n).toBe(1)
    t += BAD_STOP_MS
    await loadBus('479', undefined, get, () => t)
    expect(n).toBe(2)
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
    expect(calls).toEqual(['1', '10']); expect(l?.via).toEqual({ name: 'Neighbour A', d: 120, stop: '10' }); expect(l?.arrivals[0].line).toBe('35')
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

describe('route view: one line at a stop', () => {
  const two = { destinos: [
    { linea: '35', destino: 'SEMINARIO', primero: '4 minutos.', segundo: '12 minutos.' },
    { linea: '40', destino: 'CENTRO', primero: '1 minuto.', segundo: '' },
    { linea: '35', destino: 'PLAZA ARAGON', primero: '9 minutos.', segundo: '' },
  ] }
  const mk = (answers: Record<string, unknown>) => { const calls: string[] = []; return { calls, get: (url: string) => { const id = /tuzsa-(\d+)/.exec(url)![1]; calls.push(id); return Promise.resolve(answers[id]) } } }
  beforeEach(() => clearBad())

  it('keeps only the arrivals of the chosen line', async () => {
    const l = await loadBus('1', undefined, async () => two, () => 0, [], '35')
    expect(l?.arrivals.map(a => a.line)).toEqual(['35', '35'])
    expect(l?.arrivals[0].mins).toEqual([4, 12])
    expect((await loadBus('1', undefined, async () => two, () => 0, []))?.arrivals).toHaveLength(3)
  })
  it('a stop that serves other lines but not this one counts as empty: the neighbour is asked', async () => {
    const only40 = { destinos: [{ linea: '40', destino: 'CENTRO', primero: '1 minuto.', segundo: '' }] }
    const { calls, get } = mk({ 1: only40, 10: two })
    const l = await loadBus('1', undefined, get, () => 0, [{ stop: '10', name: 'Next door', d: 90 }], '35')
    expect(calls).toEqual(['1', '10'])
    expect(l?.via?.name).toBe('Next door')
    expect(l?.arrivals.every(a => a.line === '35')).toBe(true)
  })
  it('onlyLine without a line leaves the answer alone, and null stays null', () => {
    const l = parseBus(two, 0)
    expect(onlyLine(l)).toBe(l)
    expect(onlyLine(null, '35')).toBeNull()
  })
  it('towardEnd: the destination that names the end of the direction wins, else everything stays', () => {
    const a = onlyLine(parseBus(two, 0), '35')!.arrivals
    expect(towardEnd(a, 'Seminario').map(x => x.dest)).toEqual(['Seminario'])
    expect(towardEnd(a, 'Plaza de Aragón').map(x => x.dest)).toEqual(['Plaza Aragon'])
    expect(towardEnd(a, 'Oliver')).toHaveLength(2)
    expect(towardEnd(a, undefined)).toHaveLength(2)
  })
})

describe('route view: other stops of the same line', () => {
  const ok = { destinos: [{ linea: '35', destino: 'SEMINARIO', primero: '4 minutos.', segundo: '15 minutos.' }] }
  const bad = () => Promise.reject(new Error('HTTP 400'))
  const order = ['261', '262', '263', '264', '265', '266'].map((post, i) => ({ post, name: 'Stop ' + post, lat: 41.64 + i * 0.001, lon: -0.89 }))
  const alts = routeAlternatives(order, 2, [41.642, -0.89])
  const mk = (answers: Record<string, unknown>) => {
    const calls: string[] = []
    const get = (url: string) => { const id = /tuzsa-(\d+)/.exec(url)![1]; calls.push(id); const a = answers[id]; return a instanceof Function ? a() : Promise.resolve(a) }
    return { calls, get }
  }
  beforeEach(() => clearBad())

  it('orders the stops: before first, then after, nearest along the route first', () => {
    expect(alts.map(a => a.stop + a.side![0])).toEqual(['262b', '261b', '264a', '265a', '266a'])
  })
  it('own stop 400, previous stop answers: shown as a stop before', async () => {
    const { calls, get } = mk({ 263: bad, 262: ok })
    const l = await loadBus('263', undefined, get, () => 0, alts, '35')
    expect(calls).toEqual(['263', '262'])
    expect(l?.via).toMatchObject({ name: 'Stop 262', stop: '262', side: 'before' })
    expect(l?.arrivals[0].mins).toEqual([4, 15])
  })
  it('own stop 400, previous stops bad, the next one answers', async () => {
    const { calls, get } = mk({ 263: bad, 262: bad, 261: bad, 264: ok })
    const l = await loadBus('263', undefined, get, () => 0, alts, '35')
    expect(calls).toEqual(['263', '262', '261', '264'])
    expect(l?.via?.side).toBe('after')
  })
  it('a previous stop already known as bad costs no request', async () => {
    markBad('262', 0)
    const { calls, get } = mk({ 263: bad, 261: ok })
    const l = await loadBus('263', undefined, get, () => 1000, alts, '35')
    expect(calls).toEqual(['263', '261']); expect(l?.via?.stop).toBe('261')
  })
  it('all bad: at most 3 extra requests, then the plain empty result', async () => {
    const { calls, get } = mk({ 263: bad, 262: bad, 261: bad, 264: bad, 265: bad })
    expect(await loadBus('263', undefined, get, () => 0, alts, '35')).toBeNull()
    expect(calls).toEqual(['263', '262', '261', '264'])
  })
  it('no stop of the route known: no alternatives', () => { expect(routeAlternatives(order, -1, [0, 0])).toEqual([]) })
})

describe('baked bad stops (build-time probe)', () => {
  const ok = { destinos: [{ linea: '35', destino: 'SEMINARIO', primero: '4 minutos.', segundo: '' }] }
  const mk = () => { const calls: string[] = []; return { calls, get: async (u: string) => { calls.push(/tuzsa-(\d+)/.exec(u)![1]); return ok } } }
  beforeEach(() => { clearBad(); baked.bad = [] })

  it('range coding round-trips', () => {
    expect(encodeBad([9, 1, 2, 3, 7, 10, 3])).toEqual([[1, 3], 7, [9, 10]])
    expect([...decodeBad([[1, 3], 7, [9, 10]])].sort()).toEqual(['1', '10', '2', '3', '7', '9'])
    expect(encodeBad([])).toEqual([])
  })
  it('an own stop in the list makes no request to it and goes straight to the alternatives', async () => {
    baked.bad = [[262, 264]]
    const { calls, get } = mk()
    const l = await loadBus('263', undefined, get, () => 0, [{ stop: '262', name: 'a', d: 1 }, { stop: '265', name: 'b', d: 2 }], '35')
    expect(calls).toEqual(['265']); expect(l?.via?.stop).toBe('265')
  })
  it('busAlternatives drops listed stops before cutting to the budget', () => {
    setBakedBad(new Set(['2', '3']))
    const rows = ['1', '2', '3', '4', '5', '6'].map((id, i) => [id, 'S' + id, '35', 41.6 + i * 0.0001, -0.9] as const)
    expect(busAlternatives('1', '35', [41.6, -0.9], [41.6, -0.9], rows, 2).map(a => a.stop)).toEqual(['4', '5'])
    setBakedBad(new Set())
  })
  it('routeAlternatives still reaches 3 live candidates when neighbours are listed', () => {
    const order = Array.from({ length: 12 }, (_, i) => ({ post: String(100 + i), name: 'S', lat: 41.6 + i * 0.001, lon: -0.9 }))
    const alts = routeAlternatives(order, 5, [41.6, -0.9], 3, s => ['104', '106', '103'].includes(s))
    expect(alts.length).toBeGreaterThanOrEqual(3)
    expect(alts.some(a => ['104', '106', '103'].includes(a.stop))).toBe(false)
    expect(alts.slice(0, 3).map(a => a.stop)).toEqual(['102', '107', '108'])
  })
  it('loadBus spends its 3 extra requests on live stops only', async () => {
    baked.bad = [[100, 104]]
    const calls: string[] = []
    const get = async (u: string) => { calls.push(/tuzsa-(\d+)/.exec(u)![1]); if (/tuzsa-(105|106)/.test(u)) throw new Error('HTTP 400'); return /tuzsa-10[789]/.test(u) ? ok : { destinos: [] } }
    const order = Array.from({ length: 12 }, (_, i) => ({ post: String(100 + i), name: 'S', lat: 41.6 + i * 0.001, lon: -0.9 }))
    await loadBus('106', undefined, get, () => 0, routeAlternatives(order, 6, [41.6, -0.9], 3, s => ['100', '101', '102', '103', '104'].includes(s)), '35')
    expect(calls.some(c => ['100', '101', '102', '103', '104'].includes(c))).toBe(false)
    expect(calls.length).toBeLessThanOrEqual(4)
  })
})

describe('probeStop (build-time classification)', () => {
  const fast = async () => {}
  const seq = (...st: (number | Error)[]) => { let i = 0; const f = async () => { const v = st[Math.min(i++, st.length - 1)]; if (v instanceof Error) throw v; return { status: v } }; return { f, n: () => i } }
  it('400 three times is bad', async () => { const s = seq(400); expect(await probeStop('u', s.f, fast)).toBe('bad'); expect(s.n()).toBe(3) })
  it('500 three times is bad', async () => { expect(await probeStop('u', seq(500).f, fast)).toBe('bad') })
  it('404 three times is gone (listed too)', async () => { expect(await probeStop('u', seq(404).f, fast)).toBe('gone') })
  it('a 200 on a later try is ok, with no more tries', async () => { const s = seq(400, 200); expect(await probeStop('u', s.f, fast)).toBe('ok'); expect(s.n()).toBe(2) })
  it('a timeout or network error is unknown, not bad', async () => { expect(await probeStop('u', seq(new Error('timeout')).f, fast)).toBe('unknown'); expect(await probeStop('u', seq(400, new Error('x')).f, fast)).toBe('unknown') })
  it('503 or 429 is unknown', async () => { expect(await probeStop('u', seq(503).f, fast)).toBe('unknown') })
  it('waits between tries', async () => { const waits: number[] = []; await probeStop('u', seq(400).f, async ms => { waits.push(ms) }); expect(waits.length).toBe(2) })
})
