import van from 'vanjs-core'
import * as vanX from 'vanjs-ext'
import { store, getFilteredItems, addAgent, updateAgent, editingAgentId } from '../store.js'
import { ListItem } from '../fragments/listItem.js'
import { ConnStatus } from '../fragments/connStatus.js'
import { t } from '../lib/i18n.js'
const { div, input, span, button } = van.tags

export const ListPage = () => {
  const sortedItems = vanX.reactive({})
  const settled = van.state(false)

  // Single source of "ready to show results": the local cache finished loading
  // or items have arrived. A one-shot grace timer is the only fallback, so an
  // empty area shows the empty state instead of spinning forever — this replaces
  // the two competing derives that caused the ⏳→📭→list flip.
  van.derive(() => {
    if (store.ui.cacheLoaded || Object.keys(store.items).length > 0) settled.val = true
  })
  setTimeout(() => { settled.val = true }, 1500)

  // Reconcile the keyed reactive collection incrementally so vanX.list only
  // touches changed rows — never a full vanX.replace() rebuild (which flickers).
  van.derive(() => {
    const _items = store.items          // dependency
    const _query = store.ui.searchQuery // dependency
    const _bounds = store.map.bounds    // dependency (viewport filter)

    const list = getFilteredItems().sort((a, b) => b.created_at - a.created_at)
    const nextIds = new Set(list.map(i => i.id))

    Promise.resolve().then(() => {
      // remove rows no longer present
      for (const id of Object.keys(sortedItems)) {
        if (!nextIds.has(id)) delete sortedItems[id]
      }
      // add/update present rows (identical refs skip the write, so no re-render)
      for (const item of list) {
        if (sortedItems[item.id] !== item) sortedItems[item.id] = item
      }
    })
  })

  // Built ONCE and kept mounted; vanX.list does per-key DOM diffing internally.
  // Keeping it outside the reactive children below is what stops the flicker.
  const listEl = vanX.list(
    () => div({ class: 'list-container' }),
    sortedItems,
    (itemState) => ListItem(itemState.val)
  )

  const metaInfo = div({
    class: 'list-meta-info',
    style: 'padding: 6px 12px; font-size: 12px; font-weight: 700; color: var(--muted); display: flex; justify-content: space-between; background: var(--bg); border: 1.5px solid var(--ink); border-radius: 8px; margin-bottom: 12px; box-shadow: var(--shadow-sm);'
  },
    span(() => t('list.showing_count', { count: getFilteredItems().length })),
    span(() => t('list.total_count', { count: Object.keys(store.items).length }))
  )

  // Create an agent from the current search box + map view, then drop into edit
  // mode so it can be named right where its matches are visible.
  const createAgentFromList = () => {
    const id = addAgent({ name: store.ui.searchQuery.trim(), query: store.ui.searchQuery, bounds: store.map.bounds })
    editingAgentId.val = id
  }

  // Inline banner shown while editing/naming an agent.
  const agentEditBanner = (id) => {
    const agent = (store.agents || []).find(a => a.id === id)
    if (!agent) return null
    return div({ class: 'agent-edit-banner' },
      input({
        class: 'agent-name-input',
        placeholder: () => t('agents.name_placeholder'),
        value: agent.name,
        oninput: e => updateAgent(id, { name: e.target.value }),
      }),
      div({ class: 'agent-edit-hint' }, () =>
        store.ui.searchQuery.trim()
          ? t('agents.watching', { query: store.ui.searchQuery.trim() })
          : t('agents.watching_everything')
      ),
      div({ style: 'display:flex;gap:8px' },
        button({
          class: 'btn btn-sm btn-primary',
          onclick: () => { updateAgent(id, { query: store.ui.searchQuery, bounds: store.map.bounds }); editingAgentId.val = null },
        }, () => t('agents.save')),
        button({ class: 'btn btn-sm', onclick: () => { editingAgentId.val = null } }, () => t('agents.done'))
      )
    )
  }

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
      }),
      // Save the current search + map area as an agent (then name it inline).
      () => editingAgentId.val
        ? null
        : button({ class: 'btn btn-icon save-agent-btn', title: () => t('agents.save_as'), onclick: createAgentFromList }, '🤖')
    ),
    () => { const id = editingAgentId.val; return id ? agentEditBanner(id) : null },
    metaInfo,
    // Loading + empty are lightweight overlays toggled reactively; they never
    // recreate listEl, so existing rows stay in the DOM.
    () => (store.position.loading || !settled.val)
      ? div({ class: 'list-empty' }, span({ class: 'empty-emoji' }, '⏳'), t('list.loading'))
      : null,
    () => (!store.position.loading && settled.val && getFilteredItems().length === 0)
      ? div({ class: 'list-empty' }, span({ class: 'empty-emoji' }, '📭'), t('list.empty'))
      : null,
    listEl,
  )
}
