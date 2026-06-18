import van from 'vanjs-core'
import { t } from '../lib/i18n.js'
import { NotificationsBell } from './notificationsPanel.js'

const { div, span, img } = van.tags

export const TopBar = () => {
  return div({ class: 'topbar' },
    div({ class: 'topbar-logo' },
      span({ class: 'logo-text-say' }, 'say'),
      span({ class: 'logo-text-sheep' }, 'sheep'),
      img({ class: 'logo-wolf', src: 'images/icon-192.png', alt: 'saysheep wolf' })
    ),
    div({ class: 'topbar-marquee' },
      () => {
        // Collect only slogans that actually resolve (t() returns the key itself
        // when missing), so undefined slots never leak as raw "slogan.N" text.
        const slogans = []
        for (let i = 1; i <= 50; i++) {
          const key = `slogan.${i}`
          const val = t(key)
          if (val !== key) slogans.push(val)
        }
        const text = slogans.join('  🐑  ') + '  🐑  ' + slogans.join('  🐑  ')
        return div({ class: 'marquee-content' }, text)
      }
    ),
    NotificationsBell()
  )
}
