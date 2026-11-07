import { useSyncExternalStore } from 'react'
import { lsGet, lsSet } from './cache'
import { dist } from './geo'
import type { LatLon } from './types'
// Favourite places, kept on this device as `layerId:itemId` keys (ids repeat across layers). Fountain ids ('f' + row number) and live pharmacy ids are not stable, so they are never starred (see canFav).
const KEY = 'favs'
export const favKey = (layer: string, id: string) => `${layer}:${id}`
export const splitFav = (k: string): [string, string] => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)] }
/** Stops, stations and the like can be starred; fountains and the live pharmacy list cannot. */
export const canFav = (layer: { id: string; live?: boolean }, item: { type: string }) => !layer.live && layer.id !== 'water' && item.type !== 'fountain'

export function parseFavs(s: string | null): string[] {
  try { const v = JSON.parse(s ?? '[]'); return Array.isArray(v) ? [...new Set<string>(v.filter((x): x is string => typeof x === 'string' && x.includes(':')))] : [] } catch { return [] }
}

let raw: string | null = null // the saved text the list below was parsed from
let list: string[] = parseFavs(lsGet(KEY))
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())
const save = (next: string[]) => { list = next; raw = JSON.stringify(next); lsSet(KEY, raw); emit() }

export const getFavs = (): string[] => list
export const isFav = (layer: string, id: string): boolean => list.includes(favKey(layer, id))
/** Add (at the front) or remove. */
export function toggleFav(layer: string, id: string): void {
  const k = favKey(layer, id)
  if (list.includes(k)) { save(list.filter(x => x !== k)); return }
  save([k, ...list])
}
/** Opening a favourite moves it to the front, so the first few are the ones in use. */
export function touchFav(layer: string, id: string): void {
  const k = favKey(layer, id), i = list.indexOf(k)
  if (i > 0) save([k, ...list.slice(0, i), ...list.slice(i + 1)])
}
/** Remove one key. Returns where it was (for restoreFav), or -1 when it was not saved. */
export function removeFav(k: string): number {
  const i = list.indexOf(k)
  if (i >= 0) save(list.filter(x => x !== k))
  return i
}
/** Put a removed key back at its old position (undo). */
export function restoreFav(k: string, index: number): void {
  if (list.includes(k)) return
  const next = [...list]; next.splice(Math.min(Math.max(index, 0), next.length), 0, k)
  save(next)
}

const subscribe = (f: () => void) => {
  subs.add(f)
  // another tab changed the list
  const onStorage = (e: StorageEvent) => {
    if (e.key !== 'zgz:v2:' + KEY || e.newValue === raw) return
    raw = e.newValue; list = parseFavs(e.newValue); emit()
  }
  window.addEventListener('storage', onStorage)
  return () => { subs.delete(f); window.removeEventListener('storage', onStorage) }
}
/** The favourite keys, re-rendering the component whenever they change (here or in another tab). */
export const useFavs = (): string[] => useSyncExternalStore(subscribe, getFavs, getFavs)

/** The `n` places nearest to `pos` (straight line, ties keep the recency order of the input). No position: the first `n` as given. */
export function nearestFavs<T extends { item: { lat: number; lon: number } }>(list: T[], pos: LatLon | null, n: number): T[] {
  if (!pos) return list.slice(0, n)
  return list.map((f, i) => ({ f, i, d: dist(pos, [f.item.lat, f.item.lon]) })).sort((a, b) => a.d - b.d || a.i - b.i).slice(0, n).map(x => x.f)
}

// ---- Own names ("Home stop"): kept apart from the key list, so the list stays as it was. Map of `layer:id` -> label.
const LKEY = 'favLabels'
export const LABEL_MAX = 30
export function parseLabels(s: string | null): Record<string, string> {
  try {
    const v = JSON.parse(s ?? '{}')
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Record<string, string> = {}
    for (const [k, x] of Object.entries(v)) if (typeof x === 'string' && x.trim()) out[k] = x.trim().slice(0, LABEL_MAX)
    return out
  } catch { return {} }
}
/** The label as it is saved: trimmed, spaces collapsed, at most LABEL_MAX characters. Empty means "no label". */
export const cleanLabel = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX).trim()

let lraw: string | null = lsGet(LKEY)
let labels: Record<string, string> = parseLabels(lraw)
const lsubs = new Set<() => void>()
const lemit = () => lsubs.forEach(f => f())
const lsave = (next: Record<string, string>) => { labels = next; lraw = JSON.stringify(next); lsSet(LKEY, lraw); lemit() }
export const getLabels = () => labels
/** Set the label of a saved place; an empty text clears it. */
export function setLabel(key: string, text: string): void {
  const v = cleanLabel(text)
  if ((labels[key] ?? '') === v) return
  const next = { ...labels }
  if (v) next[key] = v; else delete next[key]
  lsave(next)
}
const lsubscribe = (f: () => void) => {
  lsubs.add(f)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== 'zgz:v2:' + LKEY || e.newValue === lraw) return
    lraw = e.newValue; labels = parseLabels(e.newValue); lemit()
  }
  window.addEventListener('storage', onStorage)
  return () => { lsubs.delete(f); window.removeEventListener('storage', onStorage) }
}
export const useFavLabels = (): Record<string, string> => useSyncExternalStore(lsubscribe, getLabels, getLabels)

/** What to show for a place: its own label when it has one, else its name. */
export const favTitle = (name: string, label?: string): string => label || name

/** Stops (bus, tram, train) or everything else. */
export type FavKind = 'all' | 'stops' | 'places'
export const STOP_LAYERS = ['bus', 'tram', 'cercanias']
export const isStopLayer = (layerId: string) => STOP_LAYERS.includes(layerId)
export function filterKind<T extends { layer: { id: string } }>(list: T[], kind: FavKind): T[] {
  return kind === 'all' ? list : list.filter(f => isStopLayer(f.layer.id) === (kind === 'stops'))
}
