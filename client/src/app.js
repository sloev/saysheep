import van from 'vanjs-core'
import { initStore } from './store.js'
import { Loading } from './fragments/loading.js'
import { NavBar } from './fragments/navBar.js'
import { routerElement } from './router.js'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  )
}

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
