// Offline gazetteer build: GeoNames -> a global cities blob the client binary-
// searches in pure JS, PLUS per-geohash3 "village" buckets (all populated places
// pop<1000) that the client lazy-loads near the user. Names are filtered to
// English + each country's primary language and folded to ASCII.
//
// Outputs (src/public/gaz/):
//   world.<hash>.bin.gz   global cities (pop>=1000, rich names)
//   v1/<gh3>.bin.gz       village buckets (pop<1000, name only)
//   index.json            { blob, cities, villageVersion, buckets }
// Inputs (downloaded to client/): cities1000, alternateNamesV2, allCountries,
//   countryInfo, admin1CodesASCII.
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
  'allCountries.txt': 'allCountries.zip',
  'countryInfo.txt': null,
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
const FOLD = { 'ø':'o','æ':'ae','å':'a','ß':'ss','ł':'l','đ':'d','ð':'d','þ':'th','œ':'oe','ı':'i','ħ':'h','ŋ':'n','ĸ':'k','ª':'a','º':'o' }
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

  // Assemble a self-contained gzipped blob from places[] + folded-name postings.
  const buildBlob = (places, nameMap) => {
    // collapse genuine dupes (same folded name AND identical gh5)
    for (const [name, set] of nameMap) {
      const byGh = new Map()
      for (const idx of set) { const g = places[idx].gh5; if (!byGh.has(g)) byGh.set(g, idx) }
      if (byGh.size !== set.size) nameMap.set(name, new Set(byGh.values()))
    }
    const countryList = [...new Set(places.map(c => c.cc))]
    const countryIdx = new Map(countryList.map((c, i) => [c, i]))
    const admin1List = [...new Set(places.map(c => c.admin1))]
    const admin1IdxM = new Map(admin1List.map((c, i) => [c, i]))

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
      const ids = [...nameMap.get(name)].sort((a, b) => a - b)
      namesW.varint(ids.length)
      let p = 0
      for (const id of ids) { namesW.varint(id - p); p = id }
      prev = name
    }

    const w = new Writer()
    w.bytes(Buffer.from('SGZ1'))
    w.u32(places.length); w.u32(names.length); w.u32(numBlocks); w.u16(K)
    w.u16(countryList.length); w.u16(admin1List.length)
    for (const c of places) w.bytes(Buffer.from(c.gh5, 'ascii'))
    for (const c of places) w.u16(countryIdx.get(c.cc))
    for (const c of places) w.u16(admin1IdxM.get(c.admin1))
    for (const c of places) w.str(c.name)
    for (const cc of countryList) w.bytes(Buffer.from((cc + '  ').slice(0, 2), 'ascii'))
    for (const a of admin1List) w.str(admin1Name[a] || '')
    for (const off of blockOffsets) w.u32(off)
    w.bytes(Uint8Array.from(namesW.b))
    return zlib.gzipSync(Buffer.from(w.b), { level: 9 })
  }

  const outDir = path.resolve('src/public/gaz')
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })

  // ===== Phase 1: global cities blob (pop>=1000, rich multi-language names) =====
  console.log('Phase 1: reading cities1000...')
  const cities = []
  const idToIdx = new Map()
  for (const line of fs.readFileSync('cities1000.txt', 'utf8').split('\n')) {
    if (!line) continue
    const c = line.split('\t')
    const lat = parseFloat(c[4]), lng = parseFloat(c[5])
    if (isNaN(lat) || isNaN(lng)) continue
    idToIdx.set(c[0], cities.length)
    cities.push({ name: c[1], ascii: c[2], cc: c[8] || '', admin1: `${c[8]}.${c[10]}`, gh5: Geohash.encode(lat, lng, 5) })
  }
  const nameMap = new Map()
  const add = (folded, idx) => { if (!folded) return; let s = nameMap.get(folded); if (!s) { s = new Set(); nameMap.set(folded, s) } s.add(idx) }
  cities.forEach((c, idx) => { if (isLatin(c.name)) add(fold(c.name), idx); if (isLatin(c.ascii)) add(fold(c.ascii), idx) })

  console.log('  streaming alternateNamesV2...')
  const rl = readline.createInterface({ input: fs.createReadStream('alternateNamesV2.txt'), crlfDelay: Infinity })
  for await (const line of rl) {
    const c = line.split('\t')
    const idx = idToIdx.get(c[1]); if (idx === undefined) continue
    const iso = c[2], alt = c[3]
    if (!alt || c[7] === '1') continue
    if (iso !== 'en' && iso !== primaryLang[cities[idx].cc]) continue
    if (!isLatin(alt)) continue
    add(fold(alt), idx)
  }

  const citiesGz = buildBlob(cities, nameMap)
  const hash = crypto.createHash('sha256').update(citiesGz).digest('hex').slice(0, 12)
  const blobName = `world.${hash}.bin.gz`
  fs.writeFileSync(path.join(outDir, blobName), citiesGz)
  const cityCount = cities.length
  console.log(`  cities blob ${(citiesGz.length / 1048576).toFixed(2)}MB (${cityCount} cities)`)
  cities.length = 0; nameMap.clear(); idToIdx.clear() // free before village pass

  // ===== Phase 2: village buckets (pop<1000, geohash3, lazy-loaded) =====
  const VER = 'v1'
  const verDir = path.join(outDir, VER)
  fs.mkdirSync(verDir, { recursive: true })
  const PPL = new Set(['PPL','PPLA','PPLA2','PPLA3','PPLA4','PPLC','PPLG','PPLL','PPLR','PPLS','PPLX'])
  const TMP = 'villages.tmp.tsv'

  console.log('Phase 2: scanning allCountries for villages...')
  const wsv = fs.createWriteStream(TMP)
  const rl2 = readline.createInterface({ input: fs.createReadStream('allCountries.txt'), crlfDelay: Infinity })
  let vcount = 0
  for await (const line of rl2) {
    const c = line.split('\t')
    if (c[6] !== 'P' || !PPL.has(c[7])) continue
    if ((parseInt(c[14]) || 0) >= 1000) continue // cities already in the global blob
    const lat = +c[4], lng = +c[5]; if (Number.isNaN(lat) || Number.isNaN(lng)) continue
    const name = (c[1] || '').replace(/[\t\n\r]/g, ' ').trim()
    if (!name || !isLatin(name)) continue
    const gh5 = Geohash.encode(lat, lng, 5)
    wsv.write(`${gh5.slice(0, 3)}\t${name}\t${gh5}\t${c[8] || ''}\t${c[8]}.${c[10]}\n`)
    vcount++
  }
  await new Promise(r => wsv.end(r))
  console.log(`  ${vcount} villages; sorting by bucket...`)
  // Whole-line sort groups by the leading geohash3 token (LC_ALL=C = byte order).
  execSync(`LC_ALL=C sort -S 512M "${TMP}" -o "${TMP}"`, { stdio: 'inherit' })

  const bucketList = []
  let curGh3 = null, group = []
  const flush = () => {
    if (!group.length) return
    const seen = new Set(); const uniq = []
    for (const v of group) { const k = v.name + '|' + v.gh5; if (seen.has(k)) continue; seen.add(k); uniq.push(v) }
    const nm = new Map()
    uniq.forEach((v, i) => { const f = fold(v.name); if (f) { let s = nm.get(f); if (!s) { s = new Set(); nm.set(f, s) } s.add(i) } })
    fs.writeFileSync(path.join(verDir, `${curGh3}.bin.gz`), buildBlob(uniq, nm))
    bucketList.push(curGh3)
  }
  const rl3 = readline.createInterface({ input: fs.createReadStream(TMP), crlfDelay: Infinity })
  for await (const line of rl3) {
    const t = line.split('\t')
    if (t.length < 5) continue
    const gh3 = t[0]
    if (gh3 !== curGh3) { flush(); curGh3 = gh3; group = [] }
    group.push({ name: t[1], gh5: t[2], cc: t[3], admin1: t[4] })
  }
  flush()
  fs.unlinkSync(TMP)

  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({
    blob: blobName, cities: cityCount, villageVersion: VER, buckets: bucketList.sort().join('')
  }))

  console.log(`  ${bucketList.length} village buckets written to ${VER}/`)
  console.log('Done.')
}

build().catch(e => { console.error(e); process.exit(1) })
