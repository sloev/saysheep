import van from 'vanjs-core'
import L from 'leaflet'
import { store, onMapBoundsChange, currentItemId, registerOnPositionUpdate } from '../store.js'
import { getItemGeo, isTaken, getItemTitle } from '../lib/nostr.js'
import { cone } from '../router.js'
import { t } from '../lib/i18n.js'
import { searchPlaces } from '../lib/gazetteer.js'
import { encodeGeohash } from '../lib/geo.js'

import 'leaflet/dist/leaflet.css'

const mapDiv = van.tags.div({ id: 'map' })
let _map = null
const _markers = new Map()

export const setupMap = (lng, lat) => {
  if (_map) return

  mapDiv.innerHTML = ''
  mapDiv.style.display = 'block'
  mapDiv.style.alignItems = ''
  mapDiv.style.justifyContent = ''
  mapDiv.style.padding = ''
  mapDiv.style.textAlign = ''
  mapDiv.style.background = ''

  const savedLat = localStorage.getItem('saysheep_last_lat')
  const savedLng = localStorage.getItem('saysheep_last_lng')
  const savedZoom = localStorage.getItem('saysheep_last_zoom')

  const initialCenter = (savedLat && savedLng)
    ? [parseFloat(savedLat), parseFloat(savedLng)]
    : [lat, lng]
  const initialZoom = savedZoom ? parseFloat(savedZoom) : 14

  _map = L.map(mapDiv, {
    zoomControl: false,
    maxZoom: 18,
    minZoom: 8
  }).setView(initialCenter, initialZoom)



  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(_map)

  let invalidateTimeout = null
  const resizeObserver = new ResizeObserver(() => {
    if (!_map) return
    if (invalidateTimeout) clearTimeout(invalidateTimeout)
    invalidateTimeout = setTimeout(() => {
      if (_map) _map.invalidateSize()
    }, 100)
  })
  resizeObserver.observe(mapDiv)

  const notifyBounds = () => {
    const bounds = _map.getBounds()
    const zoom = _map.getZoom()
    const center = _map.getCenter()

    localStorage.setItem('saysheep_last_lat', center.lat)
    localStorage.setItem('saysheep_last_lng', center.lng)
    localStorage.setItem('saysheep_last_zoom', zoom)

    onMapBoundsChange({
      sw: { lat: bounds.getSouthWest().lat, lng: bounds.getSouthWest().lng },
      ne: { lat: bounds.getNorthEast().lat, lng: bounds.getNorthEast().lng },
      zoom,
    })
  }

  _map.on('moveend', notifyBounds)
  _map.on('zoomend', notifyBounds)

  notifyBounds()

  van.derive(() => {
    const items = store.items

    for (const [id, value] of _markers.entries()) {
      if (!items[id]) {
        value.marker.remove()
        _markers.delete(id)
      }
    }

    for (const [id, event] of Object.entries(items)) {
      if (event.kind !== 30402) continue // only listings get a pin
      const taken = isTaken(event)
      const mine = event.pubkey === store.identity.pubkey
      const cls = `map-marker ${taken ? 'taken' : ''} ${mine ? 'mine' : ''}`.trim()

      const existing = _markers.get(id)
      if (existing) {
        if (existing.el.className !== cls) existing.el.className = cls
        continue
      }

      const geo = getItemGeo(event)
      if (!geo) continue

      const el = document.createElement('div')
      el.className = cls
      el.title = getItemTitle(event) || '📦'

      const icon = L.divIcon({
        html: el,
        className: 'leaflet-custom-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 28]
      })

      const marker = L.marker([geo.lat, geo.lng], { icon })
        .addTo(_map)

      el.addEventListener('click', () => {
        currentItemId.val = id
        cone.navigate('item', {})
      })

      _markers.set(id, { marker, el })
    }
  })
}

export const MapComponent = () => mapDiv

export const flyToMap = (lng, lat, zoom = 14) => {
  if (!_map) return
  const currentCenter = _map.getCenter()
  const currentZoom = _map.getZoom()
  const dist = currentCenter.distanceTo([lat, lng])
  if (dist < 10 && currentZoom === zoom) return
  _map.flyTo([lat, lng], zoom)
}

export const MapSearchBox = () => {
  const query = van.state('')
  const searching = van.state(false)
  const results = van.state([])

  // Geohash5 of the user's location (or map center) for proximity ranking.
  const userGh5 = () => {
    if (!store.position.loading && store.position.lat != null && !store.position.isFallback) {
      return encodeGeohash(store.position.lat, store.position.lng, 5)
    }
    if (_map) { const c = _map.getCenter(); return encodeGeohash(c.lat, c.lng, 5) }
    return ''
  }

  const handleSearch = async () => {
    const q = query.val.trim()
    if (!q) { results.val = []; return }
    searching.val = true
    try {
      results.val = await searchPlaces(q, userGh5())
    } catch (err) {
      console.error(err)
      results.val = []
      alert(t('map.search_unavailable'))
    } finally {
      searching.val = false
    }
  }

  const pick = (place) => {
    results.val = []
    query.val = place.name
    flyToMap(place.lng, place.lat, 13)
  }

  return van.tags.div({ class: 'map-searchbox-wrap' },
    van.tags.div({ class: 'map-searchbox' },
      van.tags.input({
        class: 'map-search-input',
        type: 'text',
        placeholder: () => t('map.search_placeholder'),
        value: query,
        oninput: (e) => { query.val = e.target.value },
        onkeydown: (e) => { if (e.key === 'Enter') handleSearch() }
      }),
      van.tags.button({
        class: 'btn btn-primary map-search-btn',
        onclick: handleSearch,
        disabled: searching
      }, () => searching.val ? '⏳' : 'Go')
    ),
    () => {
      const list = results.val
      if (!list.length) return van.tags.div()
      return van.tags.div({ class: 'map-search-results' },
        ...list.map(place =>
          van.tags.div({ class: 'map-search-result', onclick: () => pick(place) },
            van.tags.span({ class: 'msr-name' }, place.name),
            place.label ? van.tags.span({ class: 'msr-label' }, place.label) : null
          )
        )
      )
    }
  )
}

export const MapControls = () => {
  const locating = van.state(false)

  const handleZoomIn = () => {
    if (_map) _map.zoomIn()
  }
  const handleZoomOut = () => {
    if (_map) _map.zoomOut()
  }
  const handleGoToMyLocation = () => {
    if (!navigator.geolocation) {
      alert(t('map.geolocation_unsupported'))
      return
    }
    locating.val = true
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const lat = coords.latitude
      const lng = coords.longitude
      store.position.lat = lat
      store.position.lng = lng
      store.position.loading = false
      locating.val = false
      flyToMap(lng, lat, 14)
    }, (err) => {
      locating.val = false
      alert(t('map.location_error', { error: err.message }))
    })
  }

  return van.tags.div({ class: 'map-controls-right' },
    van.tags.button({ class: 'map-control-btn', onclick: handleZoomIn, title: 'Zoom in' }, '＋'),
    van.tags.button({ class: 'map-control-btn', onclick: handleZoomOut, title: 'Zoom out' }, '－'),
    van.tags.button({ class: 'map-control-btn', onclick: handleGoToMyLocation, disabled: locating, title: 'Go to my location' },
      () => locating.val ? '⏳' : '📍'
    )
  )
}

registerOnPositionUpdate((lng, lat) => {
  flyToMap(lng, lat, 14)
})
