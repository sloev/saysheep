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
import { screenEvent, getReportStats } from './moderation.js'

const log = createLogger('relay')
let iroh

const subscriptions = new Map()

const getEventPow = (id) => {
  let count = 0
  for (let i = 0; i < id.length; i++) {
    const val = parseInt(id[i], 16)
    if (val === 0) {
      count += 4
    } else {
      if (val & 8) {}
      else if (val & 4) { count += 1 }
      else if (val & 2) { count += 2 }
      else if (val & 1) { count += 3 }
      break
    }
  }
  return count
}

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

  iroh.onEvent = async (event) => {
    const screenResult = await screenEvent(event)
    if (!screenResult.ok) return
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
      const reports = getReportStats()
      res.end(JSON.stringify({ relay: p2p.stats(), uptime: process.uptime(), reports }))
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
    // ── Per-item social/link preview ──
    // Shared item links can point here (/i/<d-tag>) so chat/social crawlers get
    // real Open Graph meta — including the photo served as an HTTP image, since
    // crawlers can't read the data: URL stored in the event — while real
    // browsers are bounced on to the PWA item page.
    const imgMatch = req.url?.match(/^\/i\/([^/?]+)\/image/)
    if (imgMatch) {
      const dtag = decodeURIComponent(imgMatch[1])
      let item = null
      try { item = queryEvents({ kinds: [30402], '#d': [dtag], limit: 1 })[0] } catch {}
      const data = item?.tags?.find(t => t[0] === 'image')?.[1] || ''
      const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(data)
      if (m) {
        const buf = Buffer.from(m[2], 'base64')
        res.setHeader('Content-Type', m[1])
        res.setHeader('Cache-Control', 'public, max-age=300')
        res.end(buf)
      } else {
        res.statusCode = 404
        res.end('no image')
      }
      return
    }
    if (req.url?.startsWith('/i/')) {
      const dtag = decodeURIComponent(req.url.slice(3).split(/[?/]/)[0])
      let item = null
      try { item = queryEvents({ kinds: [30402], '#d': [dtag], limit: 1 })[0] } catch {}
      const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
      const tagVal = (name) => item?.tags?.find(t => t[0] === name)?.[1] || ''
      const pwa = (config.pwa_url || '').replace(/\/$/, '')
      const itemUrl = `${pwa}/item/${encodeURIComponent(dtag)}`
      const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0]
      const host = req.headers.host
      const hasImage = !!tagVal('image')
      const imgUrl = hasImage && host ? `${proto}://${host}/i/${encodeURIComponent(dtag)}/image` : ''
      const title = item ? (tagVal('title') || 'free on saysheep') : 'saysheep'
      const desc = item ? (tagVal('summary') || item.content || 'free to a good home') : 'give away and find free stuff nearby'
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${imgUrl ? `<meta property="og:image" content="${esc(imgUrl)}">` : ''}
<meta property="og:url" content="${esc(itemUrl)}">
<meta name="twitter:card" content="${imgUrl ? 'summary_large_image' : 'summary'}">
<meta http-equiv="refresh" content="0; url=${esc(itemUrl)}">
</head><body>Redirecting to <a href="${esc(itemUrl)}">${esc(title)}</a>…</body></html>`)
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
        try {
          p2p.handle(clientId, ws, msg)
        } catch (err) {
          log.error('P2P error handling message:', err)
          ws.send(JSON.stringify(['NOTICE', 'P2P processing error']))
        }
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

  try {
    const n = deleteExpired()
    if (n > 0) log.info(`Startup purge: removed ${n} expired events`)
  } catch (err) {
    log.error('Startup purge failed:', err)
  }

  setInterval(() => {
    const n = deleteExpired()
    if (n > 0) log.info(`Purged ${n} expired events`)
  }, 60 * 1000)

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

const handleEvent = async (ws, event, clients, ip) => {
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

  // Spam prevention: PoW (Proof of Work) verification
  const minPowItem = config.min_pow_difficulty_item !== undefined ? config.min_pow_difficulty_item : 8
  const minPowChat = config.min_pow_difficulty_chat !== undefined ? config.min_pow_difficulty_chat : 4
  const minPowGeneral = config.min_pow_difficulty || 0

  let requiredPow = minPowGeneral
  if (event.kind === 30402) requiredPow = Math.max(requiredPow, minPowItem)
  if (event.kind === 1) requiredPow = Math.max(requiredPow, minPowChat)

  if (requiredPow > 0) {
    const pow = getEventPow(event.id)
    if (pow < requiredPow) {
      ws.send(JSON.stringify(['OK', event.id, false, `pow: difficulty ${pow} < target ${requiredPow}`]))
      return
    }
  }
  if (event.kind === 5) {
    for (const tag of event.tags) if (tag[0] === 'e') deleteEvent(tag[1], event.pubkey)
    ws.send(JSON.stringify(['OK', event.id, true, '']))
    return
  }

  // Screen event
  const screenResult = await screenEvent(event)
  if (!screenResult.ok) {
    ws.send(JSON.stringify(['OK', event.id, false, screenResult.reason || 'blocked']))
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
