import van from 'vanjs-core'
import { assetUrl } from '../router.js'
const { div, span, img } = van.tags

export const Loading = (visible) => {
  return div({ class: () => `loading-screen ${visible.val ? '' : 'hidden'}` },
    div({ class: 'loading-logo' }, 'saysheep ', img({ class: 'loading-wolf', src: assetUrl('images/icon-192.png'), alt: 'saysheep wolf' })),
    div({ class: 'loading-dots' },
      div({ class: 'loading-dot' }),
      div({ class: 'loading-dot' }),
      div({ class: 'loading-dot' }),
    )
  )
}
