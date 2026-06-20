import van from 'vanjs-core'
import * as vanX from 'vanjs-ext'
import { initSync, subscribeArea, subscribeDMs, sendDM, CONNECTIVITY, getMode } from './lib/sync.js'
import { toMessage, threadKey, parseThreadKey, dmRecipient, CHAT_KIND, DM_POW } from './lib/dm.js'
import { initI18n } from './lib/i18n.js'
import { getIdentity, importIdentity } from './lib/identity.js'
import { encodeGeohash, precisionForZoom, geohashesForBounds, geohashBounds } from './lib/geo.js'
import { getSearchableTerms } from './lib/categories.js'

import { getRelays } from './lib/relay.js'
import { getItemGeohash, getItemGeo, isTaken, isExpired, getEventPow, randomUUID, isTestContext, computeReceiptHash, getItemTitle } from './lib/nostr.js'
import { notifyIfMatches, findAgentMatch } from './lib/notifications.js'
import { getItemId } from './lib/nostr.js'
import { cone } from './router.js'

const savedItemId = typeof window !== 'undefined' ? localStorage.getItem('saysheep_current_item_id') : null
export const currentItemId = van.state(savedItemId)

// Open an item's detail page with a deep-linkable URL (/item/<d-tag>), so the
// address bar and shared links identify the specific listing. The stable d-tag
// is used so a link survives the owner editing/republishing the listing.
export const openItem = (event) => {
  if (!event) return
  currentItemId.val = event.id
  cone.navigate('item', { params: { id: getItemId(event) } })
}
export const openItemById = (id) => {
  if (!id) return
  const ev = store.items?.[id]
  currentItemId.val = id
  cone.navigate('item', { params: { id: ev ? getItemId(ev) : id } })
}

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

  // Load the in-app notification feed + backfill watermark
  initNotifications()

  // Private item chat: replay cached DMs + subscribe for new ones (to/from me).
  loadThreadReads()
  subscribeDMs(store.identity.pubkey, (ev) => addEvent(ev))

  // First-ever launch: drop a welcome notification that opens the onboarding page.
  if (!localStorage.getItem('saysheep_welcomed')) {
    addNotification({ type: 'announcement', route: 'onboarding', key: 'welcome', params: { textKey: 'notif.welcome' } })
    localStorage.setItem('saysheep_welcomed', '1')
  }

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
  // Private item chat (NIP-44 DM): decrypt, thread, and feed the Messages view.
  // These never enter store.items (which is listings only).
  if (event.kind === CHAT_KIND) {
    if (!event.content || event.content.length > 16000) return
    if (getEventPow(event.id) < DM_POW) return // anti-spam PoW
    ingestMessage(event)
    return
  }
  // Legacy plaintext chat (kind 1) is dropped — chat is private now.
  if (event.kind === 1) return

  // Discard test events for general users
  const isTestItem = event.tags.some(t => t[0] === 'test' && t[1] === 'true')
  if (isTestItem && !isTestContext()) {
    return
  }

  // Spam prevention: PoW (Proof of Work) verification
  if (event.kind === 30402) {
    if (getEventPow(event.id) < 8) {
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

  // OS notification + in-app feed for matching listings and chat replies.
  if (event.kind === 30402 && !isTaken(event)) {
    notifyIfMatches(event, store.agents)
  }
  maybeNotify(event)
}

// ---- Agents: a saved { name, query, bounds, notificationsEnabled } ----
// query is exactly what you'd type in the list search box; bounds is a map view.
// editingAgentId is the agent open in the Agents tab's detail view (null = list).
export const editingAgentId = van.state(null)

// Open an agent in the Agents tab's detail view.
export const openAgent = (id) => {
  editingAgentId.val = id
  cone.navigate('agents', {})
}

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

// ---- In-app notification feed ----
// A notification is { id, key, type, params, itemId, ts, read }. `type` is one of
// 'item' (an agent matched a new listing), 'message' (a chat reply on one of my
// listings), or 'announcement' (from the platform). `params` is rendered with t()
// at display time so the feed re-localises when the language changes.
const NOTIF_CAP = 50
// Only events newer than this (unix seconds) generate notifications, so the
// initial relay backfill of historical listings doesn't flood the feed. Snapshot
// at startup; the running max is persisted as the next session's baseline.
let _notifBaseline = 0
let _notifMax = 0

// The feed is a plain van.state array (rendered wholesale, not keyed) — its
// reassignment is reliably reactive, unlike a vanX array field.
export const notifications = van.state([])

const initNotifications = () => {
  const stored = localStorage.getItem('saysheep_notif_ts')
  _notifBaseline = stored == null ? Math.floor(Date.now() / 1000) : (parseInt(stored) || 0)
  _notifMax = _notifBaseline
  if (stored == null) localStorage.setItem('saysheep_notif_ts', String(_notifBaseline))
  try {
    notifications.val = JSON.parse(localStorage.getItem('saysheep_notifications') || '[]') || []
  } catch { notifications.val = [] }
}

const saveNotifications = () => {
  localStorage.setItem('saysheep_notifications', JSON.stringify(notifications.val.slice(0, NOTIF_CAP)))
  localStorage.setItem('saysheep_notif_ts', String(_notifMax))
}

export const addNotification = ({ type, params = {}, itemId = null, route = null, ts, key }) => {
  const when = ts || Math.floor(Date.now() / 1000)
  const dedupeKey = key || `${type}:${itemId || ''}:${when}`
  if (notifications.val.some(n => n.key === dedupeKey)) return
  notifications.val = [
    { id: randomUUID(), key: dedupeKey, type, params, itemId, route, ts: when, read: false },
    ...notifications.val,
  ].slice(0, NOTIF_CAP)
  saveNotifications()
}

export const markNotificationsRead = () => {
  if (!notifications.val.some(n => !n.read)) return
  notifications.val = notifications.val.map(n => n.read ? n : { ...n, read: true })
  saveNotifications()
}

export const clearNotifications = () => {
  notifications.val = []
  saveNotifications()
}

export const unreadNotificationCount = () => notifications.val.filter(n => !n.read).length

// Inspect a freshly-ingested event and append any in-app notification it warrants.
// Gated on the backfill watermark so only genuinely new events notify.
const maybeNotify = (event) => {
  if (!event?.created_at) return
  if (event.created_at > _notifMax) _notifMax = event.created_at
  if (event.created_at <= _notifBaseline) return

  // An agent matched a new listing.
  if (event.kind === 30402 && !isTaken(event)) {
    const agent = findAgentMatch(event, store.agents)
    if (agent) {
      const what = (agent.query || '').trim() || getItemTitle(event) || ''
      addNotification({
        type: 'item',
        itemId: event.id,
        ts: event.created_at,
        key: `item:${event.id}`,
        params: { what, agent: agent.name || '' },
      })
    }
  }
  // DM notifications are raised in ingestMessage (the content must be decrypted
  // first to know which thread it belongs to).
}

// ---- Private item chat (NIP-44 DM) threads ----
// Decrypted messages, newest-appended. A plain van.state (rendered wholesale),
// like the notification feed — vanX array fields don't reliably re-bind.
export const messages = van.state([])
// Per-thread last-read unix seconds, for unread dots. van.state so the navbar
// badge and thread list re-derive when it changes.
export const threadReads = van.state({})
// The thread open in the Messages page (a threadKey), or null for the list.
export const openThread = van.state(null)
// Locally hidden/archived threads: key -> hide timestamp. A thread reappears
// once a newer message arrives (created_at > hide ts).
export const hiddenThreads = van.state({})

const loadThreadReads = () => {
  try { threadReads.val = JSON.parse(localStorage.getItem('saysheep_thread_reads') || '{}') || {} }
  catch { threadReads.val = {} }
  try { hiddenThreads.val = JSON.parse(localStorage.getItem('saysheep_hidden_threads') || '{}') || {} }
  catch { hiddenThreads.val = {} }
}

// Block the other party in a thread: mute them (drops their future events and
// existing listings) and leave the thread view. Muted parties are filtered out
// of the thread list.
export const blockThread = (key) => {
  const { ownerPubkey, takerPubkey } = parseThreadKey(key)
  mutePubkey(threadOther(ownerPubkey, takerPubkey))
  openThread.val = null
}

// Hide/archive a thread locally; it returns if a newer message arrives.
export const hideThread = (key) => {
  const next = { ...hiddenThreads.val, [key]: Math.floor(Date.now() / 1000) }
  hiddenThreads.val = next
  localStorage.setItem('saysheep_hidden_threads', JSON.stringify(next))
  openThread.val = null
}

// Decrypt + thread a DM event, append it to the feed, and notify if it's an
// inbound message newer than the backfill watermark.
const ingestMessage = (event) => {
  const { secretKey } = getIdentity()
  const msg = toMessage(event, secretKey, store.identity.pubkey)
  if (!msg) return

  // Harden against forged 'o'/'i' tags: a DM's owner is authoritatively the
  // listing's pubkey, not whatever the sender claimed. When we hold the listing,
  // require that one of the two participants actually owns it (else the thread is
  // spoofed — drop it), and recompute the thread from the real owner so a sender
  // can't misattribute a conversation to a different item/owner.
  const item = findItemByDtag(msg.itemId)
  if (item) {
    const recipient = dmRecipient(event)
    const realOwner = item.pubkey
    if (msg.sender !== realOwner && recipient !== realOwner) return
    const taker = msg.sender === realOwner ? recipient : msg.sender
    msg.ownerPubkey = realOwner
    msg.takerPubkey = taker
    msg.key = threadKey(msg.itemId, realOwner, taker)
  }

  if (messages.val.some(m => m.id === msg.id)) return
  messages.val = [...messages.val, msg].sort((a, b) => a.created_at - b.created_at)

  if (!msg.fromMe) {
    if (event.created_at > _notifMax) _notifMax = event.created_at
    // Coalesce: at most one unread message notification per thread, so a burst of
    // messages (or a spammer) can't flood the feed.
    const alreadyUnread = notifications.val.some(n => n.type === 'message' && !n.read && n.params?.threadKey === msg.key)
    if (event.created_at > _notifBaseline && !alreadyUnread) {
      const item = findItemByDtag(msg.itemId)
      addNotification({
        type: 'message',
        itemId: msg.itemId,
        route: 'messages',
        ts: event.created_at,
        key: `dm:${event.id}`,
        params: { title: item ? (getItemTitle(item) || '') : '', threadKey: msg.key },
      })
    }
  }
}

// Resolve a listing by its stable d-tag (messages reference items by d-tag so a
// thread survives the owner republishing the listing).
export const findItemByDtag = (dtag) =>
  Object.values(store.items).find(e => e.kind === 30402 && getItemId(e) === dtag) || null

// The other participant in a thread, from my perspective.
export const threadOther = (ownerPubkey, takerPubkey) =>
  store.identity.pubkey === ownerPubkey ? takerPubkey : ownerPubkey

// Threads, newest-activity first: { key, itemId, ownerPubkey, takerPubkey, last }.
export const getThreads = () => {
  const map = new Map()
  for (const m of messages.val) {
    const cur = map.get(m.key)
    if (!cur) {
      map.set(m.key, { key: m.key, itemId: m.itemId, ownerPubkey: m.ownerPubkey, takerPubkey: m.takerPubkey, last: m })
    } else if (m.created_at > cur.last.created_at) {
      cur.last = m
    }
  }
  return [...map.values()]
    // Hide blocked participants and locally-archived threads (the latter return
    // when a newer message lands).
    .filter(th => !isMuted(threadOther(th.ownerPubkey, th.takerPubkey)))
    .filter(th => !(hiddenThreads.val[th.key] >= th.last.created_at))
    .sort((a, b) => b.last.created_at - a.last.created_at)
}

export const getThreadMessages = (key) =>
  messages.val.filter(m => m.key === key).sort((a, b) => a.created_at - b.created_at)

// Unread if the newest inbound message is newer than my last read of the thread.
export const threadUnread = (key) => {
  let lastIn = 0
  for (const m of messages.val) if (m.key === key && !m.fromMe && m.created_at > lastIn) lastIn = m.created_at
  return lastIn > (threadReads.val[key] || 0)
}

export const unreadThreadTotal = () => getThreads().filter(th => threadUnread(th.key)).length

export const markThreadRead = (key) => {
  const next = { ...threadReads.val, [key]: Math.floor(Date.now() / 1000) }
  threadReads.val = next
  localStorage.setItem('saysheep_thread_reads', JSON.stringify(next))
}

// Send a message in a thread: resolves the recipient (the other participant) and
// the live item event needed for peer geohash routing.
export const sendThreadMessage = async (key, text) => {
  const trimmed = (text || '').trim()
  if (!trimmed) return null
  const { ownerPubkey, takerPubkey, itemId } = parseThreadKey(key)
  const itemEvent = findItemByDtag(itemId)
  if (!itemEvent) return null
  const event = await sendDM({ recipientPubkey: threadOther(ownerPubkey, takerPubkey), itemEvent, text: trimmed })
  ingestMessage(event)
  return event
}

// Open (or start) the thread between me — an interested user — and an item owner.
export const openOwnerThread = (itemEvent) => {
  const key = threadKey(getItemId(itemEvent), itemEvent.pubkey, store.identity.pubkey)
  openThread.val = key
  markThreadRead(key)
  cone.navigate('messages', {})
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

