
import van from "vanjs-core"
import { getDb } from '../db/db.js'
import { getStore } from '../store.js'
import { ListItem } from '../fragments/listItem.js'

const { a, div, h3, img, li, nav, p, ul } = van.tags

const db = getDb();
const store = getStore()


export const ListPage = () => {
    return div({ class: "content" },
        Object.values(store.items).map(ListItem)
    )
}