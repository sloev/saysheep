// Custom P2P layer: k-bucket peer discovery + WebRTC direct connections
// Signaling is routed through the relay WebSocket via ["P2P", "SIGNAL", ...] messages.
// Once a DataChannel is open, Nostr events flow directly peer-to-peer.
// On Android, also uses WiFi Direct for offline LAN mesh (no internet needed).

import { KBucket, randomNodeId } from './kbucket.js'
import { sendP2P } from './relay.js'
import { verifyEvent } from 'nostr-tools'
import { storeEvent } from './storage.js'
import { initWifiDirect, sendWifiMessage, connectWifiPeer, stopWifiDirect, isWifiDirectActive } from './wifidirect.js'
import { getEventPow } from './nostr.js'

const isValidEvent = (event) => {
  if (!event || !verifyEvent(event)) return false
  if (event.kind === 30402 || event.kind === 1) {
    const reqPow = event.kind === 30402 ? 8 : 4
    if (getEventPow(event.id) < reqPow) return false
  }
  return true
}

const STUN = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

// --- State ---
let _nodeId = null
let _kbucket = null
let _peers = new Map()          // nodeId -> PeerConn
let _pendingIce = new Map()     // nodeId -> [ICE candidates queued before remote desc]
let _onEvent = null
let _onPeerCountChange = null
let _activeGeohashes = new Set()
let _tileProvider = null
let _tileCallback = null

class PeerConn {
  constructor(nodeId, initiator) {
    this.nodeId = nodeId
    this.initiator = initiator
    this.pc = new RTCPeerConnection(STUN)
    this.dc = null
    this.state = 'connecting' // connecting | open | closed
    this.geohashes = []
  }
}

// --- Init ---

export const initPeer = ({ nodeId, onEvent, onPeerCountChange }) => {
  _nodeId = nodeId || getOrCreateNodeId()
  _kbucket = new KBucket(_nodeId)
  _onEvent = onEvent
  _onPeerCountChange = onPeerCountChange

  initWifiDirect({
    onMessage: (msg, fromAddress) => {
      if (!Array.isArray(msg)) return
      if (msg[0] === 'EVENT') {
        const event = msg[1]
        if (isValidEvent(event)) {
          storeEvent(event)
          _onEvent?.(event)
        }
      } else if (msg[0] === 'GET_TILE') {
        const prefix = msg[1]
        if (_tileProvider) {
          _tileProvider(prefix).then(places => {
            if (places) {
              sendWifiMessage(['TILE', prefix, places])
            }
          })
        }
      } else if (msg[0] === 'TILE') {
        const [prefix, places] = msg.slice(1)
        _tileCallback?.(prefix, places)
      }
    },
    onPeerChange: (peers) => {
      // Auto-connect to discovered WiFi Direct peers
      for (const peer of peers) {
        if (peer.status === 'available') {
          connectWifiPeer(peer.address)
        }
      }
    },
  })

  return _nodeId
}

export const getNodeId = () => _nodeId

const getOrCreateNodeId = () => {
  let id = localStorage.getItem('saysheep_node_id')
  if (!id) {
    id = randomNodeId()
    localStorage.setItem('saysheep_node_id', id)
  }
  return id
}

// --- Called by relay.js when a P2P message arrives from the relay ---

export const handleP2PMessage = (msg) => {
  if (!Array.isArray(msg)) return
  const [, type, ...args] = msg

  switch (type) {
    case 'HELLO': {
      // Relay responds with its nodeId + list of k closest known peers
      const [relayNodeId, peers] = args
      if (relayNodeId) _kbucket.add({ id: relayNodeId, type: 'relay' })
      for (const p of (peers || []).slice(0, 20)) {
        if (p.nodeId && p.nodeId !== _nodeId) {
          _kbucket.add({ id: p.nodeId })
          _maybeConnect(p.nodeId)
        }
      }
      break
    }

    case 'PEERS': {
      // Response to a FIND query
      const peers = args[1] || []
      for (const p of peers.slice(0, 20)) {
        if (p.nodeId && p.nodeId !== _nodeId) {
          _kbucket.add({ id: p.nodeId })
          _maybeConnect(p.nodeId)
        }
      }
      break
    }

    case 'SIGNAL': {
      // Inbound WebRTC signaling routed from another peer via relay
      const [from, to, payload] = args
      if (to !== _nodeId) return
      _handleSignal(from, payload)
      break
    }

    case '_connected': {
      // Relay WebSocket just connected — announce ourselves
      sendP2P(['P2P', 'HELLO', _nodeId, [..._activeGeohashes]])
      break
    }
  }
}

// --- Area subscription (geohash-based pub/sub) ---

export const announceGeohash = (geohash) => {
  _activeGeohashes.add(geohash)
  sendP2P(['P2P', 'ANNOUNCE', _nodeId, geohash])
  // Find peers serving this geohash
  const reqId = Math.random().toString(36).slice(2)
  sendP2P(['P2P', 'FIND', reqId, geohash])
}

export const leaveGeohash = (geohash) => {
  _activeGeohashes.delete(geohash)
}

// Broadcast a Nostr event to all peers interested in any matching geohash prefix
export const broadcastEvent = (event, geohash) => {
  const prefix = geohash.slice(0, 4)
  let sent = 0
  for (const peer of _peers.values()) {
    if (peer.state !== 'open') continue
    const interested = peer.geohashes.some(g =>
      g.startsWith(prefix) || prefix.startsWith(g.slice(0, 4))
    )
    if (interested || peer.geohashes.length === 0) {
      _dcSend(peer, ['EVENT', event])
      sent++
    }
  }
  // Also send over WiFi Direct mesh when available (offline Android)
  if (isWifiDirectActive()) {
    sendWifiMessage(['EVENT', event])
    sent++
  }
  return sent
}

export const getPeerCount = () =>
  [..._peers.values()].filter(p => p.state === 'open').length

// --- WebRTC connection management ---

const _maybeConnect = (targetNodeId) => {
  if (targetNodeId === _nodeId) return
  if (_peers.has(targetNodeId)) return
  if (_peers.size >= 30) return // cap connections
  _initiateConnection(targetNodeId)
}

const _initiateConnection = async (targetNodeId) => {
  const peer = new PeerConn(targetNodeId, true)
  _peers.set(targetNodeId, peer)

  peer.dc = peer.pc.createDataChannel('saysheep', { ordered: false, maxRetransmits: 2 })
  _wireDataChannel(peer)
  _wireICE(peer)

  try {
    const offer = await peer.pc.createOffer()
    await peer.pc.setLocalDescription(offer)
    sendP2P(['P2P', 'SIGNAL', _nodeId, targetNodeId, { type: 'offer', sdp: offer.sdp }])
  } catch {
    _cleanupPeer(targetNodeId)
  }
}

const _handleSignal = async (fromNodeId, payload) => {
  try {
    if (payload.type === 'offer') {
      // We are the answerer — create peer if not exists
      if (_peers.has(fromNodeId)) return // already connecting, ignore duplicate
      const peer = new PeerConn(fromNodeId, false)
      _peers.set(fromNodeId, peer)

      peer.pc.ondatachannel = ({ channel }) => {
        peer.dc = channel
        _wireDataChannel(peer)
      }
      _wireICE(peer)

      await peer.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
      await _drainPendingIce(peer)

      const answer = await peer.pc.createAnswer()
      await peer.pc.setLocalDescription(answer)
      sendP2P(['P2P', 'SIGNAL', _nodeId, fromNodeId, { type: 'answer', sdp: answer.sdp }])

    } else if (payload.type === 'answer') {
      const peer = _peers.get(fromNodeId)
      if (!peer || peer.pc.signalingState !== 'have-local-offer') return
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
      await _drainPendingIce(peer)

    } else if (payload.type === 'ice') {
      const peer = _peers.get(fromNodeId)
      if (!peer) return
      if (peer.pc.remoteDescription) {
        await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {})
      } else {
        // Queue until remote description is set
        if (!_pendingIce.has(fromNodeId)) _pendingIce.set(fromNodeId, [])
        _pendingIce.get(fromNodeId).push(payload.candidate)
      }
    }
  } catch (e) {
    _cleanupPeer(fromNodeId)
  }
}

const _drainPendingIce = async (peer) => {
  const queued = _pendingIce.get(peer.nodeId) || []
  _pendingIce.delete(peer.nodeId)
  for (const c of queued) {
    await peer.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
  }
}

const _wireICE = (peer) => {
  peer.pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      sendP2P(['P2P', 'SIGNAL', _nodeId, peer.nodeId, {
        type: 'ice',
        candidate: candidate.toJSON(),
      }])
    }
  }
  peer.pc.onconnectionstatechange = () => {
    if (['failed', 'closed', 'disconnected'].includes(peer.pc.connectionState)) {
      _cleanupPeer(peer.nodeId)
    }
  }
}

const _wireDataChannel = (peer) => {
  peer.dc.onopen = () => {
    peer.state = 'open'
    _kbucket.add({ id: peer.nodeId })
    _onPeerCountChange?.(getPeerCount())

    // Introduce ourselves: share nodeId + active geohashes
    _dcSend(peer, ['P2P', 'HELLO', _nodeId, [..._activeGeohashes]])

    // Ask for their k closest peers (expand our routing table)
    _dcSend(peer, ['P2P', 'FIND', Math.random().toString(36).slice(2), _nodeId])
  }

  peer.dc.onclose = () => {
    _cleanupPeer(peer.nodeId)
  }

  peer.dc.onmessage = ({ data }) => {
    try {
      _handlePeerMessage(peer, JSON.parse(data))
    } catch {}
  }

  peer.dc.onerror = () => _cleanupPeer(peer.nodeId)
}

const _handlePeerMessage = (peer, msg) => {
  if (!Array.isArray(msg) || !msg.length) return
  const [type, ...args] = msg

  if (type === 'GET_TILE') {
    const prefix = args[0]
    if (_tileProvider) {
      _tileProvider(prefix).then(places => {
        if (places) {
          _dcSend(peer, ['TILE', prefix, places])
        }
      })
    }
    return
  }

  if (type === 'TILE') {
    const [prefix, places] = args
    _tileCallback?.(prefix, places)
    return
  }

  if (type === 'EVENT') {
    const event = args[0]
    if (isValidEvent(event)) {
      storeEvent(event)
      _onEvent?.(event)
    }
    return
  }

  if (type === 'P2P') {
    const subtype = args[0]

    if (subtype === 'HELLO') {
      // They shared their geohashes
      const [, theirNodeId, theirGeohashes] = args
      peer.geohashes = theirGeohashes || []
      _kbucket.add({ id: peer.nodeId, geohashes: peer.geohashes })

      // Gossip: share our k closest peers back to them
      const closest = _kbucket.closest(peer.nodeId, 8)
        .filter(p => p.id !== peer.nodeId && p.id !== _nodeId)
        .map(p => ({ nodeId: p.id }))
      if (closest.length) {
        _dcSend(peer, ['P2P', 'PEERS', null, closest])
      }
    }

    if (subtype === 'PEERS') {
      // They shared their known peers — try to connect
      const newPeers = args[2] || []
      for (const p of newPeers.slice(0, 10)) {
        if (p.nodeId && p.nodeId !== _nodeId && !_peers.has(p.nodeId)) {
          _kbucket.add({ id: p.nodeId })
          if (_peers.size < 25) _initiateConnection(p.nodeId)
        }
      }
    }

    if (subtype === 'FIND') {
      // They want k peers closest to a target
      const [, reqId, targetId] = args
      const closest = _kbucket.closest(targetId || _nodeId, 10)
        .filter(p => p.id !== peer.nodeId)
        .map(p => ({ nodeId: p.id }))
      _dcSend(peer, ['P2P', 'PEERS', reqId, closest])
    }
  }
}

const _dcSend = (peer, msg) => {
  if (peer.dc?.readyState === 'open') {
    try { peer.dc.send(JSON.stringify(msg)) } catch {}
  }
}

const _cleanupPeer = (nodeId) => {
  const peer = _peers.get(nodeId)
  if (!peer) return
  try { peer.pc.close() } catch {}
  peer.state = 'closed'
  _peers.delete(nodeId)
  _kbucket.remove(nodeId)
  _onPeerCountChange?.(getPeerCount())
}

export const registerTileProvider = (provider) => {
  _tileProvider = provider
}

export const registerTileCallback = (callback) => {
  _tileCallback = callback
}

export const requestTileP2P = (prefix) => {
  let recipients = 0
  for (const peer of _peers.values()) {
    if (peer.state === 'open') {
      _dcSend(peer, ['GET_TILE', prefix])
      recipients++
    }
  }
  if (isWifiDirectActive()) {
    sendWifiMessage(['GET_TILE', prefix])
    recipients++
  }
  return recipients
}
