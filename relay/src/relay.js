import { WebSocket, WebSocketServer } from 'ws'
import { createServer } from 'http'
import { verifyEvent } from 'nostr-tools/pure'
import { storeEvent, queryEvents, deleteEvent, deleteExpired } from './db.js'
import { matchesAny } from './filters.js'
import { startFederation } from './federation.js'
import { createLogger } from './logger.js'
import config from '../relay.config.json' assert { type: 'json' }

const log = createLogger('relay')

// clientId -> [{subId, filters}]
const subscriptions = new Map()
// clientId -> { ws, rateCount, rateReset }
const clientMeta = new Map()

export const startRelay = (port) => {
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.headers.accept?.includes('application/nostr+json') || req.url === '/') {
      res.setHeader('Content-Type', 'application/nostr+json')
      res.end(JSON.stringify({
        name: config.name,
        description: config.description,
        supported_nips: config.supported_nips,
        software: 'glean-relay',
        version: '1.0.0',
        limitation: {
          max_message_length: config.max_event_size_bytes,
          max_subscriptions: config.max_subscriptions_per_client,
          min_pow_difficulty: config.min_pow_difficulty,
        }
      }))
      return
    }
    res.end('Glean Relay')
  })

  const wss = new WebSocketServer({ server, maxPayload: config.max_event_size_bytes })
  const clients = new Set()

  wss.on('connection', (ws, req) => {
    const clientId = crypto.randomUUID()
    ws.clientId = clientId
    clients.add(ws)
    subscriptions.set(clientId, [])
    clientMeta.set(clientId, { ws, rateCount: 0, rateReset: Date.now() + 60000 })
    log.info(`Client connected: ${clientId} (${req.socket.remoteAddress})`)

    ws.on('message', (raw) => {
      if (raw.length > config.max_event_size_bytes) {
        ws.send(JSON.stringify(['NOTICE', 'message too large']))
        return
      }
      try {
        const msg = JSON.parse(raw.toString())
        handleMessage(ws, msg, clients)
      } catch {
        ws.send(JSON.stringify(['NOTICE', 'invalid JSON']))
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
      subscriptions.delete(clientId)
      clientMeta.delete(clientId)
      log.info(`Client disconnected: ${clientId}`)
    })

    ws.on('error', () => {
      clients.delete(ws)
      subscriptions.delete(clientId)
      clientMeta.delete(clientId)
    })
  })

  // Cleanup expired events every hour
  setInterval(() => {
    const n = deleteExpired()
    if (n > 0) log.info(`Deleted ${n} expired events`)
  }, 3600 * 1000)

  // Federation sync on startup and every N minutes
  const syncPeers = () => startFederation(config.federation.peers, (ev) => broadcastEvent(ev, null, clients))
  syncPeers()
  setInterval(syncPeers, config.federation.sync_interval_minutes * 60 * 1000)

  server.listen(port, () => log.info(`Relay listening on port ${port}`))
  return server
}

const handleMessage = (ws, msg, clients) => {
  const [type, ...rest] = msg
  if (type === 'EVENT') handleEvent(ws, rest[0], clients)
  else if (type === 'REQ') handleReq(ws, rest[0], rest.slice(1))
  else if (type === 'CLOSE') handleClose(ws, rest[0])
}

const handleEvent = (ws, event, clients) => {
  if (!event || typeof event !== 'object') {
    ws.send(JSON.stringify(['NOTICE', 'invalid event']))
    return
  }

  // Verify
  try {
    if (!verifyEvent(event)) {
      ws.send(JSON.stringify(['OK', event.id, false, 'invalid: bad signature']))
      return
    }
  } catch (e) {
    ws.send(JSON.stringify(['OK', event?.id || '', false, 'error: verification failed']))
    return
  }

  // Kind 5: delete request
  if (event.kind === 5) {
    for (const tag of event.tags) {
      if (tag[0] === 'e') deleteEvent(tag[1], event.pubkey)
    }
    ws.send(JSON.stringify(['OK', event.id, true, '']))
    return
  }

  const stored = storeEvent(event)
  ws.send(JSON.stringify(['OK', event.id, true, stored ? '' : 'duplicate']))

  if (stored) broadcastEvent(event, ws, clients)
}

const broadcastEvent = (event, senderWs, clients) => {
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

  // Replace existing sub with same id
  const idx = subs.findIndex(s => s.subId === subId)
  if (idx !== -1) subs.splice(idx, 1)

  if (subs.length >= config.max_subscriptions_per_client) {
    ws.send(JSON.stringify(['NOTICE', `max ${config.max_subscriptions_per_client} subscriptions`]))
    return
  }

  subs.push({ subId, filters })

  // Send stored events
  for (const filter of filters) {
    const events = queryEvents(filter)
    for (const ev of events) {
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
