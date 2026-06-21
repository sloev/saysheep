import van from 'vanjs-core'

// Direct download for the signed Android build attached to the latest GitHub
// release (the asset name is stable: app-release-unsigned-signed.apk).
export const ANDROID_APK_URL =
  'https://github.com/sloev/saysheep/releases/latest/download/app-release-unsigned-signed.apk'

let _deferred = null
export const installAvailable = van.state(false)

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

export const isCapacitorNative = () =>
  typeof window !== 'undefined' &&
  window.Capacitor?.isNativePlatform?.() === true

export const isIOS = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream

if (typeof window !== 'undefined') {
  // Chrome/Android/desktop fire this when the PWA is installable; stash it so a
  // button can trigger the native prompt on demand.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    _deferred = e
    installAvailable.val = true
  })
  window.addEventListener('appinstalled', () => {
    _deferred = null
    installAvailable.val = false
  })
}

export const promptInstall = async () => {
  if (!_deferred) return false
  _deferred.prompt()
  const { outcome } = await _deferred.userChoice
  _deferred = null
  installAvailable.val = false
  return outcome === 'accepted'
}
