
import van from "vanjs-core"
import { getDb } from '../db/db.js'
import { getStore } from '../store.js'
import {ListItem} from '../fragments/listItem.js'
import BellImage  from '../images/bell.png'

const { a, div, h3, img, li, nav, p, ul } = van.tags

const db = getDb();
const store = getStore()


export const ListPage = () => {
    const items = [
        {"title":"sofa","image":BellImage, "verified": true,"description":"some nice sofa", "lnglat":[-74.5, 40], "messages":0, "date": new Date()},
        {"title":"chair","image":BellImage, "verified": false,"description":"some nice sofa", "lnglat":[-74.5, 40], "messages": 0, "date": new Date()},
        {"title":"sofa","image":BellImage, "verified": true,"description":"some nice sofa", "lnglat":[-74.5, 40], "messages": 0, "date": new Date()},

    ]
    return div({class:"content"},
        items.map(item=>{
            return ListItem(item)
        })
    )
}