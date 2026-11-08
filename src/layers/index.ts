import { DATA } from '../data'
import type { LayerConfig, LayerId } from '../lib/types'
import { buildLayers, heavyItems } from './build'
import { loadHeavy } from '../data/heavy'
import type { Heavy } from '../data'
import { serviceOrder } from './goals'

export const LAYERS: Record<LayerId, LayerConfig> = buildLayers(DATA)
/** Bus stops and bike racks arrive after the first screen: until then the Bus layer is empty and Bizi has its stations only. */
export let HEAVY: Heavy | null = null
let ready = 0
const subs = new Set<() => void>()
export const subscribeHeavy = (f: () => void) => (subs.add(f), () => { subs.delete(f) })
export const heavyVersion = () => ready
export function loadHeavyLayers(): Promise<void> {
  return loadHeavy().then(h => {
    if (HEAVY) return
    HEAVY = h
    const { bus, racks } = heavyItems(h)
    LAYERS.bus.items = bus
    LAYERS.bizi.items = [...LAYERS.bizi.items, ...racks]
    ready++
    subs.forEach(f => f())
  })
}
/** Every service in chip order. Warm indoor places come 3rd from 1 Nov to 31 Mar (device date). */
export const layerOrder = (date: Date = new Date()): LayerId[] => serviceOrder(date)
export const ORDER: LayerId[] = layerOrder()
/** Layer shown to a first-time visitor: always toilets (a choice saved on the device wins; see App). */
export const defaultLayer = (): LayerId => 'toilets'
