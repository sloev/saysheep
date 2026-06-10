import createCone from 'van-cone'
import van from 'vanjs-core'

export const routerElement = van.tags.div({ id: 'router-outlet' })
export const cone = createCone({ routerElement })
