import L from 'leaflet'
// markercluster looks for a global L
;(window as unknown as { L: typeof L }).L = L
