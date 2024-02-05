import createCone from 'van-cone';
import van from "vanjs-core"
import { MapPage } from './pages/mapPage'
import { ListPage } from './pages/listPage'
import { SearchPage } from './pages/searchPage'
import { NotFoundPage } from './pages/notFoundPage'
import { NewItemPage } from './pages/newItemPage'
import { TvPage } from './pages/tvPage'
import tvImage from './images/tv.png'
import iconImage from './images/icon.png'
import bellImage from './images/bell.png'
import listImage from './images/list.png'
import mapImage from './images/map.png'
import binocularsImage from './images/binoculars.png'
import newImage from './images/new.png'
const { a, div, h3, img, li, nav, p, ul } = van.tags




// create the spa object
export const routerElement = div({ id: 'layout', class: "content-container" })
const { link, route } = createCone({ routerElement: routerElement })

route('home', '/', MapPage, { title: 'SaySheep' })
route('mapItem', '/map/', MapPage, { title: 'SaySheep | map' })
route('list', '/list', ListPage, { title: 'SaySheep | list' })
route('search', '/search', SearchPage, { title: 'SaySheep | search' })
route('new', '/new', NewItemPage, { title: 'SaySheep | new' })
route('tv', '/tv', TvPage, { title: 'SaySheep | tv' })
route('notFound', '.*', NotFoundPage, { title: 'SaySheep| Not Found' })


export const navBar = () => {
    return nav({ class: "navbar" },
        div({ class: 'navbar-icon' }, img({ src: iconImage })),
        div(),
        link({ name: 'home', class: 'navbar-link' }, img({ src: mapImage })),
        link({ name: 'list', class: 'navbar-link' }, img({ src: listImage })),
        link({ name: 'search', class: 'navbar-link' }, img({ src: binocularsImage })),
        link({ name: 'new', class: 'navbar-link' }, img({ src: newImage })),
        link({ name: 'tv', class: 'navbar-link' }, img({ src: tvImage })),
    )
}

