import van from 'vanjs-core'
import maplibregl from 'maplibre-gl'
import * as pmtiles from 'pmtiles'
import mapstyle from '../mapstyle.json'
import { store, onMapBoundsChange, currentItemId } from '../store.js'
import { getItemGeo, isTaken, getItemTitle } from '../lib/nostr.js'
import { cone } from '../router.js'
import { t } from '../lib/i18n.js'
import { getRelays, getRelaysStatus } from '../lib/relay.js'

const mapDiv = van.tags.div({ id: 'map' })
let _map = null
const _markers = new Map()

const isWebGLSupported = () => {
  try {
    if (!maplibregl.supported()) return false
    const canvas = document.createElement('canvas')
    const gl = window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    if (!gl) return false
    return true
  } catch (e) {
    return false
  }
}

let _leafletLoadingPromise = null

const loadLeaflet = () => {
  if (_leafletLoadingPromise) return _leafletLoadingPromise

  _leafletLoadingPromise = new Promise((resolve) => {
    if (window.L) {
      resolve()
      return
    }

    // Link CSS
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    // Script JS
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => {
      resolve()
    }
    document.body.appendChild(script)
  })

  return _leafletLoadingPromise
}

const setupLeafletMap = async (lng, lat) => {
  await loadLeaflet()
  if (_map) return

  mapDiv.innerHTML = ''
  mapDiv.style.display = 'block'
  mapDiv.style.alignItems = ''
  mapDiv.style.justifyContent = ''
  mapDiv.style.padding = ''
  mapDiv.style.textAlign = ''
  mapDiv.style.background = ''

  const L = window.L

  const savedLat = localStorage.getItem('saysheep_last_lat')
  const savedLng = localStorage.getItem('saysheep_last_lng')
  const savedZoom = localStorage.getItem('saysheep_last_zoom')

  const initialCenter = (savedLat && savedLng)
    ? [parseFloat(savedLat), parseFloat(savedLng)]
    : [lat, lng]
  const initialZoom = savedZoom ? parseFloat(savedZoom) : 14

  _map = L.map(mapDiv, {
    zoomControl: false
  }).setView(initialCenter, initialZoom)

  L.control.zoom({ position: 'topright' }).addTo(_map)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(_map)

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

const flyToMap = (lng, lat, zoom = 14) => {
  if (!_map) return
  if (window.L && _map instanceof window.L.Map) {
    _map.flyTo([lat, lng], zoom)
  } else {
    _map.flyTo({
      center: [lng, lat],
      zoom,
      essential: true
    })
  }
}

export const setupMap = (lng, lat) => {
  if (_map) return
  if (!isWebGLSupported()) {
    setupLeafletMap(lng, lat)
    return
  }
  const protocol = new pmtiles.Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)

  const isSelfHostedRelay = (url) => {
    const envUrl = import.meta.env?.VITE_RELAY_URL
    if (envUrl && url === envUrl) return true
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('192.168.') || url.includes('10.')) return true
    try {
      const relayHost = new URL(url).hostname
      if (relayHost === window.location.hostname) return true
    } catch {}
    return false
  }

  const status = getRelaysStatus()
  const selfHostedRelays = status.filter(r => isSelfHostedRelay(r.url))
  const connectedRelay = selfHostedRelays.find(r => r.connected) || selfHostedRelays[0]

  let mapPmtilesUrl
  if (connectedRelay) {
    const relayBaseUrl = connectedRelay.url.replace(/^ws/, 'http')
    mapPmtilesUrl = `pmtiles://${relayBaseUrl}/map.pmtiles`
  } else {
    mapPmtilesUrl = 'pmtiles://https://data.source.coop/protomaps/openstreetmap/v4.pmtiles'
  }

  const dynamicStyle = JSON.parse(JSON.stringify(mapstyle))
  dynamicStyle.sources["saysheep-tiles"].url = mapPmtilesUrl

  const savedLat = localStorage.getItem('saysheep_last_lat')
  const savedLng = localStorage.getItem('saysheep_last_lng')
  const savedZoom = localStorage.getItem('saysheep_last_zoom')

  const initialCenter = (savedLat && savedLng)
    ? [parseFloat(savedLng), parseFloat(savedLat)]
    : [lng, lat]
  const initialZoom = savedZoom ? parseFloat(savedZoom) : 14

  _map = new maplibregl.Map({
    container: mapDiv,
    style: dynamicStyle,
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
    if (mapDiv.offsetWidth === 0 || mapDiv.offsetHeight === 0) return
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
        flyToMap(targetLng, targetLat, 14)
      } else {
        alert(t('map.location_not_found'))
      }
    } catch (err) {
      alert(t('map.search_error', { error: err.message }))
    } finally {
      searching.val = false
    }
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

  return van.tags.div({ class: 'map-searchbox' },
    van.tags.input({
      class: 'map-search-input',
      type: 'text',
      placeholder: t('map.search_placeholder'),
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

