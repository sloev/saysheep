import van from 'vanjs-core'
import { store, addSubscription, removeSubscription, saveSubscriptions } from '../store.js'
import { encodeGeohash, getHumanReadableLocation } from '../lib/geo.js'
import { t } from '../lib/i18n.js'
import { randomUUID } from '../lib/nostr.js'
import { translateTag } from '../lib/categories.js'
import { TagInput } from '../fragments/tagInput.js'
const { div, button, span, h2, p } = van.tags

export const AgentsPage = () => {
  const newTags = van.state([])

  const addAgent = async () => {
    if (store.position.loading || !store.position.lat) return
    const lat = store.position.lat
    const lng = store.position.lng
    const gh = encodeGeohash(lat, lng, 5)
    // Subscriptions/Agents default to notificationsEnabled: true
    const id = randomUUID()
    if (!store.subscriptions) store.subscriptions = []
    
    // Add subscription immediately with default label
    store.subscriptions.push({ id, geohash: gh, tags: [...newTags.val], label: `${gh} + 5km`, notificationsEnabled: true })
    saveSubscriptions()
    newTags.val = []

    // Fetch human readable name asynchronously
    try {
      const label = await getHumanReadableLocation(lat, lng, gh)
      const idx = store.subscriptions.findIndex(s => s.id === id)
      if (idx !== -1) {
        store.subscriptions[idx].label = label
        saveSubscriptions()
      }
    } catch {}
  }

  return div({ class: 'page-content' },
    div({ class: 'page-header' },
      div({ class: 'page-title' }, t('agents.heading'))
    ),
    div({ class: 'form-section' },
      p({ style: 'font-size:13px;color:var(--muted);line-height:1.5' },
        t('agents.description')
      ),
      div({ class: 'form-label' }, t('agents.categories')),
      TagInput({ tags: newTags }),
      button({
        class: 'btn btn-submit',
        onclick: addAgent,
        disabled: () => store.position.loading,
      }, t('agents.add'))
    ),
    div({ class: 'list-container' },
      () => {
        const subs = store.subscriptions || []
        if (!subs.length) return div({ class: 'list-empty' },
          span({ class: 'empty-emoji' }, '🤖'),
          t('agents.empty')
        )
        return div({ style: 'display:flex;flex-direction:column;gap:8px' },
          ...subs.map(sub => div({ class: 'alert-card' },
            div({ class: 'alert-info' },
              div({ class: 'alert-area' }, '📍 ', sub.label || sub.geohash),
              div({ class: 'alert-tags' },
                ...( (sub.tags || []).map(tag => span({ class: 'tag' }, translateTag(tag))) )
              )
            ),
            div({ style: 'display:flex;gap:8px;align-items:center' },
              button({
                class: () => `btn btn-sm ${sub.notificationsEnabled !== false ? 'btn-primary' : 'btn-muted'}`,
                style: 'font-size: 14px; min-width: 36px; padding: 6px;',
                onclick: () => {
                  sub.notificationsEnabled = sub.notificationsEnabled === false ? true : false
                  saveSubscriptions()
                }
              }, () => sub.notificationsEnabled !== false ? '🔔' : '🔕'),
              button({
                class: 'btn btn-sm btn-danger',
                onclick: () => removeSubscription(sub.id)
              }, t('agents.remove'))
            )
          ))
        )
      }
    )
  )
}

