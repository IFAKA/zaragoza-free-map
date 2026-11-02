import { CENTER, dist } from './geo'
import { nowMadrid, openState, type Now } from './hours'
import { schedFor } from './cityHours'
import type { Item, LatLon, LayerConfig, RankedItem } from './types'

export interface RankOpts { ref: LatLon | null; openOnly: boolean; cat: string | null }

/** Open / closed / unknown for one item right now (Madrid time). Always-available items count as open. */
export function itemOpen(it: Item, now: Required<Now>): boolean | null {
  if (it.always) return true
  const s = it.sched ? schedFor(it.sched, now.md) : it.hours
  return s ? openState(s, now.day, now.min) : null
}
/**
 * Filter and order a layer's items.
 * Open now ON : closed items are hidden; open (or always available) first, then unknown hours, each by distance.
 * Open now OFF: everything, by distance.
 */
export function rank(cfg: LayerConfig, items: Item[], o: RankOpts, now = nowMadrid()): RankedItem[] {
  const ref = o.ref || CENTER
  const out: RankedItem[] = []
  for (const it of items) {
    if (cfg.cats && o.cat && (it.cat || 'other') !== o.cat) continue
    const open = cfg.hours ? itemOpen(it, now) : null
    if (cfg.hours && o.openOnly && open === false) continue
    out.push({ ...it, d: dist(ref, [it.lat, it.lon]), open })
  }
  const tier = (x: RankedItem) => (cfg.hours && o.openOnly ? (x.open === true ? 0 : 1) : 0)
  return out.sort((a, b) => tier(a) - tier(b) || a.d - b.d)
}

/**
 * Like rank, but when "Open now" is on and every place is closed, show them all by distance
 * (each row keeps its own closed state) instead of an empty map. `allClosed` tells the UI to say so.
 */
export function rankOrAll(cfg: LayerConfig, items: Item[], o: RankOpts, now = nowMadrid()): { arr: RankedItem[]; allClosed: boolean } {
  const arr = rank(cfg, items, o, now)
  if (arr.length || !cfg.hours || !o.openOnly) return { arr, allClosed: false }
  const all = rank(cfg, items, { ...o, openOnly: false }, now)
  return { arr: all, allClosed: all.length > 0 }
}
