import van from 'vanjs-core'
import * as vanX from 'vanjs-ext'
import { store, getFilteredItems } from '../store.js'
import { ListItem } from '../fragments/listItem.js'
import { ConnStatus } from '../fragments/connStatus.js'
import { t } from '../lib/i18n.js'
const { div, input, span } = van.tags

export const ListPage = () => {
  return div({ class: 'page-content' },
    div({ class: 'page-header' },
      div({ class: 'page-title' }, t('list')),
      div({ class: 'mobile-only' }, ConnStatus())
    ),
    div({ class: 'search-bar' },
      input({
        class: 'search-input',
        type: 'search',
        placeholder: t('list.search'),
        value: store.ui.searchQuery,
        oninput: e => { store.ui.searchQuery = e.target.value },
      })
    ),
    () => {
      if (store.position.loading) {
        return div({ class: 'list-empty' },
          span({ class: 'empty-emoji' }, '⏳'),
          t('list.loading')
        )
      }
      const items = getFilteredItems()
      const totalCount = Object.keys(store.items).length
      
      const metaInfo = div({ class: 'list-meta-info', style: 'padding: 6px 12px; font-size: 12px; font-weight: 700; color: var(--muted); display: flex; justify-content: space-between; background: var(--bg); border: 1.5px solid var(--ink); border-radius: 8px; margin-bottom: 12px; box-shadow: var(--shadow-sm);' },
        span(`Showing ${items.length} items inside map view`),
        span(`Total: ${totalCount}`)
      )

      if (!items.length) {
        return div({ style: 'display: flex; flex-direction: column;' },
          metaInfo,
          div({ class: 'list-empty' },
            span({ class: 'empty-emoji' }, '📭'),
            t('list.empty')
          )
        )
      }
      return div({ style: 'display: flex; flex-direction: column;' },
        metaInfo,
        div({ class: 'list-container' },
          ...items
            .sort((a, b) => b.created_at - a.created_at)
            .map(ev => ListItem(ev))
        )
      )
    }
  )
}
