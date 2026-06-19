import { getIdentity } from './identity.js'
import { initRelay, publishEvent as relayPublish, subscribeArea as relaySubscribeArea, subscribeDMs as relaySubscribeDMs } from './relay.js'
import { initPeer, handleP2PMessage, announceGeohash, leaveGeohash, broadcastEvent as peerBroadcast } from './peer.js'
import { storeEvent, getItemsByGeohash, getDMs, purgeExpired } from './storage.js'
import { isWebXDC, webxdcSend, webxdcListen } from './webxdc.js'
import { buildItemEvent, buildTakenEvent, buildTakerTakenEvent, buildDeleteEvent, buildReportEvent, getItemGeohash, getItemId, randomUUID } from './nostr.js'
import { buildDMEvent } from './dm.js'
import { phashFromDataUrl } from './phash.js'

export const CONNECTIVITY = {
  BOTH: 'both',
  PEERS: 'peers',
  RELAYS: 'relays',
}

// There is no user-facing connectivity toggle. saysheep always runs peers AND
// relays at once; if no relay is reachable the relay calls simply no-op and the
// peer layer (WebRTC / Android WiFi-Direct) carries sync on its own, so it
// "downgrades" to peers-only automatically and re-upgrades when a relay returns.
const _mode = CONNECTIVITY.BOTH
let _areaUnsubs = new Map()
let _chatUnsubs = new Map()
let _onPeerCount = null
let _onRelayCount = null
let _peerEventHandler = null
let _onEventCallback = null

export const getMode = () => CONNECTIVITY.BOTH

export const initSync = ({ onPeerCount, onRelayCount, onEvent, relayUrls }) => {
  _onPeerCount = onPeerCount
  _onRelayCount = onRelayCount
  _onEventCallback = onEvent

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

// Subscribe to all private DMs for the current identity. Cached DMs replay
// first; incoming relay DMs are persisted before being handed up so they
// survive reloads. Peer-delivered DMs arrive through the shared area handler.
export const subscribeDMs = async (myPubkey, onEvent) => {
  const cached = await getDMs()
  cached.forEach(onEvent)

  const unsubs = []
  if (!isWebXDC() && _mode !== CONNECTIVITY.PEERS) {
    unsubs.push(relaySubscribeDMs(myPubkey, async (ev) => {
      await storeEvent(ev)
      onEvent(ev)
    }))
  }

  _chatUnsubs.set('dm', unsubs)
  return () => {
    unsubs.forEach(fn => fn())
    _chatUnsubs.delete('dm')
  }
}

export const publishItem = async ({ id, description, tags, photo, geo, availableUntil, receiptHash }) => {
  const { secretKey } = getIdentity()
  let phash = null
  if (photo) {
    try {
      phash = await phashFromDataUrl(photo)
    } catch (e) {
      console.error('Failed to compute pHash:', e)
    }
  }
  const event = buildItemEvent({ secretKey, id: id || randomUUID(), description, tags, photo, geo, availableUntil, receiptHash, phash })
  await storeEvent(event)
  await _broadcast(event, geo)
  if (_onEventCallback) _onEventCallback(event)
  return event
}

export const markTaken = async (originalEvent, code) => {
  const { secretKey } = getIdentity()
  const { pubkey } = getIdentity()
  let event
  if (pubkey === originalEvent.pubkey) {
    event = buildTakenEvent({ secretKey, originalEvent })
  } else {
    event = await buildTakerTakenEvent({ secretKey, originalEvent, code })
  }
  await storeEvent(event)
  await _broadcast(event, null, originalEvent)
  if (_onEventCallback) _onEventCallback(event)
  return event
}

// Send a private (NIP-44) DM to one participant of an item thread. recipient is
// the item owner when an interested user writes, or the interested user when the
// owner replies.
export const sendDM = async ({ recipientPubkey, itemEvent, text }) => {
  const { secretKey } = getIdentity()
  const gh = getItemGeohash(itemEvent)
  const event = buildDMEvent({
    secretKey,
    recipientPubkey,
    itemEventId: itemEvent.id,
    itemId: getItemId(itemEvent),
    ownerPubkey: itemEvent.pubkey,
    geohash: gh ? gh.slice(0, 4) : null,
    text,
  })
  await storeEvent(event)

  if (isWebXDC()) {
    webxdcSend(event)
  } else {
    if (_mode !== CONNECTIVITY.PEERS) await relayPublish(event)
    if (_mode !== CONNECTIVITY.RELAYS && gh) peerBroadcast(event, gh.slice(0, 4))
  }
  return event
}

export const deleteItem = async (event) => {
  const { secretKey } = getIdentity()
  const delEvent = buildDeleteEvent({ secretKey, eventId: event.id })
  await storeEvent(delEvent)
  if (!isWebXDC() && _mode !== CONNECTIVITY.PEERS) await relayPublish(delEvent)
  if (_onEventCallback) _onEventCallback(delEvent)
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

export const reportItem = async (targetEvent, reason, content = '') => {
  const { secretKey } = getIdentity()
  const reportEvent = buildReportEvent({ secretKey, targetEvent, reason, content })
  await storeEvent(reportEvent)
  if (isWebXDC()) {
    webxdcSend(reportEvent)
  } else {
    if (_mode !== CONNECTIVITY.PEERS) await relayPublish(reportEvent)
    if (_mode !== CONNECTIVITY.RELAYS) {
      const gh = getItemGeohash(targetEvent)
      if (gh) peerBroadcast(reportEvent, gh.slice(0, 4))
    }
  }
  if (_onEventCallback) _onEventCallback(reportEvent)
  return reportEvent
}
