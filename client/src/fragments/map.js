import van from 'vanjs-core'
import L from 'leaflet'
import { store, onMapBoundsChange, registerOnPositionUpdate, openItem } from '../store.js'
import { getItemGeo, isTaken, getItemTitle } from '../lib/nostr.js'
import { t } from '../lib/i18n.js'
import { searchPlaces } from '../lib/gazetteer.js'
import { encodeGeohash, haversineDistance, Geohash } from '../lib/geo.js'
import { formatDistance } from '../helpers/format.js'

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

      el.addEventListener('click', () => openItem(event))

      _markers.set(id, { marker, el })
    }
  })
}

export const MapComponent = () => mapDiv

export const fitMapBounds = (bounds) => {
  if (!_map || !bounds?.sw || !bounds?.ne) return
  _map.fitBounds([[bounds.sw.lat, bounds.sw.lng], [bounds.ne.lat, bounds.ne.lng]])
}

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

  // Results are ranked and labelled by distance/direction from the current map
  // centroid (what the user is looking at), not their GPS position.
  const origin = () => {
    if (_map) { const c = _map.getCenter(); return { lat: c.lat, lng: c.lng } }
    return null
  }

  const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'] // index 0 = north
  const bearingArrow = (lat1, lng1, lat2, lng2) => {
    const r = d => d * Math.PI / 180
    const y = Math.sin(r(lng2 - lng1)) * Math.cos(r(lat2))
    const x = Math.cos(r(lat1)) * Math.sin(r(lat2)) - Math.sin(r(lat1)) * Math.cos(r(lat2)) * Math.cos(r(lng2 - lng1))
    const b = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
    return ARROWS[Math.round(b / 45) % 8]
  }

  const handleSearch = async () => {
    const q = query.val.trim()
    if (!q) { results.val = []; return }
    searching.val = true
    try {
      // The map centroid drives both proximity ranking and the per-result
      // distance/direction, so the closest place to what's on screen ranks first.
      const o = origin()
      const gh5 = o ? encodeGeohash(o.lat, o.lng, 5) : ''
      // Load village buckets around the map view (plus its neighbours) so nearby
      // small places are searchable.
      const areas = new Set()
      if (o) {
        const g = encodeGeohash(o.lat, o.lng, 3)
        areas.add(g)
        for (const n of Geohash.neighbors(g)) areas.add(n)
      }
      const places = await searchPlaces(q, gh5, [...areas])
      results.val = o
        ? places
            .map(pl => ({ ...pl, _m: haversineDistance(o.lat, o.lng, pl.lat, pl.lng) }))
            // Closest to the map centre ranks first, by true distance.
            .sort((a, b) => a._m - b._m)
            .map(pl => ({
              ...pl,
              dist: formatDistance(pl._m),
              arrow: bearingArrow(o.lat, o.lng, pl.lat, pl.lng),
            }))
        : places
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
            van.tags.div({ class: 'msr-text' },
              van.tags.span({ class: 'msr-name' }, place.name),
              place.label ? van.tags.span({ class: 'msr-label' }, place.label) : null
            ),
            place.dist ? van.tags.span({ class: 'msr-dist', title: `${place.arrow} ${place.dist}` }, place.arrow, ' ', place.dist) : null
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
