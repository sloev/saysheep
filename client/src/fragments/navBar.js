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
import { AlertsPage } from '../pages/alertsPage.js'
import { NotFoundPage } from '../pages/notFoundPage.js'

const { nav, div, img, span } = van.tags

// Register routes
cone.route('home', '/', MapPage, { title: 'Glean' })
cone.route('map', '/map', MapPage, { title: 'Glean | map' })
cone.route('list', '/list', ListPage, { title: 'Glean | list' })
cone.route('new', '/new', NewItemPage, { title: 'Glean | give away' })
cone.route('item', '/item', ItemPage, { title: 'Glean | item' })
cone.route('alerts', '/alerts', AlertsPage, { title: 'Glean | alerts' })
cone.route('settings', '/settings', SettingsPage, { title: 'Glean | settings' })
cone.route('notFound', '.*', NotFoundPage, { title: 'Glean | not found' })

export const NavBar = () => {
  return nav({ class: 'navbar' },
    cone.link({ name: 'map', class: 'nav-link' },
      img({ src: mapImg }), span(t('nav.map'))
    ),
    cone.link({ name: 'list', class: 'nav-link' },
      img({ src: listImg }), span(t('nav.list'))
    ),
    cone.link({ name: 'new', class: 'nav-link nav-new' }, '＋'),
    cone.link({ name: 'alerts', class: 'nav-link' },
      img({ src: bellImg }), span(t('nav.alerts'))
    ),
    div({
      class: 'nav-link',
      onclick: () => cone.navigate('settings', {}),
    }, span('⚙'), span(t('nav.settings')))
  )
}
