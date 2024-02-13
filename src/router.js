import createCone from 'van-cone';
import van from "vanjs-core"

const { a, div, h3, img, li, nav, p, ul } = van.tags




// create the spa object
export const routerElement = div({ id: 'layout' })
export const cone = createCone({ routerElement: routerElement })
