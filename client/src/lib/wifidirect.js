// Android WiFi Direct mesh layer — wraps the @saysheep/wifidirect Capacitor plugin.
// Falls back gracefully to a no-op on web and iOS.

import van from 'vanjs-core'

let _plugin = null
let _onMessage = null
let _onPeerChange = null
let _listeners = []
let _active = false

// Reactive state exposed to the UI (settingsPage reads these)
export const wifiDirectActive = van.state(false)
export const wifiDirectPeers = van.state([])
export const wifiDirectConnected = van.state(false)
export const wifiDirectIsGroupOwner = van.state(false)
export const wifiDirectGroupOwnerAddress = van.state(null)

const isCapacitorAndroid = () =>
  typeof window !== 'undefined' &&
  window.Capacitor?.getPlatform?.() === 'android'

export const initWifiDirect = async ({ onMessage, onPeerChange }) => {
  if (!isCapacitorAndroid()) return false

  try {
    const { WifiDirect } = await import('@saysheep/wifidirect')
    _plugin = WifiDirect
    _onMessage = onMessage
    _onPeerChange = onPeerChange

    const result = await _plugin.startDiscovery()
    if (!result?.supported) return false

    _listeners.push(
      _plugin.addListener('peersUpdated', ({ peers }) => {
        wifiDirectPeers.val = Array.isArray(peers) ? peers : []
        _onPeerChange?.(peers)
      }),
      _plugin.addListener('connectionChanged', ({ connected, groupOwnerAddress, isGroupOwner }) => {
        wifiDirectConnected.val = !!connected
        wifiDirectIsGroupOwner.val = !!isGroupOwner
        wifiDirectGroupOwnerAddress.val = groupOwnerAddress || null
      }),
      _plugin.addListener('messageReceived', ({ message, from }) => {
        try {
          _onMessage?.(JSON.parse(message), from)
        } catch {}
      }),
    )

    _active = true
    wifiDirectActive.val = true
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
  wifiDirectActive.val = false
  wifiDirectConnected.val = false
  wifiDirectPeers.val = []
  wifiDirectIsGroupOwner.val = false
  wifiDirectGroupOwnerAddress.val = null
}

export const connectWifiPeer = (address) =>
  _plugin?.connect({ address }).catch(() => {})

export const sendWifiMessage = (message) => {
  if (!_plugin || !_active) return false
  _plugin.sendMessage({ message: JSON.stringify(message) }).catch(() => {})
  return true
}

export const isWifiDirectActive = () => _active
