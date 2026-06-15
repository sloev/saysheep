import { verifyEvent } from 'nostr-tools'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { geohashesForBounds } from './geo.js'
import { getGazetteerTileLocal, saveGazetteerTileLocal, getMeta, setMeta } from './storage.js'
import { registerTileProvider, registerTileCallback, requestTileP2P } from './peer.js'

export const ORIGIN_PUBKEY = '97471863b51fa180e5815ab35f299a2b708f7abfdbed8d062a8c3e371e4f5c10'

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
        }
      }

      const res = await fetch('gaz/manifest.json')
      if (res.ok) {
        const event = await res.json()
        if (event.pubkey === ORIGIN_PUBKEY && verifyEvent(event)) {
          _manifest = JSON.parse(event.content)
          await setMeta('signed_manifest', event)
        }
      }
    } catch (e) {
      console.error('Failed to load manifest:', e)
    }

    if (!_manifest) {
      _manifest = {}
    }
    _manifestPromise = null
    return _manifest
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
    const url = `gaz/${prefix}/v${entry.version}.json.gz`
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
  if (_pendingP2P.has(prefix)) {
    return _pendingP2P.get(prefix)
  }

  const promise = new Promise((resolve) => {
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        _pendingP2P.delete(prefix)
        resolve(null)
      }
    }, 5000)

    _pendingP2P.set(prefix, {
      resolve: (places) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          _pendingP2P.delete(prefix)
          resolve(places)
        }
      },
      entry
    })

    requestTileP2P(prefix)
  })

  _pendingP2P.set(prefix, promise)
  return promise
}

export const resolvePrefixesForBounds = async (sw, ne) => {
  await ensureManifest()
  const p3List = await geohashesForBounds(sw, ne, 3)
  const prefixes = []
  for (const p3 of p3List) {
    if (_manifest[p3]) {
      prefixes.push(p3)
    } else {
      const children = Object.keys(_manifest).filter(k => k.startsWith(p3))
      prefixes.push(...children)
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
  if (pending && pending.resolve) {
    try {
      const text = JSON.stringify(places)
      const hash = bytesToHex(sha256(new TextEncoder().encode(text)))
      if (hash === pending.entry.hash) {
        pending.resolve(places)
      } else {
        console.warn(`P2P tile hash mismatch for ${prefix}`)
        pending.resolve(null)
      }
    } catch (e) {
      console.error('Failed to verify P2P tile hash:', e)
      pending.resolve(null)
    }
  }
})

registerTileProvider(async (prefix) => {
  if (_tileCache.has(prefix)) {
    return _tileCache.get(prefix)
  }
  const local = await getGazetteerTileLocal(prefix)
  return local ? local.places : null
})
