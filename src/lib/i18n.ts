import { lsGet } from './cache'

export type Lang = 'en' | 'es'
const en = {
  title: 'Free services · Zaragoza', near: '📍 Use my location', nearing: 'Locating…', locOk: '📍 Using your location', more: 'More', less: 'Less', back: 'All needs',
  walkThere: 'Walk there →', showMore: 'Show more', min: 'min walk',
  fromCentre: 'Distances from the city centre. Tap “Use my location” for yours.', fromYou: 'Sorted by distance from you.',
  denied: 'Location unavailable. Showing distances from the city centre.', finding: 'Finding your location…', places: 'places', unnamed: 'Unnamed',
  nearest: 'Nearest', selected: 'Selected', nearestBikes: 'Nearest with bikes',
  openNow: 'Open now', open: 'Open now', closed: 'Closed now', hoursUnknown: 'hours unknown', hours: 'Hours',
  report: 'Wrong or missing? Report', cust: 'customers only', call: 'Call',
  srcCity: 'City data', srcOsm: 'OpenStreetMap', srcTgo: 'toiletsgo list', live: 'live', saved: 'saved copy', updated: 'updated', notVerified: 'not verified',
  stLoad: 'loading…', stLive: 'live', stSaved: 'saved copy', stFail: 'unavailable now', sources: 'Sources',
  srcInfo: 'About this data', srcInfoCity: 'Official open data from the Ayuntamiento de Zaragoza.', srcInfoOsm: 'Added by volunteers on OpenStreetMap. Nobody has checked it for us.', srcInfoTgo: 'A community list (toiletsgo). Not checked by us.',
  bikes: 'bikes', docks: 'free docks', outOfService: 'out of service',
  loading: 'Loading data…', failed: 'Could not load this data right now.', retry: 'Try again',
  none: 'Nothing here yet.', noneOpen: 'Nothing known to be open. Turn off “Open now” to see all.',
  hint: 'Tip: tap Share, then “Add to Home Screen”, to open this in one tap.', hintX: 'Close tip',
  privacy: 'Your location never leaves your device. No ads, no tracking.',
  credits: 'Data: Ayuntamiento de Zaragoza open data, OpenStreetMap contributors (ODbL), toiletsgo community list. Tiles: Esri. Being listed does not guarantee a place works or is open right now.',
  fixOsm: 'Fix it on OpenStreetMap',
  all: 'All', muni: 'Public buildings', food: 'Cafés & bars', other: 'Other', langSwitch: 'Switch language', handle: 'Expand or collapse the list', map: 'Map',
}
export type Key = keyof typeof en
const es: Record<Key, string> = {
  title: 'Servicios gratis · Zaragoza', near: '📍 Usar mi ubicación', nearing: 'Localizando…', locOk: '📍 Usando tu ubicación', more: 'Más', less: 'Menos', back: 'Todo',
  walkThere: 'Cómo llegar a pie →', showMore: 'Ver más', min: 'min a pie',
  fromCentre: 'Distancias desde el centro. Pulsa «Usar mi ubicación» para ver las tuyas.', fromYou: 'Ordenado por distancia desde ti.',
  denied: 'Ubicación no disponible. Mostrando distancias desde el centro.', finding: 'Buscando tu ubicación…', places: 'lugares', unnamed: 'Sin nombre',
  nearest: 'Más cercano', selected: 'Elegido', nearestBikes: 'Más cercano con bicis',
  openNow: 'Abierto ahora', open: 'Abierto ahora', closed: 'Cerrado ahora', hoursUnknown: 'horario desconocido', hours: 'Horario',
  report: '¿Falta o está mal? Avisar', cust: 'solo clientes', call: 'Llamar',
  srcCity: 'Datos municipales', srcOsm: 'OpenStreetMap', srcTgo: 'lista toiletsgo', live: 'en vivo', saved: 'copia guardada', updated: 'actualizado', notVerified: 'sin verificar',
  stLoad: 'cargando…', stLive: 'en vivo', stSaved: 'copia guardada', stFail: 'no disponible ahora', sources: 'Fuentes',
  srcInfo: 'Sobre estos datos', srcInfoCity: 'Datos abiertos oficiales del Ayuntamiento de Zaragoza.', srcInfoOsm: 'Añadido por voluntarios en OpenStreetMap. Nadie lo ha comprobado por nosotros.', srcInfoTgo: 'Una lista comunitaria (toiletsgo). No la hemos comprobado.',
  bikes: 'bicis', docks: 'anclajes libres', outOfService: 'fuera de servicio',
  loading: 'Cargando datos…', failed: 'No se pudieron cargar estos datos ahora.', retry: 'Reintentar',
  none: 'Aún no hay nada aquí.', noneOpen: 'Nada abierto que sepamos. Quita «Abierto ahora» para ver todo.',
  hint: 'Consejo: pulsa Compartir y luego «Añadir a pantalla de inicio» para abrirlo con un toque.', hintX: 'Cerrar consejo',
  privacy: 'Tu ubicación no sale de tu dispositivo. Sin anuncios ni rastreo.',
  credits: 'Datos: datos abiertos del Ayuntamiento de Zaragoza, colaboradores de OpenStreetMap (ODbL), lista comunitaria toiletsgo. Mapa: Esri. Aparecer en la lista no garantiza que el sitio funcione o esté abierto ahora.',
  fixOsm: 'Corrígelo en OpenStreetMap',
  all: 'Todos', muni: 'Edificios públicos', food: 'Cafés y bares', other: 'Otros', langSwitch: 'Cambiar idioma', handle: 'Expandir o contraer la lista', map: 'Mapa',
}
export const DICT: Record<Lang, Record<Key, string>> = { en, es }

const TYPES: Record<Lang, Record<string, string>> = {
  en: { muni: 'Public building', cafe: 'Café', restaurant: 'Restaurant', fast_food: 'Fast food', bar: 'Bar or café', pub: 'Pub', ice_cream: 'Ice cream', library: 'Library', hotel: 'Hotel', hostel: 'Hostel', coworking_space: 'Coworking', community_centre: 'Community centre', museum: 'Museum', university: 'University', college: 'College',
    fountain: 'Drinking fountain', toilet: 'Public toilet', charger: 'Device charging point', lib: 'Library', civic: 'Civic centre', youth: 'Youth centre', townhall: 'Town hall', place: 'Public place', bizi: 'Bizi station · cheap bike share, not free' },
  es: { muni: 'Edificio público', cafe: 'Café', restaurant: 'Restaurante', fast_food: 'Comida rápida', bar: 'Bar o café', pub: 'Pub', ice_cream: 'Heladería', library: 'Biblioteca', hotel: 'Hotel', hostel: 'Hostal', coworking_space: 'Coworking', community_centre: 'Centro cívico', museum: 'Museo', university: 'Universidad', college: 'Centro educativo',
    fountain: 'Fuente de agua potable', toilet: 'Aseo público', charger: 'Punto de carga de móvil', lib: 'Biblioteca', civic: 'Centro cívico', youth: 'Zona joven', townhall: 'Ayuntamiento', place: 'Lugar público', bizi: 'Estación Bizi · bici compartida barata, no gratis' },
}
export const typeLabel = (lang: Lang, type: string) => TYPES[lang][type] || type.replace(/_/g, ' ')

export function initialLang(): Lang {
  const saved = lsGet('lang')
  if (saved === 'en' || saved === 'es') return saved
  return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en'
}
