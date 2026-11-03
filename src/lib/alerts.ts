// Renfe service alerts (GTFS-RT, JSON) for the Zaragoza Cercanías line. The feed has no CORS header, so vercel.json proxies it at /api/renfe-alerts (cached 2 min).
// Any failure (offline, dev server without the proxy) gives no alerts: a notice is a bonus, never a blocker.
export interface RailAlert { id: string; text: string; stops: string[] }

interface Feed { entity?: { id: string; alert?: { informedEntity?: { routeId?: string; stopId?: string }[]; descriptionText?: { translation?: { text: string; language?: string }[] }; headerText?: { translation?: { text: string; language?: string }[] }; activePeriod?: { start?: string; end?: string }[] } }[] }

/** Keeps the alerts that name a Zaragoza route (ids start with 70T) or one of our stations, active now. */
export function zaragozaAlerts(feed: Feed, stations: Set<string>, now = Date.now() / 1000): RailAlert[] {
  const out: RailAlert[] = []
  for (const e of feed.entity ?? []) {
    const a = e.alert
    if (!a) continue
    const ie = a.informedEntity ?? []
    const mine = ie.some(x => /^70T/.test(x.routeId ?? '') || (x.stopId && stations.has(x.stopId)))
    if (!mine) continue
    const p = a.activePeriod?.[0]
    if (p && ((p.start && +p.start > now) || (p.end && +p.end < now))) continue
    const tr = [...(a.descriptionText?.translation ?? []), ...(a.headerText?.translation ?? [])]
    const text = (tr.find(x => x.language === 'es') ?? tr[0])?.text?.trim()
    if (text) out.push({ id: e.id, text, stops: ie.map(x => x.stopId).filter((s): s is string => !!s) })
  }
  return out
}

let cache: Promise<RailAlert[]> | null = null
export const loadRailAlerts = (stations: Set<string>): Promise<RailAlert[]> =>
  (cache ??= fetch('/api/renfe-alerts', { signal: AbortSignal.timeout(8000) })
    .then(r => (r.ok ? r.json() : { entity: [] }))
    .then(f => zaragozaAlerts(f as Feed, stations))
    .catch(() => []))
