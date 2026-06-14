import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent, nip19 } from 'nostr-tools'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import Geohash from 'ngeohash'
import { argon2id } from 'hash-wasm'

export { generateSecretKey, getPublicKey, verifyEvent, nip19 }

export const computeReceiptHash = async (code, dTag, ownerPubkey) => {
  const salt = dTag + ownerPubkey
  const saltBuffer = new TextEncoder().encode(salt.padEnd(16, 'x').substring(0, 16))
  return argon2id({
    password: code,
    salt: saltBuffer,
    iterations: 3,
    memorySize: 65536,
    parallelism: 1,
    hashLength: 16,
    outputType: 'hex'
  })
}

export const normalizeVerificationCode = (code) => {
  if (!code) return ''
  return code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/I|L/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V')
}

export const getEventPow = (id) => {
  let count = 0
  for (let i = 0; i < id.length; i++) {
    const val = parseInt(id[i], 16)
    if (val === 0) {
      count += 4
    } else {
      if (val & 8) {}
      else if (val & 4) { count += 1 }
      else if (val & 2) { count += 2 }
      else if (val & 1) { count += 3 }
      break
    }
  }
  return count
}

export const getEventHash = (event) => {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ])
  const encoder = new TextEncoder()
  return bytesToHex(sha256(encoder.encode(serialized)))
}

export const isTestContext = () => {
  if (typeof window === 'undefined') return false
  return !!(
    window.navigator.webdriver ||
    window.location.search.includes('test=true') ||
    localStorage.getItem('saysheep_test_mode') === 'true'
  )
}

// Build a free-item listing event (NIP-99 kind 30402) with NIP-13 PoW (difficulty 8)
export const buildItemEvent = ({ secretKey, id, description, tags, photo, geo, availableUntil, receiptHash, phash }) => {
  const isTest = isTestContext()
  const now = Math.floor(Date.now() / 1000)
  const expiry = isTest
    ? now + 300 // 5 minutes for test items
    : (availableUntil ? Math.floor(availableUntil / 1000) : now + 14 * 86400)

  // Multiple geohash precisions for area queries - capped at 6 for privacy (approx 1.2km)
  const geohash = Geohash.encode(geo.lat, geo.lng, 6)
  const geoTags = []
  for (let i = 2; i <= geohash.length; i++) {
    geoTags.push(['g', geohash.slice(0, i)])
  }

  const firstLine = (description || '').split('\n')[0] || ''
  const title = firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine

  const eventTags = [
    ['d', id],
    ['title', title],
    ['summary', description || ''],
    ['status', 'active'],
    ['expiry', String(expiry)],
    ['available_until', String(expiry)],
    ...geoTags,
    ...tags.map(t => ['t', t]),
  ]
  if (photo) eventTags.push(['image', photo])
  if (phash) eventTags.push(['phash', phash])
  if (isTest) eventTags.push(['test', 'true'])
  if (receiptHash) eventTags.push(['h', receiptHash])

  // Mine NIP-13 PoW (difficulty target 8)
  const targetDifficulty = 8
  eventTags.push(['nonce', '', String(targetDifficulty)])
  const nonceIdx = eventTags.length - 1

  const pubkey = getPublicKey(secretKey)
  const baseEvent = {
    pubkey,
    created_at: now,
    kind: 30402,
    content: description || '',
    tags: eventTags
  }

  let counter = 0
  while (true) {
    eventTags[nonceIdx][1] = String(counter)
    const eventId = getEventHash(baseEvent)
    if (getEventPow(eventId) >= targetDifficulty) {
      break
    }
    counter++
  }

  return finalizeEvent({
    kind: 30402,
    created_at: now,
    tags: eventTags,
    content: description || '',
  }, secretKey)
}

// Build a report event (NIP-56 kind 1984) with NIP-13 PoW (difficulty 4)
export const buildReportEvent = ({ secretKey, targetEvent, reason, content = '' }) => {
  const now = Math.floor(Date.now() / 1000)
  const pubkey = getPublicKey(secretKey)
  const eventTags = [
    ['e', targetEvent.id],
    ['p', targetEvent.pubkey],
    ['report', reason],
    ['nonce', '', '4']
  ]
  const nonceIdx = 3
  const baseEvent = {
    pubkey,
    created_at: now,
    kind: 1984,
    content,
    tags: eventTags
  }
  let counter = 0
  while (true) {
    eventTags[nonceIdx][1] = String(counter)
    const eventId = getEventHash(baseEvent)
    if (getEventPow(eventId) >= 4) {
      break
    }
    counter++
  }

  return finalizeEvent({
    kind: 1984,
    created_at: now,
    tags: eventTags,
    content,
  }, secretKey)
}

// Build a "mark taken" event — replaces the listing via same 'd' tag
export const buildTakenEvent = ({ secretKey, originalEvent }) => {
  const now = Math.floor(Date.now() / 1000)
  const d = originalEvent.tags.find(t => t[0] === 'd')?.[1] || ''
  const existingTags = originalEvent.tags.filter(t => t[0] !== 'status' && t[0] !== 'expiry' && t[0] !== 'nonce')
  
  const originalExpiry = originalEvent.tags.find(t => t[0] === 'expiry')?.[1]
  const expiry = originalExpiry ? originalExpiry : String(now + 14 * 86400)

  const targetDifficulty = 8
  const eventTags = [
    ...existingTags,
    ['status', 'taken'],
    ['expiry', expiry],
    ['nonce', '', String(targetDifficulty)]
  ]
  const nonceIdx = eventTags.length - 1

  const pubkey = getPublicKey(secretKey)
  const baseEvent = {
    pubkey,
    created_at: now,
    kind: 30402,
    content: originalEvent.content || '',
    tags: eventTags
  }

  let counter = 0
  while (true) {
    eventTags[nonceIdx][1] = String(counter)
    const eventId = getEventHash(baseEvent)
    if (getEventPow(eventId) >= targetDifficulty) {
      break
    }
    counter++
  }

  return finalizeEvent({
    kind: 30402,
    created_at: now,
    tags: eventTags,
    content: originalEvent.content || '',
  }, secretKey)
}

// Build a taker-signed "item taken" event (kind 30403)
export const buildTakerTakenEvent = async ({ secretKey, originalEvent, code }) => {
  const now = Math.floor(Date.now() / 1000)
  const originalExpiry = originalEvent.tags.find(t => t[0] === 'expiry')?.[1]
  const expiry = originalExpiry ? originalExpiry : String(now + 14 * 86400)

  const eventTags = [
    ['e', originalEvent.id],
    ['c', code],
    ['expiry', expiry]
  ]

  return finalizeEvent({
    kind: 30403,
    created_at: now,
    tags: eventTags,
    content: `Item claimed: ${originalEvent.id}`,
  }, secretKey)
}

// Build a chat message referencing an item with NIP-13 PoW (difficulty 4)
export const buildChatEvent = ({ secretKey, itemEventId, text }) => {
  const now = Math.floor(Date.now() / 1000)
  const pubkey = getPublicKey(secretKey)
  const eventTags = [
    ['e', itemEventId, '', 'reply'],
    ['nonce', '', '4']
  ]
  const nonceIdx = 1
  const baseEvent = {
    pubkey,
    created_at: now,
    kind: 1,
    content: text,
    tags: eventTags
  }
  let counter = 0
  while (true) {
    eventTags[nonceIdx][1] = String(counter)
    const eventId = getEventHash(baseEvent)
    if (getEventPow(eventId) >= 4) {
      break
    }
    counter++
  }

  return finalizeEvent({
    kind: 1,
    created_at: now,
    tags: eventTags,
    content: text,
  }, secretKey)
}

// Build a delete event (NIP-09)
export const buildDeleteEvent = ({ secretKey, eventId }) => {
  return finalizeEvent({
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['e', eventId]],
    content: 'deleted',
  }, secretKey)
}

export const getItemStatus = (event) => event.tags.find(t => t[0] === 'status')?.[1] || 'active'
export const getItemTitle = (event) => event.tags.find(t => t[0] === 'title')?.[1] || ''
export const getItemSummary = (event) => event.tags.find(t => t[0] === 'summary')?.[1] || event.content || ''
export const getItemImage = (event) => event.tags.find(t => t[0] === 'image')?.[1] || null
export const getItemTags = (event) => event.tags.filter(t => t[0] === 't').map(t => t[1])
export const getItemGeohash = (event) => {
  const gTags = event.tags.filter(t => t[0] === 'g').map(t => t[1])
  return gTags.sort((a, b) => b.length - a.length)[0] || null
}
export const getItemGeo = (event) => {
  const gh = getItemGeohash(event)
  if (!gh) return null
  const { latitude, longitude } = Geohash.decode(gh)
  return { lat: latitude, lng: longitude }
}
export const getItemExpiry = (event) => {
  const tag = event.tags.find(t => t[0] === 'expiry')
  return tag ? parseInt(tag[1]) * 1000 : null
}
export const getItemId = (event) => event.tags.find(t => t[0] === 'd')?.[1] || event.id
export const isTaken = (event) => getItemStatus(event) === 'taken' || !!event.takenLocally
export const isExpired = (event) => {
  const expiry = getItemExpiry(event)
  return expiry ? expiry < Date.now() : false
}
export const shortPubkey = (pubkey) => {
  if (!pubkey) return '?'
  const ADJECTIVES = [
    'blue', 'red', 'green', 'yellow', 'happy', 'sad', 'fast', 'slow',
    'bright', 'dark', 'cozy', 'warm', 'cold', 'wild', 'tame', 'brave',
    'calm', 'sweet', 'sour', 'salty', 'bitter', 'spicy', 'fresh', 'clean',
    'dirty', 'loud', 'soft', 'rough', 'smooth', 'sharp', 'dull', 'clever',
    'silly', 'funny', 'friendly', 'shy', 'proud', 'gentle', 'light', 'heavy',
    'young', 'old', 'new', 'fancy', 'plain', 'curly', 'sleepy', 'sunny',
    'windy', 'rainy', 'snowy', 'cloudy', 'stormy', 'muddy', 'golden', 'silver',
    'bronze', 'copper', 'wooden', 'stony', 'glassy', 'silky', 'fluffy', 'fuzzy',
    'bumpy', 'shiny', 'dusty', 'misty', 'mossy', 'leafy', 'lazy', 'crazy',
    'lucky', 'rusty', 'frosty', 'sparky', 'peachy', 'cheery', 'merry', 'jolly'
  ]
  const NOUNS = [
    'sheep', 'weasel', 'badger', 'otter', 'fox', 'wolf', 'bear', 'deer',
    'rabbit', 'hare', 'squirrel', 'mouse', 'rat', 'beaver', 'hedgehog', 'mole',
    'frog', 'toad', 'newt', 'lizard', 'snake', 'turtle', 'snail', 'slug',
    'crab', 'lobster', 'shrimp', 'clam', 'oyster', 'squid', 'octopus', 'fish',
    'bird', 'owl', 'hawk', 'eagle', 'falcon', 'robin', 'sparrow', 'finch',
    'crow', 'raven', 'jay', 'magpie', 'dove', 'pigeon', 'swan', 'duck',
    'bee', 'wasp', 'ant', 'beetle', 'butterfly', 'moth', 'dragonfly', 'spider',
    'cat', 'dog', 'horse', 'cow', 'pig', 'goat', 'donkey', 'mule',
    'apple', 'pear', 'peach', 'plum', 'cherry', 'grape', 'berry', 'melon',
    'oak', 'pine', 'birch', 'maple', 'fern', 'moss', 'flower', 'rose'
  ]
  try {
    const clean = pubkey.startsWith('npub') ? pubkey : pubkey
    const val1 = parseInt(clean.slice(0, 4), 16)
    const val2 = parseInt(clean.slice(4, 8), 16)
    const adj = ADJECTIVES[val1 % ADJECTIVES.length]
    const noun = NOUNS[val2 % NOUNS.length]
    return `${adj}-${noun}`
  } catch {
    return pubkey.slice(0, 8) + '…'
  }
}

export const randomUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  const array = new Uint32Array(4)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    for (let i = 0; i < 4; i++) array[i] = Math.floor(Math.random() * 4294967296)
  }
  let i = 0
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (array[i >> 2] >> ((i % 4) * 8)) & 0xf
    i++
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export const generateSecureVerificationCode = () => {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const array = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    for (let i = 0; i < 8; i++) array[i] = Math.floor(Math.random() * 256)
  }
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[array[i] % 32]
    if (i === 3) code += '-'
  }
  return code
}
