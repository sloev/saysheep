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

  _map = new maplibregl.Map({
    container: mapDiv,
    style: mapstyle,
    center: [lng, lat],
    zoom: 14,
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
