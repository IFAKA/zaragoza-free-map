import type { LayerId } from '../lib/types'
import { seasonOf } from '../lib/season'

/**
 * The service chips, in the order a new visitor sees them. The person's own taps re-sort the row when the app opens (lib/usage.ts).
 * Adding a service = add its id here (and its layer in build.ts). Nothing else.
 */
export const SERVICES: LayerId[] = ['toilets', 'water', 'pharmacy', 'shelter', 'bus', 'tram', 'bizi', 'cercanias', 'wifi', 'charge', 'libraries']

/** The default chip order. Warm indoor places (shelter) come 3rd from 1 Nov to 31 Mar (device date), 4th otherwise. */
export function serviceOrder(date: Date = new Date()): LayerId[] {
  if (seasonOf(date) !== 'warm') return [...SERVICES]
  const rest = SERVICES.filter(l => l !== 'shelter')
  return [...rest.slice(0, 2), 'shelter', ...rest.slice(2)]
}
