import { verifyEvent } from 'nostr-tools'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { geohashesForBounds } from './geo.js'
import { getGazetteerTileLocal, saveGazetteerTileLocal, getMeta, setMeta } from './storage.js'
import { registerTileProvider, registerTileCallback, requestTileP2P } from './peer.js'

export const ORIGIN_PUBKEY = '97471863b51fa180e5815ab35f299a2b708f7abfdbed8d062a8c3e371e4f5c10'

const getAssetUrl = (relativePath) => {
  let baseHref = ''
  if (typeof document !== 'undefined') {
    const baseEl = document.querySelector('base')
    if (baseEl) {
      baseHref = baseEl.href
    } else {
      baseHref = document.baseURI || window.location.href
    }
  } else if (typeof window !== 'undefined') {
    let base = ''
    if (window.location.pathname.startsWith('/saysheep')) {
      base = '/saysheep'
    }
    baseHref = window.location.origin + base + '/'
  } else {
    const envBase = (import.meta.env.BASE_URL || '/')
    baseHref = envBase.endsWith('/') ? envBase : envBase + '/'
  }

  // Clean relative path of leading slash
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath

  // URL constructor resolves path against base dynamically.
  // In Node.js or SSR without a valid absolute protocol, fallback to string concat.
  if (baseHref.startsWith('http://') || baseHref.startsWith('https://') || baseHref.startsWith('file://')) {
    return new URL(cleanPath, baseHref).href
  } else {
    const cleanBase = baseHref.endsWith('/') ? baseHref : baseHref + '/'
    return `${cleanBase}${cleanPath}`
  }
}

const _tileCache = new Map()
const _pendingP2P = new Map()
let _manifest = null
let _manifestPromise = null

const normalizeString = (str) => {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const isMatch = (name, query) => {
  const normName = normalizeString(name)
  if (normName.startsWith(query)) return true
  const words = normName.split(/\s+/)
  return words.some(w => w.startsWith(query))
}

export const ensureManifest = () => {
  if (_manifest) return Promise.resolve(_manifest)
  if (_manifestPromise) return _manifestPromise

  _manifestPromise = (async () => {
    try {
      const cachedEvent = await getMeta('signed_manifest')
      if (cachedEvent) {
        if (verifyEvent(cachedEvent)) {
          _manifest = JSON.parse(cachedEvent.content)
          _manifestPromise = null
          return _manifest
        }
      }
    } catch (e) {
      console.error('Failed to load cached manifest:', e)
    }

    try {
      const url = getAssetUrl('gaz/manifest.json')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} when fetching manifest`)
      const event = await res.json()
      if (event.pubkey === ORIGIN_PUBKEY && verifyEvent(event)) {
        _manifest = JSON.parse(event.content)
        await setMeta('signed_manifest', event)
        _manifestPromise = null
        return _manifest
      }
      throw new Error('Invalid manifest signature or publisher')
    } catch (e) {
      _manifestPromise = null
      console.error('Failed to load manifest from origin:', e)
      throw e
    }
  })()

  return _manifestPromise
}

export const getGazetteerTile = async (prefix) => {
  await ensureManifest()

  const entry = _manifest[prefix]
  if (!entry) {
    console.warn(`Prefix ${prefix} not found in manifest`)
    return null
  }

  if (_tileCache.has(prefix)) {
    return _tileCache.get(prefix)
  }

  const local = await getGazetteerTileLocal(prefix)
  if (local && local.version === entry.version) {
    try {
      const text = JSON.stringify(local.places)
      const hash = bytesToHex(sha256(new TextEncoder().encode(text)))
      if (hash === entry.hash) {
        _tileCache.set(prefix, local.places)
        return local.places
      }
    } catch (e) {
      console.error('Failed to verify local tile hash:', e)
    }
  }

  let places = await fetchP2P(prefix, entry)
  if (places) {
    await saveGazetteerTileLocal(prefix, places, entry.version)
    _tileCache.set(prefix, places)
    return places
  }

  places = await fetchOrigin(prefix, entry)
  if (places) {
    await saveGazetteerTileLocal(prefix, places, entry.version)
    _tileCache.set(prefix, places)
    return places
  }

  return null
}

const fetchOrigin = async (prefix, entry) => {
  try {
    const url = getAssetUrl(`gaz/${prefix}/v${entry.version}.json.gz`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const ds = new DecompressionStream('gzip')
    const decompressedStream = res.body.pipeThrough(ds)
    const text = await new Response(decompressedStream).text()
    const places = JSON.parse(text)

    const hash = bytesToHex(sha256(new TextEncoder().encode(text)))
    if (hash !== entry.hash) {
      throw new Error('Hash mismatch for origin tile')
    }

    return places
  } catch (e) {
    console.error(`Failed to fetch tile ${prefix} from origin:`, e)
    return null
  }
}

const fetchP2P = (prefix, entry) => {
  const existing = _pendingP2P.get(prefix)
  if (existing) return existing.promise

  // One record per in-flight request holds BOTH the promise (for dedup) and the
  // resolve fn + entry (for the tile callback to settle). Storing only the bare
  // promise here previously left the callback unable to resolve it.
  const record = { entry }
  record.promise = new Promise((resolve) => {
    let resolved = false
    const finish = (places) => {
      if (resolved) return
      resolved = true
      clearTimeout(record.timeout)
      _pendingP2P.delete(prefix)
      resolve(places)
    }
    record.resolve = finish
    record.timeout = setTimeout(() => finish(null), 2500)

    // If no peer received the request, fail fast to origin instead of waiting
    // out the whole timeout.
    const recipients = requestTileP2P(prefix)
    if (!recipients) finish(null)
  })

  _pendingP2P.set(prefix, record)
  return record.promise
}

export const resolvePrefixesForBounds = async (sw, ne) => {
  await ensureManifest()
  const p3List = await geohashesForBounds(sw, ne, 3)
  const prefixes = []
  for (const p3 of p3List) {
    // Check both exact match (p3) and child splits (startsWith p3) to seamlessly
    // support cases where dense cells are split into finer 4-character tiles.
    const matches = Object.keys(_manifest).filter(k => k === p3 || k.startsWith(p3))
    if (matches.length > 0) {
      prefixes.push(...matches)
    }
  }
  return prefixes
}

export const searchPlaces = async (query, viewportBounds) => {
  if (!query || !viewportBounds) return []
  const normQuery = normalizeString(query.trim())
  if (!normQuery) return []

  const { sw, ne } = viewportBounds
  const prefixes = await resolvePrefixesForBounds(sw, ne)

  const tilesData = await Promise.all(prefixes.map(p => getGazetteerTile(p)))

  const results = []
  for (const places of tilesData) {
    if (!places) continue
    for (const place of places) {
      let matched = false
      if (isMatch(place.name, normQuery)) {
        matched = true
      } else if (place.altNames) {
        for (const alt of place.altNames) {
          if (isMatch(alt, normQuery)) {
            matched = true
            break
          }
        }
      }

      if (matched) {
        results.push(place)
      }
    }
  }

  results.sort((a, b) => (b.population || 0) - (a.population || 0))
  return results
}

// Register callbacks with P2P layers
registerTileCallback((prefix, places) => {
  const pending = _pendingP2P.get(prefix)
  if (!pending || !pending.resolve) return
  try {
    const text = JSON.stringify(places)
    const hash = bytesToHex(sha256(new TextEncoder().encode(text)))
    if (hash === pending.entry.hash) {
      pending.resolve(places)
    } else {
      // A bad/malicious peer must not short-circuit us to a null result; let
      // honest peers or the timeout settle the request instead.
      console.warn(`P2P tile hash mismatch for ${prefix}`)
    }
  } catch (e) {
    console.error('Failed to verify P2P tile hash:', e)
  }
})

registerTileProvider(async (prefix) => {
  if (_tileCache.has(prefix)) {
    return _tileCache.get(prefix)
  }
  const local = await getGazetteerTileLocal(prefix)
  return local ? local.places : null
})
