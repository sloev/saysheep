import van from 'vanjs-core'
import { initStore, store } from './store.js'
import { Loading } from './fragments/loading.js'
import { NavBar } from './fragments/navBar.js'
import { routerElement } from './router.js'

const { div } = van.tags

const App = () => {
  const loading = van.state(true)

  initStore().then(() => { loading.val = false })

  return div({ id: 'app' },
    Loading(loading),
    div({ class: 'page-content', id: 'main-content' }, routerElement),
    NavBar(),
  )
}

document.body.replaceChildren(App())
