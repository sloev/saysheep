import van from 'vanjs-core'
import { cone } from '../router.js'
import { t } from '../lib/i18n.js'
const { div, button } = van.tags

export const NotFoundPage = () =>
  div({ style: 'padding:60px 20px;text-align:center' },
    div({ style: 'font-size:48px;margin-bottom:16px' }, '🌿'),
    div({ style: 'font-size:20px;font-weight:800;margin-bottom:8px' }, t('notfound.title')),
    button({ class: 'btn btn-primary', onclick: () => cone.navigate('map', {}) }, t('notfound.back'))
  )
