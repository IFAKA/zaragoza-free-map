import { DATA } from '../data'
import type { LayerConfig, LayerId } from '../lib/types'
import { buildLayers } from './build'

export const LAYERS: Record<LayerId, LayerConfig> = buildLayers(DATA)
/** Layers shown as tabs. */
export const ORDER: LayerId[] = ['water', 'toilets', 'charge', 'wifi']
/** Layers behind "More". */
export const MORE: LayerId[] = ['libraries', 'bizi']
