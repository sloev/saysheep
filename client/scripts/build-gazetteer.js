import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { execSync } from 'child_process'
import Geohash from 'ngeohash'
import { finalizeEvent } from 'nostr-tools'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

const skHex = process.env.ORIGIN_SK || '6a751f950e4860c6af2722b2c5914526ac1fbbf57d5eb3f00c17ebc5c4902f4c'
const sk = Uint8Array.from(Buffer.from(skHex, 'hex'))

const GEONAMES_ZIP_URL = 'https://download.geonames.org/export/dump/cities15000.zip'
const ZIP_FILE = 'cities15000.zip'
const TXT_FILE = 'cities15000.txt'

async function downloadGeoNames() {
  if (fs.existsSync(TXT_FILE)) {
    console.log(`${TXT_FILE} already exists, skipping download.`)
    return
  }

  console.log(`Downloading ${GEONAMES_ZIP_URL}...`)
  const res = await fetch(GEONAMES_ZIP_URL)
  if (!res.ok) throw new Error(`Failed to download GeoNames: ${res.statusText}`)
  
  const buffer = await res.arrayBuffer()
  fs.writeFileSync(ZIP_FILE, Buffer.from(buffer))
  console.log(`Downloaded zip, extracting...`)
  
  execSync(`unzip -o ${ZIP_FILE}`)
  console.log(`Extraction complete.`)
}

function parseGeoNames() {
  console.log(`Parsing ${TXT_FILE}...`)
  const content = fs.readFileSync(TXT_FILE, 'utf8')
  const lines = content.split('\n')
  const places = []

  for (const line of lines) {
    if (!line.trim()) continue
    const cols = line.split('\t')
    if (cols.length < 15) continue

    const name = cols[2] || cols[1] // asciiname or name
    const altNamesStr = cols[3] || ''
    const lat = parseFloat(cols[4])
    const lng = parseFloat(cols[5])
    const population = parseInt(cols[14]) || 0

    if (isNaN(lat) || isNaN(lng)) continue

    const altNames = altNamesStr
      .split(',')
      .map(n => n.trim())
      .filter(n => n && n !== name)
      .slice(0, 5) // limit alt names to keep files small

    const geohash6 = Geohash.encode(lat, lng, 6)

    places.push({
      name,
      altNames,
      lat,
      lng,
      geohash6,
      population
    })
  }

  console.log(`Parsed ${places.length} places.`)
  return places
}

async function build() {
  await downloadGeoNames()
  const allPlaces = parseGeoNames()

  const bin3 = {}
  for (const p of allPlaces) {
    const p3 = p.geohash6.slice(0, 3)
    if (!bin3[p3]) bin3[p3] = []
    bin3[p3].push(p)
  }

  const finalTiles = {} // prefix -> places[]

  for (const [p3, places] of Object.entries(bin3)) {
    if (places.length <= 1000) {
      finalTiles[p3] = places
    } else {
      console.log(`Tile ${p3} has ${places.length} places, splitting into 4-char prefixes...`)
      const bin4 = {}
      for (const p of places) {
        const p4 = p.geohash6.slice(0, 4)
        if (!bin4[p4]) bin4[p4] = []
        bin4[p4].push(p)
      }
      for (const [p4, p4Places] of Object.entries(bin4)) {
        finalTiles[p4] = p4Places
      }
    }
  }

  const manifest = {}
  const publicGazDir = path.resolve('src/public/gaz')
  if (fs.existsSync(publicGazDir)) {
    fs.rmSync(publicGazDir, { recursive: true, force: true })
  }
  fs.mkdirSync(publicGazDir, { recursive: true })

  console.log(`Writing tiles and creating manifest...`)
  for (const [prefix, places] of Object.entries(finalTiles)) {
    const json = JSON.stringify(places)
    const hash = bytesToHex(sha256(new TextEncoder().encode(json)))
    const gzip = zlib.gzipSync(Buffer.from(json))

    const tileDir = path.join(publicGazDir, prefix)
    fs.mkdirSync(tileDir, { recursive: true })
    fs.writeFileSync(path.join(tileDir, 'v1.json.gz'), gzip)

    manifest[prefix] = {
      version: 1,
      hash,
      size: gzip.length,
      prefixLen: prefix.length
    }
  }

  const manifestEvent = finalizeEvent({
    kind: 30405,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(manifest)
  }, sk)

  fs.writeFileSync(
    path.join(publicGazDir, 'manifest.json'),
    JSON.stringify(manifestEvent, null, 2)
  )

  console.log(`Build complete! Wrote ${Object.keys(finalTiles).length} tiles to ${publicGazDir}`)
}

build().catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
