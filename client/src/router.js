import createCone from 'van-cone'
import van from 'vanjs-core'

let base = ''
if (typeof window !== 'undefined') {
  if (window.location.pathname.startsWith('/saysheep')) {
    base = '/saysheep'
  }
} else {
  base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
}
const prefix = typeof window !== 'undefined' ? window.location.origin + base : base

// Canonical, shareable deep link to an item (stable d-tag in the path). Built
// here because it needs the same base prefix the router uses.
export const itemUrl = (id) =>
  `${typeof window !== 'undefined' ? window.location.origin : ''}${base}/item/${encodeURIComponent(id)}`

// The link to SHARE for an item. When VITE_OG_BASE points at a public relay
// (e.g. https://relay.example.com), share the relay's /i/<d-tag> preview URL so
// chat/social crawlers unfurl a rich card (title, description, photo) and real
// browsers get bounced on to the PWA. Without it, share the canonical PWA link.
const _ogBase = (import.meta.env?.VITE_OG_BASE || '').replace(/\/$/, '')
export const shareUrl = (id) =>
  _ogBase ? `${_ogBase}/i/${encodeURIComponent(id)}` : itemUrl(id)

// Absolute path to a static asset under the app base. Needed because a bare
// relative src ("images/x.png") resolves against the current SPA route
// (e.g. /saysheep/list/) and 404s on every non-root route.
export const assetUrl = (path) => `${base}/${path.replace(/^\//, '')}`

export const routerElement = van.tags.div({ id: 'router-outlet' })
export const cone = createCone({
  routerElement,
  routerConfig: {
    prefix
  }
})

