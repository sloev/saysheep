import { openDB } from 'idb'

const DB_NAME = 'glean'
const DB_VERSION = 1

let _db = null

const db = async () => {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const events = db.createObjectStore('events', { keyPath: 'id' })
      events.createIndex('kind', 'kind')
      events.createIndex('created_at', 'created_at')
      events.createIndex('pubkey', 'pubkey')
      db.createObjectStore('meta', { keyPath: 'key' })
    },
  })
  return _db
}

export const storeEvent = async (event) => {
  const d = await db()
  const tx = d.transaction('events', 'readwrite')
  const existing = await tx.store.get(event.id)
  if (!existing) await tx.store.put(event)
  await tx.done
}

export const getEvent = async (id) => {
  return (await db()).get('events', id)
}

export const getEventsByKind = async (kind, limit = 500) => {
  const d = await db()
  const index = d.transaction('events').store.index('kind')
  return index.getAll(kind, limit)
}

// Get items by geohash prefix — filter client-side
export const getItemsByGeohash = async (geohashPrefix) => {
  const all = await getEventsByKind(30402)
  return all.filter(ev => {
    const gTags = ev.tags.filter(t => t[0] === 'g').map(t => t[1])
    return gTags.some(g => g.startsWith(geohashPrefix) || geohashPrefix.startsWith(g))
  })
}

export const getChatForItem = async (itemEventId) => {
  const all = await getEventsByKind(1)
  return all
    .filter(ev => ev.tags.some(t => t[0] === 'e' && t[1] === itemEventId))
    .sort((a, b) => a.created_at - b.created_at)
}

export const deleteEvent = async (id) => {
  (await db()).delete('events', id)
}

export const purgeExpired = async () => {
  const now = Math.floor(Date.now() / 1000)
  const maxAge = now - 14 * 86400
  const d = await db()
  const all = await d.getAll('events')
  const tx = d.transaction('events', 'readwrite')
  for (const ev of all) {
    const expiryTag = ev.tags?.find(t => t[0] === 'expiry')
    const expiry = expiryTag ? parseInt(expiryTag[1]) : null
    if ((expiry && expiry < now) || ev.created_at < maxAge) {
      tx.store.delete(ev.id)
    }
  }
  await tx.done
}

export const getMeta = async (key) => {
  const row = await (await db()).get('meta', key)
  return row?.value
}

export const setMeta = async (key, value) => {
  (await db()).put('meta', { key, value })
}
