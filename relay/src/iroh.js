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
    const dataDir = path.resolve(process.cwd(), process.env.IROH_DATA_DIR || 'data/iroh')
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

    try {
      this.node = await Iroh.persistent(dataDir)
      this.nodeId = (await this.node.node.status()).addr.nodeId
      log.info(`Iroh Node started: ${this.nodeId}`)

      this.bootstrapPeers = new Set()
      await this.resubscribe()
    } catch (e) {
      log.error(`Failed to start Iroh: ${e.message}`)
    }
  }

  async resubscribe() {
    if (!this.node) return
    try {
      if (this.sender) {
        try {
          await this.sender.close()
        } catch {}
      }

      const bootstrapList = Array.from(this.bootstrapPeers)
      this.sender = await this.node.gossip.subscribe(GOSSIP_TOPIC, bootstrapList, (err, msg) => {
        if (err) {
          log.error(`Gossip error: ${err.message}`)
          return
        }
        this._handleGossipMessage(msg)
      })

      log.info(`Joined Gossip topic: glean-nostr-v1 | bootstrap peers: ${bootstrapList.length}`)
    } catch (e) {
      log.error(`Failed to resubscribe to Gossip: ${e.message}`)
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

  async getNodeAddr() {
    if (!this.node) return null
    try {
      return await this.node.net.nodeAddr()
    } catch {
      return null
    }
  }

  async addNodeAddr(addr) {
    if (!this.node) return
    try {
      await this.node.net.addNodeAddr(addr)
      log.info(`Added Iroh node address: ${addr.nodeId.slice(0, 8)}`)

      if (!this.bootstrapPeers.has(addr.nodeId)) {
        this.bootstrapPeers.add(addr.nodeId)
        log.info(`Re-subscribing to Gossip topic with new peer: ${addr.nodeId.slice(0, 8)}`)
        await this.resubscribe()
      }
    } catch (e) {
      log.error(`Failed to add Iroh node address: ${e.message}`)
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
