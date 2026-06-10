import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent, nip19 } from 'nostr-tools'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import Geohash from 'ngeohash'

export { generateSecretKey, getPublicKey, verifyEvent, nip19 }

// Build a free-item listing event (NIP-99 kind 30402)
export const buildItemEvent = ({ secretKey, id, title, description, tags, photo, geo, availableUntil }) => {
  const now = Math.floor(Date.now() / 1000)
  const expiry = availableUntil
    ? Math.floor(availableUntil / 1000)
    : now + 14 * 86400

  // Multiple geohash precisions for area queries
  const geohash = Geohash.encode(geo.lat, geo.lng, 9)
  const geoTags = []
  for (let i = 2; i <= geohash.length; i++) {
    geoTags.push(['g', geohash.slice(0, i)])
  }

  const eventTags = [
    ['d', id],
    ['title', title || ''],
    ['summary', description || ''],
    ['status', 'active'],
    ['expiry', String(expiry)],
    ['available_until', String(expiry)],
    ...geoTags,
    ...tags.map(t => ['t', t]),
  ]
  if (photo) eventTags.push(['image', photo])

  return finalizeEvent({
    kind: 30402,
    created_at: now,
    tags: eventTags,
    content: description || '',
  }, secretKey)
}

// Build a "mark taken" event — replaces the listing via same 'd' tag
export const buildTakenEvent = ({ secretKey, originalEvent }) => {
  const now = Math.floor(Date.now() / 1000)
  const d = originalEvent.tags.find(t => t[0] === 'd')?.[1] || ''
  const existingTags = originalEvent.tags.filter(t => t[0] !== 'status' && t[0] !== 'expiry')
  return finalizeEvent({
    kind: 30402,
    created_at: now,
    tags: [...existingTags, ['status', 'taken'], ['expiry', String(now + 60)]],
    content: originalEvent.content,
  }, secretKey)
}

// Build a chat message referencing an item
export const buildChatEvent = ({ secretKey, itemEventId, text }) => {
  return finalizeEvent({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['e', itemEventId, '', 'reply']],
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
export const isTaken = (event) => getItemStatus(event) === 'taken'
export const isExpired = (event) => {
  const expiry = getItemExpiry(event)
  return expiry ? expiry < Date.now() : false
}
export const shortPubkey = (pubkey) => pubkey ? pubkey.slice(0, 8) + '…' : '?'
