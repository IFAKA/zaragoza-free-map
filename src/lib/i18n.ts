import { lsGet } from './cache'

export type Lang = 'en' | 'es'
const en = {
  title: 'Free services', subtitle: 'Zaragoza', back: 'Back', settings: 'Settings', settingsTitle: 'Settings', tabsLabel: 'Services', typeLabel: 'Type', language: 'Language', about: 'About and credits', aboutTitle: 'About',
  langTitle: 'Language', langEn: 'English', langEs: 'Español', close: 'Close',
  handle: 'Expand or collapse the panel', map: 'Map', zoomIn: 'Zoom in', zoomOut: 'Zoom out', panel: 'Services panel',
  openNow: 'Open now', openNowHint: 'Hide places that are closed', showRange: 'Show range', showRangeHint: 'WiFi range circles (estimate)',
  open: 'Open now', closed: 'Closed now', hoursUnknown: 'Hours unknown', alwaysOn: 'Always available', hours: 'Hours', holidays: 'Hours can differ on public holidays.',
  walk: 'Walk there', details: 'Details', useLocation: 'Use my location', locating: 'Finding you…', fromCentre: 'from the city centre', fromYou: 'from you', minWalk: 'min walk',
  deniedTitle: 'Location is off', deniedBody: 'Distances are from the city centre. Allow location in your browser to see yours.',
  nearestwater: 'Nearest drinking fountain', nearesttoilets: 'Nearest free toilet', nearestcharge: 'Nearest place to charge', nearestwifi: 'Nearest free WiFi', nearestlibraries: 'Nearest library', nearestbizi: 'Nearest Bizi station',
  selected: 'Selected', places: 'places', all: 'All', muni: 'Public buildings', food: 'Cafés and bars', other: 'Other',
  noneOpen: 'Nothing known to be open. Turn off “Open now” to see everything.', showMore: 'Show more',
  srcCity: 'City record', srcOsm: 'OpenStreetMap', srcTgo: 'City equipment catalogue (toilet list by toiletsgo)', snapshot: 'snapshot', notVerified: 'not verified by us',
  srcInfo: 'About this data', srcInfoCity: 'Official open data from the Ayuntamiento de Zaragoza, saved in this app. It can be out of date.', srcInfoOsm: 'Added by volunteers on OpenStreetMap and saved in this app. Nobody has checked it for us.', srcInfoTgo: 'The place, address and phone are records of the Ayuntamiento de Zaragoza equipment catalogue (zaragoza.es/sede/servicio/equipamiento). That the place has a public toilet comes from the toiletsgo list, which neither the city nor we checked.',
  report: 'Wrong or missing? Report', cust: 'customers only', call: 'Call', address: 'Address', phone: 'Phone', source: 'Source', ssid: 'Network',
  occLive: 'Live occupancy', occNone: 'Occupancy not published', occInfoTitle: 'Why no numbers?',
  occInfo: 'Only the University of Zaragoza libraries publish how full they are, and only on their own page. The city and other libraries do not publish it, so we do not guess.',
  bizi: 'Bizi is a cheap bike share, not free. This map shows the station places only. Bikes and free docks are not shown: the app has no live connection.',
  rangeEst: 'Approximate range (estimate). The city does not publish WiFi coverage.', rangeCity: 'about 40 m around the building', rangeOsm: 'about 25 m around the venue',
  installHint: 'Add this app to your home screen to open it in one tap. It works offline.', installClose: 'Got it',
  privacy: 'Your location never leaves your device. No ads. The app makes no data requests: everything is saved in it. Only map tiles load from the internet. Anonymous usage statistics with Umami, no cookies and no location.',
  disclaimer: 'Independent project, not affiliated with the Ayuntamiento de Zaragoza. Visual style follows the city’s public design system.',
  dataRefreshed: 'Data refreshed', sources: 'Sources',
  creditsCity: 'Ayuntamiento de Zaragoza open data (WiFi points, libraries, civic centres, Bizi stations)', creditsFountains: 'Drinking fountains: Ayuntamiento de Zaragoza (Zenodo 8141704)', creditsOsm: 'OpenStreetMap contributors (ODbL)', creditsTgo: 'Toilet places: Ayuntamiento de Zaragoza equipment catalogue, list by toiletsgo', creditsTiles: 'Map tiles: Esri, HERE, Garmin and OpenStreetMap contributors',
  noGuarantee: 'Being listed does not mean a place works or is open right now.',
  fixOsm: 'Fix it on OpenStreetMap',
}
export type Key = keyof typeof en
const es: Record<Key, string> = {
  title: 'Servicios gratis', subtitle: 'Zaragoza', back: 'Atrás', settings: 'Ajustes', settingsTitle: 'Ajustes', tabsLabel: 'Servicios', typeLabel: 'Tipo', language: 'Idioma', about: 'Acerca de y créditos', aboutTitle: 'Acerca de',
  langTitle: 'Idioma', langEn: 'English', langEs: 'Español', close: 'Cerrar',
  handle: 'Expandir o contraer el panel', map: 'Mapa', zoomIn: 'Acercar', zoomOut: 'Alejar', panel: 'Panel de servicios',
  openNow: 'Abierto ahora', openNowHint: 'Oculta los sitios cerrados', showRange: 'Ver alcance', showRangeHint: 'Círculos de alcance WiFi (estimación)',
  open: 'Abierto ahora', closed: 'Cerrado ahora', hoursUnknown: 'Horario desconocido', alwaysOn: 'Siempre disponible', hours: 'Horario', holidays: 'El horario puede cambiar en festivos.',
  walk: 'Cómo llegar a pie', details: 'Detalles', useLocation: 'Usar mi ubicación', locating: 'Buscándote…', fromCentre: 'desde el centro', fromYou: 'desde ti', minWalk: 'min a pie',
  deniedTitle: 'Ubicación desactivada', deniedBody: 'Las distancias son desde el centro. Permite la ubicación en el navegador para ver las tuyas.',
  nearestwater: 'Fuente de agua más cercana', nearesttoilets: 'Aseo gratis más cercano', nearestcharge: 'Sitio más cercano para cargar', nearestwifi: 'WiFi gratis más cercano', nearestlibraries: 'Biblioteca más cercana', nearestbizi: 'Estación Bizi más cercana',
  selected: 'Elegido', places: 'sitios', all: 'Todos', muni: 'Edificios públicos', food: 'Cafés y bares', other: 'Otros',
  noneOpen: 'Nada abierto que sepamos. Quita «Abierto ahora» para verlo todo.', showMore: 'Ver más',
  srcCity: 'Dato municipal', srcOsm: 'OpenStreetMap', srcTgo: 'Catálogo de equipamientos del Ayuntamiento (lista de aseos de toiletsgo)', snapshot: 'copia del', notVerified: 'sin verificar por nosotros',
  srcInfo: 'Sobre estos datos', srcInfoCity: 'Datos abiertos oficiales del Ayuntamiento de Zaragoza, guardados en esta app. Pueden estar desactualizados.', srcInfoOsm: 'Añadido por voluntarios en OpenStreetMap y guardado en esta app. Nadie lo ha comprobado por nosotros.', srcInfoTgo: 'El lugar, la dirección y el teléfono son datos del catálogo de equipamientos del Ayuntamiento de Zaragoza (zaragoza.es/sede/servicio/equipamiento). Que tenga aseo público viene de la lista de toiletsgo, que ni el Ayuntamiento ni nosotros hemos comprobado.',
  report: '¿Falta o está mal? Avisar', cust: 'solo clientes', call: 'Llamar', address: 'Dirección', phone: 'Teléfono', source: 'Fuente', ssid: 'Red',
  occLive: 'Ocupación en directo', occNone: 'Ocupación no publicada', occInfoTitle: '¿Por qué no hay números?',
  occInfo: 'Solo las bibliotecas de la Universidad de Zaragoza publican cuánta gente hay, y solo en su propia página. El Ayuntamiento y otras bibliotecas no lo publican, así que no lo adivinamos.',
  bizi: 'Bizi es bici compartida barata, no gratis. El mapa solo muestra dónde están las estaciones. No se muestran bicis ni anclajes libres: la app no tiene conexión en vivo.',
  rangeEst: 'Alcance aproximado (estimación). El Ayuntamiento no publica la cobertura WiFi.', rangeCity: 'unos 40 m alrededor del edificio', rangeOsm: 'unos 25 m alrededor del local',
  installHint: 'Añade esta app a tu pantalla de inicio para abrirla con un toque. Funciona sin conexión.', installClose: 'Entendido',
  privacy: 'Tu ubicación no sale de tu dispositivo. Sin anuncios. La app no pide datos por internet: todo va guardado en ella. Solo los mapas se cargan de internet. Estadísticas anónimas de uso con Umami, sin cookies ni ubicación.',
  disclaimer: 'Proyecto independiente, sin relación con el Ayuntamiento de Zaragoza. El estilo visual sigue el sistema de diseño público del Ayuntamiento.',
  dataRefreshed: 'Datos actualizados', sources: 'Fuentes',
  creditsCity: 'Datos abiertos del Ayuntamiento de Zaragoza (puntos WiFi, bibliotecas, centros cívicos, estaciones Bizi)', creditsFountains: 'Fuentes de agua: Ayuntamiento de Zaragoza (Zenodo 8141704)', creditsOsm: 'Colaboradores de OpenStreetMap (ODbL)', creditsTgo: 'Aseos: catálogo de equipamientos del Ayuntamiento de Zaragoza, lista de toiletsgo', creditsTiles: 'Mapas: Esri, HERE, Garmin y colaboradores de OpenStreetMap',
  noGuarantee: 'Aparecer en la lista no garantiza que el sitio funcione o esté abierto ahora.',
  fixOsm: 'Corrígelo en OpenStreetMap',
}
export const DICT: Record<Lang, Record<Key, string>> = { en, es }

const TYPES: Record<Lang, Record<string, string>> = {
  en: { muni: 'Public building', cafe: 'Café', restaurant: 'Restaurant', fast_food: 'Fast food', bar: 'Bar or café', pub: 'Pub', ice_cream: 'Ice cream', library: 'Library', hotel: 'Hotel', hostel: 'Hostel', coworking_space: 'Coworking', community_centre: 'Community centre', museum: 'Museum', university: 'University', college: 'College',
    fountain: 'Drinking fountain', toilet: 'Public toilet', charger: 'Charging point', lib: 'Library', civic: 'Civic centre', youth: 'Youth centre', townhall: 'Town hall', place: 'Public place', bizi: 'Bizi station' },
  es: { muni: 'Edificio público', cafe: 'Café', restaurant: 'Restaurante', fast_food: 'Comida rápida', bar: 'Bar o café', pub: 'Pub', ice_cream: 'Heladería', library: 'Biblioteca', hotel: 'Hotel', hostel: 'Hostal', coworking_space: 'Coworking', community_centre: 'Centro cívico', museum: 'Museo', university: 'Universidad', college: 'Centro educativo',
    fountain: 'Fuente de agua potable', toilet: 'Aseo público', charger: 'Punto de carga', lib: 'Biblioteca', civic: 'Centro cívico', youth: 'Zona joven', townhall: 'Ayuntamiento', place: 'Lugar público', bizi: 'Estación Bizi' },
}
export const typeLabel = (lang: Lang, type: string) => TYPES[lang][type] || type.replace(/_/g, ' ')

export function initialLang(): Lang {
  const saved = lsGet('lang')
  if (saved === 'en' || saved === 'es') return saved
  return 'es' // Spanish unless the user chose otherwise, whatever the browser language is
}
