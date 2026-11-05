import { MS } from './motion'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '../lib/leafletGlobal'
import 'leaflet.markercluster'
import { useEffect, useRef } from 'react'
import { CENTER } from '../lib/geo'
import { pointAt } from '../lib/transit'
import { bearingAt } from '../lib/pathBearing'
import { walkRoute } from '../lib/walkRoute'
import type { LatLon, LayerConfig, RankedItem } from '../lib/types'
import { iconHtml } from './icons'
import { arrowBearing, type Vehicle } from '../lib/vehicles'

export interface FlyRequest { n: number; to: LatLon; zoom: number; fitUser?: LatLon; soft?: boolean }
/** A bus line to draw in place of the markers: its route pieces, its stops in order, and which stop is the current one (-1 = none). */
export interface RouteView { key: string; paths: LatLon[][]; stops: { post: string; name: string; lat: number; lon: number }[]; cur: number }
interface Props {
  layer: LayerConfig
  items: RankedItem[]
  selected: string | null
  /** Counts up on every pick by the person (a row or a marker), never on a refresh: each one plays the pick moment once. */
  pick: number
  userPos: LatLon | null
  fly: FlyRequest | null
  /** Pixels at the bottom of the map that the drawer covers. */
  inset: () => number
  showRange: boolean
  desktop: boolean
  onSelect: (id: string) => void
  onBackgroundClick: () => void
  /** A bus line to show instead of the markers (the map frames it above the sheet), and a stop of it tapped. `fitN` counts up to frame it again (the sheet changed height). */
  route?: RouteView | null
  /** A rail line drawn thin under the stops (tram, Cercanías). */
  track?: LatLon[][] | null
  fitN?: number
  /** Estimated vehicles (tram, Cercanías), drawn small and faded under the stop markers. They slide to a new place on a refresh. */
  vehicles?: Vehicle[]
  vehBadge?: string
  vehStart?: string
  onRouteStop?: (post: string) => void
  label: string
  zoomTitles: { in: string; out: string }
}
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches
/** WiFi range estimate in metres: ~40 m around a city building, ~25 m around an OpenStreetMap venue. */
export const rangeMetres = (it: { building?: boolean }) => (it.building ? 40 : 25)
// Esri light/dark gray canvas: keyless, looks like Positron / Dark Matter. CARTO's own tile URLs now answer "API KEY REQUIRED".
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/'
const TILES = (d: boolean) => `${ESRI}${d ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base'}/MapServer/tile/{z}/{y}/{x}`
const LABELS = (d: boolean) => `${ESRI}${d ? 'World_Dark_Gray_Reference' : 'World_Light_Gray_Reference'}/MapServer/tile/{z}/{y}/{x}`

/** Plain Leaflet, driven from React effects. Markers live in one layer group (no React element per marker). */
/** The bus mark nearest the current stop (about every 5% of each piece of the route, not on the stop itself). Estimated, like the others. */
function nearBus(route: RouteView): { pt: [number, number]; bearing: number } | null {
  const cur = route.stops[route.cur]
  if (!cur) return null
  const here = L.latLng(cur.lat, cur.lon)
  let best: { pt: [number, number]; bearing: number } | null = null, bd = Infinity
  for (const path of route.paths) for (let f = 0.05; f < 1; f += 0.05) {
    const a = pointAt(path, f)
    if (!a) continue
    const d = here.distanceTo(L.latLng(a.pt[0], a.pt[1]))
    if (d > 150 && d < bd) { bd = d; best = { pt: [a.pt[0], a.pt[1]], bearing: a.bearing } }
  }
  return best ?? (route.paths[0]?.length ? { pt: route.paths[0][0] as [number, number], bearing: pointAt(route.paths[0], 0.01)?.bearing ?? 0 } : null) // no mark: the start of the direction
}

/** An arrow above the closest place (the stop), turned the way the vehicle arrives (prev to the stop), clear of the stop and the lines. */
function lineArrow(bearing: number, to: LatLon, color: string, up = 33): L.Marker {
  const html = `<b class="vdir mid" style="--c:${color};transform:rotate(${Math.round(bearing)}deg)"><svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true"><path d="M6 1 11 11 6 8.5 1 11Z" fill="var(--c)" stroke="var(--color-on-brand)" stroke-width="2" stroke-linejoin="round"/></svg></b>`
  return L.marker(to, { icon: L.divIcon({ className: 'mkw', html, iconSize: [14, 14], iconAnchor: [7, up] }), interactive: false, keyboard: false, pane: 'vehPane' })
}

/** A small arrow above a marker that points the way it travels (bearing in degrees, 0 = north). */
const dirHtml = (bearing: number) => `<b class="vdir" style="transform:rotate(${Math.round(bearing)}deg)"><svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true"><path d="M6 1 11 11 6 8.5 1 11Z" fill="var(--c, currentColor)" stroke="var(--color-on-brand)" stroke-width="2" stroke-linejoin="round"/></svg></b>`

export function MapView({ layer, items, selected, pick, userPos, fly, inset, showRange, desktop, onSelect, onBackgroundClick, route = null, track = null, fitN = 0, vehicles = [], vehBadge = '', vehStart = '', onRouteStop, label, zoomTitles }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const group = useRef<L.MarkerClusterGroup | null>(null)
  const rings = useRef<L.LayerGroup | null>(null)
  const markers = useRef(new Map<string, { mk: L.Marker; kind: number }>())
  const sig = useRef('')
  const me = useRef<L.Marker | null>(null)
  const vehGroup = useRef<L.LayerGroup | null>(null)
  const vehLine = useRef<L.Polyline | null>(null)
  const vehArrow = useRef<L.Marker | null>(null)
  const walkLine = useRef<L.Polyline | null>(null)
  const vehs = useRef(new Map<string, { mk: L.Marker; raf: number; fit: string }>())
  const routeGroup = useRef<L.LayerGroup | null>(null)
  const cb = useRef({ onSelect, onBackgroundClick, inset, onRouteStop, desktop })
  cb.current = { onSelect, onBackgroundClick, inset, onRouteStop, desktop }
  const live = useRef({ layer, items, selected, showRange, vehicles })
  live.current = { layer, items, selected, showRange, vehicles }

  // the zoom buttons are made once by Leaflet: follow a language change here
  useEffect(() => {
    const c = el.current
    c?.querySelector('.leaflet-control-zoom-in')?.setAttribute('title', zoomTitles.in)
    c?.querySelector('.leaflet-control-zoom-in')?.setAttribute('aria-label', zoomTitles.in)
    c?.querySelector('.leaflet-control-zoom-out')?.setAttribute('title', zoomTitles.out)
    c?.querySelector('.leaflet-control-zoom-out')?.setAttribute('aria-label', zoomTitles.out)
  }, [zoomTitles.in, zoomTitles.out])

  useEffect(() => { el.current?.classList.toggle('rail', !!track) }, [track])

  const drawRings = () => {
    const m = map.current, g = rings.current
    if (!m || !g) return
    g.clearLayers()
    const { layer, items, selected, showRange } = live.current
    if (layer.id !== 'wifi' || !showRange) return
    const col = getComputedStyle(document.documentElement).getPropertyValue('--color-wifi').trim() // canvas needs a real colour, not var()
    const style = (r: number, c: L.LatLng) => L.circle(c, { radius: r, color: col, weight: 1.5, dashArray: '5 4', fillColor: col, fillOpacity: 0.08, interactive: false })
    const view = m.getBounds().pad(0.3), z = m.getZoom()
    for (const it of items) {
      const isSel = it.id === selected
      if (!isSel && (z < 16 || !view.contains([it.lat, it.lon]))) continue
      style(rangeMetres(it), L.latLng(it.lat, it.lon)).addTo(g)
    }
  }

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, attributionControl: true, renderer: L.canvas({ padding: 0.5, tolerance: 8 }) }).setView(CENTER, 15)
    if (desktop) L.control.zoom({ position: 'bottomright', zoomInTitle: zoomTitles.in, zoomOutTitle: zoomTitles.out }).addTo(m)
    m.attributionControl.setPosition('topleft') // top left: the Settings button floats at the top right
    m.on('click', () => cb.current.onBackgroundClick())
    const tiles = L.tileLayer(TILES(dark()), { maxZoom: 19, maxNativeZoom: 16, attribution: 'Tiles © Esri, HERE, Garmin, OpenStreetMap contributors' }).addTo(m)
    const labels = L.tileLayer(LABELS(dark()), { maxZoom: 19, maxNativeZoom: 16, pane: 'shadowPane' }).addTo(m)
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => { tiles.setUrl(TILES(dark())); labels.setUrl(LABELS(dark())) }
    mq.addEventListener('change', onScheme)
    rings.current = L.layerGroup().addTo(m)
    routeGroup.current = L.layerGroup().addTo(m)
    m.createPane('vehPane').style.zIndex = '640' // above the stop markers (markerPane 600), whatever their screen position
    vehGroup.current = L.layerGroup().addTo(m)
    // close markers merge into a numbered circle when zoomed out; from zoom 16 each one shows on its own
    group.current = L.markerClusterGroup({ maxClusterRadius: 50, disableClusteringAtZoom: 16, showCoverageOnHover: false, spiderfyOnMaxZoom: false, chunkedLoading: true, iconCreateFunction: c => { const n = c.getChildCount(); return L.divIcon({ className: 'mkw', html: `<div class="mkc" style="--c:${live.current.layer.color}">${n}</div>`, iconSize: [38, 38], iconAnchor: [19, 19] }) } }).addTo(m)
    map.current = m
    m.on('moveend zoomend', drawRings)
    const far = () => el.current?.classList.toggle('far', m.getZoom() < 15) // zoomed out: rail stops shrink so the line shows between them (see .rail.far in styles.css)
    m.on('zoomend', far); far()
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current!)
    return () => { mq.removeEventListener('change', onScheme); ro.disconnect(); vehs.current.forEach(v => cancelAnimationFrame(v.raf)); vehs.current.clear(); vehGroup.current = null; m.remove(); map.current = null; group.current = null; routeGroup.current = null; rings.current = null; sig.current = ''; markers.current.clear(); me.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // markers: kept between renders and matched by id. A new layer rebuilds them; a filter only adds the new places,
  // removes the gone ones and re-icons the ones whose greyed-out state changed. Selection just toggles a class.
  useEffect(() => {
    const g = group.current
    if (!g) return
    if (layer.id !== sig.current) { sig.current = layer.id; g.clearLayers(); markers.current.clear() }
    const mkIcon = (closed: boolean, rack: boolean) => L.divIcon({ className: 'mkw', html: `<div class="mk${closed ? ' off' : ''}" style="--c:${rack ? 'var(--color-rack)' : layer.color}">${iconHtml(rack ? 'lock' : layer.icon)}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] })
    const icons = [mkIcon(false, false), mkIcon(true, false), mkIcon(false, true)]
    const kind = (it: RankedItem) => (it.cat === 'mine' ? 2 : it.off || (layer.hours && it.open === false) ? 1 : 0) // Bizi tab: street racks keep their own colour and lock icon
    const want = new Set(items.map(i => i.id))
    const gone: L.Marker[] = []
    markers.current.forEach((e, id) => { if (!want.has(id)) { gone.push(e.mk); markers.current.delete(id) } })
    if (gone.length) g.removeLayers(gone)
    const add: L.Marker[] = []
    for (const it of items) {
      const k = kind(it), have = markers.current.get(it.id)
      if (have) { if (have.kind !== k) { have.mk.setIcon(icons[k]); have.kind = k } continue }
      const mk = L.marker([it.lat, it.lon], { icon: icons[k], keyboard: false, riseOnHover: false, title: it.name || undefined })
      mk.on('click', e => { L.DomEvent.stopPropagation(e); cb.current.onSelect(it.id) })
      markers.current.set(it.id, { mk, kind: k }); add.push(mk)
    }
    if (add.length) g.addLayers(add)
    markers.current.forEach(({ mk }, id) => {
      mk.getElement()?.firstElementChild?.classList.toggle('sel', id === selected)
      mk.setZIndexOffset(id === selected ? 1000 : 0)
    })
    drawRings()
  }, [layer, items, selected, showRange])

  // the pick moment: only when the person picked (pick counts up), on the marker that is now selected
  useEffect(() => {
    if (!pick) return
    const el = live.current.selected ? markers.current.get(live.current.selected)?.mk.getElement()?.firstElementChild : null
    if (!el) return
    el.classList.remove('pulse'); void (el as HTMLElement).offsetWidth; el.classList.add('pulse')
    const done = () => el.classList.remove('pulse')
    el.addEventListener('animationend', done, { once: true })
  }, [pick])

  // a bus line: a white casing under a brand line, arrows along it, a dot at every stop and a big one at the current stop
  useEffect(() => {
    const g = routeGroup.current
    if (!g) return
    g.clearLayers()
    if (!route) {
      if (track) {
        const col = getComputedStyle(document.documentElement).getPropertyValue(layer.color.replace(/^var\(|\)$/g, '')).trim()
        const white = getComputedStyle(document.documentElement).getPropertyValue('--color-on-brand').trim()
        for (const path of track) {
          L.polyline(path, { color: white, weight: 6, opacity: 0.9, interactive: false }).addTo(g)
          L.polyline(path, { color: col, weight: 3, interactive: false }).addTo(g)
        }
      }
      return
    }
    const brand = getComputedStyle(document.documentElement).getPropertyValue('--color-bus').trim() // canvas needs a real colour, not var()
    const white = getComputedStyle(document.documentElement).getPropertyValue('--color-on-brand').trim()
    for (const path of route.paths) {
      L.polyline(path, { color: white, weight: 8, opacity: 0.9, interactive: false }).addTo(g)
      L.polyline(path, { color: brand, weight: 4.5, interactive: false }).addTo(g)
    }
    for (const path of route.paths) {
      for (const f of [0.2, 0.4, 0.6, 0.8]) {
        const a = pointAt(path, f)
        if (!a) continue
        L.marker(a.pt, { icon: L.divIcon({ className: 'mkw', html: `<div class="vbus">${iconHtml('bus')}${dirHtml(a.bearing)}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }), interactive: false, keyboard: false }).addTo(g)
      }
    }
    route.stops.forEach((s, i) => {
      if (i === route.cur) return
      const dot = L.circleMarker([s.lat, s.lon], { radius: 3.5, color: brand, weight: 1.5, fillColor: white, fillOpacity: 1 }).addTo(g)
      dot.on('click', e => { L.DomEvent.stopPropagation(e); cb.current.onRouteStop?.(s.post) })
    })
    const near = nearBus(route), stopAt = route.stops[route.cur]
    if (near && stopAt) {
      lineArrow(bearingAt(route.paths, [stopAt.lat, stopAt.lon]) ?? near.bearing, [stopAt.lat, stopAt.lon], brand, 27).addTo(g) // the bus stop dot is smaller than the tram and train markers
    }
    if (near) L.marker(near.pt, { icon: L.divIcon({ className: 'mkw', html: `<div class="vbus">${iconHtml('bus')}${dirHtml(near.bearing)}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }), interactive: false, keyboard: false, pane: 'vehPane' }).addTo(g)
    const cur = route.stops[route.cur]
    if (cur) L.circleMarker([cur.lat, cur.lon], { radius: 9, color: white, weight: 3, fillColor: brand, fillOpacity: 1, interactive: false }).addTo(g)
  }, [route, track, layer.color])
  // you -> the closest place (the selected stop, or the stop of the shown bus line): a dotted line in the section colour
  useEffect(() => {
    const m = map.current
    walkLine.current?.remove(); walkLine.current = null
    if (!m || !userPos) return
    const it = route ? route.stops[route.cur] && { lat: route.stops[route.cur].lat, lon: route.stops[route.cur].lon } : items.find(i => i.id === selected) // the closest place: the selected stop, fountain, toilet..., never a vehicle mark
    if (!it) return
    const col = getComputedStyle(document.documentElement).getPropertyValue(layer.color.replace(/^var\(|\)$/g, '')).trim()
    const to: [number, number] = [it.lat, it.lon]
    const draw = (path: [number, number][]) => { walkLine.current?.remove(); walkLine.current = L.polyline(path, { color: col, weight: 3, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(m) }
    draw([userPos, to]) // straight line until the street route arrives (and if it never does)
    const ac = new AbortController()
    walkRoute(userPos, to, ac.signal).then(p => { if (p && !ac.signal.aborted) draw(p) })
    return () => ac.abort()
  }, [userPos, selected, items, route, layer.color])
  // estimated vehicles: a marker per id, slid (not jumped) to its new place; no sliding when reduced motion is on
  const vsig = vehicles.map(v => v.id + v.icon + v.color + v.pos.join(',') + (v.start ? 's' : '')).join('|') + '|' + vehBadge + vehStart
  useEffect(() => {
    const g = vehGroup.current, m0 = map.current
    if (!g || !m0) return
    const keep = new Set(vehicles.map(v => v.id))
    vehLine.current?.remove(); vehLine.current = null
    vehArrow.current?.remove(); vehArrow.current = null
    if (vehicles[0]) vehLine.current = L.polyline([vehicles[0].pos, ...(vehicles[0].via ?? []), vehicles[0].stop], { color: getComputedStyle(document.documentElement).getPropertyValue(vehicles[0].color.replace(/^var\(|\)$/g, '')).trim(), weight: 3, lineCap: 'round', interactive: false }).addTo(m0)
    if (vehicles[0]) { const v0 = vehicles[0]; vehArrow.current = lineArrow(arrowBearing(v0.via, v0.pos, v0.stop), v0.stop, getComputedStyle(document.documentElement).getPropertyValue(v0.color.replace(/^var\(|\)$/g, '')).trim()).addTo(m0) }
    // a changed stop or direction (fit key) unmounts the marker, so it appears at its new place instead of floating there
    vehs.current.forEach((v, id) => { if (!keep.has(id) || v.fit !== vehicles.find(x => x.id === id)?.fit) { cancelAnimationFrame(v.raf); g.removeLayer(v.mk); vehs.current.delete(id) } })
    for (const v of vehicles) {
      const html = `<div class="veh" style="--c:${v.color}">${iconHtml(v.icon)}${dirHtml(v.bearing)}${(v.start ? vehStart : vehBadge) ? `<i>${v.start ? vehStart : vehBadge}</i>` : ''}</div>`
      const icon = L.divIcon({ className: 'mkw', html, iconSize: [24, 24], iconAnchor: [12, 12] })
      const cur = vehs.current.get(v.id)
      if (!cur) { const mk = L.marker(v.pos, { icon, interactive: false, keyboard: false, pane: 'vehPane' }).addTo(g); vehs.current.set(v.id, { mk, raf: 0, fit: v.fit }); continue }
      cur.mk.setIcon(icon)
      cancelAnimationFrame(cur.raf)
      const from = cur.mk.getLatLng(), to = L.latLng(v.pos)
      if (reduced()) { cur.mk.setLatLng(to); continue }
      const t0 = performance.now(), D = 1500
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / D), e = 1 - (1 - k) * (1 - k)
        cur.mk.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e])
        if (k < 1) cur.raf = requestAnimationFrame(step)
      }
      cur.raf = requestAnimationFrame(step)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vsig])
  // when the stop or direction changes, frame the stop and its vehicles together if one is out of view (after the fly to the stop has ended)
  const fitKey = vehicles[0]?.fit ?? ''
  useEffect(() => {
    const m = map.current
    const vs = live.current.vehicles
    if (!m || !fitKey || !vs.length) return
    const id = setTimeout(() => {
      const pad = L.point(cb.current.desktop ? 440 : 40, 70), padB = L.point(40, cb.current.inset() + 30)
      const view = m.getBounds()
      const inner = L.latLngBounds(m.containerPointToLatLng(pad), m.containerPointToLatLng(m.getSize().subtract(padB)))
      const pts = [vs[0].stop, ...(userPos ? [userPos] : [])] // only you and the closest place (the stop), not the vehicle
      if (pts.every(q => inner.contains(q)) && view.isValid()) return
      m.fitBounds(L.latLngBounds(pts), { paddingTopLeft: pad, paddingBottomRight: padB, maxZoom: 16, animate: !reduced(), duration: MS.fly / 1000 })
    }, MS.fly + 150)
    return () => clearTimeout(id)
  }, [fitKey])
  useEffect(() => {
    const m = map.current
    if (!m || !route) return
    const cs = route.stops[route.cur], mk = nearBus(route)
    const pts: [number, number][] = [...(cs ? [[cs.lat, cs.lon] as [number, number]] : []), ...(mk ? [mk.pt as [number, number]] : []), ...(userPos ? [userPos as [number, number]] : [])]
    if (pts.length < 2) return
    const anim = !reduced()
    // fractional zoom for this one fit (whole zooms would leave a long route small): the zoom is worked out at once, so snapping can come back right after
    const snap = m.options.zoomSnap
    m.options.zoomSnap = 0
    m.fitBounds(L.latLngBounds(pts), { paddingTopLeft: L.point(cb.current.desktop ? 440 : 40, 70), paddingBottomRight: L.point(40, cb.current.inset() + 30), maxZoom: 17, animate: anim, duration: MS.fly / 1000 })
    m.options.zoomSnap = snap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.key, fitN])

  useEffect(() => {
    const m = map.current
    if (!m) return
    me.current?.remove(); me.current = null
    if (userPos) me.current = L.marker(userPos, { icon: L.divIcon({ className: 'mkw', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, keyboard: false, zIndexOffset: 3000 }).addTo(m)
  }, [userPos])

  // fly requests: interruptible (a new request retargets), no movement when reduced motion is on
  useEffect(() => {
    const m = map.current
    if (!m || !fly) return
    const bottom = cb.current.inset()
    const anim = !reduced()
    if (fly.fitUser) {
      const b = L.latLngBounds([fly.fitUser, fly.to])
      const o = { paddingTopLeft: L.point(40, 70), paddingBottomRight: L.point(40, bottom + 30), maxZoom: fly.zoom, animate: anim, duration: MS.fly / 1000 }
      if (anim && !fly.soft) m.flyToBounds(b, o); else m.fitBounds(b, { ...o, duration: MS.reframe / 1000 })
      return
    }
    const p = m.project(fly.to, fly.zoom).add([0, bottom / 2])
    const c = m.unproject(p, fly.zoom)
    if (anim && !fly.soft) m.flyTo(c, fly.zoom, { duration: MS.fly / 1000 }); else m.setView(c, fly.zoom, { animate: anim, duration: MS.reframe / 1000 })
  }, [fly])

  return <div ref={el} className="absolute inset-0 z-0" role="application" aria-label={label} data-testid="map" />
}
