import van from 'vanjs-core'
import { store, updateAgent, removeAgent, editingAgentId, itemMatchesQuery, itemInBounds, isMuted } from '../store.js'
import { fitMapBounds } from '../fragments/map.js'
import { ListItem } from '../fragments/listItem.js'
import { isTaken, isExpired } from '../lib/nostr.js'
import { t } from '../lib/i18n.js'
const { div, button, span, input, p, label } = van.tags

const boundsEqual = (a, b) => {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.sw.lat === b.sw.lat && a.sw.lng === b.sw.lng && a.ne.lat === b.ne.lat && a.ne.lng === b.ne.lng
}

export const AgentsPage = () => {
  const openDetail = (agent) => {
    editingAgentId.val = agent.id
    if (agent.bounds) fitMapBounds(agent.bounds)
  }

  // ── Agent list ── (clickable rows; opening one shows its detail view)
  const agentList = () => {
    const agents = store.agents || []
    const intro = div({ class: 'form-section' },
      p({ style: 'font-size:13px;color:var(--muted);line-height:1.5' }, () => t('agents.description'))
    )
    if (!agents.length) {
      return div({}, intro, div({ class: 'list-empty' }, span({ class: 'empty-emoji' }, '🤖'), () => t('agents.empty')))
    }
    return div({}, intro,
      div({ style: 'display:flex;flex-direction:column;gap:8px;padding:0 12px 12px' },
        ...agents.map(agent => div({ class: 'agent-card agent-card-row', onclick: () => openDetail(agent) },
          div({ class: 'agent-card-main' },
            div({ class: 'agent-card-name' }, agent.name?.trim() || t('agents.unnamed')),
            div({ class: 'agent-summary' },
              agent.query?.trim() ? t('agents.watching', { query: agent.query.trim() }) : t('agents.watching_everything'))
          ),
          div({ class: 'agent-actions' },
            button({
              class: () => `btn btn-icon ${agent.notificationsEnabled !== false ? 'btn-primary' : 'btn-muted'}`,
              title: () => t('agents.notifications'),
              onclick: (e) => { e.stopPropagation(); updateAgent(agent.id, { notificationsEnabled: agent.notificationsEnabled === false }) },
            }, () => agent.notificationsEnabled !== false ? '🔔' : '🔕'),
            button({
              class: 'btn btn-icon btn-danger', title: () => t('agents.remove'),
              onclick: (e) => { e.stopPropagation(); removeAgent(agent.id) },
            }, '🗑'),
            span({ class: 'agent-card-chevron' }, '›')
          )
        ))
      )
    )
  }

  // ── Agent detail ── name/terms/area are edited in LOCAL state and written to
  // the store only on Save, so typing never mutates the store (and so never
  // re-renders the inputs — that was the per-keystroke defocus bug).
  const agentDetail = (id) => {
    const agent = (store.agents || []).find(a => a.id === id)
    if (!agent) { editingAgentId.val = null; return '' }

    const nameState = van.state(agent.name || '')
    const queryState = van.state(agent.query || '')
    const boundsState = van.state(agent.bounds || null)

    const dirty = () =>
      nameState.val !== (agent.name || '') ||
      queryState.val !== (agent.query || '') ||
      !boundsEqual(boundsState.val, agent.bounds || null)

    const save = () => updateAgent(id, { name: nameState.val.trim(), query: queryState.val, bounds: boundsState.val })

    const field = (icon, labelKey, inputEl) => label({ class: 'agent-field' },
      span({ class: 'agent-field-label' }, icon, ' ', () => t(labelKey)),
      inputEl
    )

    return div({ class: 'agent-detail' },
      div({ class: 'agent-detail-head' },
        div({ class: 'agent-detail-top' },
          button({ class: 'back-btn', style: 'margin:0', onclick: () => { editingAgentId.val = null } }, t('item.back')),
          // Save only enabled once something actually changed.
          () => dirty()
            ? button({ class: 'btn btn-sm btn-primary', onclick: save }, () => t('agents.save_changes'))
            : span({ class: 'agent-saved-hint' }, () => t('agents.saved'))
        ),
        field('✏️', 'agents.name_label', input({
          class: 'agent-name-input', placeholder: () => t('agents.name_placeholder'),
          value: nameState, oninput: e => { nameState.val = e.target.value },
        })),
        field('✏️', 'agents.terms_label', input({
          class: 'agent-name-input', type: 'search', placeholder: () => t('list.search'),
          value: queryState, oninput: e => { queryState.val = e.target.value },
        })),
        div({ class: 'agent-field' },
          span({ class: 'agent-field-label' }, '📍 ', () => t('agents.area_label')),
          div({ style: 'display:flex;gap:8px;align-items:center' },
            span({ class: 'agent-summary', style: 'flex:1' },
              () => boundsState.val ? t('agents.area_custom') : t('agents.area_everywhere')),
            button({ class: 'btn btn-sm', onclick: () => { boundsState.val = store.map.bounds } },
              () => t('agents.use_current_area'))
          )
        ),
        div({ class: 'agent-actions', style: 'margin-top:10px' },
          button({
            class: () => `btn btn-sm ${agent.notificationsEnabled !== false ? 'btn-primary' : 'btn-muted'}`,
            onclick: () => updateAgent(id, { notificationsEnabled: agent.notificationsEnabled === false }),
          }, () => agent.notificationsEnabled !== false ? '🔔 ' + t('agents.notifications_on') : '🔕 ' + t('agents.notifications_off')),
          button({ class: 'btn btn-sm btn-danger', onclick: () => { removeAgent(id); editingAgentId.val = null } },
            '🗑 ', () => t('agents.remove'))
        )
      ),
      div({ class: 'agent-detail-matches' },
        div({ class: 'list-filter-hint', style: 'padding:10px 12px 4px' }, () => t('agents.matches')),
        // Live matches for the (edited) terms + area — updates as items stream in
        // and as the terms field is typed, without touching the inputs above.
        () => {
          const _items = store.items // dependency
          const q = queryState.val
          const b = boundsState.val
          const matches = Object.values(store.items).filter(ev =>
            ev.kind === 30402 && !isMuted(ev.pubkey) && !isTaken(ev) && !isExpired(ev) &&
            itemInBounds(ev, b) && itemMatchesQuery(ev, q)
          ).sort((x, y) => y.created_at - x.created_at)
          if (!matches.length) {
            return div({ class: 'list-empty' }, span({ class: 'empty-emoji' }, '🔍'), () => t('agents.no_matches'))
          }
          return div({ class: 'list-container' }, ...matches.map(ev => ListItem(ev)))
        }
      )
    )
  }

  return div({ class: 'page-content' },
    () => editingAgentId.val ? agentDetail(editingAgentId.val) : agentList()
  )
}
