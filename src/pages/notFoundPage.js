import van from "vanjs-core"
import { getStore } from '../store.js'

const { a, div, h3, img, li, nav, p, ul } = van.tags

const store = getStore()

export const NotFoundPage = () => {
    return div({class:"content"},
    "not found"
)
}
