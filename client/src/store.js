import van from 'vanjs-core'
import * as vanX from 'vanjs-ext'
import { initSync, subscribeArea, CONNECTIVITY, getMode } from './lib/sync.js'
import { initI18n } from './lib/i18n.js'
import { getIdentity, importIdentity } from './lib/identity.js'
import { encodeGeohash, precisionForZoom, geohashesForBounds } from './lib/geo.js'
import { getSearchableTerms } from './lib/categories.js'

import { getRelays } from './lib/relay.js'
import { getItemGeohash, getItemGeo, isTaken, isExpired, getEventPow, randomUUID, isTestContext, computeReceiptHash } from './lib/nostr.js'
import { notifyIfMatches } from './lib/notifications.js'

const savedItemId = typeof window !== 'undefined' ? localStorage.getItem('saysheep_current_item_id') : null
export const currentItemId = van.state(savedItemId)

van.derive(() => {
  if (typeof window !== 'undefined') {
    if (currentItemId.val) {
      localStorage.setItem('saysheep_current_item_id', currentItemId.val)
    } else {
      localStorage.removeItem('saysheep_current_item_id')
    }
  }
})

let _onPositionUpdate = null
export const registerOnPositionUpdate = (cb) => {
  _onPositionUpdate = cb
}

export const store = vanX.reactive({
  items: {},
  position: { lat: null, lng: null, loading: true, error: null, isFallback: false },
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
        const firstReal = store.position.isFallback || (store.position.lat === null);
        store.position.lat = coords.latitude
        store.position.lng = coords.longitude
        store.position.loading = false
        store.position.isFallback = false
        if (firstReal && _onPositionUpdate) {
          _onPositionUpdate(coords.longitude, coords.latitude)
        }
      },
      (err) => {
        if (!store.position.lat) {
          store.position.lat = 55.6761
          store.position.lng = 12.5683
          store.position.isFallback = true
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
      store.position.isFallback = true
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

  // Discard test events for general users
  const isTestItem = event.tags.some(t => t[0] === 'test' && t[1] === 'true')
  if (isTestItem && !isTestContext()) {
    return
  }

  // Spam prevention: PoW (Proof of Work) verification
  if (event.kind === 30402 || event.kind === 1) {
    const requiredPow = event.kind === 30402 ? 8 : 4
    if (getEventPow(event.id) < requiredPow) {
      return // Discard spam event
    }
  }

  if (event.kind === 30403) {
    const eTag = event.tags.find(t => t[0] === 'e')?.[1]
    const code = event.tags.find(t => t[0] === 'c')?.[1]
    if (eTag && code) {
      const target = store.items[eTag]
      if (target) {
        const hTag = target.tags.find(t => t[0] === 'h')?.[1]
        const dTag = target.tags.find(t => t[0] === 'd')?.[1] || ''
        if (hTag) {
          computeReceiptHash(code, dTag, target.pubkey).then(hCheck => {
            if (hCheck === hTag) {
              target.takenLocally = true
              store.items = { ...store.items }
            }
          })
        }
      }
      store.items[event.id] = event
      store.items = { ...store.items }
    }
    return
  }

  // NIP-09 kind 5: deletion event
  if (event.kind === 5) {
    const eTags = event.tags.filter(t => t[0] === 'e').map(t => t[1])
    let deleted = false
    for (const id of eTags) {
      const target = store.items[id]
      if (target && target.pubkey === event.pubkey) {
        delete store.items[id]
        deleted = true
        if (currentItemId.val === id) {
          currentItemId.val = null
        }
      }
    }
    if (deleted) {
      store.items = { ...store.items }
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
  store.items = { ...store.items }

  if (event.kind === 30402) {
    const claimants = Object.values(store.items).filter(ev => ev.kind === 30403 && ev.tags.find(t => t[0] === 'e')?.[1] === event.id)
    for (const claimant of claimants) {
      const code = claimant.tags.find(t => t[0] === 'c')?.[1]
      const hTag = event.tags.find(t => t[0] === 'h')?.[1]
      const dTag = event.tags.find(t => t[0] === 'd')?.[1] || ''
      if (code && hTag) {
        computeReceiptHash(code, dTag, event.pubkey).then(hCheck => {
          if (hCheck === hTag) {
            event.takenLocally = true
            store.items = { ...store.items }
          }
        })
      }
    }
  }

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

    if (!q) return true
    const { title, content, tags } = getSearchableTerms(ev)
    return title.includes(q) ||
           content.includes(q) ||
           tags.some(t => t.includes(q))
  })
}

export const updateIdentity = (secretKeyHex) => {
  const ident = importIdentity(secretKeyHex)
  store.identity.pubkey = ident.pubkey
}

