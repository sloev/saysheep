const CACHE = 'saysheep-v2'
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
  if (e.request.method !== 'GET' || e.request.url.includes('wss://')) return

  const url = new URL(e.request.url)
  const sameOrigin = url.origin === self.location.origin

  // App shell (HTML documents / SPA navigations) is network-first so a new
  // deploy lands immediately instead of serving a stale index.html — which
  // would otherwise reference already-deleted hashed chunks and leave the app
  // running old code until a manual reload. Falls back to cache when offline.
  const isShell = e.request.mode === 'navigate' ||
    (sameOrigin && (url.pathname.endsWith('.html') || url.pathname.endsWith('/')))

  if (isShell) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok && sameOrigin) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
          return res
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match('./')))
    )
    return
  }

  // Hashed build assets, images, tiles: cache-first (immutable; the hash changes
  // on update, so a stale copy is never wrong), revalidating in the background.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request)
        .then(res => {
          if (res.ok && sameOrigin) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
