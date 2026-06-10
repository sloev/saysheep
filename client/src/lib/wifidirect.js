// Android WiFi Direct mesh layer — wraps the @glean/wifidirect Capacitor plugin.
// Falls back gracefully to a no-op on web and iOS.

let _plugin = null
let _onMessage = null
let _onPeerChange = null
let _listeners = []
let _active = false

const isCapacitorAndroid = () =>
  typeof window !== 'undefined' &&
  window.Capacitor?.getPlatform?.() === 'android'

export const initWifiDirect = async ({ onMessage, onPeerChange }) => {
  if (!isCapacitorAndroid()) return false

  try {
    const { WifiDirect } = await import('@glean/wifidirect')
    _plugin = WifiDirect
    _onMessage = onMessage
    _onPeerChange = onPeerChange

    const result = await _plugin.startDiscovery()
    if (!result?.supported) return false

    _listeners.push(
      _plugin.addListener('peersUpdated', ({ peers }) => {
        _onPeerChange?.(peers)
      }),
      _plugin.addListener('connectionChanged', ({ connected, groupOwnerAddress, isGroupOwner }) => {
        // Connection state change is handled by WifiDirectManager natively
        // but surface it here for diagnostics
      }),
      _plugin.addListener('messageReceived', ({ message, from }) => {
        try {
          _onMessage?.(JSON.parse(message), from)
        } catch {}
      }),
    )

    _active = true
    return true
  } catch {
    return false
  }
}

export const stopWifiDirect = async () => {
  if (!_plugin) return
  _listeners.forEach(l => l.remove())
  _listeners = []
  await _plugin.stopDiscovery().catch(() => {})
  await _plugin.disconnect().catch(() => {})
  _active = false
}

export const connectWifiPeer = (address) =>
  _plugin?.connect({ address }).catch(() => {})

export const sendWifiMessage = (message) => {
  if (!_plugin || !_active) return false
  _plugin.sendMessage({ message: JSON.stringify(message) }).catch(() => {})
  return true
}

export const isWifiDirectActive = () => _active
