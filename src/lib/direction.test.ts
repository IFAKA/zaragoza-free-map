import { describe, expect, it } from 'vitest'
import cercanias from '../data/cercanias.json'
import times from '../data/cercanias-times.json'
import tram from '../data/tram.json'
import { chooseDir, outsideCentre, railGroups, shownDir, towardCentre } from './direction'
import { decodePolyline, nextDepartures, type Timetable } from './transit'
import type { LatLon } from './types'

describe('chooseDir: remembered > soonest > centre > first', () => {
  const o = (a: number | null, b: number | null) => [{ id: 'n', soon: a }, { id: 's', soon: b }]
  it('the remembered direction wins, even when the other is sooner', () => {
    expect(chooseDir(o(9, 2), 's')).toBe('s')
    expect(chooseDir(o(2, 9), 's')).toBe('s')
  })
  it('a remembered direction with no vehicle left is skipped', () => {
    expect(chooseDir(o(4, null), 's')).toBe('n')
  })
  it('without a memory the soonest wins', () => {
    expect(chooseDir(o(7, 3))).toBe('s')
    expect(chooseDir(o(3, 7), 'x')).toBe('n')
    expect(chooseDir(o(null, 12))).toBe('s')
  })
  it('a tie goes to the way to the centre, else to the first', () => {
    expect(chooseDir(o(5, 5), null, 's')).toBe('s')
    expect(chooseDir(o(5, 5), null, null)).toBe('n')
    expect(chooseDir(o(5, 5), null, 'zzz')).toBe('n')
  })
  it('the centre only breaks a tie, it never beats a sooner vehicle', () => {
    expect(chooseDir(o(2, 5), null, 's')).toBe('n')
  })
  it('nothing left: the remembered one, else the first', () => {
    expect(chooseDir(o(null, null), 's')).toBe('s')
    expect(chooseDir(o(null, null))).toBe('n')
  })
  it('shownDir moves off an empty direction only when the other has a vehicle', () => {
    expect(shownDir(o(null, 4), 'n')).toBe('s')
    expect(shownDir(o(3, 4), 'n')).toBe('n')
    expect(shownDir(o(null, null), 'n')).toBe('n')
  })
})

describe('centre helpers', () => {
  it('outsideCentre: Valdespartera is outside, the Pilar is not', () => {
    expect(outsideCentre([41.6, -0.9])).toBe(true)
    expect(outsideCentre([41.6565, -0.8785])).toBe(false)
  })
  it('towardCentre picks the end that points to the centre', () => {
    const south: LatLon = [41.6, -0.9], north: LatLon = [41.69, -0.88]
    expect(towardCentre([41.62, -0.9], [{ id: 'n', at: north }, { id: 's', at: south }])).toBe('n') // a stop south of the centre: north is the way in
    expect(towardCentre([41.68, -0.88], [{ id: 'n', at: north }, { id: 's', at: south }])).toBe('s')
  })
  it('the tram: Parque Goya is at the northern end of the baked stops (next to Avenida de la Academia, the last one)', () => {
    const lat = (n: string) => tram.rows.find(r => r[1] === n)![2] as number
    expect(tram.ends[0]).toBe('Parque Goya')
    expect(Math.max(...tram.rows.map(r => r[2] as number)) - lat('Parque Goya')).toBeLessThan(0.002)
  })
})

describe('Cercanías: the two travel directions', () => {
  const path = decodePolyline(cercanias.line[0])
  const at = (name: string): LatLon => { const r = cercanias.rows.find(x => x[1] === name)!; return [r[2] as number, r[3] as number] }
  const idx = (name: string) => cercanias.dests.indexOf(name)
  const dests = cercanias.dests.map((n, i) => ({ i, at: at(n) }))
  const groups = (station: string) => railGroups(path, at(station), dests)
  const far = (station: string) => groups(station).map(g => [g.id, cercanias.dests[g.far], g.dests.map(i => cercanias.dests[i]).sort()])

  it('Utebo: Casetas one way, Delicias and Miraflores the other (named by Miraflores, the furthest)', () => {
    expect(far('Utebo')).toEqual([['lo', 'Casetas', ['Casetas']], ['hi', 'Zaragoza-Miraflores', ['Zaragoza Delicias', 'Zaragoza-Miraflores']]])
  })
  it('Zaragoza-Goya: Casetas and Delicias to the west, Miraflores to the east', () => {
    const g = far('Zaragoza-Goya')
    expect(g[0]).toEqual(['lo', 'Casetas', ['Casetas', 'Zaragoza Delicias']])
    expect(g[1]).toEqual(['hi', 'Zaragoza-Miraflores', ['Zaragoza-Miraflores']])
  })
  it('a terminus has only one way: no second group', () => {
    expect(groups('Casetas').map(g => g.id)).toEqual(['hi'])
    expect(groups('Zaragoza-Miraflores').map(g => g.id)).toEqual(['lo'])
  })
  it('every real timetable destination lands in exactly one group, at every station', () => {
    for (const r of cercanias.rows) {
      const tt = (times.t as unknown as Record<string, Timetable>)[r[0]]
      const used = new Set<number>()
      for (const day of Object.values(tt)) for (let i = 1; i < day.length; i += 2) used.add(day[i])
      const gs = railGroups(path, [r[2] as number, r[3] as number], dests.filter(d => used.has(d.i)))
      const seen = gs.flatMap(g => g.dests)
      expect(new Set(seen).size).toBe(seen.length)
      expect([...used].sort()).toEqual([...seen].sort())
    }
  })
  it('nextDepartures filtered to one group only returns that way, and the groups together cover all', () => {
    const tt = (times.t as unknown as Record<string, Timetable>)['70801'] // Utebo
    const now = { day: 1, min: 8 * 60 }
    const lo = nextDepartures(tt, now, 3, d => d === idx('Casetas')), hi = nextDepartures(tt, now, 3, d => d !== idx('Casetas'))
    expect(lo.every(x => x.dest === idx('Casetas'))).toBe(true)
    expect(hi.every(x => x.dest !== idx('Casetas'))).toBe(true)
    expect(nextDepartures(tt, now, 3)[0].inMin).toBe(Math.min(lo[0].inMin, hi[0].inMin))
  })
  it('a direction with no train left today only has tomorrow: it reads as empty', () => {
    const tt = (times.t as unknown as Record<string, Timetable>)['70801']
    const late = nextDepartures(tt, { day: 1, min: 23 * 60 + 50 }, 3, d => d === idx('Casetas'))
    expect(late.every(x => x.tomorrow)).toBe(true)
  })
})
