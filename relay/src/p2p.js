// Relay-side P2P handler
// - Maintains a DHT node ID for the relay (stable, persisted in DB)
// - Tracks connected clients: nodeId, geohashes of interest
// - Routes SIGNAL messages between clients (WebRTC signaling)
// - Answers FIND queries using k-bucket routing table
// - Handles ANNOUNCE (client says "I serve geohash X")

import { randomBytes } from 'crypto'
import { KBucket } from './kbucket.js'
import { getMeta, setMeta } from './db.js'
import { createLogger } from './logger.js'

const log = createLogger('p2p')

const getOrCreateRelayNodeId = () => {
  let id = getMeta('relay_node_id')
  if (!id) {
    id = randomBytes(32).toString('hex')
    setMeta('relay_node_id', id)
    log.info('Generated relay node ID:', id.slice(0, 8) + '...')
  }
  return id
}

export class RelayP2P {
  constructor() {
    this.nodeId = getOrCreateRelayNodeId()
    this.kbucket = new KBucket(this.nodeId)
    // clientId -> { ws, nodeId, geohashes }
    this.clients = new Map()
  }

  // Called by relay.js for each ["P2P", subtype, ...] message
  handle(clientId, ws, msg) {
    const [, type, ...args] = msg
    switch (type) {
      case 'HELLO':   this._onHello(clientId, ws, args);   break
      case 'FIND':    this._onFind(clientId, ws, args);    break
      case 'SIGNAL':  this._onSignal(clientId, ws, args);  break
      case 'ANNOUNCE': this._onAnnounce(clientId, ws, args); break
    }
  }

  onClientDisconnect(clientId) {
    const client = this.clients.get(clientId)
    if (client?.nodeId) {
      this.kbucket.remove(client.nodeId)
    }
    this.clients.delete(clientId)
  }

  // ["P2P", "HELLO", nodeId, geohashes, isRelay, url]
  _onHello(clientId, ws, [nodeId, geohashes, isRelay, url]) {
    if (!nodeId) return

    // Register client
    this.clients.set(clientId, { ws, nodeId, geohashes: geohashes || [], isRelay: !!isRelay, url })
    this.kbucket.add({ id: nodeId, clientId, type: isRelay ? 'relay' : 'browser', url })

    log.info(`${isRelay ? 'RELAY' : 'HELLO'} from ${nodeId.slice(0,8)}... (${this.kbucket.size()} peers in table)`)

    // Respond: our nodeId + k closest known peers (excluding the caller)
    const closest = this.kbucket
      .closest(nodeId, 20)
      .filter(p => p.id !== nodeId)
      .slice(0, 10)
      .map(p => ({ nodeId: p.id }))

    ws.send(JSON.stringify(['P2P', 'HELLO', this.nodeId, closest, config.public_url]))
  }

  // ["P2P", "FIND", requestId, targetId]  — find k peers closest to target
  _onFind(clientId, ws, [requestId, targetId]) {
    const client = this.clients.get(clientId)
    if (!client) return

    const tid = targetId || client.nodeId || this.nodeId
    const closest = this.kbucket
      .closest(tid, 20)
      .filter(p => p.id !== client.nodeId)
      .slice(0, 15)
      .map(p => ({ nodeId: p.id }))

    ws.send(JSON.stringify(['P2P', 'PEERS', requestId, closest]))
  }

  // ["P2P", "SIGNAL", from, to, payload]  — route WebRTC signaling
  _onSignal(clientId, ws, [from, to, payload]) {
    if (!from || !to || !payload) return

    // 1. Try local routing
    for (const [cid, client] of this.clients) {
      if (client.nodeId === to) {
        try {
          client.ws.send(JSON.stringify(['P2P', 'SIGNAL', from, to, payload]))
          return
        } catch {}
      }
    }

    // 2. Try cross-relay routing: find closest relays to 'to'
    const closest = this.kbucket.closest(to, 5).filter(p => p.type === 'relay')
    for (const peer of closest) {
      const relayClient = this.clients.get(peer.clientId)
      if (relayClient?.ws?.readyState === 1) { // WebSocket.OPEN
        try {
          relayClient.ws.send(JSON.stringify(['P2P', 'SIGNAL', from, to, payload]))
          return
        } catch {}
      }
    }
  }

  // ["P2P", "ANNOUNCE", nodeId, geohash]
  _onAnnounce(clientId, ws, [nodeId, geohash]) {
    const client = this.clients.get(clientId)
    if (!client || !geohash) return
    if (!client.geohashes.includes(geohash)) {
      client.geohashes.push(geohash)
    }
  }

  // For use by relay.js when deciding which clients to notify of new events
  getClientsForGeohash(geohash) {
    return [...this.clients.values()].filter(c =>
      c.geohashes.some(g => geohash.startsWith(g) || g.startsWith(geohash.slice(0, 4)))
    )
  }

  // Get unique geohash prefixes that our local clients care about
  getInterestedGeohashes() {
    const set = new Set()
    for (const c of this.clients.values()) {
      if (!c.isRelay) for (const g of c.geohashes) set.add(g)
    }
    return [...set]
  }

  stats() {
    return {
      nodeId: this.nodeId.slice(0, 8) + '...',
      peers: this.kbucket.size(),
      clients: this.clients.size,
    }
  }
}

      clients: this.clients.size,
    }
  }
}
