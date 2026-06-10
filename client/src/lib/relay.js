import { SimplePool } from 'nostr-tools'
import { storeEvent } from './storage.js'

// Default public relays + local relay
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
]

let _pool = null
let _relays = []
let _activeSubscriptions = new Map() // subKey -> sub

export const initRelay = (relayUrls) => {
  _relays = relayUrls?.length ? relayUrls : getStoredRelays()
  _pool = new SimplePool()
  return _pool
}

export const getPool = () => _pool
export const getRelays = () => _relays

export const addRelay = (url) => {
  if (!_relays.includes(url)) {
    _relays.push(url)
    saveRelays(_relays)
  }
}

export const removeRelay = (url) => {
  _relays = _relays.filter(r => r !== url)
  saveRelays(_relays)
}

const getStoredRelays = () => {
  try {
    const s = localStorage.getItem('glean_relays')
    const parsed = s ? JSON.parse(s) : null
    return parsed?.length ? parsed : DEFAULT_RELAYS
  } catch {
    return DEFAULT_RELAYS
  }
}

const saveRelays = (relays) => {
  localStorage.setItem('glean_relays', JSON.stringify(relays))
}

export const publishEvent = async (event) => {
  if (!_pool || !_relays.length) return
  await Promise.allSettled(_pool.publish(_relays, event))
}

// Subscribe to items in a geohash area
export const subscribeArea = (geohashPrefixes, onEvent, onEose) => {
  if (!_pool) return () => {}
  const since = Math.floor(Date.now() / 1000) - 14 * 86400
  const sub = _pool.subscribeMany(
    _relays,
    [{ kinds: [30402], '#g': geohashPrefixes, since, limit: 200 }],
    {
      onevent: (event) => {
        storeEvent(event)
        onEvent(event)
      },
      oneose: onEose,
    }
  )
  return () => sub.close()
}

// Subscribe to chat messages for an item
export const subscribeChat = (itemEventId, onEvent) => {
  if (!_pool) return () => {}
  const sub = _pool.subscribeMany(
    _relays,
    [{ kinds: [1], '#e': [itemEventId], limit: 100 }],
    {
      onevent: (event) => {
        storeEvent(event)
        onEvent(event)
      },
    }
  )
  return () => sub.close()
}
