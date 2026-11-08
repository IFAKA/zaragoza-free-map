// Bus stops and bike racks: the two biggest files. They load after the first screen (layers/index.ts), so the first visit downloads less.
import type { BusRow, RackRow } from '../lib/sources.ts'
import { closedBusStops, type Heavy, type Snap } from './index'

let loading: Promise<Heavy> | null = null
export const loadHeavy = (): Promise<Heavy> => (loading ??= Promise.all([import('./bus.json'), import('./racks.json')]).then(([b, r]) => {
  const closed = closedBusStops()
  const bus = b.default as unknown as Snap<BusRow>
  return { bus: { ...bus, rows: bus.rows.filter(x => !closed.has(String(x[0]))) }, racks: r.default as unknown as Snap<RackRow> }
}))
