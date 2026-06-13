import van from 'vanjs-core'
import { store } from '../store.js'
import { setupMap } from '../fragments/map.js'
import { ListPage } from './listPage.js'
const { div } = van.tags

van.derive(() => {
  if (!store.position.loading && store.position.lat && !store.ui.loading) {
    setupMap(store.position.lng, store.position.lat)
  }
})

export const MapPage = () => {
  return div({ class: 'page-content full-height map-page-container' },
    div({ class: 'desktop-sidebar-only' }, ListPage())
  )
}

