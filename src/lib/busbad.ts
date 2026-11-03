// Bus stops the city server never answers (HTTP 400 "(500)Internal Server Error", or 404 for stale numbers).
// scripts/probe-bus.mjs finds them at build time and writes src/data/busbad.json; the app then never asks them (see live.ts).
// The file stores stop numbers as a sorted list where a run of consecutive numbers is a pair [from, to].
export type BadItem = number | [number, number]
export interface BusBad { src: string; updated: string | null; total: number; bad: BadItem[] }

/** [1, 2, 3, 7, 9, 10] -> [[1, 3], 7, [9, 10]]. Input is sorted and deduplicated here. */
export function encodeBad(nums: number[]): BadItem[] {
  const s = [...new Set(nums)].sort((a, b) => a - b), out: BadItem[] = []
  for (let i = 0; i < s.length;) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    out.push(j === i ? s[i] : [s[i], s[j]])
    i = j + 1
  }
  return out
}
export function decodeBad(items: readonly BadItem[]): Set<string> {
  const out = new Set<string>()
  for (const it of items) { if (typeof it === 'number') out.add(String(it)); else for (let n = it[0]; n <= it[1]; n++) out.add(String(n)) }
  return out
}

export type Probe = 'ok' | 'bad' | 'gone' | 'unknown'
export const PROBE_TRIES = 3
/**
 * Asks one stop up to 3 times. 'ok' at the first HTTP 2xx. 'bad' (400/500) or 'gone' (404) only when every try got that same kind of server error.
 * Network errors and timeouts are 'unknown' (we learned nothing about the stop). `fetchFn` and `sleep` are injected for tests.
 */
export async function probeStop(url: string, fetchFn: (u: string) => Promise<{ status: number }>, sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)), gapMs = 1500): Promise<Probe> {
  let seen: 'bad' | 'gone' | null = null
  for (let t = 0; t < PROBE_TRIES; t++) {
    if (t) await sleep(gapMs)
    let status: number
    try { status = (await fetchFn(url)).status } catch { return 'unknown' }
    if (status >= 200 && status < 300) return 'ok'
    const kind = status === 404 ? 'gone' : status === 400 || status === 500 ? 'bad' : null
    if (!kind) return 'unknown' // 429, 503...: the server is busy, not a verdict on the stop
    if (seen && seen !== kind) return 'unknown'
    seen = kind
  }
  return seen ?? 'unknown'
}
