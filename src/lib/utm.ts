import type { LatLon } from './types'

/**
 * UTM zone 30N, ETRS89 (EPSG:25830, GRS80 ellipsoid) -> [lat, lon] in degrees.
 * Inverse transverse Mercator (Snyder series via the footpoint latitude).
 */
export function utm30ToLatLon(E: number, N: number): LatLon {
  const a = 6378137, f = 1 / 298.257222101
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = 0.9996, lon0 = (-3 * Math.PI) / 180
  const x = E - 500000, M = N / k0
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256))
  const s = Math.sqrt(1 - e2), e1 = (1 - s) / (1 + s)
  const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)
  const sp = Math.sin(phi1), cp = Math.cos(phi1), tp = Math.tan(phi1)
  const N1 = a / Math.sqrt(1 - e2 * sp * sp), R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sp * sp, 1.5)
  const T1 = tp * tp, C1 = ep2 * cp * cp, D = x / (N1 * k0)
  const lat = phi1 - ((N1 * tp) / R1) * (D * D / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720)
  const lon = lon0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / cp
  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI]
}
