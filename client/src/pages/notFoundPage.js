import van from 'vanjs-core'
import { cone } from '../router.js'
const { div, button } = van.tags

export const NotFoundPage = () =>
  div({ style: 'padding:60px 20px;text-align:center' },
    div({ style: 'font-size:48px;margin-bottom:16px' }, '🌿'),
    div({ style: 'font-size:20px;font-weight:800;margin-bottom:8px' }, 'nothing here'),
    button({ class: 'btn btn-primary', onclick: () => cone.navigate('map', {}) }, 'back to map')
  )
