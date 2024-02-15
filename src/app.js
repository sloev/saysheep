import van from "vanjs-core"


import { getStore } from './store.js'
import {Loading} from './fragments/loading'
import {routerElement} from './router.js'
import { navBar } from "./fragments/navBar.js"


const store = getStore()

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
