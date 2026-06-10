import { getIdentity } from './identity.js'
import { initRelay, publishEvent as relayPublish, subscribeArea as relaySubscribeArea, subscribeChat as relaySubscribeChat, getRelays } from './relay.js'
import { initPeer, joinAreaRoom, broadcastEvent as peerBroadcast, leaveAreaRoom } from './peer.js'
import { storeEvent, getItemsByGeohash, getChatForItem, purgeExpired } from './storage.js'
import { isWebXDC, webxdcSend, webxdcListen } from './webxdc.js'
import { buildItemEvent, buildTakenEvent, buildChatEvent, buildDeleteEvent, getItemGeohash } from './nostr.js'

export const CONNECTIVITY = {
  BOTH: 'both',
  PEERS: 'peers',
  RELAYS: 'relays',
}

let _mode = CONNECTIVITY.BOTH
let _areaUnsubs = new Map() // geohash -> [unsub fns]
let _chatUnsubs = new Map() // itemId -> [unsub fns]
let _onPeerCount = null
let _onRelayCount = null

export const getMode = () => _mode
export const setMode = (mode) => {
  _mode = mode
  localStorage.setItem('glean_connectivity', mode)
}

export const initSync = ({ onPeerCount, onRelayCount, relayUrls }) => {
  _mode = localStorage.getItem('glean_connectivity') || CONNECTIVITY.BOTH
  _onPeerCount = onPeerCount
  _onRelayCount = onRelayCount

  if (!isWebXDC()) {
    if (_mode !== CONNECTIVITY.PEERS) {
      initRelay(relayUrls)
    }
    if (_mode !== CONNECTIVITY.RELAYS) {
      initPeer(onPeerCount)
    }
  } else {
    webxdcListen((event) => {
      storeEvent(event)
    })
  }

  // Purge old events on startup
  purgeExpired()
}

export const subscribeArea = async (geohash, onEvent) => {
  // First serve from local cache
  const cached = await getItemsByGeohash(geohash)
  cached.forEach(onEvent)

  // Active subscriptions
  const unsubs = []

  if (!isWebXDC()) {
    if (_mode !== CONNECTIVITY.PEERS) {
      // Subscribe to relay for this area (use multiple precision prefixes)
      const prefixes = []
      for (let i = 2; i <= Math.min(geohash.length, 6); i++) {
        prefixes.push(geohash.slice(0, i))
      }
      const unsub = relaySubscribeArea(prefixes, onEvent, null)
      unsubs.push(unsub)
    }

    if (_mode !== CONNECTIVITY.RELAYS) {
      // Join Trystero room for this geohash
      const areaHash = geohash.slice(0, 4) // ~40x20km room
      const unsub = joinAreaRoom(areaHash, onEvent)
      unsubs.push(unsub)
    }
  }

  _areaUnsubs.set(geohash, unsubs)
  return () => {
    unsubs.forEach(fn => fn())
    _areaUnsubs.delete(geohash)
  }
}

export const unsubscribeArea = (geohash) => {
  const unsubs = _areaUnsubs.get(geohash) || []
  unsubs.forEach(fn => fn())
  _areaUnsubs.delete(geohash)
  leaveAreaRoom(geohash.slice(0, 4))
}

export const subscribeChat = async (itemEventId, onMessage) => {
  const cached = await getChatForItem(itemEventId)
  cached.forEach(onMessage)

  const unsubs = []

  if (!isWebXDC() && _mode !== CONNECTIVITY.PEERS) {
    const unsub = relaySubscribeChat(itemEventId, onMessage)
    unsubs.push(unsub)
  }

  _chatUnsubs.set(itemEventId, unsubs)
  return () => {
    unsubs.forEach(fn => fn())
    _chatUnsubs.delete(itemEventId)
  }
}

export const publishItem = async ({ title, description, tags, photo, geo, availableUntil }) => {
  const { secretKey, pubkey } = getIdentity()
  const id = crypto.randomUUID()
  const event = buildItemEvent({ secretKey, id, title, description, tags, photo, geo, availableUntil })

  await storeEvent(event)
  await _broadcast(event, geo)
  return event
}

export const markTaken = async (originalEvent) => {
  const { secretKey } = getIdentity()
  const event = buildTakenEvent({ secretKey, originalEvent })
  await storeEvent(event)
  await _broadcast(event, null, originalEvent)
  return event
}

export const sendChatMessage = async (itemEventId, text, itemEvent) => {
  const { secretKey } = getIdentity()
  const event = buildChatEvent({ secretKey, itemEventId, text })
  await storeEvent(event)

  if (isWebXDC()) {
    webxdcSend(event)
  } else {
    if (_mode !== CONNECTIVITY.PEERS) await relayPublish(event)
    if (_mode !== CONNECTIVITY.RELAYS && itemEvent) {
      const gh = getItemGeohash(itemEvent)
      if (gh) peerBroadcast(event, gh.slice(0, 4))
    }
  }
  return event
}

export const deleteItem = async (event) => {
  const { secretKey } = getIdentity()
  const delEvent = buildDeleteEvent({ secretKey, eventId: event.id })
  await storeEvent(delEvent)
  if (!isWebXDC() && _mode !== CONNECTIVITY.PEERS) await relayPublish(delEvent)
}

const _broadcast = async (event, geo, originalEvent) => {
  if (isWebXDC()) {
    webxdcSend(event)
    return
  }
  if (_mode !== CONNECTIVITY.PEERS) await relayPublish(event)
  if (_mode !== CONNECTIVITY.RELAYS) {
    const src = originalEvent || event
    const gh = getItemGeohash(src)
    if (gh) peerBroadcast(event, gh.slice(0, 4))
  }
}
