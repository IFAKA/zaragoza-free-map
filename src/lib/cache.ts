import type { Item, PartKey } from './types'
const PFX = 'zgz:v1:'
export const lsGet = (k: string): string | null => { try { return localStorage.getItem(PFX + k) } catch { return null } }
export const lsSet = (k: string, v: string): void => { try { localStorage.setItem(PFX + k, v) } catch { /* quota or private mode */ } }

export type LayerCache = Partial<Record<PartKey, { items: Item[]; ts: number }>>
export function readLayerCache(id: string): LayerCache | null {
  try {
    const v = JSON.parse(lsGet('layer:' + id) || 'null')
    return v && typeof v === 'object' ? v : null
  } catch { return null }
}
export function writeLayerCache(id: string, c: LayerCache): void { lsSet('layer:' + id, JSON.stringify(c)) }

export async function fetchJson<T = unknown>(url: string, ms: number): Promise<T> {
  const c = new AbortController(), tm = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(url, { signal: c.signal })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return (await r.json()) as T
  } finally { clearTimeout(tm) }
}
export async function fetchText(url: string, ms: number): Promise<string> {
  const c = new AbortController(), tm = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(url, { signal: c.signal })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return await r.text()
  } finally { clearTimeout(tm) }
}
/** Run once, share the promise, allow reset (for retry). A failure clears the memo. */
export function memo<T>(fn: () => Promise<T>) {
  let p: Promise<T> | null = null
  const w = () => p ?? (p = fn().catch(e => { p = null; throw e }))
  w.reset = () => { p = null }
  return w
}
