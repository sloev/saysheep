// Pure-JS reader for the offline gazetteer blob built by scripts/build-gazetteer.js.
// Loads a single immutable, content-addressed gzipped blob, binary-searches the
// front-coded name table by prefix, and returns candidate cities ordered by
// proximity (geohash5 longest-common-prefix to the user). No WASM.

const FOLD = { 'ø':'o','æ':'ae','å':'a','ß':'ss','ł':'l','đ':'d','ð':'d','þ':'th','œ':'oe','ı':'i','ħ':'h','ŋ':'n','ĸ':'k','ª':'a','º':'o' }
export const fold = (s) => s.toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[øæåßłđðþœıħŋĸªº]/g, c => FOLD[c] || c)
  .replace(/[^a-z0-9]+/g, ' ').trim()

const td = new TextDecoder()

// ---- parse the gunzipped blob into a reusable state object ----
export const parseBlob = (u8) => {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let p = 0
  const magic = td.decode(u8.subarray(0, 4)); p = 4
  if (magic !== 'SGZ1') throw new Error('bad gazetteer magic: ' + magic)
  const N = dv.getUint32(p, true); p += 4
  const M = dv.getUint32(p, true); p += 4
  const numBlocks = dv.getUint32(p, true); p += 4
  const K = dv.getUint16(p, true); p += 2
  const numCountries = dv.getUint16(p, true); p += 2
  const numAdmin1 = dv.getUint16(p, true); p += 2

  const gh5Off = p; p += N * 5
  const countryOff = p; p += N * 2
  const admin1Off = p; p += N * 2

  // varint helper bound to a local cursor
  const readVarint = () => {
    let shift = 0, result = 0, b
    do { b = u8[p++]; result |= (b & 0x7f) << shift; shift += 7 } while (b & 0x80)
    return result >>> 0
  }

  // display names (sequential)
  const cityNames = new Array(N)
  for (let i = 0; i < N; i++) { const len = readVarint(); cityNames[i] = td.decode(u8.subarray(p, p + len)); p += len }
  // country table (2 bytes each)
  const countries = new Array(numCountries)
  for (let i = 0; i < numCountries; i++) { countries[i] = td.decode(u8.subarray(p, p + 2)).trim(); p += 2 }
  // admin1 table
  const admin1 = new Array(numAdmin1)
  for (let i = 0; i < numAdmin1; i++) { const len = readVarint(); admin1[i] = td.decode(u8.subarray(p, p + len)); p += len }
  // block offsets
  const blockOffsets = new Uint32Array(numBlocks)
  for (let i = 0; i < numBlocks; i++) { blockOffsets[i] = dv.getUint32(p, true); p += 4 }
  const namesOff = p

  return { u8, dv, N, M, numBlocks, K, gh5Off, countryOff, admin1Off, cityNames, countries, admin1, blockOffsets, namesOff }
}

const gh5Of = (st, idx) => td.decode(st.u8.subarray(st.gh5Off + idx * 5, st.gh5Off + idx * 5 + 5))
const lcp = (a, b) => { let i = 0; const n = Math.min(a.length, b.length); while (i < n && a[i] === b[i]) i++; return i }

// Decode one front-coded entry at absolute byte offset `pos` given previous name.
// Returns { name, ids, next } where ids is the posting list (city indices).
const decodeEntry = (st, pos, prev) => {
  const u8 = st.u8
  let p = pos
  const rv = () => { let shift = 0, r = 0, b; do { b = u8[p++]; r |= (b & 0x7f) << shift; shift += 7 } while (b & 0x80); return r >>> 0 }
  const shared = rv(), sufLen = rv()
  const name = prev.slice(0, shared) + td.decode(u8.subarray(p, p + sufLen)); p += sufLen
  const count = rv()
  const ids = new Array(count)
  let acc = 0
  for (let i = 0; i < count; i++) { acc += rv(); ids[i] = acc }
  return { name, ids, next: p }
}

const blockFirstName = (st, b) => decodeEntry(st, st.namesOff + st.blockOffsets[b], '').name

// Find names with the given folded prefix; returns a Set of city indices.
const collectByPrefix = (st, qf, maxCandidates = 2000) => {
  const out = new Set()
  if (!qf) return out
  // rightmost block whose first name <= qf
  let lo = 0, hi = st.numBlocks - 1, start = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (blockFirstName(st, mid) <= qf) { start = mid; lo = mid + 1 } else hi = mid - 1
  }
  let pos = st.namesOff + st.blockOffsets[start]
  let prev = ''
  const end = st.namesOff + (start + 1 < st.numBlocks ? Infinity : 0) // sentinel; we stop by content
  const bufEnd = st.u8.length
  while (pos < bufEnd) {
    const e = decodeEntry(st, pos, prev)
    if (e.name.startsWith(qf)) {
      for (const id of e.ids) { out.add(id); if (out.size >= maxCandidates) return out }
    } else if (e.name > qf) {
      break
    }
    prev = e.name
    pos = e.next
  }
  return out
}

// Public: search(state, query, userGh5) -> [{ name, label, gh5, lat?, lng? }]
export const searchGazetteer = (st, query, userGh5 = '', limit = 40) => {
  const qf = fold(query || '')
  if (!qf) return []
  const ids = collectByPrefix(st, qf)
  const results = []
  for (const idx of ids) {
    const gh5 = gh5Of(st, idx)
    const admin = st.admin1[st.dv.getUint16(st.admin1Off + idx * 2, true)] || ''
    const cc = st.countries[st.dv.getUint16(st.countryOff + idx * 2, true)] || ''
    const label = [admin && admin !== st.cityNames[idx] ? admin : '', cc].filter(Boolean).join(', ')
    results.push({ name: st.cityNames[idx], label, gh5, score: lcp(userGh5, gh5) })
  }
  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return results.slice(0, limit)
}

// ---- browser loader (singleton) ----
let _state = null          // global cities blob
let _loading = null
let _ver = 'v1'            // village bucket directory
let _bucketSet = null      // Set of geohash3 codes that actually have a bucket
const _buckets = new Map() // gh3 -> parsed state | null
const _bucketLoading = new Map()

const getAssetUrl = (rel) => {
  let base = ''
  if (typeof document !== 'undefined') {
    const el = document.querySelector('base')
    base = el ? el.href : (document.baseURI || location.href)
  } else { base = '/' }
  const clean = rel.startsWith('/') ? rel.slice(1) : rel
  return (base.startsWith('http') || base.startsWith('file')) ? new URL(clean, base).href : base.replace(/\/?$/, '/') + clean
}

// Returns the decompressed blob bytes. The asset is gzip-compressed content, but
// some servers (e.g. vite preview) also set Content-Encoding: gzip and the
// browser transparently decompresses it, while others (e.g. GitHub Pages) serve
// the raw bytes. Detect the gzip magic (0x1f 0x8b) and only decompress when the
// browser hasn't already done so — robust either way.
const loadBytes = async (res) => {
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) return buf // already decompressed by transport
  const ds = new DecompressionStream('gzip')
  const ab = await new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer()
  return new Uint8Array(ab)
}

export const ensureGazetteer = async () => {
  if (_state) return _state
  if (_loading) return _loading
  _loading = (async () => {
    try {
      const idx = await (await fetch(getAssetUrl('gaz/index.json'), { cache: 'no-cache' })).json()
      _ver = idx.villageVersion || 'v1'
      // idx.buckets is a flat concatenation of 3-char geohash codes that have a
      // village bucket; knowing this up front lets us skip 404s for empty areas.
      _bucketSet = new Set()
      const bs = idx.buckets || ''
      for (let i = 0; i + 3 <= bs.length; i += 3) _bucketSet.add(bs.slice(i, i + 3))
      const res = await fetch(getAssetUrl('gaz/' + idx.blob)) // immutable: long-cacheable
      if (!res.ok) throw new Error(`gazetteer blob ${res.status}`)
      _state = parseBlob(await loadBytes(res))
      return _state
    } catch (e) {
      _loading = null // allow retry on next search
      throw e
    }
  })()
  return _loading
}

// Lazy-load a village bucket (pop<1000 places) for a geohash3 area. Returns null
// for areas with no bucket (no fetch attempted) or on error.
export const ensureBucket = async (gh3) => {
  if (!gh3 || !_bucketSet || !_bucketSet.has(gh3)) return null
  if (_buckets.has(gh3)) return _buckets.get(gh3)
  if (_bucketLoading.has(gh3)) return _bucketLoading.get(gh3)
  const pr = (async () => {
    try {
      const res = await fetch(getAssetUrl(`gaz/${_ver}/${gh3}.bin.gz`))
      const st = res.ok ? parseBlob(await loadBytes(res)) : null
      _buckets.set(gh3, st)
      return st
    } catch {
      _buckets.set(gh3, null)
      return null
    } finally {
      _bucketLoading.delete(gh3)
    }
  })()
  _bucketLoading.set(gh3, pr)
  return pr
}

// Decode a geohash5 to an approximate lat/lng centroid (ngeohash-free, tiny).
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz'
export const geohashToLatLng = (gh) => {
  let evenBit = true, latMin = -90, latMax = 90, lonMin = -180, lonMax = 180
  for (const ch of gh) {
    const cd = B32.indexOf(ch)
    for (let mask = 16; mask > 0; mask >>= 1) {
      if (evenBit) { const mid = (lonMin + lonMax) / 2; if (cd & mask) lonMin = mid; else lonMax = mid }
      else { const mid = (latMin + latMax) / 2; if (cd & mask) latMin = mid; else latMax = mid }
      evenBit = !evenBit
    }
  }
  return { lat: (latMin + latMax) / 2, lng: (lonMin + lonMax) / 2 }
}

// High-level helper used by the search box: returns proximity-ordered places
// with lat/lng resolved from geohash5.
// Search the global cities blob merged with any village buckets for the given
// geohash3 areas (loaded on demand). Results are deduped by name+location and
// ordered by proximity to userGh5.
export const searchPlaces = async (query, userGh5 = '', gh3List = []) => {
  const st = await ensureGazetteer()
  const buckets = (await Promise.all([...new Set(gh3List)].map(ensureBucket))).filter(Boolean)
  const all = []
  for (const s of [st, ...buckets]) for (const r of searchGazetteer(s, query, userGh5, 60)) all.push(r)
  const best = new Map()
  for (const r of all) {
    const k = r.name + '|' + r.gh5
    const e = best.get(k)
    if (!e || r.score > e.score) best.set(k, r)
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 40)
    .map(r => ({ ...r, ...geohashToLatLng(r.gh5) }))
}
