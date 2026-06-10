export const isWebXDC = () => typeof window !== 'undefined' && typeof window.webxdc !== 'undefined'

export const webxdcSend = (payload) => {
  if (!isWebXDC()) return
  window.webxdc.sendUpdate({ payload }, '')
}

export const webxdcListen = (callback) => {
  if (!isWebXDC()) return
  window.webxdc.setUpdateListener(({ payload }) => {
    if (payload) callback(payload)
  }, 0)
}

export const getWebXDCSelfAddr = () => {
  if (!isWebXDC()) return null
  return window.webxdc.selfAddr
}
