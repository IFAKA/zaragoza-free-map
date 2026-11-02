import { DATA } from '../data'
import type { LayerConfig, LayerId } from '../lib/types'
import { seasonOf } from '../lib/season'
import { buildLayers } from './build'

export const LAYERS: Record<LayerId, LayerConfig> = buildLayers(DATA)
const BASE: LayerId[] = ['bus', 'toilets', 'libraries', 'bizi', 'wifi', 'charge', 'water', 'racks']
/** Layers shown as tabs, in order (Settings is a button in the header). Warm indoor places come first from 1 Nov to 31 Mar (device date), last otherwise. */
export const layerOrder = (date: Date = new Date()): LayerId[] => (seasonOf(date) === 'warm' ? ['shelter', ...BASE] : [...BASE, 'shelter'])
export const ORDER: LayerId[] = layerOrder()
/** Layer shown when the person has not chosen one yet. */
export const defaultLayer = (date: Date = new Date()): LayerId => layerOrder(date)[0] === 'shelter' ? 'shelter' : 'toilets'
