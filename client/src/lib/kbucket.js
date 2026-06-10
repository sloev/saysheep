// Kademlia-inspired k-bucket peer table
// Node IDs are 32-byte values represented as 64-char hex strings

export const hexToBytes = (hex) =>
  new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)))

export const bytesToHex = (bytes) =>
  Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

export const randomNodeId = () =>
  bytesToHex(crypto.getRandomValues(new Uint8Array(32)))

const bufEqual = (a, b) => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

const toBytes = (id) => typeof id === 'string' ? hexToBytes(id) : id

export const xorDistance = (a, b) => {
  const ab = toBytes(a), bb = toBytes(b)
  const r = new Uint8Array(32)
  for (let i = 0; i < 32; i++) r[i] = ab[i] ^ bb[i]
  return r
}

export const compareXor = (a, b) => {
  for (let i = 0; i < 32; i++) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  return 0
}

// Number of common leading bits between two node IDs (= Kademlia bucket index)
// Uses Math.clz32(x) - 24 to find MSB position within a byte
export const prefixLen = (a, b) => {
  const ab = toBytes(a), bb = toBytes(b)
  for (let i = 0; i < 32; i++) {
    const x = ab[i] ^ bb[i]
    if (x === 0) continue
    return i * 8 + (Math.clz32(x) - 24)
  }
  return 256
}

export class KBucket {
  // k = max peers per bucket, 20 is standard Kademlia
  constructor(localId, k = 20) {
    this.localId = typeof localId === 'string' ? localId : bytesToHex(localId)
    this.k = k
    // 257 buckets: bucket[i] holds peers with exactly i common leading bits
    this.buckets = Array.from({ length: 257 }, () => [])
  }

  _idx(peerId) {
    return prefixLen(this.localId, typeof peerId === 'string' ? peerId : bytesToHex(peerId))
  }

  // Add or refresh a peer entry
  // peer must have: { id: hex string, ...metadata }
  add(peer) {
    if (!peer?.id) return
    const id = typeof peer.id === 'string' ? peer.id : bytesToHex(peer.id)
    if (id === this.localId) return // never add self

    const idx = this._idx(id)
    const bucket = this.buckets[idx]
    const existing = bucket.findIndex(p => p.id === id)

    const entry = { ...peer, id, lastSeen: Date.now() }

    if (existing !== -1) {
      // Refresh: move to tail (most recently seen = end)
      bucket.splice(existing, 1)
      bucket.push(entry)
    } else if (bucket.length < this.k) {
      bucket.push(entry)
    } else {
      // Bucket full: evict least recently seen (head)
      bucket.shift()
      bucket.push(entry)
    }
  }

  remove(peerId) {
    const id = typeof peerId === 'string' ? peerId : bytesToHex(peerId)
    const idx = this._idx(id)
    const bucket = this.buckets[idx]
    const i = bucket.findIndex(p => p.id === id)
    if (i !== -1) bucket.splice(i, 1)
  }

  // Return the `count` peers closest to targetId by XOR distance
  closest(targetId, count = 20) {
    const tid = typeof targetId === 'string' ? targetId : bytesToHex(targetId)
    return this.buckets.flat()
      .sort((a, b) => compareXor(xorDistance(a.id, tid), xorDistance(b.id, tid)))
      .slice(0, count)
  }

  has(peerId) {
    const id = typeof peerId === 'string' ? peerId : bytesToHex(peerId)
    return this.buckets[this._idx(id)].some(p => p.id === id)
  }

  size() { return this.buckets.reduce((s, b) => s + b.length, 0) }
  all() { return this.buckets.flat() }
}
