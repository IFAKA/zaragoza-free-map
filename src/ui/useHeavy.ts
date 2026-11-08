import { useSyncExternalStore } from 'react'
import { heavyVersion, subscribeHeavy } from '../layers'

/** Changes when the bus stops and bike racks have loaded (see layers/index.ts): put it in the deps of anything built from layer items. */
export const useHeavy = (): number => useSyncExternalStore(subscribeHeavy, heavyVersion)
