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

export const importIdentity = (secretKeyHex) => {
  const secretKey = hexToBytes(secretKeyHex)
  const pubkey = getPublicKey(secretKey)
  _identity = { secretKey, pubkey }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ secretKeyHex, pubkey }))
  return _identity
}

export const isWebAuthnSupported = () => {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'
}

export const hasPasskey = () => {
  return typeof localStorage !== 'undefined' && !!localStorage.getItem('glean_passkey_cred_id')
}

export const registerPasskey = async () => {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn not supported')
  const challenge = new Uint8Array(32)
  window.crypto.getRandomValues(challenge)
  const userId = new Uint8Array(16)
  window.crypto.getRandomValues(userId)

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Glean' },
      user: {
        id: userId,
        name: 'user@glean.pwa',
        displayName: 'Glean PWA User'
      },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }], // ES256
      authenticatorSelection: {
        userVerification: 'preferred',
        residentKey: 'required',
        requireResidentKey: true
      }
    }
  })

  if (credential) {
    const rawId = bytesToHex(new Uint8Array(credential.rawId))
    localStorage.setItem('glean_passkey_cred_id', rawId)
    return rawId
  }
  return null
}

export const verifyPasskey = async () => {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn not supported')
  const credId = localStorage.getItem('glean_passkey_cred_id')
  if (!credId) throw new Error('No passkey registered')

  const challenge = new Uint8Array(32)
  window.crypto.getRandomValues(challenge)

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [{
        type: 'public-key',
        id: hexToBytes(credId)
      }],
      userVerification: 'preferred'
    }
  })

  return !!assertion
}

export const clearPasskey = () => {
  localStorage.removeItem('glean_passkey_cred_id')
}

