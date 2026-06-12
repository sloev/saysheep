export class LFUCache {
  constructor(capacity) {
    this.capacity = capacity
    this.cache = new Map() // key -> { value, freq }
    this.freqMap = new Map() // freq -> Set(keys)
    this.minFreq = 0
  }

  get(key) {
    if (!this.cache.has(key)) return null
    const node = this.cache.get(key)
    this._updateFreq(key, node)
    return node.value
  }

  put(key, value) {
    if (this.capacity <= 0) return
    if (this.cache.has(key)) {
      const node = this.cache.get(key)
      node.value = value
      this._updateFreq(key, node)
      return
    }
    if (this.cache.size >= this.capacity) {
      const evictSet = this.freqMap.get(this.minFreq)
      const evictKey = evictSet.values().next().value
      evictSet.delete(evictKey)
      if (evictSet.size === 0) {
        this.freqMap.delete(this.minFreq)
      }
      this.cache.delete(evictKey)
    }
    const newNode = { value, freq: 1 }
    this.cache.set(key, newNode)
    if (!this.freqMap.has(1)) {
      this.freqMap.set(1, new Set())
    }
    this.freqMap.get(1).add(key)
    this.minFreq = 1
  }

  _updateFreq(key, node) {
    const oldFreq = node.freq
    node.freq++
    const oldSet = this.freqMap.get(oldFreq)
    oldSet.delete(key)
    if (oldSet.size === 0) {
      this.freqMap.delete(oldFreq)
      if (this.minFreq === oldFreq) {
        this.minFreq++
      }
    }
    if (!this.freqMap.has(node.freq)) {
      this.freqMap.set(node.freq, new Set())
    }
    this.freqMap.get(node.freq).add(key)
  }
}
