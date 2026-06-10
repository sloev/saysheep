export const createLogger = (namespace) => ({
  info: (...args) => console.log(`[${namespace}]`, ...args),
  error: (...args) => console.error(`[${namespace}]`, ...args),
  warn: (...args) => console.warn(`[${namespace}]`, ...args),
})
