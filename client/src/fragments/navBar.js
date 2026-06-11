import van from 'vanjs-core'
import { cone } from '../router.js'
import { t } from '../lib/i18n.js'
import mapImg from '../images/map.png'
import listImg from '../images/list.png'
import newImg from '../images/new.png'
import bellImg from '../images/bell.png'
import { MapPage } from '../pages/mapPage.js'
import { ListPage } from '../pages/listPage.js'
import { NewItemPage } from '../pages/newItemPage.js'
import { ItemPage } from '../pages/itemPage.js'
import { SettingsPage } from '../pages/settingsPage.js'
import { AgentsPage } from '../pages/agentsPage.js'
import { NotFoundPage } from '../pages/notFoundPage.js'

const { nav, div, img, span } = van.tags

// Register routes
cone.route('home', '/', MapPage, { title: 'saysheep' })
cone.route('map', '/map', MapPage, { title: 'saysheep | map' })
cone.route('list', '/list', ListPage, { title: 'saysheep | list' })
cone.route('new', '/new', NewItemPage, { title: 'saysheep | give away' })
cone.route('item', '/item', ItemPage, { title: 'saysheep | item' })
cone.route('agents', '/agents', AgentsPage, { title: 'saysheep | agents' })
cone.route('settings', '/settings', SettingsPage, { title: 'saysheep | settings' })
cone.route('notFound', '.*', NotFoundPage, { title: 'saysheep | not found' })

export const NavBar = () => {
  return nav({ class: 'navbar' },
    cone.link({ name: 'map', class: 'nav-link' },
      img({ src: mapImg }), span(() => t('map'))
    ),
    cone.link({ name: 'list', class: 'nav-link' },
      img({ src: listImg }), span(() => t('list'))
    ),
    cone.link({ name: 'new', class: 'nav-link nav-new' }, '＋'),
    cone.link({ name: 'agents', class: 'nav-link' },
      img({ src: bellImg }), span(() => t('agents'))
    ),
    div({
      class: 'nav-link',
      onclick: () => cone.navigate('settings', {}),
    }, span('⚙'), span(() => t('settings')))
  )
}

