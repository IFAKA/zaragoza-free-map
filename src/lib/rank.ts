import { CENTER, dist } from './geo'
import { nowMadrid, openState } from './hours'
import type { Item, LatLon, LayerConfig, RankedItem } from './types'

export interface RankOpts { ref: LatLon | null; openOnly: boolean; cat: string | null }
/** Filter and sort a layer's items by distance. Items with unknown hours are always kept. */
export function rank(cfg: LayerConfig, items: Item[], o: RankOpts, now = nowMadrid()): RankedItem[] {
  const ref = o.ref || CENTER
  const out: RankedItem[] = []
  for (const it of items) {
    if (cfg.cats && o.cat && (it.cat || 'other') !== o.cat) continue
    const open = cfg.hours && it.hours ? openState(it.hours, now.day, now.min) : null
    if (cfg.hours && o.openOnly && open === false) continue
    out.push({ ...it, d: dist(ref, [it.lat, it.lon]), open })
  }
  return out.sort((a, b) => a.d - b.d)
}
/** Bizi: nearest station that has a bike (only trusted when the data is live). */
export function nearestOf(cfg: LayerConfig, arr: RankedItem[], live: boolean): RankedItem | null {
  return (cfg.usable && live ? arr.find(cfg.usable) : undefined) ?? arr[0] ?? null
}
