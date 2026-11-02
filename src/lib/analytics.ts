/** Anonymous usage statistics (Umami cloud, EU). Cookieless. Never sends location, searches or any personal data. */
const SRC = 'https://cloud.umami.is/script.js'

/** Pure guard: load the script only in a production build, with a website id, and when the browser does not ask for Do Not Track. */
export function shouldLoadAnalytics(o: { prod: boolean; id?: string; dnt?: string | null }): boolean {
  return o.prod && !!o.id && o.dnt !== '1'
}

export function initAnalytics(): void {
  const id = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined
  if (typeof document === 'undefined' || !id || !shouldLoadAnalytics({ prod: import.meta.env.PROD, id, dnt: navigator.doNotTrack })) return
  if (document.querySelector('script[data-website-id]')) return
  const s = document.createElement('script')
  s.defer = true
  s.src = SRC
  s.dataset.websiteId = id
  s.dataset.doNotTrack = 'true'
  document.head.appendChild(s)
}

type Umami = { track: (name: string, data?: Record<string, string>) => void }
/** Event names: 'tab' {layer}, 'select' {layer}, 'directions' {layer}, 'report'. Only layer ids, never places, positions or text. */
export function track(name: 'tab' | 'select' | 'directions' | 'report', layer?: string): void {
  try { (window as unknown as { umami?: Umami }).umami?.track(name, layer ? { layer } : undefined) } catch { /* analytics must never break the app */ }
}
