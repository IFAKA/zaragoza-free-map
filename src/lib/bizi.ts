// Live Bizi counts (bikes and free docks per station). Second runtime request of the app, approved like the pharmacies:
// the city's own Bizi endpoint is unreliable, so we read CityBikes (api.citybik.es, open, CORS *, updates every minute).
// The places always come from the bundled bizi.json; the counts are joined onto them by position (or the number in the name).
// Rule: counts older than 5 minutes are never shown as live.
import { dist } from './geo'
import { lsGet, lsSet } from './cache'
import type { Item } from './types'

export const BIZI_URL = 'https://api.citybik.es/v2/networks/bizi'
export const FRESH_MS = 5 * 60_000
export const REFRESH_MS = 60_000
/** [bikes you can take, free docks, e-bikes among the bikes], keyed by our station id. */
export type BiziCount = [number, number, number]
export type BiziCounts = Record<string, BiziCount>
export interface BiziLive { at: number; counts: BiziCounts }

interface CbStation {
  name?: string; latitude?: number; longitude?: number; free_bikes?: number; empty_slots?: number; timestamp?: string
  extra?: { ebikes?: number; renting?: boolean; returning?: boolean }
}
export interface CbNetwork { network?: { stations?: CbStation[] } }

/** CityBikes writes "2026-11-02T21:14:30.810753+00:00Z" (offset and Z together): drop the stray Z. */
export const parseStamp = (s: string | undefined): number => {
  const t = Date.parse(String(s ?? '').replace(/(\+00:00|[+-]\d\d:\d\d)Z$/, '$1'))
  return Number.isFinite(t) ? t : NaN
}
const numOf = (name: string | undefined) => /^\s*(\d+)\s*-/.exec(name ?? '')?.[1]

/**
 * Join CityBikes stations to our places: the nearest one within 40 m, else the one with the same number in its name.
 * A station that is not renting has 0 bikes to take; one that is not returning has 0 docks to use.
 * Returns null when the feed is not fresh at `now` (its newest station stamp is older than 5 minutes) or joins nothing.
 */
export function joinBizi(json: CbNetwork | undefined, places: Pick<Item, 'id' | 'name' | 'lat' | 'lon'>[], now: number): BiziLive | null {
  const st = (json?.network?.stations ?? []).filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number')
  if (!st.length) return null
  const newest = Math.max(...st.map(s => parseStamp(s.timestamp)).filter(Number.isFinite))
  if (!Number.isFinite(newest) || now - newest > FRESH_MS) return null
  const byNum = new Map<string, CbStation>()
  for (const s of st) { const n = numOf(s.name); if (n) byNum.set(n, s) }
  const counts: BiziCounts = {}
  for (const p of places) {
    let best: CbStation | undefined, bd = 40
    for (const s of st) {
      if (Math.abs(s.latitude! - p.lat) > 0.0006 || Math.abs(s.longitude! - p.lon) > 0.0006) continue
      const d = dist([p.lat, p.lon], [s.latitude!, s.longitude!])
      if (d < bd) { bd = d; best = s }
    }
    best ??= byNum.get(numOf(p.name) ?? '')
    if (!best) continue
    const bikes = best.extra?.renting === false ? 0 : Math.max(0, best.free_bikes ?? 0)
    const docks = best.extra?.returning === false ? 0 : Math.max(0, best.empty_slots ?? 0)
    counts[p.id] = [bikes, docks, Math.min(bikes, Math.max(0, best.extra?.ebikes ?? 0))]
  }
  return Object.keys(counts).length ? { at: now, counts } : null
}

export const isFresh = (at: number, now: number) => now - at >= 0 && now - at <= FRESH_MS

/** The saved counts, only while they are fresh. */
export function readBiziCache(now: number): BiziLive | null {
  try {
    const c = JSON.parse(lsGet('bizi') || 'null') as BiziLive | null
    return c && typeof c.at === 'number' && c.counts && isFresh(c.at, now) ? c : null
  } catch { return null }
}

/** Fresh counts from CityBikes (and saves them with their time), else the saved counts if still fresh, else null. `get` is injected for tests. */
export async function loadBizi(places: Pick<Item, 'id' | 'name' | 'lat' | 'lon'>[], now: () => number = Date.now, get: (url: string) => Promise<unknown> = defaultGet): Promise<BiziLive | null> {
  try {
    const live = joinBizi((await get(BIZI_URL)) as CbNetwork, places, now())
    if (live) { lsSet('bizi', JSON.stringify(live)); return live }
  } catch { /* offline, slow, blocked or rate-limited: fall back to the saved counts if they are still fresh */ }
  return readBiziCache(now())
}
async function defaultGet(url: string): Promise<unknown> {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

/** Merge counts into the station items (other items, such as bike racks, pass through). */
export const withCounts = (items: Item[], counts: BiziCounts | null): Item[] =>
  counts ? items.map(it => { const c = counts[it.id]; return c ? { ...it, bikes: c[0], docks: c[1], ebikes: c[2] } : it }) : items
