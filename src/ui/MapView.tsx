import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { CENTER } from '../lib/geo'
import type { LatLon, LayerConfig, RankedItem } from '../lib/types'
import { iconHtml } from './icons'

export interface FlyRequest { n: number; to: LatLon; zoom: number; fitUser?: LatLon; instant?: boolean }
interface Props {
  layer: LayerConfig
  items: RankedItem[]
  selected: string | null
  userPos: LatLon | null
  fly: FlyRequest | null
  /** Pixels at the bottom of the map that the drawer covers. */
  inset: () => number
  showRange: boolean
  desktop: boolean
  onSelect: (id: string) => void
  onBackgroundClick: () => void
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
export function MapView({ layer, items, selected, userPos, fly, inset, showRange, desktop, onSelect, onBackgroundClick, label, zoomTitles }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const group = useRef<L.LayerGroup | null>(null)
  const rings = useRef<L.LayerGroup | null>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const sig = useRef('')
  const me = useRef<L.Marker | null>(null)
  const cb = useRef({ onSelect, onBackgroundClick, inset })
  cb.current = { onSelect, onBackgroundClick, inset }
  const live = useRef({ layer, items, selected, showRange })
  live.current = { layer, items, selected, showRange }

  // the zoom buttons are made once by Leaflet: follow a language change here
  useEffect(() => {
    const c = el.current
    c?.querySelector('.leaflet-control-zoom-in')?.setAttribute('title', zoomTitles.in)
    c?.querySelector('.leaflet-control-zoom-in')?.setAttribute('aria-label', zoomTitles.in)
    c?.querySelector('.leaflet-control-zoom-out')?.setAttribute('title', zoomTitles.out)
    c?.querySelector('.leaflet-control-zoom-out')?.setAttribute('aria-label', zoomTitles.out)
  }, [zoomTitles.in, zoomTitles.out])

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
    const m = L.map(el.current!, { zoomControl: false, attributionControl: true, renderer: L.canvas({ padding: 0.5 }) }).setView(CENTER, 15)
    if (desktop) L.control.zoom({ position: 'bottomright', zoomInTitle: zoomTitles.in, zoomOutTitle: zoomTitles.out }).addTo(m)
    m.attributionControl.setPosition('topleft') // top left: the Settings button floats at the top right
    m.on('click', () => cb.current.onBackgroundClick())
    const tiles = L.tileLayer(TILES(dark()), { maxZoom: 19, maxNativeZoom: 16, attribution: 'Tiles © Esri, HERE, Garmin, OpenStreetMap contributors' }).addTo(m)
    const labels = L.tileLayer(LABELS(dark()), { maxZoom: 19, maxNativeZoom: 16, pane: 'shadowPane' }).addTo(m)
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => { tiles.setUrl(TILES(dark())); labels.setUrl(LABELS(dark())) }
    mq.addEventListener('change', onScheme)
    rings.current = L.layerGroup().addTo(m)
    group.current = L.layerGroup().addTo(m)
    map.current = m
    m.on('moveend zoomend', drawRings)
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current!)
    return () => { mq.removeEventListener('change', onScheme); ro.disconnect(); m.remove(); map.current = null; group.current = null; rings.current = null; sig.current = ''; markers.current.clear(); me.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // markers: rebuilt only when the set of visible items changes; selection just toggles a class
  useEffect(() => {
    const g = group.current
    if (!g) return
    const s = layer.id + '|' + items.map(i => i.id + (i.open === false ? 'x' : '')).join(',')
    if (s !== sig.current) {
      sig.current = s
      g.clearLayers(); markers.current.clear()
      const mkIcon = (closed: boolean, rack: boolean) => L.divIcon({ className: 'mkw', html: `<div class="mk${closed ? ' off' : ''}" style="--c:${rack ? 'var(--color-rack)' : layer.color}">${iconHtml(rack ? 'lock' : layer.icon)}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] })
      const icons = [mkIcon(false, false), mkIcon(true, false), mkIcon(false, true)]
      for (const it of items) {
        const icon = icons[it.cat === 'mine' ? 2 : layer.hours && it.open === false ? 1 : 0] // Bizi tab: street racks keep their own colour and lock icon
        const mk = L.marker([it.lat, it.lon], { icon, keyboard: false, riseOnHover: false, title: it.name || undefined })
        mk.on('click', e => { L.DomEvent.stopPropagation(e); cb.current.onSelect(it.id) })
        markers.current.set(it.id, mk); g.addLayer(mk)
      }
    }
    markers.current.forEach((mk, id) => {
      mk.getElement()?.firstElementChild?.classList.toggle('sel', id === selected)
      mk.setZIndexOffset(id === selected ? 1000 : 0)
    })
    drawRings()
  }, [layer, items, selected, showRange])

  useEffect(() => {
    const m = map.current
    if (!m) return
    me.current?.remove(); me.current = null
    if (userPos) me.current = L.marker(userPos, { icon: L.divIcon({ className: 'mkw', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, keyboard: false, zIndexOffset: 500 }).addTo(m)
  }, [userPos])

  // fly requests: interruptible (a new request retargets), no movement when reduced motion is on
  useEffect(() => {
    const m = map.current
    if (!m || !fly) return
    const bottom = cb.current.inset()
    const anim = !reduced() && !fly.instant
    if (fly.fitUser) {
      const b = L.latLngBounds([fly.fitUser, fly.to])
      const o = { paddingTopLeft: L.point(40, 70), paddingBottomRight: L.point(40, bottom + 30), maxZoom: fly.zoom, animate: anim, duration: 0.45 }
      if (anim) m.flyToBounds(b, o); else m.fitBounds(b, o)
      return
    }
    const p = m.project(fly.to, fly.zoom).add([0, bottom / 2])
    const c = m.unproject(p, fly.zoom)
    if (anim) m.flyTo(c, fly.zoom, { duration: 0.45 }); else m.setView(c, fly.zoom, { animate: false })
  }, [fly])

  return <div ref={el} className="absolute inset-0 z-0" role="application" aria-label={label} data-testid="map" />
}
