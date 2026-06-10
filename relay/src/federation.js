import { WebSocket } from 'ws'
import { storeEvent, getMeta, setMeta } from './db.js'
import { createLogger } from './logger.js'
import config from '../relay.config.json' assert { type: 'json' }

const log = createLogger('federation')

export const startFederation = (peers, onNewEvent, p2p) => {
  if (!peers?.length) return
  for (const peerUrl of peers) {
    syncWithPeer(peerUrl, onNewEvent, p2p)
  }
}

const syncWithPeer = (peerUrl, onNewEvent, p2p) => {
  // Don't sync with ourselves
  if (config.public_url && peerUrl === config.public_url) return

  const metaKey = `federation_sync_${peerUrl}`
  const lastSync = parseInt(getMeta(metaKey) || '0')
  const since = lastSync || Math.floor(Date.now() / 1000) - 14 * 86400
  const geohashes = p2p?.getInterestedGeohashes() || []

  log.info(`Syncing with peer ${peerUrl} since ${since} for ${geohashes.length} geohashes`)

  let ws
  try {
    ws = new WebSocket(peerUrl)
  } catch (e) {
    log.error(`Failed to connect to peer ${peerUrl}:`, e.message)
    return
  }

  const subId = `fed-${Math.random().toString(36).slice(2)}`
  let received = 0

  ws.on('open', () => {
    // Announce ourselves as a relay
    ws.send(JSON.stringify(['P2P', 'HELLO', p2p?.nodeId, geohashes, true, config.public_url]))

    const filter = { kinds: [30402, 1, 5], since, limit: 10000 }
    if (geohashes.length) filter['#g'] = geohashes
    ws.send(JSON.stringify(['REQ', subId, filter]))
  })

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg[0] === 'EVENT' && msg[1] === subId) {
        const stored = storeEvent(msg[2])
        if (stored) { received++; onNewEvent?.(msg[2]) }
      } else if (msg[0] === 'EOSE') {
        setMeta(metaKey, String(Math.floor(Date.now() / 1000)))
        log.info(`Synced ${received} new events from ${peerUrl}`)
        ws.close()
      }
    } catch {}
  })

  ws.on('error', (e) => log.error(`Peer sync error ${peerUrl}:`, e.message))
}
