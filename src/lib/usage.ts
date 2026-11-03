// What this person uses most, kept on this device only (localStorage). Nothing here is sent anywhere.

/** Taps per service, e.g. { toilets: 12, tram: 3 }. */
export type Taps = Partial<Record<string, number>>

/** Read the saved counts. Anything damaged or odd is ignored, never thrown. */
export function parseTaps(raw: string | null): Taps {
  if (!raw) return {}
  try {
    const v: unknown = JSON.parse(raw)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Taps = {}
    for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[k] = Math.floor(n)
    return out
  } catch { return {} }
}
export const bumpTap = (taps: Taps, id: string): Taps => ({ ...taps, [id]: (taps[id] ?? 0) + 1 })

/**
 * The default order, re-sorted by the person's own tap counts (most used first). Ties keep the default order,
 * so a new visitor (no counts) gets the default. Computed once when the app opens and never again: chips must not jump under a thumb.
 */
export function rankByTaps<T extends string>(defaults: readonly T[], taps: Taps): T[] {
  return defaults.map((id, i) => ({ id, i, n: taps[id] ?? 0 })).sort((a, b) => b.n - a.n || a.i - b.i).map(x => x.id)
}
