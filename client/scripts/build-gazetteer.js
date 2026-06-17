// Offline gazetteer build: GeoNames cities1000 + alternateNamesV2 -> a single
// immutable, content-addressed gzipped blob the client binary-searches in pure
// JS. Names are filtered to English + each country's primary language and folded
// to ASCII. Output: src/public/gaz/world.<hash>.bin.gz + gaz/index.json.
//
// Inputs (downloaded on demand to client/ ):
//   cities1000.txt, alternateNamesV2.txt, countryInfo.txt, admin1CodesASCII.txt
// Run: node scripts/build-gazetteer.js   (from client/)
import fs from 'fs'
import readline from 'readline'
import zlib from 'zlib'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'
import Geohash from 'ngeohash'

const DUMP = 'https://download.geonames.org/export/dump'
const NEED = {
  'cities1000.txt': 'cities1000.zip',
  'alternateNamesV2.txt': 'alternateNamesV2.zip',
  'countryInfo.txt': null,            // plain file
  'admin1CodesASCII.txt': null,
}

const ensure = (txt, zip) => {
  if (fs.existsSync(txt)) return
  if (zip) {
    if (!fs.existsSync(zip)) execSync(`curl -sS -o ${zip} ${DUMP}/${zip}`, { stdio: 'inherit' })
    execSync(`unzip -o ${zip} ${txt}`, { stdio: 'inherit' })
  } else {
    execSync(`curl -sS -o ${txt} ${DUMP}/${txt}`, { stdio: 'inherit' })
  }
}

// ---- ASCII folding (so "København" === "Kobenhavn" === "kobenhavn") ----
const FOLD = { 'ø':'o','æ':'ae','å':'a','ß':'ss','ł':'l','đ':'d','ð':'d','þ':'th','œ':'oe','ı':'i','ħ':'h','ŋ':'n','ĸ':'k','ª':'a','º':'o','ø':'o' }
export const fold = (s) => s.toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[øæåßłđðþœıħŋĸªº]/g, c => FOLD[c] || c)
  .replace(/[^a-z0-9]+/g, ' ').trim()
const isLatin = (s) => { const f = fold(s); return f.length > 0 && /^[a-z0-9 ]+$/.test(f) }

// ---- varint writer ----
class Writer {
  constructor() { this.b = [] }
  u8(n) { this.b.push(n & 0xff) }
  u16(n) { this.b.push(n & 0xff, (n >> 8) & 0xff) }
  u32(n) { this.b.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff) }
  varint(n) { while (n >= 0x80) { this.b.push((n & 0x7f) | 0x80); n >>>= 7 } this.b.push(n) }
  bytes(buf) { for (let i = 0; i < buf.length; i++) this.b.push(buf[i]) }
  str(s) { const u = Buffer.from(s, 'utf8'); this.varint(u.length); this.bytes(u) }
  get length() { return this.b.length }
}

const build = async () => {
  for (const [txt, zip] of Object.entries(NEED)) ensure(txt, zip)

  console.log('Reading countryInfo + admin1...')
  const primaryLang = {}
  for (const line of fs.readFileSync('countryInfo.txt', 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const c = line.split('\t')
    if (c[0]) primaryLang[c[0]] = (c[15] || '').split(',')[0].split('-')[0].toLowerCase()
  }
  const admin1Name = {}
  for (const line of fs.readFileSync('admin1CodesASCII.txt', 'utf8').split('\n')) {
    if (!line) continue
    const c = line.split('\t') // code, name, asciiname, geonameid
    admin1Name[c[0]] = c[2] || c[1] || ''
  }

  console.log('Reading cities1000...')
  const cities = []           // { name, cc, admin1code, gh5 }
  const idToIdx = new Map()
  for (const line of fs.readFileSync('cities1000.txt', 'utf8').split('\n')) {
    if (!line) continue
    const c = line.split('\t')
    const lat = parseFloat(c[4]), lng = parseFloat(c[5])
    if (isNaN(lat) || isNaN(lng)) continue
    idToIdx.set(c[0], cities.length)
    cities.push({ name: c[1], ascii: c[2], cc: c[8] || '', admin1: `${c[8]}.${c[10]}`, gh5: Geohash.encode(lat, lng, 5) })
  }
  console.log(`  ${cities.length} cities`)

  // ---- name -> set(cityIdx) ----
  const nameMap = new Map()
  const add = (folded, idx) => {
    if (!folded) return
    let s = nameMap.get(folded); if (!s) { s = new Set(); nameMap.set(folded, s) }
    s.add(idx)
  }
  cities.forEach((c, idx) => {
    if (isLatin(c.name)) add(fold(c.name), idx)
    if (isLatin(c.ascii)) add(fold(c.ascii), idx)
  })

  console.log('Streaming alternateNamesV2 (18M rows)...')
  let seen = 0, kept = 0
  const rl = readline.createInterface({ input: fs.createReadStream('alternateNamesV2.txt'), crlfDelay: Infinity })
  for await (const line of rl) {
    if ((++seen % 4000000) === 0) console.log(`  ${seen} rows...`)
    const c = line.split('\t')
    const idx = idToIdx.get(c[1]); if (idx === undefined) continue
    const iso = c[2], alt = c[3]
    if (!alt) continue
    if (c[7] === '1') continue // isHistoric
    if (iso !== 'en' && iso !== primaryLang[cities[idx].cc]) continue
    if (!isLatin(alt)) continue
    add(fold(alt), idx); kept++
  }
  console.log(`  kept ${kept} alt names; ${nameMap.size} unique searchable names`)

  // ---- collapse genuine dupes (same name AND identical gh5) ----
  for (const [name, set] of nameMap) {
    const byGh = new Map()
    for (const idx of set) { const g = cities[idx].gh5; if (!byGh.has(g)) byGh.set(g, idx) }
    if (byGh.size !== set.size) nameMap.set(name, new Set(byGh.values()))
  }

  // ---- country + admin1 tables ----
  const countryList = [...new Set(cities.map(c => c.cc))]
  const countryIdx = new Map(countryList.map((c, i) => [c, i]))
  const admin1List = [...new Set(cities.map(c => c.admin1))]
  const admin1Idx = new Map(admin1List.map((c, i) => [c, i]))

  // ---- front-coded name blocks ----
  const names = [...nameMap.keys()].sort()
  const K = 16
  const numBlocks = Math.ceil(names.length / K)
  const namesW = new Writer()
  const blockOffsets = []
  let prev = ''
  for (let i = 0; i < names.length; i++) {
    if (i % K === 0) { blockOffsets.push(namesW.length); prev = '' }
    const name = names[i]
    let shared = 0
    while (shared < prev.length && shared < name.length && prev[shared] === name[shared]) shared++
    const suffix = Buffer.from(name.slice(shared), 'utf8')
    namesW.varint(shared); namesW.varint(suffix.length); namesW.bytes(suffix)
    // inline postings (delta-encoded sorted cityIdx)
    const ids = [...nameMap.get(name)].sort((a, b) => a - b)
    namesW.varint(ids.length)
    let p = 0
    for (const id of ids) { namesW.varint(id - p); p = id }
    prev = name
  }

  // ---- assemble blob ----
  const w = new Writer()
  w.bytes(Buffer.from('SGZ1'))
  w.u32(cities.length); w.u32(names.length); w.u32(numBlocks); w.u16(K)
  w.u16(countryList.length); w.u16(admin1List.length)
  // side arrays
  for (const c of cities) w.bytes(Buffer.from(c.gh5, 'ascii'))             // N*5
  for (const c of cities) w.u16(countryIdx.get(c.cc))                       // N*u16
  for (const c of cities) w.u16(admin1Idx.get(c.admin1))                    // N*u16
  for (const c of cities) w.str(c.name)                                     // display names
  for (const cc of countryList) w.bytes(Buffer.from((cc + '  ').slice(0, 2), 'ascii'))
  for (const a of admin1List) w.str(admin1Name[a] || '')
  // names section
  for (const off of blockOffsets) w.u32(off)
  w.bytes(Uint8Array.from(namesW.b))

  const raw = Buffer.from(w.b)
  const gz = zlib.gzipSync(raw, { level: 9 })
  const hash = crypto.createHash('sha256').update(gz).digest('hex').slice(0, 12)

  const outDir = path.resolve('src/public/gaz')
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })
  const blobName = `world.${hash}.bin.gz`
  fs.writeFileSync(path.join(outDir, blobName), gz)
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ blob: blobName, cities: cities.length, names: names.length }))

  console.log(`\nDone. raw ${(raw.length / 1048576).toFixed(2)}MB -> gz ${(gz.length / 1048576).toFixed(2)}MB`)
  console.log(`  ${blobName}`)
}

build().catch(e => { console.error(e); process.exit(1) })
