import { WebSocket, WebSocketServer } from 'ws'
import { createServer } from 'http'
import { verifyEvent } from 'nostr-tools/pure'
import { storeEvent, queryEvents, deleteEvent, deleteExpired } from './db.js'
import { matchesAny } from './filters.js'
import { startFederation } from './federation.js'
import { RelayP2P } from './p2p.js'
import { saysheepIroh } from './iroh.js'
import { RelayBootstrap } from './bootstrap.js'
import { createLogger } from './logger.js'
import config from './config.js'

const log = createLogger('relay')
let iroh

const subscriptions = new Map()

// --- Simple token-bucket rate limiter (per IP, shared across all clients from same IP) ---
const RATE_WINDOW_MS = 60_000   // 1 minute window
const RATE_LIMIT_EVENTS = 60    // max EVENT messages per window per IP
const _ipCounters = new Map()   // ip -> { count, resetAt }

const _checkRate = (ip) => {
  const now = Date.now()
  let bucket = _ipCounters.get(ip)
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS }
    _ipCounters.set(ip, bucket)
  }
  bucket.count++
  return bucket.count <= RATE_LIMIT_EVENTS
}

setInterval(() => {
  const now = Date.now()
  for (const [ip, b] of _ipCounters) if (now > b.resetAt) _ipCounters.delete(ip)
}, RATE_WINDOW_MS)

export const startRelay = (port) => {
  const p2p = new RelayP2P()
  iroh = new saysheepIroh()
  iroh.start().then(() => {
    const bootstrap = new RelayBootstrap(p2p, iroh)
    bootstrap.start()
  })

  iroh.onEvent = (event) => {
    const stored = storeEvent(event)
    if (stored) {
      log.info(`[iroh-gossip] Received new event ${event.id.slice(0, 8)}`)
      broadcastNostr(event, null, clients)
    }
  }

  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.url === '/stats') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ relay: p2p.stats(), uptime: process.uptime() }))
      return
    }
    if (req.headers.accept?.includes('application/nostr+json') || req.url === '/') {
      res.setHeader('Content-Type', 'application/nostr+json')
      res.end(JSON.stringify({
        name: config.name,
        description: config.description,
        supported_nips: config.supported_nips,
        software: 'saysheep-relay',
        version: '1.0.0',
        limitation: {
          max_message_length: config.max_event_size_bytes,
          max_subscriptions: config.max_subscriptions_per_client,
          min_pow_difficulty: config.min_pow_difficulty,
        },
      }))
      return
    }
    res.end('saysheep Relay — connect via WebSocket')
  })

  const wss = new WebSocketServer({ server, maxPayload: config.max_event_size_bytes })
  const clients = new Set()

  wss.on('connection', (ws, req) => {
    const clientId = crypto.randomUUID()
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
    ws.clientId = clientId
    ws.clientIp = clientIp
    clients.add(ws)
    subscriptions.set(clientId, [])
    log.info(`+ ${clientId.slice(0,8)} (${clientIp})`)

    ws.on('message', (raw) => {
      if (raw.length > config.max_event_size_bytes) {
        ws.send(JSON.stringify(['NOTICE', 'message too large']))
        return
      }
      let msg
      try { msg = JSON.parse(raw.toString()) } catch {
        ws.send(JSON.stringify(['NOTICE', 'invalid JSON']))
        return
      }
      if (!Array.isArray(msg) || !msg.length) return

      // P2P control messages — dispatch to DHT layer
      if (msg[0] === 'P2P') {
        p2p.handle(clientId, ws, msg)
        return
      }

      handleNostr(ws, msg, clients, ws.clientIp)
    })

    ws.on('close', () => {
      clients.delete(ws)
      subscriptions.delete(clientId)
      p2p.onClientDisconnect(clientId)
      log.info(`- ${clientId.slice(0,8)}`)
    })

    ws.on('error', () => {
      clients.delete(ws)
      subscriptions.delete(clientId)
      p2p.onClientDisconnect(clientId)
    })
  })

  setInterval(() => {
    const n = deleteExpired()
    if (n > 0) log.info(`Purged ${n} expired events`)
  }, 3600 * 1000)

  const syncPeers = () => {
    const dynamicPeers = p2p.kbucket.all()
      .filter(p => p.type === 'relay' && p.url) // We need a URL to connect
      .map(p => p.url)
    const allPeers = [...new Set([...config.federation.peers, ...config.federation.seeds || [], ...dynamicPeers])]
    startFederation(allPeers, (ev) => {
      broadcastNostr(ev, null, clients)
      iroh?.broadcastEvent(ev)
    }, p2p)
  }
  syncPeers()
  setInterval(syncPeers, config.federation.sync_interval_minutes * 60 * 1000)

  server.listen(port, () => log.info(`Relay on :${port} | node ${p2p.nodeId.slice(0,8)}...`))
  return server
}

const handleNostr = (ws, msg, clients, ip) => {
  const [type, ...rest] = msg
  if (type === 'EVENT') handleEvent(ws, rest[0], clients, ip)
  else if (type === 'REQ') handleReq(ws, rest[0], rest.slice(1))
  else if (type === 'CLOSE') handleClose(ws, rest[0])
}

const handleEvent = (ws, event, clients, ip) => {
  if (!_checkRate(ip)) {
    ws.send(JSON.stringify(['NOTICE', 'rate-limited: slow down']))
    return
  }
  if (!event || typeof event !== 'object') {
    ws.send(JSON.stringify(['NOTICE', 'invalid event']))
    return
  }
  try {
    if (!verifyEvent(event)) {
      ws.send(JSON.stringify(['OK', event.id, false, 'invalid: bad signature']))
      return
    }
  } catch {
    ws.send(JSON.stringify(['OK', event?.id || '', false, 'error: verification failed']))
    return
  }
  if (event.kind === 5) {
    for (const tag of event.tags) if (tag[0] === 'e') deleteEvent(tag[1], event.pubkey)
    ws.send(JSON.stringify(['OK', event.id, true, '']))
    return
  }
  const stored = storeEvent(event)
  ws.send(JSON.stringify(['OK', event.id, true, stored ? '' : 'duplicate']))
  if (stored) {
    broadcastNostr(event, ws, clients)
    iroh?.broadcastEvent(event)
  }
}

const broadcastNostr = (event, senderWs, clients) => {
  for (const client of clients) {
    if (client === senderWs || client.readyState !== WebSocket.OPEN) continue
    const subs = subscriptions.get(client.clientId) || []
    for (const sub of subs) {
      if (matchesAny(event, sub.filters)) {
        client.send(JSON.stringify(['EVENT', sub.subId, event]))
        break
      }
    }
  }
}

const handleReq = (ws, subId, filters) => {
  if (!subId || !filters.length) return
  const subs = subscriptions.get(ws.clientId)
  if (!subs) return
  const idx = subs.findIndex(s => s.subId === subId)
  if (idx !== -1) subs.splice(idx, 1)
  if (subs.length >= config.max_subscriptions_per_client) {
    ws.send(JSON.stringify(['NOTICE', `max ${config.max_subscriptions_per_client} subs`]))
    return
  }
  subs.push({ subId, filters })
  for (const filter of filters) {
    for (const ev of queryEvents(filter)) {
      ws.send(JSON.stringify(['EVENT', subId, ev]))
    }
  }
  ws.send(JSON.stringify(['EOSE', subId]))
}

const handleClose = (ws, subId) => {
  const subs = subscriptions.get(ws.clientId)
  if (!subs) return
  const idx = subs.findIndex(s => s.subId === subId)
  if (idx !== -1) subs.splice(idx, 1)
}
