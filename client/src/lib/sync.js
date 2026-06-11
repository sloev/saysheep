import { getIdentity } from './identity.js'
import { initRelay, publishEvent as relayPublish, subscribeArea as relaySubscribeArea, subscribeChat as relaySubscribeChat } from './relay.js'
import { initPeer, handleP2PMessage, announceGeohash, leaveGeohash, broadcastEvent as peerBroadcast } from './peer.js'
import { storeEvent, getItemsByGeohash, getChatForItem, purgeExpired } from './storage.js'
import { isWebXDC, webxdcSend, webxdcListen } from './webxdc.js'
import { buildItemEvent, buildTakenEvent, buildChatEvent, buildDeleteEvent, getItemGeohash } from './nostr.js'

export const CONNECTIVITY = {
  BOTH: 'both',
  PEERS: 'peers',
  RELAYS: 'relays',
}

let _mode = CONNECTIVITY.BOTH
let _areaUnsubs = new Map()
let _chatUnsubs = new Map()
let _onPeerCount = null
let _onRelayCount = null
let _peerEventHandler = null

export const getMode = () => _mode
export const setMode = (mode) => {
  _mode = mode
  localStorage.setItem('saysheep_connectivity', mode)
}

export const initSync = ({ onPeerCount, onRelayCount, relayUrls }) => {
  _mode = localStorage.getItem('saysheep_connectivity') || CONNECTIVITY.BOTH
  _onPeerCount = onPeerCount
  _onRelayCount = onRelayCount

  if (!isWebXDC()) {
    if (_mode !== CONNECTIVITY.PEERS) {
      initRelay(relayUrls, handleP2PMessage, onRelayCount)
    }
    if (_mode !== CONNECTIVITY.RELAYS) {
      initPeer({
        nodeId: null, // loads from localStorage or generates fresh
        onEvent: (event) => _peerEventHandler?.(event),
        onPeerCountChange: onPeerCount,
      })
    }
  } else {
    webxdcListen((event) => storeEvent(event))
  }

  purgeExpired()
}

export const subscribeArea = async (geohash, onEvent) => {
  _peerEventHandler = onEvent

  // Serve local cache immediately
  const cached = await getItemsByGeohash(geohash)
  cached.forEach(onEvent)

  const unsubs = []

  if (!isWebXDC()) {
    if (_mode !== CONNECTIVITY.PEERS) {
      const prefixes = []
      for (let i = 2; i <= Math.min(geohash.length, 6); i++) prefixes.push(geohash.slice(0, i))
      unsubs.push(relaySubscribeArea(prefixes, onEvent, null))
    }

    if (_mode !== CONNECTIVITY.RELAYS) {
      const areaHash = geohash.slice(0, 4)
      announceGeohash(areaHash)
      unsubs.push(() => leaveGeohash(areaHash))
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
  leaveGeohash(geohash.slice(0, 4))
}

export const subscribeChat = async (itemEventId, onMessage) => {
  const cached = await getChatForItem(itemEventId)
  cached.forEach(onMessage)

  const unsubs = []
  if (!isWebXDC() && _mode !== CONNECTIVITY.PEERS) {
    unsubs.push(relaySubscribeChat(itemEventId, onMessage))
  }

  _chatUnsubs.set(itemEventId, unsubs)
  return () => {
    unsubs.forEach(fn => fn())
    _chatUnsubs.delete(itemEventId)
  }
}

export const publishItem = async ({ description, tags, photo, geo, availableUntil }) => {
  const { secretKey } = getIdentity()
  const event = buildItemEvent({ secretKey, id: crypto.randomUUID(), description, tags, photo, geo, availableUntil })
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
  if (isWebXDC()) { webxdcSend(event); return }
  if (_mode !== CONNECTIVITY.PEERS) await relayPublish(event)
  if (_mode !== CONNECTIVITY.RELAYS) {
    const src = originalEvent || event
    const gh = getItemGeohash(src)
    if (gh) peerBroadcast(event, gh.slice(0, 4))
  }
}
