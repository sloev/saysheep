import van from 'vanjs-core'
import { cone } from '../router.js'
import { t } from '../lib/i18n.js'
import { MapPage } from '../pages/mapPage.js'
import { ListPage } from '../pages/listPage.js'
import { NewItemPage } from '../pages/newItemPage.js'
import { ItemPage } from '../pages/itemPage.js'
import { SettingsPage } from '../pages/settingsPage.js'
import { AgentsPage } from '../pages/agentsPage.js'
import { MessagesPage } from '../pages/messagesPage.js'
import { OnboardingPage } from '../pages/onboardingPage.js'
import { NotFoundPage } from '../pages/notFoundPage.js'
import { openThread, unreadThreadTotal, editingAgentId } from '../store.js'

const { nav, span } = van.tags

// Register routes
cone.route('home', '/', MapPage, { title: 'saysheep' })
cone.route('map', '/map', MapPage, { title: 'saysheep | map' })
cone.route('list', '/list', ListPage, { title: 'saysheep | list' })
cone.route('new', '/new', NewItemPage, { title: 'saysheep | give away' })
cone.route('item', '/item/:id', ItemPage, { title: 'saysheep | item' })
cone.route('agents', '/agents', AgentsPage, { title: 'saysheep | agents' })
cone.route('messages', '/messages', MessagesPage, { title: 'saysheep | messages' })
cone.route('onboarding', '/onboarding', OnboardingPage, { title: 'saysheep | welcome' })
cone.route('settings', '/settings', SettingsPage, { title: 'saysheep | settings' })
cone.route('notFound', '.*', NotFoundPage, { title: 'saysheep | not found' })

const iconSvg = (type) => {
  const paths = {
    map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line>',
    list: '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>',
    alerts: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
    robot: '<rect x="5" y="9" width="14" height="11" rx="2"></rect><path d="M12 9V5"></path><circle cx="12" cy="3.5" r="1"></circle><path d="M9 14h.01"></path><path d="M15 14h.01"></path><path d="M9 20v2"></path><path d="M15 20v2"></path>',
    chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>'
  }
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  el.setAttribute('width', '24')
  el.setAttribute('height', '24')
  el.setAttribute('viewBox', '0 0 24 24')
  el.setAttribute('fill', 'none')
  el.setAttribute('stroke', 'currentColor')
  el.setAttribute('stroke-width', '2.5')
  el.setAttribute('stroke-linecap', 'round')
  el.setAttribute('stroke-linejoin', 'round')
  el.innerHTML = paths[type]
  return el
}

const NavTab = (name, iconType, labelKey, isFab = false) => {
  // Icon-only tabs; the label is kept as a tooltip/aria-label for accessibility.
  return cone.link({
    name,
    title: t(labelKey),
    'aria-label': t(labelKey),
    class: isFab
      ? 'nav-fab nav-new mobile-only'
      : `nav-link nav-link-${iconType}${name === 'map' ? ' mobile-only' : ''}`
  },
    iconSvg(iconType)
  )
}

// Messages tab carries an unread badge and resets to the thread list on tap.
// onclick replaces van-cone's default navigation handler (otherProps are spread
// last), so it must navigate itself; aria-current still tracks the active route.
const MessagesTab = () => cone.link({
  name: 'messages',
  title: t('messages.title'),
  'aria-label': t('messages.title'),
  class: 'nav-link nav-link-chat',
  onclick: (e) => { e.preventDefault(); openThread.val = null; cone.navigate('messages', {}) },
},
  iconSvg('chat'),
  () => {
    const c = unreadThreadTotal()
    return c
      ? span({ class: 'nav-badge' }, c > 9 ? '9+' : String(c))
      : span({ class: 'nav-badge', style: 'display:none' })
  }
)

// Agents tab resets to the agent list on tap (mirrors the Messages tab).
const AgentsTab = () => cone.link({
  name: 'agents',
  title: t('agents'),
  'aria-label': t('agents'),
  class: 'nav-link nav-link-robot',
  onclick: (e) => { e.preventDefault(); editingAgentId.val = null; cone.navigate('agents', {}) },
}, iconSvg('robot'))

export const NavBar = () => {
  // Mobile shows six slots (map is mobile-only — on desktop the map is the
  // right-hand pane). Desktop hides map + the FAB, leaving list/messages/
  // agents/settings in the sidebar.
  return nav({ class: 'navbar' },
    NavTab('map', 'map', 'map'),
    NavTab('list', 'list', 'list'),
    MessagesTab(),
    NavTab('new', 'plus', 'nav.new', true),
    AgentsTab(),
    NavTab('settings', 'settings', 'settings')
  )
}
