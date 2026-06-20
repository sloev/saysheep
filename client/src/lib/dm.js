import { finalizeEvent, nip44, getPublicKey } from 'nostr-tools'
import { getEventHash, getEventPow } from './nostr.js'

// Small NIP-13 proof-of-work on every DM to deter spam, mirroring the anti-spam
// the old public chat carried. Ingest rejects DMs below this difficulty.
export const DM_POW = 4

// Private item chat. A message is a regular (relay-stored) event whose body is
// NIP-44 encrypted to the recipient, while a few single-char tags stay in clear
// text so relays/peers can route and thread it:
//   p = recipient        e = item event id      i = item stable id (d-tag)
//   o = item owner        g = coarse geohash (peer routing)
// A thread is the triple (item d-tag, owner, taker) — "taker" being whichever
// participant is not the owner. There is one thread per interested user per item.
export const CHAT_KIND = 1442

export const threadKey = (itemId, ownerPubkey, takerPubkey) =>
  `${itemId}|${ownerPubkey}|${takerPubkey}`

export const parseThreadKey = (key) => {
  const [itemId, ownerPubkey, takerPubkey] = (key || '').split('|')
  return { itemId, ownerPubkey, takerPubkey }
}

export const dmRecipient = (event) => event.tags.find(t => t[0] === 'p')?.[1] || null
export const dmItemEventId = (event) => event.tags.find(t => t[0] === 'e')?.[1] || null
export const dmItemId = (event) => event.tags.find(t => t[0] === 'i')?.[1] || null
export const dmOwner = (event) => event.tags.find(t => t[0] === 'o')?.[1] || null

// Build an encrypted DM about an item.
export const buildDMEvent = ({ secretKey, recipientPubkey, itemEventId, itemId, ownerPubkey, geohash, text }) => {
  const convKey = nip44.getConversationKey(secretKey, recipientPubkey)
  const content = nip44.encrypt(text, convKey)
  const now = Math.floor(Date.now() / 1000)
  const tags = [
    ['p', recipientPubkey],
    ['e', itemEventId],
    ['i', itemId],
    ['o', ownerPubkey],
  ]
  if (geohash) tags.push(['g', geohash])

  // Mine NIP-13 PoW (difficulty DM_POW) before finalizing.
  tags.push(['nonce', '', String(DM_POW)])
  const nonceIdx = tags.length - 1
  const baseEvent = { pubkey: getPublicKey(secretKey), created_at: now, kind: CHAT_KIND, content, tags }
  let counter = 0
  while (true) {
    tags[nonceIdx][1] = String(counter)
    if (getEventPow(getEventHash(baseEvent)) >= DM_POW) break
    counter++
  }

  return finalizeEvent({ kind: CHAT_KIND, created_at: now, tags, content }, secretKey)
}

// Decrypt a DM for the given identity. The conversation key is symmetric, so the
// "other party" is the sender when I'm the recipient, else the recipient.
export const decryptDM = (event, secretKey, myPubkey) => {
  const recipient = dmRecipient(event)
  if (event.pubkey !== myPubkey && recipient !== myPubkey) return null // not a participant
  const other = event.pubkey === myPubkey ? recipient : event.pubkey
  if (!other) return null
  try {
    return nip44.decrypt(event.content, nip44.getConversationKey(secretKey, other))
  } catch {
    return null
  }
}

// Normalize an ingested DM event into a thread message, or null if it isn't a
// well-formed DM we're a participant in.
export const toMessage = (event, secretKey, myPubkey) => {
  const recipient = dmRecipient(event)
  const owner = dmOwner(event)
  const itemId = dmItemId(event)
  if (!recipient || !owner || !itemId) return null
  if (event.pubkey !== myPubkey && recipient !== myPubkey) return null
  const text = decryptDM(event, secretKey, myPubkey)
  if (text == null) return null
  // taker = the participant who isn't the owner
  const taker = owner === event.pubkey ? recipient : event.pubkey
  return {
    id: event.id,
    key: threadKey(itemId, owner, taker),
    itemId,
    ownerPubkey: owner,
    takerPubkey: taker,
    sender: event.pubkey,
    fromMe: event.pubkey === myPubkey,
    text,
    created_at: event.created_at,
  }
}
