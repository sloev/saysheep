// In-app update checker for the Capacitor Android build.
// Compares the build-time version (VITE_APP_VERSION, injected by vite.config.js
// from package.json) against the latest GitHub release tag. When a newer version
// exists, pushes an in-app notification with a direct APK download link.
//
// On the web (non-Capacitor) this module is a harmless no-op.

import van from 'vanjs-core'
import { isCapacitorNative, ANDROID_APK_URL } from './pwaInstall.js'

const GITHUB_API = 'https://api.github.com/repos/sloev/saysheep/releases/latest'
const CHECK_INTERVAL = 24 * 60 * 60 * 1000 // once per day
const LS_KEY = 'saysheep_update_check'

// Build-time version injected by Vite's `define` (see vite.config.js).
// Falls back to '0.0.0' during dev / if not set.
const currentVersion = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0')

export const updateAvailable = van.state(null) // null | { tag, url }

// Simple semver compare: returns true if remote > local.
const isNewer = (remote, local) => {
  const parse = (v) => (v || '').replace(/^v/, '').split('.').map(Number)
  const r = parse(remote)
  const l = parse(local)
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true
    if ((r[i] || 0) < (l[i] || 0)) return false
  }
  return false
}

export const checkForUpdate = async () => {
  if (!isCapacitorNative()) return null

  // Throttle: at most once per CHECK_INTERVAL
  const lastCheck = parseInt(localStorage.getItem(LS_KEY) || '0')
  if (Date.now() - lastCheck < CHECK_INTERVAL) return null

  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 5000)
    const res = await fetch(GITHUB_API, {
      signal: ctrl.signal,
      headers: { 'Accept': 'application/vnd.github+json' },
    })
    clearTimeout(to)
    if (!res.ok) return null

    const data = await res.json()
    const tag = data.tag_name || ''
    localStorage.setItem(LS_KEY, String(Date.now()))

    if (isNewer(tag, currentVersion)) {
      // Find the signed APK asset, or fall back to the stable URL
      const apk = data.assets?.find(a => a.name?.endsWith('.apk'))
      const url = apk?.browser_download_url || ANDROID_APK_URL
      updateAvailable.val = { tag, url }
      return { tag, url }
    }
  } catch {}
  return null
}

export const getAppVersion = () => currentVersion
