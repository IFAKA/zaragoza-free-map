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
  document.head.appendChild(s)
}

type GoatCounter = { count: (o: { path: string; title?: string; event?: boolean }) => void }
/** Event names: 'tab', 'select', 'directions' (with the layer id) and 'report'. Only layer ids, never places, positions or text. */
export function track(name: 'tab' | 'select' | 'directions' | 'report', layer?: string): void {
  try { (window as unknown as { goatcounter?: GoatCounter }).goatcounter?.count({ path: layer ? `${name}-${layer}` : name, title: name, event: true }) } catch { /* analytics must never break the app */ }
}
