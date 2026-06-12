import van from 'vanjs-core'
import maplibregl from 'maplibre-gl'
import * as pmtiles from 'pmtiles'
import mapstyle from '../mapstyle.json'
import { store, onMapBoundsChange, currentItemId } from '../store.js'
import { getItemGeo, isTaken, getItemTitle } from '../lib/nostr.js'
import { cone } from '../router.js'

const mapDiv = van.tags.div({ id: 'map' })
let _map = null
const _markers = new Map()

export const setupMap = (lng, lat) => {
  if (_map) return
  const protocol = new pmtiles.Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)

  const savedLat = localStorage.getItem('saysheep_last_lat')
  const savedLng = localStorage.getItem('saysheep_last_lng')
  const savedZoom = localStorage.getItem('saysheep_last_zoom')

  const initialCenter = (savedLat && savedLng)
    ? [parseFloat(savedLng), parseFloat(savedLat)]
    : [lng, lat]
  const initialZoom = savedZoom ? parseFloat(savedZoom) : 14

  _map = new maplibregl.Map({
    container: mapDiv,
    style: mapstyle,
    center: initialCenter,
    zoom: initialZoom,
    maxZoom: 18,
    minZoom: 8,
  })

  _map.addControl(new maplibregl.NavigationControl(), 'top-right')
  _map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
  }), 'top-right')

  const notifyBounds = () => {
    const bounds = _map.getBounds()
    const zoom = _map.getZoom()
    const center = _map.getCenter()

    localStorage.setItem('saysheep_last_lat', center.lat)
    localStorage.setItem('saysheep_last_lng', center.lng)
    localStorage.setItem('saysheep_last_zoom', zoom)

    onMapBoundsChange({
      sw: { lat: bounds._sw.lat, lng: bounds._sw.lng },
      ne: { lat: bounds._ne.lat, lng: bounds._ne.lng },
      zoom,
    })
  }

  _map.on('load', notifyBounds)
  _map.on('moveend', notifyBounds)
  _map.on('zoomend', notifyBounds)

  // Watch store items and add/update markers
  van.derive(() => {
    const items = store.items

    // Clean up markers that are no longer in store.items
    for (const [id, value] of _markers.entries()) {
      if (!items[id]) {
        value.marker.remove()
        _markers.delete(id)
      }
    }

    for (const [id, event] of Object.entries(items)) {
      const taken = isTaken(event)
      const mine = event.pubkey === store.identity.pubkey
      const cls = `map-marker ${taken ? 'taken' : ''} ${mine ? 'mine' : ''}`.trim()

      const existing = _markers.get(id)
      if (existing) {
        // Update CSS class if taken state changed (e.g. item was just taken)
        if (existing.el.className !== cls) existing.el.className = cls
        continue
      }

      const geo = getItemGeo(event)
      if (!geo) continue

      const el = document.createElement('div')
      el.className = cls
      el.title = getItemTitle(event) || '📦'

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([geo.lng, geo.lat])
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

export const MapSearchBox = () => {
  const query = van.state('')
  const searching = van.state(false)
  const locating = van.state(false)

  const handleSearch = async () => {
    const q = query.val.trim()
    if (!q || !_map) return
    searching.val = true
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (data && data.length > 0) {
        const { lat, lon } = data[0]
        const targetLat = parseFloat(lat)
        const targetLng = parseFloat(lon)
        store.position.lat = targetLat
        store.position.lng = targetLng
        store.position.loading = false
        _map.flyTo({
          center: [targetLng, targetLat],
          zoom: 14,
          essential: true
        })
      } else {
        alert('Location not found')
      }
    } catch (err) {
      alert('Error searching location: ' + err.message)
    } finally {
      searching.val = false
    }
  }

  const handleGoToMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
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
      if (_map) {
        _map.flyTo({
          center: [lng, lat],
          zoom: 14,
          essential: true
        })
      }
    }, (err) => {
      locating.val = false
      alert('Error getting location: ' + err.message)
    })
  }

  return van.tags.div({ class: 'map-searchbox' },
    van.tags.input({
      class: 'map-search-input',
      type: 'text',
      placeholder: '🔍 Search location...',
      value: query,
      oninput: (e) => query.val = e.target.value,
      onkeydown: (e) => {
        if (e.key === 'Enter') handleSearch()
      }
    }),
    van.tags.button({
      class: 'btn btn-primary map-search-btn',
      onclick: handleSearch,
      disabled: () => searching.val || locating.val
    }, () => searching.val ? '⏳' : 'Go'),
    van.tags.button({
      class: 'btn btn-muted map-location-btn',
      style: 'padding: 4px 8px !important; min-height: auto !important; font-size: 14px;',
      onclick: handleGoToMyLocation,
      disabled: () => searching.val || locating.val,
      title: 'Go to my location'
    }, () => locating.val ? '⏳' : '📍')
  )
}

