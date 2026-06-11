import createCone from 'van-cone'
import van from 'vanjs-core'

const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const prefix = typeof window !== 'undefined' ? window.location.origin + base : base

export const routerElement = van.tags.div({ id: 'router-outlet' })
export const cone = createCone({
  routerElement,
  routerConfig: {
    prefix
  }
})

