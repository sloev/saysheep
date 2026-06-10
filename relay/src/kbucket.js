// Server-side k-bucket (same algorithm as client)
import { randomBytes } from 'crypto'

const hexToBytes = (hex) =>
  Buffer.from(hex, 'hex')

const bytesToHex = (buf) =>
  (Buffer.isBuffer(buf) ? buf : Buffer.from(buf)).toString('hex')

const toBuffer = (id) => typeof id === 'string' ? Buffer.from(id, 'hex') : Buffer.from(id)

const xorDistance = (a, b) => {
  const ab = toBuffer(a), bb = toBuffer(b)
  const r = Buffer.alloc(32)
  for (let i = 0; i < 32; i++) r[i] = ab[i] ^ bb[i]
  return r
}

const compareXor = (a, b) => {
  for (let i = 0; i < 32; i++) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  return 0
}

// Math.clz32 not available in Node < 18 reliably, use manual clz
const clz8 = (x) => {
  if (x === 0) return 8
  let n = 0
  if ((x & 0xF0) === 0) { n += 4; x <<= 4 }
  if ((x & 0xC0) === 0) { n += 2; x <<= 2 }
  if ((x & 0x80) === 0) { n += 1 }
  return n
}

const prefixLen = (a, b) => {
  const ab = toBuffer(a), bb = toBuffer(b)
  for (let i = 0; i < 32; i++) {
    const x = ab[i] ^ bb[i]
    if (x === 0) continue
    return i * 8 + clz8(x)
  }
  return 256
}

export class KBucket {
  constructor(localId, k = 20) {
    this.localId = typeof localId === 'string' ? localId : bytesToHex(localId)
    this.k = k
    this.buckets = Array.from({ length: 257 }, () => [])
  }

  _idx(peerId) {
    return prefixLen(this.localId, typeof peerId === 'string' ? peerId : bytesToHex(peerId))
  }

  add(peer) {
    if (!peer?.id) return
    const id = typeof peer.id === 'string' ? peer.id : bytesToHex(peer.id)
    if (id === this.localId) return
    const idx = this._idx(id)
    const bucket = this.buckets[idx]
    const i = bucket.findIndex(p => p.id === id)
    const entry = { ...peer, id, lastSeen: Date.now() }
    if (i !== -1) { bucket.splice(i, 1); bucket.push(entry) }
    else if (bucket.length < this.k) bucket.push(entry)
    else { bucket.shift(); bucket.push(entry) }
  }

  remove(peerId) {
    const id = typeof peerId === 'string' ? peerId : bytesToHex(peerId)
    const idx = this._idx(id)
    const b = this.buckets[idx]
    const i = b.findIndex(p => p.id === id)
    if (i !== -1) b.splice(i, 1)
  }

  closest(targetId, count = 20) {
    const tid = typeof targetId === 'string' ? targetId : bytesToHex(targetId)
    return this.buckets.flat()
      .sort((a, b) => compareXor(xorDistance(a.id, tid), xorDistance(b.id, tid)))
      .slice(0, count)
  }

  size() { return this.buckets.reduce((s, b) => s + b.length, 0) }
  all() { return this.buckets.flat() }
}

export const randomNodeId = () => randomBytes(32).toString('hex')
export { bytesToHex, hexToBytes }
