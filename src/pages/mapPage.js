
import van from "vanjs-core"
import { getStore } from '../store.js'
import { Search } from '../fragments/search'

import { Map } from '../fragments/map'
const { a, div, h3, img, li, nav, p, ul } = van.tags

const store = getStore()

export const MapPage = () => {
    return div({ class: "content" },
        Search(),
        Map(),
    )
        
}
