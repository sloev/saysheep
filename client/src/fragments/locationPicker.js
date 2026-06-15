import van from 'vanjs-core'
import L from 'leaflet'
import { store } from '../store.js'
import 'leaflet/dist/leaflet.css'

const { div } = van.tags

// A self-contained Leaflet picker: click the map to drop/move a pin. Calls
// onPick(lat, lng) on every placement. Tears its map down when removed from the
// DOM so it doesn't leak listeners/tiles when the toggle closes or the page
// unmounts.
const DEFAULT = { lat: 55.6761, lng: 12.5683 } // Copenhagen fallback

if (typeof customElements !== 'undefined' && !customElements.get('picker-cleanup')) {
  customElements.define('picker-cleanup', class extends HTMLElement {
    disconnectedCallback() { if (this.onunmount) this.onunmount() }
  })
}

export const LocationPicker = ({ initialLat, initialLng, onPick }) => {
  const mapDiv = div({
    class: 'location-picker-map',
    style: 'width:100%;height:240px;border:1.5px solid var(--ink);border-radius:8px;overflow:hidden;cursor:crosshair'
  })

  let map = null
  let marker = null

  const hasChosen = initialLat != null && !isNaN(initialLat) && initialLng != null && !isNaN(initialLng)
  const hasRealGps = !store.position.loading && store.position.lat != null && !store.position.isFallback

  const center = hasChosen
    ? { lat: initialLat, lng: initialLng }
    : hasRealGps
      ? { lat: store.position.lat, lng: store.position.lng }
      : DEFAULT

  const place = (latlng) => {
    if (marker) marker.setLatLng(latlng)
    else marker = L.marker(latlng).addTo(map)
    onPick(latlng.lat, latlng.lng)
  }

  const init = () => {
    if (map || !mapDiv.isConnected) return
    map = L.map(mapDiv, { zoomControl: true, maxZoom: 18, minZoom: 3 }).setView([center.lat, center.lng], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map)
    // The container is sized by CSS after attach; nudge Leaflet to remeasure.
    setTimeout(() => { if (map) map.invalidateSize() }, 100)

    // Seed a pin at the chosen/known location so manual mode starts usable; an
    // unknown (fallback) location stays empty until the user actually clicks.
    if (hasChosen || hasRealGps) place(center)

    map.on('click', (e) => place(e.latlng))
  }

  // Initialise once attached to the DOM.
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(init)
  setTimeout(init, 0)

  const cleanup = typeof document !== 'undefined' ? document.createElement('picker-cleanup') : {}
  cleanup.onunmount = () => { if (map) { map.remove(); map = null } }

  return div(mapDiv, cleanup)
}
