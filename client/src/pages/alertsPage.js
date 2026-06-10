import van from 'vanjs-core'
import { store, addSubscription, removeSubscription } from '../store.js'
import { encodeGeohash } from '../lib/geo.js'
import { t } from '../lib/i18n.js'
import { TagInput } from '../fragments/tagInput.js'
const { div, button, span, h2, p } = van.tags

export const AlertsPage = () => {
  const newTags = van.state([])

  const addAlert = () => {
    if (store.position.loading || !store.position.lat) return
    const gh = encodeGeohash(store.position.lat, store.position.lng, 5)
    addSubscription(gh, [...newTags.val], gh)
    newTags.val = []
  }

  return div({ class: 'page-content' },
    div({ class: 'page-header' },
      div({ class: 'page-title' }, t('alerts.heading'))
    ),
    div({ class: 'form-section' },
      p({ style: 'font-size:13px;color:var(--muted);line-height:1.5' },
        'Subscribe to categories in your current area. You\'ll see matching items when you open the app.'
      ),
      div({ class: 'form-label' }, 'categories to watch'),
      TagInput({ tags: newTags }),
      button({
        class: 'btn btn-submit',
        onclick: addAlert,
        disabled: () => store.position.loading,
      }, t('alerts.add'))
    ),
    div({ class: 'list-container' },
      () => {
        const subs = store.subscriptions || []
        if (!subs.length) return div({ class: 'list-empty' },
          span({ class: 'empty-emoji' }, '🔔'),
          t('alerts.empty')
        )
        return div({ style: 'display:flex;flex-direction:column;gap:8px' },
          ...subs.map(sub => div({ class: 'alert-card' },
            div({ class: 'alert-info' },
              div({ class: 'alert-area' }, '📍 ', sub.label || sub.geohash),
              div({ class: 'alert-tags' },
                ...( (sub.tags || []).map(tag => span({ class: 'tag' }, tag)) )
              )
            ),
            button({
              class: 'btn btn-sm btn-danger',
              onclick: () => removeSubscription(sub.id)
            }, t('alerts.remove'))
          ))
        )
      }
    )
  )
}
