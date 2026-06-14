/*
 * SCOPE STATEMENT:
 * This file and its perceptual hashing/denylist moderation tools are used for
 * OPERATOR-POLICY moderation only (spam, abusive imagery, operator-defined NSFW limits).
 * CSAM (Child Sexual Abuse Material) detection is explicitly out of scope for
 * this self-curated denylist stack. CSAM reports are handled strictly via
 * authorities (tiplines / politi.dk) and local muting, without storing
 * or auto-matching CSAM hashes on-device or on the relay.
 *
 * ALGORITHM CHOICE: Hand-rolled 2D DCT-II perceptual hash (64-bit) with Hamming distance.
 *
 * ABUSE WARNING: Coordinated false reports (Sybil attacks) can abuse auto_block.
 * Keep auto_block: false (default) for operator validation in production.
 */

import fs from 'fs'
import crypto from 'crypto'
import sharp from 'sharp'
import config from './config.js'
import { getDb } from './db.js'

let denylist = [] // Array of { sha256, phash, reason }

export function loadDenylist() {
  denylist = []
  const filePath = config.moderation?.denylist_path || 'denylist.csv'
  if (!fs.existsSync(filePath)) {
    return
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8')
    const lines = data.split('\n')
    for (const line of lines) {
      const parts = line.trim().split(',')
      if (parts.length >= 2) {
        const sha = parts[0].trim()
        const ph = parts[1].trim()
        const reason = parts[2]?.trim() || ''
        if (sha.length === 64 && ph.length === 16) {
          denylist.push({ sha256: sha, phash: ph, reason })
        }
      }
    }
  } catch (err) {
    console.error('Failed to load denylist:', err)
  }
}

export function appendToDenylist(sha256, phash, reason) {
  const filePath = config.moderation?.denylist_path || 'denylist.csv'
  try {
    fs.appendFileSync(filePath, `${sha256},${phash},${reason}\n`, 'utf8')
    denylist.push({ sha256, phash, reason })
  } catch (err) {
    console.error('Failed to append to denylist:', err)
  }
}

function dctHash(matrix) {
  const N = 32
  const dct = Array.from({ length: 8 }, () => new Float32Array(8))
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++) {
        const cosX = Math.cos(((2 * x + 1) * u * Math.PI) / 64)
        for (let y = 0; y < N; y++) {
          const cosY = Math.cos(((2 * y + 1) * v * Math.PI) / 64)
          sum += matrix[x * N + y] * cosX * cosY
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1
      dct[u][v] = (sum * cu * cv) / 16
    }
  }

  const coeffs = []
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      if (u === 0 && v === 0) continue
      coeffs.push(dct[u][v])
    }
  }

  const sorted = [...coeffs].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]

  let hex = ""
  for (let i = 0; i < 8; i++) {
    let byte = 0
    for (let j = 0; j < 8; j++) {
      const val = dct[i][j]
      const bit = val > median ? 1 : 0
      byte = (byte << 1) | bit
    }
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

export function extractImages(event) {
  if (!event?.tags) return []
  const imgTags = event.tags.filter(t => t[0] === 'image')
  const results = []
  for (const tag of imgTags) {
    const dataUrl = tag[1]
    if (!dataUrl) continue
    const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
    if (match) {
      try {
        const bytes = Buffer.from(match[1], 'base64')
        const sha = crypto.createHash('sha256').update(bytes).digest('hex')
        results.push({ bytes, sha256: sha })
      } catch (err) {
        console.error('Failed to parse base64 image:', err)
      }
    }
  }
  return results
}

export async function phashFromBytes(buffer) {
  try {
    const raw = await sharp(buffer)
      .grayscale()
      .resize(32, 32, { fit: 'fill' })
      .raw()
      .toBuffer()

    const matrix = new Float32Array(1024)
    for (let i = 0; i < 1024; i++) {
      matrix[i] = raw[i]
    }
    return dctHash(matrix)
  } catch (err) {
    console.error('phashFromBytes failed:', err)
    return null
  }
}

export function hamming(a, b) {
  let dist = 0
  for (let i = 0; i < 16; i += 2) {
    const val1 = parseInt(a.substring(i, i + 2), 16)
    const val2 = parseInt(b.substring(i, i + 2), 16)
    let diff = val1 ^ val2
    while (diff > 0) {
      if (diff & 1) dist++
      diff >>>= 1
    }
  }
  return dist
}

export function isDeniedSync(event) {
  if (!config.moderation?.enabled) return false
  const images = extractImages(event)
  for (const img of images) {
    if (denylist.some(d => d.sha256 === img.sha256)) {
      return true
    }
  }
  return false
}

export async function screenEvent(event) {
  if (!config.moderation?.enabled) return { ok: true }
  
  const images = extractImages(event)
  for (const img of images) {
    // Exact SHA-256 denylist match
    if (denylist.some(d => d.sha256 === img.sha256)) {
      return { ok: false, reason: 'blocked' }
    }
    
    // Perceptual hash check (Hamming threshold)
    const phash = await phashFromBytes(img.bytes)
    if (phash) {
      const threshold = config.moderation?.phash_threshold ?? 10
      for (const entry of denylist) {
        if (entry.phash && hamming(phash, entry.phash) <= threshold) {
          return { ok: false, reason: 'blocked' }
        }
      }
    }
  }
  return { ok: true }
}

export function getEventById(id) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id)
  if (row) {
    row.tags = JSON.parse(row.tags)
    return row
  }
  return null
}

export function deleteEventById(id) {
  const db = getDb()
  db.prepare('DELETE FROM events WHERE id = ?').run(id)
}

export async function handleReportAdded(targetId, reason) {
  if (!config.moderation?.enabled) return
  
  const db = getDb()
  const allowedReasons = ['nudity', 'spam', 'harassment']
  
  if (reason === 'illegal') {
    const illegalCount = db.prepare("SELECT COUNT(*) as c FROM reports WHERE target_id = ? AND reason = 'illegal'").get(targetId)?.c || 0
    console.warn(`[moderation] Target ${targetId} flagged as ILLEGAL. Count: ${illegalCount}. Operator review required.`)
    return
  }
  
  if (!allowedReasons.includes(reason)) return
  
  const allowedCount = db.prepare(`
    SELECT COUNT(*) as c FROM reports
    WHERE target_id = ? AND reason IN ('nudity', 'spam', 'harassment')
  `).get(targetId)?.c || 0
  
  const threshold = config.moderation?.report_threshold ?? 3
  if (allowedCount >= threshold) {
    if (config.moderation?.auto_block) {
      const target = getEventById(targetId)
      if (target) {
        const images = extractImages(target)
        for (const img of images) {
          const phash = await phashFromBytes(img.bytes)
          if (phash) {
            appendToDenylist(img.sha256, phash, `auto-blocked-by-reports-${reason}`)
            console.log(`[moderation] Auto-blocked item ${targetId} and appended sha256: ${img.sha256}, phash: ${phash} to denylist.`)
          }
        }
        deleteEventById(targetId)
      }
    } else {
      console.log(`[moderation] Target ${targetId} reached report threshold of ${threshold} (${allowedCount} reports). Queued for operator review.`)
    }
  }
}

export function getReportStats() {
  const db = getDb()
  try {
    const rows = db.prepare(`
      SELECT target_id, reason, COUNT(*) as count
      FROM reports
      GROUP BY target_id, reason
    `).all()
    return rows
  } catch {
    return []
  }
}

// Initialize denylist on startup
loadDenylist()
