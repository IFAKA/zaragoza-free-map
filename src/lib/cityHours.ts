// Conservative reader for the free-text `horario` HTML of city libraries and civic centres (Spanish).
// Rule: if anything in the text is not understood, return null ("hours unknown"). Never guess.
// No imports on purpose: scripts/build-data.mjs runs this file with plain Node.

export interface CitySched { r: string; s?: string; sf?: number; st?: number; u?: [number, number] }

const DAYS: Record<string, number> = { lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, sabados: 5, domingo: 6, domingos: 6 }
const OSM_DAY = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 }
const ENT: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', ordm: 'º', ordf: 'ª' }

/** HTML -> plain text lines. */
export function htmlLines(html: string): string[] {
  const s = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?(?:br|li|p|ul|ol|div|h\d)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m)
  return s.split(/[\r\n]+/).map(l => l.replace(/[\s ]+/g, ' ').trim()).filter(Boolean)
}

const strip = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const DAY = '(?:lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)'
const DAYITEM = `${DAY}(?:\\s*(?:a|al|-)\\s*${DAY})?`
const DAYSPEC = `(?:de\\s+)?${DAYITEM}(?:\\s*(?:,|y|e)\\s*${DAYITEM})*`
const T = "(\\d{1,2})(?:[.,:'’](\\d{2}))?"
const RANGE = `(?:de\\s+)?${T}\\s*(?:h(?:oras?|rs?)?\\.?)?\\s*(?:a|-)\\s*${T}`
const SEG_SPLIT = new RegExp(`(?<=[\\d.]|\\dh|horas)\\s+y\\s+(?=(?:de\\s+)?${DAY}\\b)`, 'g')

// "... 22 h. Domingos de 8 a 15 h." / "... 23 horas Sabados de ..." / "... 19.00- Sabado de ...": a new day spec starts right after a time
const SENT_SPLIT = new RegExp(`(?:(?<=\\d\\s*(?:h|hs|horas)?\\.)\\s+|(?<=\\d\\s*(?:h|hs|horas))\\s+|(?<=\\d)\\s*[-–]\\s*)(?=(?:de\\s+)?(?:${DAY}|laborables)\\b)`, 'g')
const MON = '(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)'
/** A line about fixed dates ("24 y 31 diciembre: de 10 a 14h", "Dias 25 de diciembre y 1 de enero, cerrado", "Horario especial:"). Fixed-date exceptions are not modelled (the card says hours can differ on holidays). */
const DATE_LINE = new RegExp(`^(?:horario especial:?$|el acceso del publico se interrumpe\\b|(?:dias?\\s+)?\\d{1,2}(?:\\s+(?:de\\s+)?${MON})?(?:\\s*(?:,|y)\\s*\\d{1,2}(?:\\s+(?:de\\s+)?${MON})?)*\\s+(?:de\\s+)?${MON}\\b(?!.*${DAY}))`)
const ALL_DAY = /^(?:servicio\s+(?:las\s+)?)?24\s+horas(?:\s+al\s+dia)?(?:,?\s+todos\s+los\s+dias(?:\s+del\s+ano)?)?\.?$/

type Wins = [number, number][]
const toMin = (h: string, m?: string) => +h * 60 + (m ? +m : 0)

/** One schedule segment such as "de lunes a viernes de 8.30 a 14.30 horas". Returns day -> windows, or null. */
function parseSegment(raw: string): Map<number, Wins> | null {
  let s = strip(raw).replace(/\s+y\s+festivos\b/g, '').replace(/\blaborables\b/g, 'lunes a viernes')
    .replace(/^(?:el\s+)?horario(?:\s+de\s+apertura)?(?:\s+del?\s+centro)?,?(?:\s+es)?(?:\s+de)?\s+(?=lunes|martes|miercoles|jueves|viernes|sabado|domingo)/, '').replace(/^horario:?\s*/, '').replace(/\s+/g, ' ').trim()
  s = s.replace(/[.;]+$/, '').trim()
  const dm = new RegExp(`^(${DAYSPEC})\\s*[:,]?\\s*(.*)$`).exec(s)
  if (!dm) return null
  const days = new Set<number>()
  const items = new RegExp(`(${DAY})(?:\\s*(?:a|al|-)\\s*(${DAY}))?`, 'g')
  let m: RegExpExecArray | null
  while ((m = items.exec(dm[1]))) {
    const a = DAYS[m[1]], b = m[2] ? DAYS[m[2]] : a
    for (let i = a; ; i = (i + 1) % 7) { days.add(i); if (i === b) break }
  }
  const rest = dm[2].replace(/^de\s+/, '').trim()
  const wins: Wins = []
  if (/^cerrad[oa]s?$/.test(rest) || rest === '') {
    if (rest === '') return null // days without hours: unknown
  } else {
    const re = new RegExp(`^${RANGE}(?:\\s*h(?:oras?|rs?)?\\.?)?`)
    let r = rest
    while (r) {
      const w = re.exec(r)
      if (!w) return null
      const s1 = toMin(w[1], w[2]), e1 = toMin(w[3], w[4])
      if (+w[1] > 24 || +w[3] > 24 || (w[2] && +w[2] > 59) || (w[4] && +w[4] > 59) || e1 <= s1 || e1 > 1440) return null
      wins.push([s1, e1])
      r = r.slice(w[0].length).replace(/^\s*(?:y|,|;)\s*/, '').trim()
      if (r && !/^(?:de\s+)?\d/.test(r)) return null
    }
  }
  const out = new Map<number, Wins>()
  for (const d of days) out.set(d, wins)
  return out
}

const hhmm = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
/** day -> windows to an OSM-style string, e.g. "Mo 15:00-21:00; Tu-Fr 08:30-21:00; Sa 09:30-14:00; Su off". */
function toOsm(byDay: Map<number, Wins>): string {
  const key = (d: number) => (byDay.get(d) || []).map(([a, b]) => hhmm(a) + '-' + hhmm(b)).join(',')
  const parts: string[] = []
  for (let d = 0; d < 7;) {
    let e = d
    while (e + 1 < 7 && key(e + 1) === key(d)) e++
    const label = d === e ? OSM_DAY[d] : OSM_DAY[d] + '-' + OSM_DAY[e]
    parts.push(label + ' ' + (key(d) || 'off'))
    d = e + 1
  }
  return parts.join('; ')
}

function parseSection(lines: string[]): Map<number, Wins> | null {
  const byDay = new Map<number, Wins>()
  let any = false
  for (const line of lines) {
    const sl = strip(line)
    if (ALL_DAY.test(sl)) { // open round the clock, every day
      any = true
      for (let d = 0; d < 7; d++) byDay.set(d, [[0, 1440]])
      continue
    }
    for (const seg of sl.split(';').flatMap(x => x.split(SEG_SPLIT)).flatMap(x => x.split(SENT_SPLIT))) {
      if (!seg.trim()) continue
      const r = parseSegment(seg)
      if (!r) return null
      any = true
      for (const [d, w] of r) byDay.set(d, [...(byDay.get(d) || []), ...w].sort((a, b) => a[0] - b[0]))
    }
  }
  if (!any) return null
  for (const w of byDay.values()) for (let i = 1; i < w.length; i++) if (w[i][0] < w[i - 1][1]) return null // overlap: do not trust
  return byDay
}

/** Parse a `horario` field. null = unknown. */
export function parseCityHorario(html: string | undefined | null): CitySched | null {
  if (!html) return null
  const lines = htmlLines(html)
  if (!lines.length) return null
  const reg: string[] = [], sum: string[] = []
  let cur = reg
  let season: [number, number] | undefined
  let u: [number, number] | undefined
  for (const line of lines) {
    const l = strip(line)
    const hv = /^horario de verano\s*\(?\s*del?\s+(\d{1,2})\s+de\s+([a-z]+)\s+al\s+(\d{1,2})\s+de\s+([a-z]+)\s*\)?\.?$/.exec(l)
    if (hv) {
      const m1 = MONTHS[hv[2]], m2 = MONTHS[hv[4]]
      if (!m1 || !m2 || season) return null
      season = [m1 * 100 + +hv[1], m2 * 100 + +hv[3]]
      cur = sum
      continue
    }
    if (/^horario:?$/.test(l) || DATE_LINE.test(l)) continue
    // a yearly closed period: "Cerrada del 1 al 16 de agosto", "Cerrada del 31 de julio al 14 de agosto"
    const cp = new RegExp(`^cerrad[oa]s?\\s+del\\s+(\\d{1,2})(?:\\s+de\\s+(${MON}))?\\s+al\\s+(\\d{1,2})\\s+de\\s+(${MON})\\.?$`).exec(l)
    if (cp) {
      const m2 = MONTHS[cp[4]], m1 = cp[2] ? MONTHS[cp[2]] : m2
      if (u) return null
      u = [m1 * 100 + +cp[1], m2 * 100 + +cp[3]]
      continue
    }
    if (/^cerrado[s]?:/.test(l) || /^fines de semana de julio y agosto\.?$/.test(l)) {
      // fixed public-holiday closures are not modelled (the card says hours can differ on holidays); a closed summer weekend is
      if (/julio/.test(l)) u = [701, 831]
      if (/verano|invierno|navidad|semana santa/.test(l)) return null
      continue
    }
    if (/verano|invierno|lectiv|vacacion|navidad|semana santa|cita previa|nuevo aviso|exclusiv/.test(l)) return null
    cur.push(line)
  }
  const a = parseSection(reg)
  if (!a) return null
  const out: CitySched = { r: toOsm(a) }
  if (season) {
    const b = parseSection(sum)
    if (!b) return null
    out.s = toOsm(b); out.sf = season[0]; out.st = season[1]
  } else if (sum.length) return null
  if (u) out.u = u
  return out
}

/** The OSM-style hours string that applies on month/day `md` (month*100+day), or null when unknown on that date. */
export function schedFor(s: CitySched, md: number): string | null {
  if (s.u && md >= s.u[0] && md <= s.u[1]) return null
  if (s.s && s.sf != null && s.st != null && (s.sf <= s.st ? md >= s.sf && md <= s.st : md >= s.sf || md <= s.st)) return s.s
  return s.r
}
