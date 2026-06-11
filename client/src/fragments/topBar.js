import van from 'vanjs-core'
import { t } from '../lib/i18n.js'

const { div, span } = van.tags

export const TopBar = () => {
  return div({ class: 'topbar' },
    div({ class: 'topbar-logo' },
      span({ class: 'logo-text-say' }, 'say'),
      span({ class: 'logo-text-sheep' }, 'sheep'),
      span({ style: 'margin-left: 4px;' }, '🐑')
    ),
    div({ class: 'topbar-marquee' },
      () => {
        const slogans = [
          t('slogan.1'),
          t('slogan.2'),
          t('slogan.3'),
          t('slogan.4'),
          t('slogan.5'),
          t('slogan.6'),
        ]
        const text = slogans.join('  🐑  ') + '  🐑  ' + slogans.join('  🐑  ')
        return div({ class: 'marquee-content' }, text)
      }
    )
  )
}
