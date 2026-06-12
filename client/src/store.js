import van from 'vanjs-core'
import * as vanX from 'vanjs-ext'
import { initSync, subscribeArea, CONNECTIVITY, getMode } from './lib/sync.js'
import { initI18n } from './lib/i18n.js'
import { getIdentity, importIdentity } from './lib/identity.js'
import { encodeGeohash, precisionForZoom, geohashesForBounds } from './lib/geo.js'


import { getRelays } from './lib/relay.js'
import { getItemGeohash, getItemGeo, isTaken, isExpired, getEventPow, randomUUID } from './lib/nostr.js'
import { notifyIfMatches } from './lib/notifications.js'

export const currentItemId = van.state(null)

export const store = vanX.reactive({
  items: {},
  position: { lat: null, lng: null, loading: true, error: null },
  map: {
    bounds: null,
    zoom: 14,
    geohash: null,
  },
  connectivity: {
    mode: CONNECTIVITY.BOTH,
    peers: 0,
    relays: 0,
  },
  identity: { pubkey: null },
  ui: {
    loading: true,
    searchQuery: '',
  },
  subscriptions: [],
  areaUnsubs: {},
})

let _mapUnsub = null

export const initStore = async () => {
  // i18n first
  await initI18n()

  // Identity
  const { pubkey } = getIdentity()
  store.identity.pubkey = pubkey

  // Init sync layer
  initSync({
    onPeerCount: (n) => { store.connectivity.peers = n },
    onRelayCount: (n) => { store.connectivity.relays = n },
    onEvent: (event) => addEvent(event),
    relayUrls: null, // uses stored/default relays
  })
  store.connectivity.mode = getMode()

  // Load subscriptions from localStorage
  try {
    const s = localStorage.getItem('saysheep_subscriptions')
    if (s) store.subscriptions = JSON.parse(s) || []
  } catch {}

  // Watch GPS
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      ({ coords }) => {
        store.position.lat = coords.latitude
        store.position.lng = coords.longitude
        store.position.loading = false
      },
      (err) => {
        if (!store.position.lat) {
          store.position.lat = 55.6761
          store.position.lng = 12.5683
        }
        store.position.loading = false
        store.position.error = 'location_denied'
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    )
  } else {
    if (!store.position.lat) {
      store.position.lat = 55.6761
      store.position.lng = 12.5683
    }
    store.position.loading = false
  }

  store.ui.loading = false
}

// Automatically subscribe to user's local geohash when GPS location is acquired
van.derive(async () => {
  if (!store.position.loading && store.position.lat && store.position.lng) {
    const precision = 5
    const gh = encodeGeohash(store.position.lat, store.position.lng, precision)
    if (!store.areaUnsubs[gh]) {
      const unsub = await subscribeArea(gh, (event) => addEvent(event))
      store.areaUnsubs[gh] = unsub
    }
  }
})


// Called when map bounds change
export const onMapBoundsChange = async ({ sw, ne, zoom }) => {
  if (!sw || !ne) return
  if (sw.lat === 0 && ne.lat === 0 && sw.lng === 0 && ne.lng === 0) return
  if (sw.lat === ne.lat && sw.lng === ne.lng) return

  store.map.bounds = { sw, ne }
  store.map.zoom = zoom

  const precision = precisionForZoom(zoom)
  const geohashes = await geohashesForBounds(sw, ne, precision)

  // Unsubscribe from geohashes no longer in view
  for (const [gh, unsub] of Object.entries(store.areaUnsubs)) {
    if (!geohashes.includes(gh)) {
      if (typeof unsub === 'function') unsub()
      delete store.areaUnsubs[gh]
    }
  }

  // Subscribe to new geohashes
  for (const gh of geohashes) {
    if (store.areaUnsubs[gh]) continue
    const unsub = await subscribeArea(gh, (event) => addEvent(event))
    store.areaUnsubs[gh] = unsub
  }
}

export const addEvent = (event) => {
  if (!event?.id) return

  // Spam prevention: PoW (Proof of Work) verification
  if (event.kind === 30402 || event.kind === 1) {
    const requiredPow = event.kind === 30402 ? 8 : 4
    if (getEventPow(event.id) < requiredPow) {
      return // Discard spam event
    }
  }

  // NIP-09 kind 5: deletion event
  if (event.kind === 5) {
    const eTags = event.tags.filter(t => t[0] === 'e').map(t => t[1])
    for (const id of eTags) {
      const target = store.items[id]
      if (target && target.pubkey === event.pubkey) {
        delete store.items[id]
        if (currentItemId.val === id) {
          currentItemId.val = null
        }
      }
    }
    return
  }

  if (isExpired(event)) return

  // NIP-33: kind 30402 is a replaceable event keyed by (pubkey, d-tag).
  // If a newer version arrives, remove the old event from the store.
  if (event.kind === 30402) {
    const d = event.tags.find(t => t[0] === 'd')?.[1]
    if (d) {
      for (const [id, ev] of Object.entries(store.items)) {
        if (ev.kind === 30402 && ev.pubkey === event.pubkey &&
            ev.tags.find(t => t[0] === 'd')?.[1] === d) {
          if (ev.created_at >= event.created_at) return // already have newer/same
          delete store.items[id] // remove stale version
          if (currentItemId.val === id) {
            currentItemId.val = event.id
          }
          break
        }
      }
    }
  }

  const existing = store.items[event.id]
  if (existing && existing.created_at >= event.created_at) return
  store.items[event.id] = event

  // Notify if this new item matches any alert subscription
  if (event.kind === 30402 && !isTaken(event)) {
    notifyIfMatches(event, store.subscriptions)
  }
}

export const saveSubscriptions = () => {
  localStorage.setItem('saysheep_subscriptions', JSON.stringify(store.subscriptions || []))
}

export const addSubscription = (geohash, tags, label) => {
  const id = randomUUID()
  if (!store.subscriptions) store.subscriptions = []
  store.subscriptions.push({ id, geohash, tags: tags || [], label: label || geohash })
  saveSubscriptions()
}

export const removeSubscription = (id) => {
  store.subscriptions = store.subscriptions.filter(s => s.id !== id)
  saveSubscriptions()
}

export const getFilteredItems = () => {
  const q = store.ui.searchQuery.toLowerCase().trim()
  return Object.values(store.items).filter(ev => {
    if (isTaken(ev) || isExpired(ev)) return false

    // Filter by visible map bounds
    if (store.map.bounds) {
      const geo = getItemGeo(ev)
      if (!geo) return false
      const { sw, ne } = store.map.bounds
      const latOk = geo.lat >= sw.lat && geo.lat <= ne.lat
      const lngOk = sw.lng <= ne.lng
        ? (geo.lng >= sw.lng && geo.lng <= ne.lng)
        : (geo.lng >= sw.lng || geo.lng <= ne.lng)
      if (!latOk || !lngOk) return false
    }

    if (!q) return true
    const title = ev.tags.find(t => t[0] === 'title')?.[1] || ''
    const tags = ev.tags.filter(t => t[0] === 't').map(t => t[1]).join(' ')
    const content = ev.content || ''
    return (title + ' ' + tags + ' ' + content).toLowerCase().includes(q)
  })
}

export const updateIdentity = (secretKeyHex) => {
  const ident = importIdentity(secretKeyHex)
  store.identity.pubkey = ident.pubkey
}

