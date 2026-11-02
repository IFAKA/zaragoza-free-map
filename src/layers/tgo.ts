import { fetchText } from '../lib/cache'
import { okCoord } from '../lib/geo'
import { utm30ToLatLon } from '../lib/utm'
import type { Item } from '../lib/types'

export const TGO_URL = 'https://raw.githubusercontent.com/IFAKA/toiletsgo/HEAD/src/data.ts'
export type TgoRow = [number, string, string, string, number, number]

export function tgoType(n: string): string {
  if (/^(bar|caf)/i.test(n)) return 'bar'
  if (/^biblioteca/i.test(n)) return 'lib'
  if (/^centro c/i.test(n)) return 'civic'
  if (/^zona joven/i.test(n)) return 'youth'
  if (/ayuntamiento/i.test(n)) return 'townhall'
  return 'place'
}
export function tgoItems(rows: TgoRow[]): Item[] {
  return rows.filter(r => okCoord(r[4], r[5])).map(r => ({
    id: 't' + r[0], part: 'tgo' as const, type: tgoType(r[1]), name: r[1], addr: r[2] || '', phone: r[3] || '', lat: r[4], lon: r[5],
  }))
}
/** Parse the RAW array in toiletsgo's src/data.ts: {id, name, address, tel, utm:[E,N]}. Rows outside Zaragoza are dropped. */
export function parseTgo(text: string): TgoRow[] {
  const re = /\{\s*id:\s*(\d+)\s*,\s*name:\s*'((?:[^'\\]|\\.)*)'\s*,\s*address:\s*'((?:[^'\\]|\\.)*)'\s*,\s*tel:\s*(null|'[^']*')\s*,\s*utm:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/g
  const un = (s: string) => s.replace(/\\(.)/g, '$1')
  const rows: TgoRow[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const [lat, lon] = utm30ToLatLon(+m[5], +m[6])
    if (lat < 41.5 || lat > 41.8 || lon < -1.1 || lon > -0.7) continue
    rows.push([+m[1], un(m[2]), un(m[3]), m[4] === 'null' ? '' : m[4].slice(1, -1), +lat.toFixed(6), +lon.toFixed(6)])
  }
  return rows
}
export const loadTgo = async (): Promise<Item[]> => tgoItems(parseTgo(await fetchText(TGO_URL, 15000)))
