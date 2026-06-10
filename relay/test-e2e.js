import { fork } from 'child_process'
import { WebSocket, WebSocketServer } from 'ws'
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import fs from 'fs'

const cleanDbFiles = () => {
  ['./data/relay-a.db', './data/relay-b.db', './data/relay-a.db-wal', './data/relay-b.db-wal', './data/relay-a.db-shm', './data/relay-b.db-shm'].forEach(file => {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    } catch {}
  });
  ['./data/iroh-a', './data/iroh-b'].forEach(dir => {
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    } catch {}
  })
}

// Clean up before starting
cleanDbFiles()

// 1. Start a mock bootstrap Nostr relay on port 3004
const bootstrapEvents = []
const wss = new WebSocketServer({ port: 3004 })
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg[0] === 'EVENT') {
        bootstrapEvents.push(msg[1])
        ws.send(JSON.stringify(['OK', msg[1].id, true, '']))
      } else if (msg[0] === 'REQ') {
        const [, subId, filter] = msg
        const matching = bootstrapEvents.filter(ev => {
          if (filter.kinds && !filter.kinds.includes(ev.kind)) return false
          if (filter['#t']) {
            const tags = ev.tags.filter(t => t[0] === 't').map(t => t[1])
            if (!filter['#t'].some(val => tags.includes(val))) return false
          }
          return true
        })
        for (const ev of matching) {
          ws.send(JSON.stringify(['EVENT', subId, ev]))
        }
        ws.send(JSON.stringify(['EOSE', subId]))
      }
    } catch {}
  })
})

console.log('Mock bootstrap server running on port 3004')

// Helper to spawn a relay
const spawnRelay = (port, dbPath, publicUrl, bootstrapSeeds, irohDir) => {
  return fork('relay/src/index.js', [], {
    env: {
      ...process.env,
      PORT: port,
      DB_PATH: dbPath,
      PUBLIC_URL: publicUrl,
      BOOTSTRAP_SEEDS: bootstrapSeeds,
      IROH_DATA_DIR: irohDir,
      SYNC_INTERVAL_MINUTES: '1' // sync frequently
    }
  })
}

// 2. Spawn Relay A and Relay B
const relayA = spawnRelay('3002', './data/relay-a.db', 'ws://localhost:3002', 'ws://localhost:3004', 'data/iroh-a')
const relayB = spawnRelay('3003', './data/relay-b.db', 'ws://localhost:3003', 'ws://localhost:3004', 'data/iroh-b')

console.log('Relay A (3002) and Relay B (3003) spawned')

// Wait for relays to initialize
setTimeout(async () => {
  let clientA, clientB
  try {
    // 3. Connect virtual client A to Relay A
    clientA = new WebSocket('ws://localhost:3002')
    // 4. Connect virtual client B to Relay B
    clientB = new WebSocket('ws://localhost:3003')

    const waitForOpen = (ws) => new Promise(res => ws.on('open', res))
    await Promise.all([waitForOpen(clientA), waitForOpen(clientB)])

    console.log('Clients connected to Relay A and Relay B')

    // Generate a secure keypair to sign the test event
    const sk = generateSecretKey()
    const pk = getPublicKey(sk)
    const now = Math.floor(Date.now() / 1000)

    const testItemEvent = finalizeEvent({
      kind: 30402,
      created_at: now,
      tags: [
        ['d', 'test-item-uuid-12345'],
        ['g', 'u1234'],
        ['t', 'free-stuff']
      ],
      content: 'Free bicycle'
    }, sk)

    let testPass = false

    // Setup subscription on Client B
    const subId = 'test-sub'
    clientB.send(JSON.stringify(['REQ', subId, { kinds: [30402] }]))
    clientB.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg[0] === 'EVENT' && msg[1] === subId) {
          const ev = msg[2]
          if (ev.id === testItemEvent.id) {
            console.log('SUCCESS: Client B successfully received event from Relay B via mesh sync!')
            testPass = true
          }
        }
      } catch (e) {
        console.error('Error in Client B msg handler:', e)
      }
    })

    // Wait 2 seconds, then Client A publishes the event to Relay A
    await new Promise(res => setTimeout(res, 2000))
    console.log('Client A publishing event to Relay A...')
    clientA.send(JSON.stringify(['EVENT', testItemEvent]))

    // Wait up to 10 seconds for federation and propagation to Relay B
    let retries = 10
    while (retries > 0 && !testPass) {
      await new Promise(res => setTimeout(res, 1000))
      retries--
    }

    if (testPass) {
      console.log('All E2E tests passed successfully!')
      shutdown(0)
    } else {
      console.error('FAIL: Client B did not receive the event within timeout')
      shutdown(1)
    }

  } catch (err) {
    console.error('Test execution failed:', err)
    shutdown(1)
  }

  function shutdown(code) {
    console.log('Shutting down E2E test environment...')
    if (clientA) clientA.close()
    if (clientB) clientB.close()
    relayA.kill()
    relayB.kill()
    wss.close()
    setTimeout(() => {
      cleanDbFiles()
      process.exit(code)
    }, 1000)
  }
}, 5000)
