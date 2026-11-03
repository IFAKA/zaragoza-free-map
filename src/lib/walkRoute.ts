// Walking route along real streets (OSM foot profile). The dotted line follows it; on any failure the caller keeps a straight line.
export type LatLng = [number, number]

const cache = new Map<string, LatLng[]>()
const r = (n: number) => n.toFixed(4) // ~10 m: small GPS moves reuse the same route

export async function walkRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<LatLng[] | null> {
  const key = `${r(from[0])},${r(from[1])}|${r(to[0])},${r(to[1])}`
  const hit = cache.get(key)
  if (hit) return hit
  try {
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const j = await res.json()
    const c: [number, number][] | undefined = j?.routes?.[0]?.geometry?.coordinates
    if (!c || c.length < 2) return null
    const path = [from, ...c.map(([lon, lat]) => [lat, lon] as LatLng), to]
    if (cache.size > 50) cache.clear()
    cache.set(key, path)
    return path
  } catch {
    return null
  }
}
