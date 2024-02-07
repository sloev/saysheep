
import van from "vanjs-core"
import { getDb } from '../db/db.js'
import { getStore } from '../store.js'
import { ListItem } from '../fragments/listItem.js'
import BellImage from '../images/bell.png'

const { a, div, h3, img, li, nav, p, ul } = van.tags

const db = getDb();
const store = getStore()


export const ListPage = () => {
    const items = [
        { id: 1, "title": "sofa", "image": BellImage, "verified": true, "description": "some nice sofa", "geo": {lng:74.5, lat:40}, "messages": 0, "date": new Date(Date.now()-Math.random()*100000) },
        { id: 2, "title": "sofa", "image": BellImage, "verified": true, "description": "some nice sofa", "geo": {lng:74.5, lat:40}, "messages": 0, "date": new Date(Date.now()-Math.random()*100000) },
        { id: 3, "title": "sofa", "image": BellImage, "verified": true, "description": "some nice sofa", "geo": {lng:74.5, lat:40}, "messages": 0, "date": new Date(Date.now()-Math.random()*100000) },
        { id: 4, "title": "sofa", "image": BellImage, "verified": true, "description": "some nice sofa", "geo": {lng:74.5, lat:40}, "messages": 0, "date": new Date(Date.now()-Math.random()*100000) },
        { id: 5, "title": "sofa", "image": BellImage, "verified": true, "description": "some nice sofa", "geo": {lng:74.5, lat:40}, "messages": 0, "date": new Date(Date.now()-Math.random()*100000) },
        { id: 6, "title": "sofa", "image": BellImage, "verified": true, "description": "some nice sofa", "geo": {lng:74.5, lat:40}, "messages": 0, "date": new Date(Date.now()-Math.random()*100000) },
        { id: 7, "title": "chair", "image": BellImage, "verified": false, "description": "some nice sofa", "geo": {lng:-74.5, lat:40}, "messages": 0, "date": new Date(Date.now()-Math.random()*100000) },
        { id: 8, "title": "sofa", "image": BellImage, "verified": true, "description": "description description description description description description description description description description description description description description description description descriptiondescription descriptiondescriptiondescription", "geo": {lng:-74.5, lat:40}, "messages": 10, "date": new Date(Date.now()-Math.random()*100000) },

    ]
    return div({ class: "content" },
        items.map(ListItem)
    )
}