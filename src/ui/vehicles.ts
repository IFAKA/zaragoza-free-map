import { createContext, useContext, useEffect } from 'react'
import type { Vehicle } from '../lib/vehicles'

/** A card publishes the estimated vehicles of its stop here (App passes them to the map). */
export const VehicleCtx = createContext<(v: Vehicle[]) => void>(() => {})

/** Publishes `list` while the card is mounted; the markers go away when it unmounts. An empty list clears them. */
export function usePublishVehicles(list: Vehicle[]) {
  const publish = useContext(VehicleCtx)
  const sig = JSON.stringify(list)
  useEffect(() => { publish(list) }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => publish([]), []) // eslint-disable-line react-hooks/exhaustive-deps
}
