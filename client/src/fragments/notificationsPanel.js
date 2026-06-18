import van from 'vanjs-core'
import { notifications, openItemById, markNotificationsRead, clearNotifications } from '../store.js'
import { cone } from '../router.js'
import { t } from '../lib/i18n.js'
import { formatRelative } from '../helpers/format.js'

const { div, span, button } = van.tags

const ICONS = { item: '🆕', message: '💬', announcement: '📢' }

const renderBody = (n) => {
  const p = n.params || {}
  if (n.type === 'message') return t('notif.message', { title: p.title || t('item.default_title') })
  if (n.type === 'announcement') return p.textKey ? t(p.textKey) : (p.text || '')
  // item (agent match)
  return t('notif.item', { what: p.what || t('item.default_title'), agent: p.agent || t('agents.heading') })
}

// A bell button with an unread badge that toggles a dropdown feed of
// notifications (agent matches, chat replies, platform announcements).
//
// NOTE: every reactive child below always returns a real element (never null) —
// a VanJS reactive child that returns null on its first run becomes a dead
// binding and never updates again.
export const NotificationsBell = () => {
  const open = van.state(false)

  const toggle = () => {
    open.val = !open.val
    if (open.val) markNotificationsRead()
  }

  const openNotification = (n) => {
    open.val = false
    if (n.route) {
      cone.navigate(n.route, {})
    } else if (n.itemId) {
      openItemById(n.itemId)
    }
  }

  const badge = () => {
    const c = notifications.val.filter(n => !n.read).length
    return c
      ? span({ class: 'notif-badge' }, c > 9 ? '9+' : String(c))
      : span({ class: 'notif-badge', style: 'display:none' })
  }

  const panel = () => {
    if (!open.val) return div({ class: 'notif-panel', style: 'display:none' })
    const list = notifications.val
    return div({ class: 'notif-panel' },
      div({ class: 'notif-panel-header' },
        span({ class: 'notif-panel-title' }, t('notif.title')),
        list.length
          ? button({ class: 'notif-clear', onclick: clearNotifications }, t('notif.clear'))
          : span()
      ),
      list.length
        ? div({ class: 'notif-list' },
            ...list.map(n => div({ class: 'notif-row', onclick: () => openNotification(n) },
              span({ class: 'notif-icon' }, ICONS[n.type] || '🔔'),
              div({ class: 'notif-body' }, renderBody(n)),
              span({ class: 'notif-time' }, formatRelative(n.ts))
            ))
          )
        : div({ class: 'notif-empty' }, t('notif.empty'))
    )
  }

  return div({ class: 'notif-bell-wrap' },
    button({ class: 'notif-bell', onclick: toggle, title: () => t('notif.title') }, '🔔', badge),
    panel
  )
}
