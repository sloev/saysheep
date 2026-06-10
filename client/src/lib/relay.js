// Custom relay client — multiplexes Nostr NIP-01 + P2P protocol
// on the same WebSocket connection.

// VITE_RELAY_URL can be set at build time to inject the self-hosted relay as the
// first default. Falls back to public Nostr relays that support NIP-01 for item
// discovery; P2P signaling will be silently ignored by those relays.
const _envRelay = import.meta.env?.VITE_RELAY_URL
const DEFAULT_RELAYS = _envRelay
  ? [_envRelay, 'wss://relay.damus.io']
  : ['wss://relay.damus.io', 'wss://nos.lol']

// --- Single relay connection ---
class GleanRelay {
  constructor(url, onP2PMessage) {
    this.url = url
    this.ws = null
    this.subs = new Map()      // subId -> {filters, onEvent, onEose}
    this.pendingOks = new Map() // eventId -> {resolve, reject, timer}
    this.onP2PMessage = onP2PMessage
    this.connected = false
    this._reconnectDelay = 1000
    this._dead = false
    this._connect()
  }

  _connect() {
    if (this._dead) return
    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this._scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.connected = true
      this._reconnectDelay = 1000
      // Re-send active subscriptions
      for (const [subId, sub] of this.subs) {
        this.ws.send(JSON.stringify(['REQ', subId, ...sub.filters]))
      }
      this.onP2PMessage?.({ type: '_connected', relay: this })
    }

    this.ws.onmessage = ({ data }) => {
      let msg
      try { msg = JSON.parse(data) } catch { return }
      if (!Array.isArray(msg)) return

      if (msg[0] === 'P2P') {
        this.onP2PMessage?.(msg)
        return
      }

      const [type, a, b] = msg
      if (type === 'EVENT') {
        this.subs.get(a)?.onEvent(b)
      } else if (type === 'EOSE') {
        this.subs.get(a)?.onEose?.()
      } else if (type === 'OK') {
        const [, id, ok, reason] = msg
        const p = this.pendingOks.get(id)
        if (p) {
          clearTimeout(p.timer)
          ok ? p.resolve() : p.reject(reason || 'rejected')
          this.pendingOks.delete(id)
        }
      }
    }

    this.ws.onclose = () => {
      this.connected = false
      this.onP2PMessage?.({ type: '_disconnected', relay: this })
      this._scheduleReconnect()
    }
    this.ws.onerror = () => {}
  }

  _scheduleReconnect() {
    if (this._dead) return
    setTimeout(() => this._connect(), this._reconnectDelay)
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000)
  }

  subscribe(subId, filters, onEvent, onEose) {
    this.subs.set(subId, { filters, onEvent, onEose })
    if (this.connected) this.ws.send(JSON.stringify(['REQ', subId, ...filters]))
    return () => this.unsubscribe(subId)
  }

  unsubscribe(subId) {
    if (this.subs.has(subId)) {
      this.subs.delete(subId)
      if (this.connected) this.ws.send(JSON.stringify(['CLOSE', subId]))
    }
  }

  publish(event) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingOks.delete(event.id)
        resolve() // timeout = optimistically ok
      }, 5000)
      this.pendingOks.set(event.id, { resolve, reject, timer })
      if (this.connected) {
        this.ws.send(JSON.stringify(['EVENT', event]))
      } else {
        reject('not connected')
      }
    })
  }

  // Send a raw P2P control message
  sendP2P(msg) {
    if (this.connected) this.ws.send(JSON.stringify(msg))
  }

  close() {
    this._dead = true
    this.ws?.close()
  }
}

// --- Multi-relay pool ---
let _relays = []
let _connections = new Map() // url -> GleanRelay
let _p2pHandler = null
let _onCountChange = null

const _emitCount = () => _onCountChange?.(getRelayCount())

export const initRelay = (relayUrls, onP2PMessage, onCountChange) => {
  _p2pHandler = onP2PMessage
  _onCountChange = onCountChange
  _relays = relayUrls?.length ? relayUrls : getStoredRelays()
  for (const url of _relays) {
    if (!_connections.has(url)) {
      _connections.set(url, new GleanRelay(url, _routeP2P))
    }
  }
}

const _routeP2P = (msg) => {
  if (msg?.type === '_connected' || msg?.type === '_disconnected') _emitCount()
  _p2pHandler?.(msg)
}

export const getRelays = () => _relays

export const addRelay = (url) => {
  if (_relays.includes(url)) return
  _relays.push(url)
  saveRelays(_relays)
  _connections.set(url, new GleanRelay(url, _routeP2P))
}

export const removeRelay = (url) => {
  _relays = _relays.filter(r => r !== url)
  saveRelays(_relays)
  _connections.get(url)?.close()
  _connections.delete(url)
}

export const getRelayCount = () =>
  [..._connections.values()].filter(r => r.connected).length

const getStoredRelays = () => {
  try {
    const s = localStorage.getItem('glean_relays')
    const p = s ? JSON.parse(s) : null
    return p?.length ? p : [...DEFAULT_RELAYS]
  } catch { return [...DEFAULT_RELAYS] }
}

const saveRelays = (relays) =>
  localStorage.setItem('glean_relays', JSON.stringify(relays))

export const publishEvent = async (event) => {
  const results = await Promise.allSettled(
    [..._connections.values()].map(r => r.publish(event))
  )
  return results
}

export const subscribeArea = (geohashPrefixes, onEvent, onEose) => {
  const subId = 'area-' + Math.random().toString(36).slice(2)
  const since = Math.floor(Date.now() / 1000) - 14 * 86400
  const filters = [{ kinds: [30402], '#g': geohashPrefixes, since, limit: 200 }]
  const unsubs = []
  for (const conn of _connections.values()) {
    unsubs.push(conn.subscribe(subId, filters, onEvent, onEose))
  }
  return () => unsubs.forEach(fn => fn())
}

export const subscribeChat = (itemEventId, onEvent) => {
  const subId = 'chat-' + Math.random().toString(36).slice(2)
  const filters = [{ kinds: [1], '#e': [itemEventId], limit: 100 }]
  const unsubs = []
  for (const conn of _connections.values()) {
    unsubs.push(conn.subscribe(subId, filters, onEvent, null))
  }
  return () => unsubs.forEach(fn => fn())
}

// Send a P2P control message to the first available relay
// (relay routes it via its DHT to the target)
export const sendP2P = (msg) => {
  for (const conn of _connections.values()) {
    if (conn.connected) { conn.sendP2P(msg); return }
  }
}
