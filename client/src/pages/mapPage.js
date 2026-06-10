import van from 'vanjs-core'
import { store } from '../store.js'
import { MapComponent, setupMap } from '../fragments/map.js'
import { ConnStatus } from '../fragments/connStatus.js'
const { div } = van.tags

export const MapPage = () => {
  van.derive(() => {
    if (!store.position.loading && store.position.lat && !store.ui.loading) {
      setupMap(store.position.lng, store.position.lat)
    }
  })

  return div({ class: 'page-content full-height' },
    div({ class: 'map-wrapper' },
      MapComponent(),
    ),
    div({ style: 'position:absolute;top:8px;left:8px;z-index:10' },
      ConnStatus()
    )
  )
}
