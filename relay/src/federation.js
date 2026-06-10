import { WebSocket } from 'ws'
import { storeEvent, getMeta, setMeta } from './db.js'
import { createLogger } from './logger.js'

const log = createLogger('federation')

export const startFederation = (peers, onNewEvent) => {
  if (!peers?.length) return
  for (const peerUrl of peers) {
    syncWithPeer(peerUrl, onNewEvent)
  }
}

const syncWithPeer = (peerUrl, onNewEvent) => {
  const metaKey = `federation_sync_${peerUrl}`
  const lastSync = parseInt(getMeta(metaKey) || '0')
  const since = lastSync || Math.floor(Date.now() / 1000) - 14 * 86400

  log.info(`Syncing with peer ${peerUrl} since ${since}`)

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
    ws.send(JSON.stringify(['REQ', subId, { kinds: [30402, 1, 5], since, limit: 10000 }]))
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
