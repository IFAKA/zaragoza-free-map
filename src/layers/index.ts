import { DATA } from '../data'
import type { LayerConfig, LayerId } from '../lib/types'
import { seasonOf } from '../lib/season'
import { buildLayers } from './build'

export const LAYERS: Record<LayerId, LayerConfig> = buildLayers(DATA)
/** Tab order by how often each need is used: toilets, water, Bizi, bus, pharmacy, WiFi, charge, libraries. */
const BASE: LayerId[] = ['toilets', 'water', 'bizi', 'bus', 'pharmacy', 'wifi', 'charge', 'libraries']
/** Layers shown as tabs, in order (Settings is a button in the header). Warm indoor places come 3rd from 1 Nov to 31 Mar (device date), last otherwise. */
export const layerOrder = (date: Date = new Date()): LayerId[] => (seasonOf(date) === 'warm' ? [...BASE.slice(0, 2), 'shelter', ...BASE.slice(2)] : [...BASE, 'shelter'])
export const ORDER: LayerId[] = layerOrder()
/** Layer shown to a first-time visitor: always toilets (a choice saved on the device wins; see App). */
export const defaultLayer = (): LayerId => 'toilets'
