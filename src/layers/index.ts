import { DATA } from '../data'
import type { LayerConfig, LayerId } from '../lib/types'
import { buildLayers } from './build'
import { serviceOrder } from './goals'

export const LAYERS: Record<LayerId, LayerConfig> = buildLayers(DATA)
/** Every service in chip order. Warm indoor places come 3rd from 1 Nov to 31 Mar (device date). */
export const layerOrder = (date: Date = new Date()): LayerId[] => serviceOrder(date)
export const ORDER: LayerId[] = layerOrder()
/** Layer shown to a first-time visitor: always toilets (a choice saved on the device wins; see App). */
export const defaultLayer = (): LayerId => 'toilets'
