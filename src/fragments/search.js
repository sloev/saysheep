import van from "vanjs-core"
const { button, div, img, input } = van.tags

import { getStore } from '../store.js'
import binocularsImage from '../images/binoculars.png'

const store = getStore()

export const Search = () => {
    return div({ class: "searchbar" },
        input({ class:"search",type: "search", placeholder: "search" }),
        img({ class:"submit",src: binocularsImage })
    )
}
