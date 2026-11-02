/** Small opening_hours reader. Understands 24/7 and rules like "Mo-Fr 09:00-14:00,16:00-20:00; Sa 10:00-13:00; Su off".
 *  Anything else (PH, months, sunrise, comments...) is "unknown" (null): the caller must keep such items. */
const WD: Record<string, number> = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 }
interface Rule { days: Set<number>; wins: [number, number][] }
type Parsed = { all: true } | { rules: Rule[] } | null

export function parseHours(str: unknown): Parsed {
  if (typeof str !== 'string') return null
  const s = str.trim()
  if (!s) return null
  if (s === '24/7') return { all: true }
  const rules: Rule[] = []
  for (const part of s.split(';')) {
    const p = part.trim()
    if (!p) continue
    const m = p.match(/^([A-Za-z,\- ]*?)\s*((?:\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(?:\s*,\s*)?)+|off|closed)$/i)
    if (!m) return null
    const days = new Set<number>()
    const ds = m[1].trim()
    if (!ds) for (let i = 0; i < 7; i++) days.add(i)
    else {
      for (const tok of ds.split(',')) {
        const r = tok.trim().match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$/)
        if (!r) return null
        const a = WD[r[1]], b = r[2] ? WD[r[2]] : a
        for (let i = a; ; i = (i + 1) % 7) { days.add(i); if (i === b) break }
      }
    }
    const wins: [number, number][] = []
    if (!/^(off|closed)$/i.test(m[2])) {
      for (const w of m[2].split(',')) {
        const q = w.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/)
        if (!q) return null
        const h1 = +q[1], m1 = +q[2], h2 = +q[3], m2 = +q[4]
        const s1 = h1 * 60 + m1, e1 = h2 * 60 + m2
        if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59 || s1 > 1440 || e1 > 1440) return null
        wins.push([s1, e1])
      }
    }
    rules.push({ days, wins })
  }
  return rules.length ? { rules } : null
}

const cache = new Map<string, Parsed>()
/** day: 0=Monday..6=Sunday, min: minutes since midnight (local). */
export function openState(str: string | undefined, day: number, min: number): boolean | null {
  if (!str) return null
  let h = cache.get(str)
  if (h === undefined) { h = parseHours(str); cache.set(str, h) }
  if (!h) return null
  if ('all' in h) return true
  const rules = h.rules
  const winsOf = (d: number) => { let w: [number, number][] | null = null; for (const r of rules) if (r.days.has(d)) w = r.wins; return w }
  const today = winsOf(day)
  if (today) for (const [s, e] of today) if (e > s ? min >= s && min < e : min >= s) return true
  const prev = winsOf((day + 6) % 7)
  if (prev) for (const [s, e] of prev) if (e < s && min < e) return true
  return false
}

/** Current weekday and minute in Zaragoza. */
export function nowMadrid(d = new Date()): { day: number; min: number } {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
    const g = (ty: string) => p.find(x => x.type === ty)!.value
    const days: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
    return { day: days[g('weekday')], min: (+g('hour') % 24) * 60 + +g('minute') }
  } catch {
    return { day: (d.getDay() + 6) % 7, min: d.getHours() * 60 + d.getMinutes() }
  }
}
