import type { LatLon } from './types'

export const CENTER: LatLon = [41.6561, -0.8773] // Plaza del Pilar area
export const BBOX = '(41.54,-1.06,41.76,-0.76)'

export function dist(a: LatLon, b: LatLon): number {
  const R = 6371000, r = Math.PI / 180
  const dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
export function fmtDist(d: number): string {
  return d < 1000 ? Math.max(10, Math.round(d / 10) * 10) + ' m' : (d / 1000).toFixed(1) + ' km'
}
export const walkMins = (d: number) => Math.max(1, Math.ceil(d / 80))
export const walkUrl = (lat: number, lon: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`
export const okCoord = (la: unknown, lo: unknown): boolean =>
  typeof la === 'number' && typeof lo === 'number' && Number.isFinite(la) && Number.isFinite(lo)

export function cleanName(s: string): string {
  const small = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'a', 'e'])
  return String(s).replace(/^SEDE\s+/i, '').replace(/\s+PLANTA\s+.*$/i, '').replace(/_/g, ' ').toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.replace(/[a-záéíóúüñ]/, c => c.toUpperCase())))
    .join(' ')
}

/** WiFi range estimate in metres: ~40 m around a city building, ~25 m around an OpenStreetMap venue. */
export const rangeMetres = (it: { building?: boolean }) => (it.building ? 40 : 25)
