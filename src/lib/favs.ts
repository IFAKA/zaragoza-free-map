import { useSyncExternalStore } from 'react'
import { lsGet, lsSet } from './cache'
// Favourite places, kept on this device as `layerId:itemId` keys (ids repeat across layers). Fountain ids ('f' + row number) and live pharmacy ids are not stable, so they are never starred (see canFav).
export const FAV_MAX = 20
const KEY = 'favs'
export const favKey = (layer: string, id: string) => `${layer}:${id}`
export const splitFav = (k: string): [string, string] => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)] }
/** Stops, stations and the like can be starred; fountains and the live pharmacy list cannot. */
export const canFav = (layer: { id: string; live?: boolean }, item: { type: string }) => !layer.live && layer.id !== 'water' && item.type !== 'fountain'

export function parseFavs(s: string | null): string[] {
  try { const v = JSON.parse(s ?? '[]'); return Array.isArray(v) ? [...new Set<string>(v.filter((x): x is string => typeof x === 'string' && x.includes(':')))].slice(0, FAV_MAX) : [] } catch { return [] }
}

let raw: string | null = null // the saved text the list below was parsed from
let list: string[] = parseFavs(lsGet(KEY))
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())
const save = (next: string[]) => { list = next; raw = JSON.stringify(next); lsSet(KEY, raw); emit() }

export const getFavs = (): string[] => list
export const isFav = (layer: string, id: string): boolean => list.includes(favKey(layer, id))
/** Add or remove. Returns false only when the list is full and the place could not be added. */
export function toggleFav(layer: string, id: string): boolean {
  const k = favKey(layer, id)
  if (list.includes(k)) { save(list.filter(x => x !== k)); return true }
  if (list.length >= FAV_MAX) return false
  save([...list, k])
  return true
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
