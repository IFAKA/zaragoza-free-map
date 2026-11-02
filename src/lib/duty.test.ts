import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadDuty, madridDate, readDutyCache, todays } from './duty'
import type { DutyRow } from './sources'

const rec = (fecha: string) => ({ id: 8767, title: 'Farmacia Torres Ferrandez - Torres Ferrandez CB', telefonos: '976270929', calle: 'C/ Zafiro, 1',
  geometry: { type: 'Point', coordinates: [-0.8761789445207417, 41.62328282277754] }, guardia: { fecha: fecha + 'T00:00:00', horario: 'Abiertas de 9:15 h. a 13:45 h.', sector: 'Sector Torrero-Paz' } })
const ok = (fecha: string) => async () => ({ result: [rec(fecha)] })
const down = async () => { throw new Error('offline') }

let store: Record<string, string>
beforeEach(() => { store = {}; (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } } })
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage })

describe('madridDate', () => {
  it('uses Madrid time, not UTC', () => {
    expect(madridDate(new Date('2026-11-02T23:30:00Z'))).toBe('2026-11-03') // 00:30 in Madrid
    expect(madridDate(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01') // 23:59 in Madrid (summer)
    expect(madridDate(new Date('2026-07-01T22:00:00Z'))).toBe('2026-07-02')
  })
})
describe('todays', () => {
  const row = (d: string) => [1, 'x', '', '', 41.6, -0.9, d, '', ''] as DutyRow
  it('only a non-empty list of today', () => {
    expect(todays([row('2026-11-02')], '2026-11-02')).toHaveLength(1)
    expect(todays([], '2026-11-02')).toBeNull()
    expect(todays([row('2026-11-01')], '2026-11-02')).toBeNull()
    expect(todays([row('2026-11-02'), row('2026-11-01')], '2026-11-02')).toBeNull()
  })
})
describe('loadDuty', () => {
  it('today list from the city is returned and saved with its date', async () => {
    const rows = await loadDuty('2026-11-02', ok('2026-11-02'))
    expect(rows?.[0][1]).toMatch(/Torres Ferrandez/)
    expect(readDutyCache('2026-11-02')).toHaveLength(1)
  })
  it('city failure: the list saved today is used', async () => {
    await loadDuty('2026-11-02', ok('2026-11-02'))
    expect(await loadDuty('2026-11-02', down)).toHaveLength(1)
  })
  it('city failure the next day: yesterday is never shown (null)', async () => {
    await loadDuty('2026-11-02', ok('2026-11-02'))
    expect(await loadDuty('2026-11-03', down)).toBeNull()
    expect(readDutyCache('2026-11-03')).toBeNull()
  })
  it('the city answers with an old list: not shown, not saved over', async () => {
    expect(await loadDuty('2026-11-03', ok('2026-11-02'))).toBeNull()
    expect(store['zgz:v2:duty']).toBeUndefined()
  })
  it('no cache and no network: null', async () => { expect(await loadDuty('2026-11-02', down)).toBeNull() })
  it('an empty answer is a failure', async () => { expect(await loadDuty('2026-11-02', async () => ({ result: [] }))).toBeNull() })
})
