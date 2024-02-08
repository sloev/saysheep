
import van from "vanjs-core"
import * as vanX from "vanjs-ext"

import { getDb } from '../db/db.js'
import { getStore } from '../store.js'
import { ListItem } from '../fragments/listItem.js'
import { Search } from '../fragments/search'

const { a, div, h3, img, li, nav, p, ul } = van.tags

const db = getDb();
const store = getStore()


export const ListPage = () => {

    return div({ class: "content" },
        Search(),
        vanX.list(div, store.matchedIds, ({val:v}) => ListItem(store.items[v])),        
    )
}