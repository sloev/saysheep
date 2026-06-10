import { Iroh } from '@number0/iroh'
import { createLogger } from './logger.js'
import path from 'path'
import fs from 'fs'

const log = createLogger('iroh')
const topicBytes = Buffer.alloc(32)
Buffer.from('glean-nostr-v1').copy(topicBytes)
const GOSSIP_TOPIC = Array.from(topicBytes)

export class GleanIroh {
  constructor() {
    this.node = null
    this.nodeId = null
    this.sender = null
  }

  async start() {
    const dataDir = path.resolve(process.cwd(), 'data/iroh')
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

    try {
      this.node = await Iroh.persistent(dataDir)
      this.nodeId = (await this.node.node.status()).addr.nodeId
      log.info(`Iroh Node started: ${this.nodeId}`)

      this.sender = await this.node.gossip.subscribe(GOSSIP_TOPIC, [], (err, msg) => {
        if (err) {
          log.error(`Gossip error: ${err.message}`)
          return
        }
        this._handleGossipMessage(msg)
      })

      log.info(`Joined Gossip topic: glean-nostr-v1`)
    } catch (e) {
      log.error(`Failed to start Iroh: ${e.message}`)
    }
  }

  _handleGossipMessage(msg) {
    if (msg.neighborUp) {
      log.info(`Gossip neighbor up: ${msg.neighborUp}`)
    }
    if (msg.neighborDown) {
      log.info(`Gossip neighbor down: ${msg.neighborDown}`)
    }
    if (msg.received) {
      try {
        const rawContent = Buffer.from(msg.received.content).toString()
        const parsed = JSON.parse(rawContent)
        if (parsed.type === 'EVENT') {
          this.onEvent?.(parsed.event)
        }
      } catch (e) {
        log.error(`Failed to parse gossip message content: ${e.message}`)
      }
    }
  }

  async broadcastEvent(event) {
    if (!this.sender) return
    try {
      const msg = JSON.stringify({ type: 'EVENT', event })
      const bytes = Array.from(Buffer.from(msg))
      await this.sender.broadcast(bytes)
    } catch (e) {
      log.error(`Iroh broadcast failed: ${e.message}`)
    }
  }

  async stats() {
    if (!this.node) return {}
    return {
      nodeId: this.nodeId,
      topic: 'glean-nostr-v1'
    }
  }
}
