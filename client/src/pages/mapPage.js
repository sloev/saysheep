import van from 'vanjs-core'
import { store } from '../store.js'
import { setupMap } from '../fragments/map.js'
import { ConnStatus } from '../fragments/connStatus.js'
import { ListPage } from './listPage.js'
const { div } = van.tags

export const MapPage = () => {
  van.derive(() => {
    if (!store.position.loading && store.position.lat && !store.ui.loading) {
      setupMap(store.position.lng, store.position.lat)
    }
  })

  return div({ class: 'page-content full-height map-page-container' },
    div({ class: 'desktop-sidebar-only' }, ListPage()),
    div({ style: 'position:absolute;top:70px;left:10px;z-index:10' },
      ConnStatus()
    )
  )
}

