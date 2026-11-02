import { describe, expect, it } from 'vitest'
import { utm30ToLatLon } from './utm'
import { DATA } from '../data'

const TGO_SNAPSHOT = DATA.toiletsgo.rows

// Independent forward projection (Krueger series, GRS80) used to round-trip the inverse.
function forward(lat: number, lon: number): [number, number] {
  const a = 6378137, f = 1 / 298.257222101, n = f / (2 - f), k0 = 0.9996
  const A = (a / (1 + n)) * (1 + n * n / 4 + n ** 4 / 64)
  const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240]
  const phi = lat * Math.PI / 180, lam = (lon + 3) * Math.PI / 180
  const e = Math.sqrt(f * (2 - f))
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)))
  const xi = Math.atan2(t, Math.cos(lam)), eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t))
  let X = xi, Y = eta
  for (let j = 1; j <= 3; j++) { X += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); Y += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta) }
  return [500000 + k0 * A * Y, k0 * A * X]
}

describe('utm30ToLatLon', () => {
  it('puts Plaza del Pilar town hall in the right place', () => {
    const [lat, lon] = utm30ToLatLon(676840.38, 4613965.9)
    expect(lat).toBeCloseTo(41.6578, 3)
    expect(lon).toBeCloseTo(-0.8761, 3)
  })
  it('round-trips with an independent forward projection (< 1 cm)', () => {
    for (const [la, lo] of [[41.6561, -0.8773], [41.6, -0.95], [41.72, -0.8], [41.55, -1.05]]) {
      const [E, N] = forward(la, lo)
      const [la2, lo2] = utm30ToLatLon(E, N)
      expect(Math.abs(la2 - la)).toBeLessThan(1e-7)
      expect(Math.abs(lo2 - lo)).toBeLessThan(1e-7)
    }
  })
  it('central meridian: easting 500000 is lon -3', () => {
    expect(utm30ToLatLon(500000, 4600000)[1]).toBeCloseTo(-3, 9)
  })
  it('every bundled toiletsgo place lies inside Zaragoza', () => {
    expect(TGO_SNAPSHOT.length).toBe(49)
    for (const r of TGO_SNAPSHOT) {
      expect(r[4]).toBeGreaterThan(41.5); expect(r[4]).toBeLessThan(41.8)
      expect(r[5]).toBeGreaterThan(-1.1); expect(r[5]).toBeLessThan(-0.7)
    }
  })
})
