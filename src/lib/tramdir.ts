// Which way a tram is going, from the baked stops. The city's live API names each arrival by the stop at the end of the trip
// ("MAGO DE OZ", "AVENIDA ACADEMIA"). Find that stop in the baked list and compare its latitude with the stop you stand at:
// the line runs north-south, so a destination with a higher latitude is north. No hardcoded end names.
export type TramRow = readonly [id: string, name: string, lat: number, lon: number, ...rest: unknown[]]
export type TramDir = 'n' | 's'

/** "Avenida de la Academia" and "AVENIDA ACADEMIA" give the same key: no accents, no small joining words. */
export const tramKey = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter(w => w && !['de', 'del', 'la', 'las', 'los', 'el', 'y'].includes(w)).join(' ')

/** 'n' / 's' for a trip from `stopName` to `dest`, or null when the destination is not a known stop (or is this stop). */
export function tramDir(dest: string, stopName: string, rows: readonly TramRow[]): TramDir | null {
  const me = tramKey(stopName)
  const d = tramKey(dest).replace(/ tranvia doble$/, '') // "Plaza del Pilar - Tranvia Doble" is the same end as "Plaza del Pilar"
  if (!d || d === me) return null
  // the city sometimes sends a shorter name ("Plaza del Pilar" for "Plaza del Pilar - Murallas")
  const to = rows.find(r => tramKey(r[1]) === d) ?? rows.find(r => tramKey(r[1]).startsWith(d + ' ')), from = rows.find(r => tramKey(r[1]) === me)
  if (!to || !from || to[2] === from[2]) return null
  return to[2] > from[2] ? 'n' : 's'
}
