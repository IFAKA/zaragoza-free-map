import { readLayerCache, writeLayerCache, type LayerCache } from './lib/cache'
import { dist } from './lib/geo'
import type { Item, LayerConfig, LayerId, PartData, PartKey } from './lib/types'
import { resetCity } from './layers/city'
import { LAYERS } from './layers'
import { osmAll } from './layers/osm'

/** Runtime data for every layer: per-source state (loading / ok / fail, live or saved copy) and the merged item list.
 *  Stale-while-revalidate: cached (or built-in) items show first, live data replaces them. */
export interface LayerRuntime { cfg: LayerConfig; parts: Partial<Record<PartKey, PartData>>; items: Item[] }
export const runtime = {} as Record<LayerId, LayerRuntime>

let version = 0
const subs = new Set<() => void>()
export const subscribe = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn) } }
export const getVersion = () => version
const bump = () => { version++; subs.forEach(f => f()) }

export function mergeItems(id: LayerId, parts: Partial<Record<PartKey, PartData>>): Item[] {
  let items: Item[] = []
  for (const p of Object.values(parts)) items = items.concat(p.items)
  if (id === 'wifi') { // drop OSM venues within 30 m of a city building
    const city = parts.city?.items || []
    items = items.filter(it => it.part === 'city' || !city.some(c => Math.abs(c.lat - it.lat) < 0.0004 && Math.abs(c.lon - it.lon) < 0.0006 && dist([it.lat, it.lon], [c.lat, c.lon]) < 30))
  }
  return items
}

for (const cfg of Object.values(LAYERS)) {
  const cache = readLayerCache(cfg.id)
  const parts: Partial<Record<PartKey, PartData>> = {}
  for (const p of cfg.parts) {
    const cp = cache?.[p.k]
    const d: PartData = { items: [], state: 'load', live: false }
    if (cp && Array.isArray(cp.items) && cp.items.length) { d.items = cp.items; d.state = 'ok'; d.ts = cp.ts }
    else if (p.snap) { d.items = p.snap(); d.state = 'ok' }
    parts[p.k] = d
  }
  runtime[cfg.id] = { cfg, parts, items: mergeItems(cfg.id, parts) }
}

async function runPart(id: LayerId, k: PartKey) {
  const rt = runtime[id], d = rt.parts[k]!
  const cfg = rt.cfg.parts.find(p => p.k === k)!
  try {
    const items = await cfg.load()
    if (!items.length) throw new Error('empty')
    d.items = items; d.live = true; d.state = 'ok'; d.ts = Date.now()
    const c: LayerCache = {}
    for (const p of rt.cfg.parts) { const pd = rt.parts[p.k]!; c[p.k] = { items: pd.items, ts: pd.ts || 0 } }
    writeLayerCache(id, c)
  } catch { d.state = d.items.length ? 'ok' : 'fail' }
  rt.items = mergeItems(id, rt.parts)
  bump()
}
export function loadLayer(id: LayerId) {
  const rt = runtime[id]
  for (const p of rt.cfg.parts) { const d = rt.parts[p.k]!; d.state = d.items.length ? 'ok' : 'load'; void runPart(id, p.k) }
  bump()
}
export function loadAll() { (Object.keys(runtime) as LayerId[]).forEach(loadLayer) }
export function retryLayer(id: LayerId) { osmAll.reset(); resetCity(); loadLayer(id) }
