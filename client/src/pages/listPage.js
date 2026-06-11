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
      if (!items.length) {
        return div({ class: 'list-empty' },
          span({ class: 'empty-emoji' }, '📭'),
          t('list.empty')
        )
      }
      return div({ class: 'list-container' },
        ...items
          .sort((a, b) => b.created_at - a.created_at)
          .map(ev => ListItem(ev))
      )
    }
  )
}
