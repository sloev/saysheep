import van from 'vanjs-core'
import { initStore, store } from './store.js'
import { Loading } from './fragments/loading.js'
import { NavBar } from './fragments/navBar.js'
import { TopBar } from './fragments/topBar.js'
import { routerElement, cone } from './router.js'
import { MapComponent, MapSearchBox, MapControls } from './fragments/map.js'
import { t } from './lib/i18n.js'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  )
}

const { div, span, button } = van.tags

const App = () => {
  const initDone = van.state(false)

  initStore().then(() => { initDone.val = true })

  const loading = van.derive(() => {
    if (!initDone.val) return true
    if (store.position.loading) return true
    return false
  })

  return div({
    id: 'app',
    class: () => 'route-' + cone.currentPage.val
  },
    Loading(loading),
    TopBar(),
    div({ id: 'global-map-container' },
      MapComponent(),
      MapSearchBox(),
      MapControls(),
    ),
    div({ id: 'main-layout' },
      div({ class: 'desktop-sidebar-header' },
        span({ class: 'desktop-sidebar-title' }, 'saysheep'),
        button({
          class: 'btn btn-primary btn-give-away',
          onclick: () => cone.navigate('new', {})
        }, '＋ ', () => t('nav.new'))
      ),
      div({ id: 'main-content' }, routerElement),
      NavBar(),
    )
  )
}

document.body.replaceChildren(App())

