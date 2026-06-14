import van from 'vanjs-core'
import * as vanX from 'vanjs-ext'
import { store, getFilteredItems } from '../store.js'
import { ListItem } from '../fragments/listItem.js'
import { ConnStatus } from '../fragments/connStatus.js'
import { t } from '../lib/i18n.js'
const { div, input, span } = van.tags

export const ListPage = () => {
  const sortedItems = vanX.reactive({})
  const settled = van.state(false)

  van.derive(() => {
    if (store.ui.cacheLoaded || Object.keys(store.items).length > 0) {
      settled.val = true
    }
  })

  van.derive(() => {
    if (!store.position.loading) {
      setTimeout(() => {
        settled.val = true
      }, 800)
    }
  })

  van.derive(() => {
    const _items = store.items
    const _query = store.ui.searchQuery

    const list = getFilteredItems().sort((a, b) => b.created_at - a.created_at)

    Promise.resolve().then(() => {
      vanX.replace(sortedItems, () => list.map(item => [item.id, item]))
    })
  })

  const metaInfo = div({
    class: 'list-meta-info',
    style: 'padding: 6px 12px; font-size: 12px; font-weight: 700; color: var(--muted); display: flex; justify-content: space-between; background: var(--bg); border: 1.5px solid var(--ink); border-radius: 8px; margin-bottom: 12px; box-shadow: var(--shadow-sm);'
  },
    span(() => t('list.showing_count', { count: getFilteredItems().length })),
    span(() => t('list.total_count', { count: Object.keys(store.items).length }))
  )

  return div({ class: 'page-content' },
    div({ class: 'page-header' },
      div({ class: 'page-title' }, () => t('list')),
      div({ class: 'mobile-only' }, ConnStatus())
    ),
    div({ class: 'search-bar' },
      input({
        class: 'search-input',
        type: 'search',
        placeholder: () => t('list.search'),
        value: store.ui.searchQuery,
        oninput: e => { store.ui.searchQuery = e.target.value },
      })
    ),
    metaInfo,
    () => {
      if (store.position.loading || !settled.val) {
        return div({ class: 'list-empty' },
          span({ class: 'empty-emoji' }, '⏳'),
          t('list.loading')
        )
      }
      const itemsCount = getFilteredItems().length
      if (!itemsCount) {
        return div({ class: 'list-empty' },
          span({ class: 'empty-emoji' }, '📭'),
          t('list.empty')
        )
      }
      return vanX.list(() => div({ class: 'list-container' }), sortedItems, (itemState) => {
        return ListItem(itemState.val)
      })
    }
  )
}
