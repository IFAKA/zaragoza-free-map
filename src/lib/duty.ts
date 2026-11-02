// Pharmacies on duty today. The one runtime request of the app (approved exception to "no runtime APIs"):
// the list changes every day, so a baked snapshot would be wrong. The city API answers with Access-Control-Allow-Origin: *.
// Rule: a list is only ever shown if its duty date is TODAY in Madrid. Yesterday's list is never shown as today's.
import { lsGet, lsSet } from './cache'
import { dutyRows, type DutyRow } from './sources.ts'

export const DUTY_URL = 'https://www.zaragoza.es/sede/servicio/farmacia.json?rows=500&srsname=wgs84'
export const DUTY_PAGE = 'https://www.zaragoza.es/sede/servicio/farmacia'

/** Today's date in Madrid as YYYY-MM-DD (not the device's own time zone). */
export const madridDate = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

/** Keep only a list whose rows are all for `today`; anything else (empty, old, mixed) is not today's list. */
export const todays = (rows: DutyRow[], today: string): DutyRow[] | null =>
  rows.length > 0 && rows.every(r => r[6] === today) ? rows : null

/** The saved list, only if it is for today. */
export function readDutyCache(today: string): DutyRow[] | null {
  try {
    const c = JSON.parse(lsGet('duty') || 'null') as { date?: string; rows?: DutyRow[] } | null
    return c && c.date === today && Array.isArray(c.rows) ? todays(c.rows, today) : null
  } catch { return null }
}

/**
 * Today's duty list: from the city if it answers with today's list (and saves it), else the saved list if that is for today, else null.
 * `get` is injected for tests.
 */
export async function loadDuty(today: string, get: (url: string) => Promise<unknown> = defaultGet): Promise<DutyRow[] | null> {
  try {
    const rows = todays(dutyRows((await get(DUTY_URL)) as Parameters<typeof dutyRows>[0]), today)
    if (rows) { lsSet('duty', JSON.stringify({ date: today, rows })); return rows }
  } catch { /* offline, slow or blocked: fall back to the saved list for today */ }
  return readDutyCache(today)
}
async function defaultGet(url: string): Promise<unknown> {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}
