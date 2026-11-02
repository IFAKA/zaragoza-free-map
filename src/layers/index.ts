import type { LayerConfig, LayerId } from '../lib/types'
import { bizi } from './bizi'
import { charge } from './charge'
import { libraries } from './libraries'
import { toilets } from './toilets'
import { water } from './water'
import { wifi } from './wifi'

export const LAYERS: Record<LayerId, LayerConfig> = { water, toilets, charge, wifi, libraries, bizi }
export const ORDER: LayerId[] = ['water', 'toilets', 'charge', 'wifi']
export const MORE: LayerId[] = ['libraries', 'bizi']
