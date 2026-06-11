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

  const handleSearch = async () => {
    const q = query.val.trim()
    if (!q || !_map) return
    searching.val = true
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (data && data.length > 0) {
        const { lat, lon } = data[0]
        _map.flyTo({
          center: [parseFloat(lon), parseFloat(lat)],
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
      class: () => `btn btn-primary map-search-btn ${searching.val ? 'loading' : ''}`,
      onclick: handleSearch,
      disabled: searching
    }, 'Go')
  )
}

