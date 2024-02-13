import van from "vanjs-core"

import { MapPage } from '../pages/mapPage'
import { ListPage } from '../pages/listPage'
import { NotFoundPage } from '../pages/notFoundPage'
import { NewItemPage } from '../pages/newItemPage'
import { TvPage } from '../pages/tvPage'
import tvImage from '../images/tv.png'
import iconImage from '../images/icon.png'
import bellImage from '../images/bell.png'
import listImage from '../images/list.png'
import mapImage from '../images/map.png'
import newImage from '../images/new.png'
import {cone} from '../router.js'

const { a, div, h3, img, li, nav, p, ul } = van.tags


cone.route('home', '/', MapPage, { title: 'SaySheep' })
cone.route('map', '/map', MapPage, { title: 'SaySheep | map' })
cone.route('list', '/list', ListPage, { title: 'SaySheep | list' })
cone.route('new', '/new', NewItemPage, { title: 'SaySheep | new' })
cone.route('tv', '/tv', TvPage, { title: 'SaySheep | tv' })
cone.route('notFound', '.*', NotFoundPage, { title: 'SaySheep| Not Found' })


export const navBar = () => {
    return nav({ class: "navbar" },
        div({ class: 'navbar-icon' }, img({ src: iconImage })),
        div(),
        cone.link({ name: 'map', class: 'navbar-link' }, img({ src: mapImage })),
        cone.link({ name: 'list', class: 'navbar-link' }, img({ src: listImage })),
        cone.link({ name: 'new',class: 'navbar-link' }, img({ src: newImage })),
        cone.link({ name: 'tv', class: 'navbar-link' }, img({ src: tvImage })),
    )
}

