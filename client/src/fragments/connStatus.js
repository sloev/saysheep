import van from 'vanjs-core'
import { store } from '../store.js'
import { t } from '../lib/i18n.js'
const { div } = van.tags

export const ConnStatus = () => {
  return div({ class: 'conn-status' },
    () => {
      const peers = store.connectivity.peers
      const relays = store.connectivity.relays
      const mode = store.connectivity.mode
      const offline = peers === 0 && relays === 0
      if (offline) return div({ class: 'conn-badge offline' }, t('connectivity.offline'))
      const badges = []
      if (mode !== 'relays' && peers > 0)
        badges.push(div({ class: 'conn-badge' }, t('connectivity.peers', { n: peers })))
      if (mode !== 'peers' && relays > 0)
        badges.push(div({ class: 'conn-badge' }, t('connectivity.relays', { n: relays })))
      return van.tags.div({ style: 'display:flex;gap:6px' }, ...badges)
    }
  )
}
