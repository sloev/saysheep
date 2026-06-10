import { generateSecretKey, getPublicKey } from 'nostr-tools'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'

const STORAGE_KEY = 'glean_identity_v1'
let _identity = null

export const getIdentity = () => {
  if (_identity) return _identity
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      const secretKey = hexToBytes(parsed.secretKeyHex)
      _identity = { secretKey, pubkey: parsed.pubkey }
      return _identity
    } catch {}
  }
  const secretKey = generateSecretKey()
  const pubkey = getPublicKey(secretKey)
  _identity = { secretKey, pubkey }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ secretKeyHex: bytesToHex(secretKey), pubkey }))
  return _identity
}

export const getPubkey = () => getIdentity().pubkey
export const getSecretKeyHex = () => bytesToHex(getIdentity().secretKey)
