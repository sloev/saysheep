import { WebSocket } from 'ws'
import { getPublicKey, finalizeEvent } from 'nostr-tools/pure'
import { createLogger } from './logger.js'
import config from '../relay.config.json' with { type: 'json' }

const log = createLogger('bootstrap')

export class RelayBootstrap {
  constructor(p2p) {
    this.p2p = p2p
    this.secretKey = Buffer.from(p2p.nodeId, 'hex')
    this.publicKey = getPublicKey(this.secretKey)
    this.seeds = config.federation.seeds || []
  }

  start() {
    if (!this.seeds.length) {
      log.info('No bootstrap seeds configured')
      return
    }
    
    // Periodically announce presence and query other relays
    this.announceAndQuery()
    setInterval(() => this.announceAndQuery(), 10 * 60 * 1000)
  }

  announceAndQuery() {
    const url = config.public_url
    if (!url) {
      log.info('No public_url configured, skipping presence announcement')
    }

    const now = Math.floor(Date.now() / 1000)
    
    // Construct NIP-99 kind:30402 presence event
    // The "d" tag makes it replaceable so we don't spam the relay.
    const tags = [
      ['d', `glean-relay:${this.p2p.nodeId}`],
      ['t', 'glean-relay'],
      ['g', '00000'],
      ['expiry', String(now + 2 * 86400)]
    ]
    if (url) {
      tags.push(['url', url])
    }

    const presenceEvent = finalizeEvent({
      kind: 30402,
      created_at: now,
      tags,
      content: JSON.stringify({
        nodeId: this.p2p.nodeId,
        url
      })
    }, this.secretKey)

    for (const seed of this.seeds) {
      this.publishAndFetch(seed, presenceEvent)
    }
  }

  publishAndFetch(seedUrl, presenceEvent) {
    let ws
    try {
      ws = new WebSocket(seedUrl)
    } catch (e) {
      log.error(`Failed to connect to seed ${seedUrl}:`, e.message)
      return
    }

    const subId = `boot-${Math.random().toString(36).slice(2)}`

    ws.on('open', () => {
      // 1. Publish presence if public_url is configured
      if (config.public_url) {
        ws.send(JSON.stringify(['EVENT', presenceEvent]))
      }

      // 2. Query for other Glean relays' presence
      // Fetch active relays (since 2 days ago)
      const since = Math.floor(Date.now() / 1000) - 2 * 86400
      ws.send(JSON.stringify(['REQ', subId, {
        kinds: [30402],
        '#t': ['glean-relay'],
        since
      }]))
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg[0] === 'EVENT' && msg[1] === subId) {
          const ev = msg[2]
          const dTag = ev.tags.find(t => t[0] === 'd')
          if (dTag && dTag[1].startsWith('glean-relay:')) {
            const peerNodeId = dTag[1].replace('glean-relay:', '')
            if (peerNodeId === this.p2p.nodeId) return // Skip ourselves

            const urlTag = ev.tags.find(t => t[0] === 'url')
            const peerUrl = urlTag ? urlTag[1] : null

            if (peerUrl && peerUrl !== config.public_url) {
              log.info(`Discovered peer relay: ${peerUrl} (node ${peerNodeId.slice(0, 8)})`)
              this.p2p.kbucket.add({
                id: peerNodeId,
                clientId: null,
                type: 'relay',
                url: peerUrl
              })
            }
          }
        } else if (msg[0] === 'EOSE' && msg[1] === subId) {
          ws.close()
        }
      } catch {}
    })

    ws.on('error', (e) => {
      // Quiet error logging for public relays
    })
  }
}
