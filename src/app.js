import van from "vanjs-core"


import config from './config.json'
import creds from './creds.client.json'

import { setupDb } from './db/db.js'
import { setupMap } from './fragments/map.js'
import { getStore } from './store.js'
import {Loading} from './fragments/loading'
import {navBar, routerElement, cone} from './router.js'


const store = getStore()
const db = setupDb(config, creds)
setupMap()

const { a, div, h3, img, li, nav, p, ul } = van.tags







const App = () => {
    return div(div({class: "container"},
        navBar(),
        routerElement,
    ),
        Loading(),
        )
}

document.body.replaceChildren(App());
