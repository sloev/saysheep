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

export const routerElement = van.tags.div({ id: 'router-outlet' })
export const cone = createCone({
  routerElement,
  routerConfig: {
    prefix
  }
})

