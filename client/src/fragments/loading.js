import van from 'vanjs-core'
const { div, span } = van.tags

export const Loading = (visible) => {
  return div({ class: () => `loading-screen ${visible.val ? '' : 'hidden'}` },
    div({ class: 'loading-logo' }, 'saysheep 🐑'),
    div({ class: 'loading-dots' },
      div({ class: 'loading-dot' }),
      div({ class: 'loading-dot' }),
      div({ class: 'loading-dot' }),
    )
  )
}
