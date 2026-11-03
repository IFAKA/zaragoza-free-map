import type { LatLon } from './types'

const mpd = (lat: number): [number, number] => [110540, 111320 * Math.cos(lat * Math.PI / 180)]

/** Compass bearing (degrees, 0 = north) the drawn route runs at the point of it nearest to `p`: the way a bus travels through a stop. Null when no path has a line. */
export function bearingAt(paths: LatLon[][], p: LatLon): number | null {
  const [kn, ke] = mpd(p[0])
  let best = Infinity, out: number | null = null
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1][1] * ke, ay = path[i - 1][0] * kn, bx = path[i][1] * ke, by = path[i][0] * kn
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
    if (!len2) continue
    const t = Math.max(0, Math.min(1, ((p[1] * ke - ax) * dx + (p[0] * kn - ay) * dy) / len2))
    const d = Math.hypot(p[1] * ke - (ax + t * dx), p[0] * kn - (ay + t * dy))
    if (d < best) { best = d; out = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360 }
  }
  return out
}
