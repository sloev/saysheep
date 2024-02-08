import van from "vanjs-core"
const { button, div, img, input } = van.tags

import { getStore, updateQuery } from '../store.js'

const store = getStore()

export const Search = () => {
    return div({ class: "searchbar" },
        input({ class: "search", type: "search", 
        placeholder: "search",value: store.query, oninput: e => updateQuery(e.target.value) }),
    )
}
