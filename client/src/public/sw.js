const CACHE = 'saysheep-v1'
const PRECACHE = ['./', './manifest.json']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  // Network-first for API/WebSocket, cache-first for assets
  if (e.request.url.includes('wss://') || e.request.method !== 'GET') return

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request)
        .then(res => {
          if (res.ok && e.request.url.startsWith(self.location.origin)) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
