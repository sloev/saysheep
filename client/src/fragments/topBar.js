import van from 'vanjs-core'
import { t } from '../lib/i18n.js'
import { cone } from '../router.js'
import { NotificationsBell } from './notificationsPanel.js'

const { div, span, img } = van.tags

export const TopBar = () => {
  // The wolf mascot separates slogans; build a fresh set of nodes each time
  // (a DOM node can't appear twice) and duplicate for a seamless marquee loop.
  const wolf = () => img({ class: 'marquee-wolf', src: 'images/icon-192.png', alt: '' })
  const buildSeq = (slogans) => {
    const out = []
    for (const s of slogans) { out.push(span({ class: 'marquee-slogan' }, s), wolf()) }
    return out
  }

  return div({ class: 'topbar' },
    // The logo doubles as a "home" link.
    div({ class: 'topbar-logo', role: 'link', title: 'saysheep', onclick: () => cone.navigate('home', {}) },
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
        return div({ class: 'marquee-content' }, ...buildSeq(slogans), ...buildSeq(slogans))
      }
    ),
    NotificationsBell()
  )
}
