import van from 'vanjs-core'
import { store, updateAgent, removeAgent, editingAgentId } from '../store.js'
import { fitMapBounds } from '../fragments/map.js'
import { t } from '../lib/i18n.js'
import { cone } from '../router.js'
const { div, button, span, p } = van.tags

export const AgentsPage = () => {
  // Open an agent for editing in the list view: load its query into the search
  // box and fly the map to its area, so its live matches are visible.
  const editAgent = (agent) => {
    store.ui.searchQuery = agent.query || ''
    editingAgentId.val = agent.id
    if (agent.bounds) fitMapBounds(agent.bounds)
    cone.navigate('list', {})
  }

  return div({ class: 'page-content' },
    div({ class: 'form-section' },
      p({ style: 'font-size:13px;color:var(--muted);line-height:1.5' }, () => t('agents.description')),
      button({ class: 'btn btn-primary', onclick: () => cone.navigate('list', {}) }, () => t('agents.create_cta'))
    ),
    div({ class: 'list-container' },
      () => {
        const agents = store.agents || []
        if (!agents.length) return div({ class: 'list-empty' },
          span({ class: 'empty-emoji' }, '🤖'),
          () => t('agents.empty')
        )
        return div({ style: 'display:flex;flex-direction:column;gap:8px' },
          // Each agent is a clickable row that opens it in the list view. The
          // action buttons stopPropagation so they don't also trigger the row.
          ...agents.map(agent => div({ class: 'agent-card agent-card-row', onclick: () => editAgent(agent) },
            div({ class: 'agent-card-main' },
              div({ class: 'agent-card-name' }, () => agent.name?.trim() || t('agents.unnamed')),
              div({ class: 'agent-summary' }, () =>
                agent.query?.trim() ? t('agents.watching', { query: agent.query.trim() }) : t('agents.watching_everything')
              )
            ),
            div({ class: 'agent-actions' },
              button({
                class: () => `btn btn-icon ${agent.notificationsEnabled !== false ? 'btn-primary' : 'btn-muted'}`,
                title: () => t('agents.notifications'),
                onclick: (e) => { e.stopPropagation(); updateAgent(agent.id, { notificationsEnabled: agent.notificationsEnabled === false }) },
              }, () => agent.notificationsEnabled !== false ? '🔔' : '🔕'),
              button({
                class: 'btn btn-icon btn-danger',
                title: () => t('agents.remove'),
                onclick: (e) => { e.stopPropagation(); removeAgent(agent.id) },
              }, '🗑'),
              span({ class: 'agent-card-chevron' }, '›')
            )
          ))
        )
      }
    )
  )
}
