import { DATA } from '../data'
import type { LayerConfig, LayerId } from '../lib/types'
import { buildLayers } from './build'

export const LAYERS: Record<LayerId, LayerConfig> = buildLayers(DATA)
/** Layers shown as tabs, in order (Settings is a tab too, always last). */
export const ORDER: LayerId[] = ['toilets', 'libraries', 'bizi', 'wifi', 'charge', 'water']
