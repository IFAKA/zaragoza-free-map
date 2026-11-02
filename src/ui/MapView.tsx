import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { CENTER } from '../lib/geo'
import type { LatLon, LayerConfig, RankedItem } from '../lib/types'
import { isDesktop } from './useSheet'

export interface FlyRequest { n: number; to: LatLon; zoom: number; fitUser?: LatLon }
interface Props {
  layer: LayerConfig | null
  items: RankedItem[]
  selected: string | null
  userPos: LatLon | null
  fly: FlyRequest | null
  inset: () => number
  onSelect: (id: string) => void
  onBackgroundClick: () => void
  label: string
}
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Plain Leaflet, driven from React effects. Markers live in one layer group (no React element per marker). */
export function MapView({ layer, items, selected, userPos, fly, inset, onSelect, onBackgroundClick, label }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const group = useRef<L.LayerGroup | null>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const sig = useRef('')
  const me = useRef<L.Marker | null>(null)
  const cb = useRef({ onSelect, onBackgroundClick, inset })
  cb.current = { onSelect, onBackgroundClick, inset }

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, attributionControl: true }).setView(CENTER, 14)
    if (isDesktop()) L.control.zoom({ position: 'topright' }).addTo(m)
    m.attributionControl.setPosition('topleft')
    m.on('click', () => cb.current.onBackgroundClick())
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri · © OpenStreetMap contributors' }).addTo(m)
    group.current = L.layerGroup().addTo(m)
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current!)
    return () => { ro.disconnect(); m.remove(); map.current = null }
  }, [])

  // markers: rebuilt only when the set of visible items changes; selection just toggles a class
  useEffect(() => {
    const g = group.current
    if (!g) return
    const s = layer ? layer.id + '|' + items.map(i => i.id).join(',') : ''
    if (s !== sig.current) {
      sig.current = s
      g.clearLayers(); markers.current.clear()
      if (layer) {
        const icon = L.divIcon({ className: 'mkw', html: `<div class="mk" style="--c:${layer.color}">${layer.icon}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] })
        for (const it of items) {
          const mk = L.marker([it.lat, it.lon], { icon, keyboard: false, riseOnHover: false })
          mk.on('click', e => { L.DomEvent.stopPropagation(e); cb.current.onSelect(it.id) })
          markers.current.set(it.id, mk); g.addLayer(mk)
        }
        requestAnimationFrame(() => requestAnimationFrame(() => markers.current.forEach(mk => mk.getElement()?.firstElementChild?.classList.add('in'))))
      }
    }
    markers.current.forEach((mk, id) => {
      mk.getElement()?.firstElementChild?.classList.toggle('sel', id === selected)
      mk.setZIndexOffset(id === selected ? 1000 : 0)
    })
  }, [layer, items, selected])

  useEffect(() => {
    const m = map.current
    if (!m) return
    me.current?.remove(); me.current = null
    if (userPos) me.current = L.marker(userPos, { icon: L.divIcon({ className: 'mkw', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, keyboard: false }).addTo(m)
  }, [userPos])

  // fly requests: interruptible (a new request retargets), no movement when reduced motion is on
  useEffect(() => {
    const m = map.current
    if (!m || !fly) return
    const bottom = cb.current.inset()
    const anim = !reduced()
    if (fly.fitUser) {
      const b = L.latLngBounds([fly.fitUser, fly.to])
      const o = { paddingTopLeft: L.point(40, 70), paddingBottomRight: L.point(40, bottom + 30), maxZoom: fly.zoom, animate: anim, duration: 0.4 }
      if (anim) m.flyToBounds(b, o); else m.fitBounds(b, o)
      return
    }
    const p = m.project(fly.to, fly.zoom).add([0, bottom / 2])
    const c = m.unproject(p, fly.zoom)
    if (anim) m.flyTo(c, fly.zoom, { duration: 0.4 }); else m.setView(c, fly.zoom, { animate: false })
  }, [fly])

  return <div ref={el} className="absolute inset-0 z-0 min-[900px]:relative min-[900px]:inset-auto min-[900px]:order-1 min-[900px]:flex-1" role="application" aria-label={label} />
}
