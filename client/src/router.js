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

export const routerElement = van.tags.div({ id: 'router-outlet' })
export const cone = createCone({
  routerElement,
  routerConfig: {
    prefix
  }
})

