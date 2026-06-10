import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

const DB_PATH = process.env.DB_PATH || './data/relay.db'
mkdirSync(dirname(DB_PATH), { recursive: true })

let _db

export const getDb = () => {
  if (_db) return _db
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  migrate(_db)
  return _db
}

const migrate = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      pubkey TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      kind INTEGER NOT NULL,
      tags TEXT NOT NULL,
      content TEXT NOT NULL,
      sig TEXT NOT NULL,
      expiry INTEGER
    );
    CREATE TABLE IF NOT EXISTS event_tags (
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_pubkey ON events(pubkey);
    CREATE INDEX IF NOT EXISTS idx_tags ON event_tags(name, value);
    CREATE TABLE IF NOT EXISTS relay_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

export const storeEvent = (event) => {
  const db = getDb()
  const expiryTag = event.tags.find(t => t[0] === 'expiry')
  const expiry = expiryTag ? parseInt(expiryTag[1]) : null

  const insert = db.prepare(`
    INSERT OR IGNORE INTO events (id, pubkey, created_at, kind, tags, content, sig, expiry)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertTag = db.prepare(`INSERT INTO event_tags (event_id, name, value) VALUES (?, ?, ?)`)

  const run = db.transaction((ev) => {
    const r = insert.run(ev.id, ev.pubkey, ev.created_at, ev.kind,
      JSON.stringify(ev.tags), ev.content, ev.sig, expiry)
    if (r.changes === 0) return false
    for (const tag of ev.tags) {
      if (tag.length >= 2 && tag[0].length === 1) {
        insertTag.run(ev.id, tag[0], tag[1])
      }
    }
    return true
  })

  return run(event)
}

export const deleteEvent = (id, pubkey) => {
  const db = getDb()
  db.prepare('DELETE FROM events WHERE id = ? AND pubkey = ?').run(id, pubkey)
}

export const queryEvents = (filter) => {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)

  let sql = `SELECT DISTINCT e.id, e.pubkey, e.created_at, e.kind, e.tags, e.content, e.sig
    FROM events e WHERE (e.expiry IS NULL OR e.expiry > ?)`
  const params = [now]

  if (filter.ids?.length) {
    sql += ` AND e.id IN (${filter.ids.map(() => '?').join(',')})`;  params.push(...filter.ids)
  }
  if (filter.kinds?.length) {
    sql += ` AND e.kind IN (${filter.kinds.map(() => '?').join(',')})`;  params.push(...filter.kinds)
  }
  if (filter.authors?.length) {
    sql += ` AND e.pubkey IN (${filter.authors.map(() => '?').join(',')})`;  params.push(...filter.authors)
  }
  if (filter.since != null) { sql += ` AND e.created_at >= ?`;  params.push(filter.since) }
  if (filter.until != null) { sql += ` AND e.created_at <= ?`;  params.push(filter.until) }

  for (const [key, values] of Object.entries(filter)) {
    if (key.startsWith('#') && key.length === 2 && Array.isArray(values) && values.length) {
      const tagName = key[1]
      sql += ` AND EXISTS (SELECT 1 FROM event_tags et WHERE et.event_id = e.id AND et.name = ? AND et.value IN (${values.map(() => '?').join(',')}))`
      params.push(tagName, ...values)
    }
  }

  sql += ` ORDER BY e.created_at DESC LIMIT ${Math.min(filter.limit || 500, 500)}`

  return db.prepare(sql).all(...params).map(row => ({ ...row, tags: JSON.parse(row.tags) }))
}

export const deleteExpired = () => {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const maxAge = now - 14 * 86400
  return db.prepare(`DELETE FROM events WHERE (expiry IS NOT NULL AND expiry < ?) OR created_at < ?`)
    .run(now, maxAge).changes
}

export const getMeta = (key) => getDb().prepare('SELECT value FROM relay_meta WHERE key=?').get(key)?.value
export const setMeta = (key, value) => getDb().prepare('INSERT OR REPLACE INTO relay_meta VALUES(?,?)').run(key, value)
