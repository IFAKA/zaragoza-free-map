// Live arrival times for the nearest bus or tram stop. Read straight from the city's open API (CORS *, no key, updates about every 30 s).
// Any failure (offline, 404, timeout, odd data) gives null: the card then shows only the link-out, never an error.
export const LIVE_BASE = 'https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano/'
export const LIVE_REFRESH_MS = 30_000
export const LIVE_TIMEOUT_MS = 8_000

export interface Arrival { line: string; dest: string; mins: number[] }
export interface Live { arrivals: Arrival[]; notice: string | null; at: number }
type Get = (url: string, signal?: AbortSignal) => Promise<unknown>

/** "VALDESPARTERA," -> "Valdespartera"; "PLAZA DEL PILAR" -> "Plaza del Pilar". */
export const prettyDest = (s: string): string =>
  s.replace(/[\s.,;:]+$/, '').trim().toLowerCase().replace(/(^|[\s\-(/])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/ (De|Del|La|Las|Los|El|Y|Al)(?= )/g, x => x.toLowerCase())

/** "3 minutos." -> 3, "Ahora"/"Llegando" -> 0, "Sin estimacion" or empty -> null. A number is taken as is. */
export function parseMins(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v) : null
  const s = String(v ?? '').trim().toLowerCase()
  const n = /^(\d+)\s*(min|m\b|minuto)/.exec(s)
  if (n) return +n[1]
  return /^(ahora|llegando|inminente)/.test(s) ? 0 : null
}


/** Group rows by line + destination, soonest first, at most 2 times per row. */
function group(rows: { line: string; dest: string; mins: number | null }[]): Arrival[] {
  const out: Arrival[] = []
  for (const r of rows) {
    if (r.mins === null || !r.line) continue
    let a = out.find(x => x.line === r.line && x.dest === r.dest)
    if (!a) out.push(a = { line: r.line, dest: r.dest, mins: [] })
    a.mins.push(r.mins)
  }
  for (const a of out) a.mins = a.mins.sort((x, y) => x - y).slice(0, 2)
  return out.sort((a, b) => a.mins[0] - b.mins[0])
}

interface BusJson { destinos?: { linea?: string; destino?: string; primero?: string; segundo?: string }[] }
export function parseBus(j: unknown, now: number): Live | null {
  const ds = (j as BusJson | null)?.destinos
  if (!Array.isArray(ds)) return null
  const rows = ds.flatMap(d => [d.primero, d.segundo].map(v => ({ line: String(d.linea ?? '').trim(), dest: prettyDest(String(d.destino ?? '')), mins: parseMins(v) })))
  return { arrivals: group(rows), notice: null, at: now }
}

/** A message is a service notice when it talks about a strike, an incident or a service change; the phone and website boilerplate is ignored. */
export const NOTICE_RE = /huelga|servicio|incidencia|interrump|corte|obras|desv[ií]o|retraso|suspend/i
export const pickNotice = (msgs: unknown): string | null => {
  if (!Array.isArray(msgs)) return null
  const m = msgs.map(x => String(x ?? '').replace(/^[.\s]+/, '').trim()).find(x => x && !/www\.|tel[eé]fono|c[oó]digo qr|ocupaci[oó]n/i.test(x) && NOTICE_RE.test(x))
  if (!m) return null
  // the city writes notices in capitals: make it a normal sentence
  return m.replace(/\s+/g, ' ').toLowerCase().replace(/(^|[.!?]\s+|^\d\d\/\d\d\s+)(\p{L})/gu, (_a, pre: string, c: string) => pre + c.toUpperCase())
}

interface TramJson { destinos?: { linea?: string; destino?: string; minutos?: unknown }[]; mensajes?: unknown }
export function parseTram(js: unknown[], now: number): Live | null {
  const rows: { line: string; dest: string; mins: number | null }[] = []
  let notice: string | null = null, any = false
  for (const j of js) {
    const t = j as TramJson | null
    if (!t || !Array.isArray(t.destinos)) continue
    any = true
    for (const d of t.destinos) rows.push({ line: String(d.linea ?? '').trim(), dest: prettyDest(String(d.destino ?? '')), mins: parseMins(d.minutos) })
    notice ??= pickNotice(t.mensajes)
  }
  return any ? { arrivals: group(rows), notice, at: now } : null
}

async function defaultGet(url: string, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(LIVE_TIMEOUT_MS)
  const r = await fetch(url, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

/** Live times for a city bus stop number ("688"). Null on any failure. Rural stops (id "r4") have no live data. */
export async function loadBus(stop: string, signal?: AbortSignal, get: Get = defaultGet, now: () => number = Date.now): Promise<Live | null> {
  if (!/^\d+$/.test(stop)) return null
  try { return parseBus(await get(`${LIVE_BASE}poste-autobus/tuzsa-${stop}.json`, signal), now()) } catch { return null }
}

/** Live times for a tram stop (one request per platform, so both directions show). Null when none answered. */
export async function loadTram(ids: string[], signal?: AbortSignal, get: Get = defaultGet, now: () => number = Date.now): Promise<Live | null> {
  if (!ids.length) return null
  const js = await Promise.all(ids.map(id => get(`${LIVE_BASE}parada-tranvia/${id}.json`, signal).catch(() => null)))
  return parseTram(js, now())
}
