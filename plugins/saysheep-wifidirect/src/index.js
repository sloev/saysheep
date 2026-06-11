import { registerPlugin } from '@capacitor/core'

// Web stub — WiFi Direct is not available in browsers
const WifiDirectWeb = {
  async startDiscovery() { return { supported: false } },
  async stopDiscovery() {},
  async connect() { throw new Error('WiFi Direct not available on web') },
  async disconnect() {},
  async sendMessage() { throw new Error('WiFi Direct not available on web') },
  async getConnectionInfo() { return null },
  addListener(event, handler) {
    return { remove: () => {} }
  },
  removeAllListeners() {},
}

const WifiDirect = registerPlugin('WifiDirect', { web: WifiDirectWeb })

export { WifiDirect }
