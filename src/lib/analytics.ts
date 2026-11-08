/** Anonymous usage statistics (GoatCounter). Cookieless. Never sends location, searches or any personal data. */
const SRC = 'https://gc.zgo.at/count.js'

/** Pure guard: load the script only in a production build, with a site code, and when the browser does not ask for Do Not Track. */
export function shouldLoadAnalytics(o: { prod: boolean; id?: string; dnt?: string | null }): boolean {
  return o.prod && !!o.id && o.dnt !== '1'
}

export function initAnalytics(): void {
  const code = import.meta.env.VITE_GOATCOUNTER_CODE as string | undefined
  if (typeof document === 'undefined' || !code || !shouldLoadAnalytics({ prod: import.meta.env.PROD, id: code, dnt: navigator.doNotTrack })) return
  if (document.querySelector('script[data-goatcounter]')) return
  const s = document.createElement('script')
  s.async = true
  s.src = SRC
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`
  s.dataset.goatcounterSettings = goatSettings()
  document.head.appendChild(s)
}

/** The name every page view is counted under, in any language, so "/" groups as one page. */
export const PAGE_TITLE = 'Zaragoza a mano'
/** The GoatCounter settings for the script tag (data-goatcounter-settings). */
export const goatSettings = () => JSON.stringify({ title: PAGE_TITLE })

type GoatCounter = { count: (o: { path: string; title?: string; event?: boolean }) => void }
/**
 * Every event the app sends. The path is the name, plus "-" and one detail when there is one. Details are only layer ids, a language code
 * or a closing way, never places, positions or text.
 *  tab: a service shown, on a real switch (layer id)
 *  select: a list row or marker picked (layer id)           directions: walking directions opened (layer id)
 *  bus-line: a bus line tapped on a stop card, to draw its route (the line number, e.g. bus-line-38)
 *  report: the OpenStreetMap report link
 *  locate-granted / locate-denied: the answer to the location question
 *  settings-open / settings-close (x, back or escape)       lang: language changed (en or es)
 */
export const EVENTS = ['tab', 'select', 'bus-line', 'locate-granted', 'locate-denied', 'settings-open', 'settings-close', 'lang'] as const
export type EventName = (typeof EVENTS)[number]
export function track(name: EventName, detail?: string): void {
  try { (window as unknown as { goatcounter?: GoatCounter }).goatcounter?.count({ path: detail ? `${name}-${detail}` : name, title: name, event: true }) } catch { /* analytics must never break the app */ }
}
