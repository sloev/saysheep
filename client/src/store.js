import van from 'vanjs-core'
import * as vanX from 'vanjs-ext'
import { initSync, subscribeArea, CONNECTIVITY, getMode } from './lib/sync.js'
import { initI18n } from './lib/i18n.js'
import { getIdentity, importIdentity } from './lib/identity.js'
import { encodeGeohash, precisionForZoom, geohashesForBounds, geohashBounds } from './lib/geo.js'
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
    cacheLoaded: false,
  },
  agents: [],
  muted: [],
  areaUnsubs: {},
})

let _mapUnsub = null

let updateTimeout = null
export const queueStoreItemsUpdate = () => {
  if (updateTimeout) return
  updateTimeout = setTimeout(() => {
    store.items = { ...store.items }
    updateTimeout = null
  }, 150)
}

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

  // Load agents (migrating any legacy point-geohash subscriptions to the new
  // query + map-bounds model).
  try {
    const a = localStorage.getItem('saysheep_agents')
    if (a) {
      store.agents = JSON.parse(a) || []
    } else {
      const legacy = JSON.parse(localStorage.getItem('saysheep_subscriptions') || 'null')
      if (Array.isArray(legacy)) {
        store.agents = legacy.map(s => ({
          id: s.id || randomUUID(),
          name: s.label || s.geohash || 'agent',
          query: (s.tags || []).join(' '),
          bounds: s.geohash ? geohashBounds(s.geohash) : null,
          notificationsEnabled: s.notificationsEnabled !== false,
        }))
        saveAgents()
      }
    }
  } catch {}

  // Load muted keys from localStorage
  try {
    const m = localStorage.getItem('saysheep_muted')
    if (m) store.muted = JSON.parse(m) || []
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
      store.ui.cacheLoaded = true
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

export const isMuted = (pubkey) => {
  if (!pubkey) return false
  return (store.muted || []).includes(pubkey)
}

export const addEvent = (event) => {
  if (!event?.id) return
  if (isMuted(event.pubkey)) return

  // Sanitization / Size validation to prevent XSS and DoS
  if (event.kind === 30402) {
    const titleTag = event.tags.find(t => t[0] === 'title')?.[1]
    if (titleTag && titleTag.length > 200) return
    const summaryTag = event.tags.find(t => t[0] === 'summary')?.[1]
    if (summaryTag && summaryTag.length > 5000) return
    const imageTag = event.tags.find(t => t[0] === 'image')?.[1]
    if (imageTag) {
      if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(imageTag)) return
      if (imageTag.length > 600000) return
    }
    const gTags = event.tags.filter(t => t[0] === 'g').map(t => t[1])
    for (const gh of gTags) {
      if (!/^[a-z0-9]+$/.test(gh) || gh.length > 9) return
    }
  }
  if (event.kind === 1) {
    if (!event.content || event.content.length > 1000) return
  }

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
    const code = event.tags.find(t => t[0] === 'c')?.[1] || ''
    if (eTag) {
      const target = store.items[eTag]
      if (target) {
        const hTag = target.tags.find(t => t[0] === 'h')?.[1]
        const dTag = target.tags.find(t => t[0] === 'd')?.[1] || ''
        // Only a taker receipt that verifies against the item's pickup-hash (h)
        // may flip it to taken. An item without an h tag cannot be claimed by a
        // third party — this prevents unverified/griefing takes.
        if (hTag && code) {
          computeReceiptHash(code, dTag, target.pubkey).then(hCheck => {
            if (hCheck === hTag) {
              target.takenLocally = true
              queueStoreItemsUpdate()
            }
          })
        }
      }
      store.items[event.id] = event
      queueStoreItemsUpdate()
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
      queueStoreItemsUpdate()
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
  queueStoreItemsUpdate()

  if (event.kind === 30402) {
    const claimants = Object.values(store.items).filter(ev => ev.kind === 30403 && ev.tags.find(t => t[0] === 'e')?.[1] === event.id)
    for (const claimant of claimants) {
      const code = claimant.tags.find(t => t[0] === 'c')?.[1] || ''
      const hTag = event.tags.find(t => t[0] === 'h')?.[1]
      const dTag = event.tags.find(t => t[0] === 'd')?.[1] || ''
      // Same rule as above: a taker receipt only counts if it verifies against
      // the item's h commitment; no h means it can't be third-party-claimed.
      if (hTag && code) {
        computeReceiptHash(code, dTag, event.pubkey).then(hCheck => {
          if (hCheck === hTag) {
            event.takenLocally = true
            queueStoreItemsUpdate()
          }
        })
      }
    }
  }

  // Notify if this new item matches any agent
  if (event.kind === 30402 && !isTaken(event)) {
    notifyIfMatches(event, store.agents)
  }
}

// ---- Agents: a saved { name, query, bounds, notificationsEnabled } ----
// query is exactly what you'd type in the list search box; bounds is a map view.
export const editingAgentId = van.state(null)

export const saveAgents = () => {
  localStorage.setItem('saysheep_agents', JSON.stringify(store.agents || []))
}

export const addAgent = ({ name, query, bounds, notificationsEnabled = true }) => {
  const id = randomUUID()
  if (!store.agents) store.agents = []
  store.agents.push({ id, name: name || '', query: query || '', bounds: bounds || null, notificationsEnabled })
  saveAgents()
  return id
}

export const updateAgent = (id, patch) => {
  const a = (store.agents || []).find(x => x.id === id)
  if (!a) return
  Object.assign(a, patch)
  saveAgents()
}

export const removeAgent = (id) => {
  store.agents = (store.agents || []).filter(a => a.id !== id)
  saveAgents()
}

// Does an item match a free-text query? Same logic as the list search box, so an
// agent's saved query behaves identically to typing it there.
export const itemMatchesQuery = (ev, query) => {
  const q = (query || '').toLowerCase().trim()
  if (!q) return true
  const { title, content, tags } = getSearchableTerms(ev)
  return title.includes(q) || content.includes(q) || tags.some(t => t.includes(q))
}

// Is an item's location inside a { sw, ne } bounds box?
export const itemInBounds = (ev, bounds) => {
  if (!bounds) return true
  const geo = getItemGeo(ev)
  if (!geo) return false
  const { sw, ne } = bounds
  return geo.lat >= sw.lat && geo.lat <= ne.lat && geo.lng >= sw.lng && geo.lng <= ne.lng
}

export const getFilteredItems = () => {
  const bounds = store.map.bounds
  const q = store.ui.searchQuery
  return Object.values(store.items).filter(ev => {
    // The list is a feed of give-away listings only — never claim receipts
    // (30403), chat (1) or deletions (5), which also live in store.items.
    if (ev.kind !== 30402) return false
    if (isMuted(ev.pubkey)) return false
    if (isTaken(ev) || isExpired(ev)) return false
    if (!itemInBounds(ev, bounds)) return false
    return itemMatchesQuery(ev, q)
  })
}

export const updateIdentity = (secretKeyHex) => {
  const ident = importIdentity(secretKeyHex)
  store.identity.pubkey = ident.pubkey
}

export const saveMuted = () => {
  localStorage.setItem('saysheep_muted', JSON.stringify(store.muted || []))
}

export const mutePubkey = (pubkey) => {
  if (!pubkey) return
  if (!store.muted) store.muted = []
  if (!store.muted.includes(pubkey)) {
    store.muted.push(pubkey)
    saveMuted()
    // Remove all existing items from store by this pubkey
    let removedAny = false
    for (const [id, ev] of Object.entries(store.items)) {
      if (ev.pubkey === pubkey) {
        delete store.items[id]
        removedAny = true
        if (currentItemId.val === id) {
          currentItemId.val = null
        }
      }
    }
    if (removedAny) {
      queueStoreItemsUpdate()
    }
  }
}

export const unmutePubkey = (pubkey) => {
  if (!pubkey) return
  if (!store.muted) return
  store.muted = store.muted.filter(pk => pk !== pubkey)
  saveMuted()
}

