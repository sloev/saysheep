import van from 'vanjs-core'
import { getItemTitle, getItemSummary, getItemImage, getItemTags, getItemGeo, isTaken, shortPubkey } from '../lib/nostr.js'
import { getTagColor } from '../lib/categories.js'
import { formatRelative, formatDistance } from '../helpers/format.js'
import { haversineDistance } from '../lib/geo.js'
import { store, currentItemId } from '../store.js'
import { t } from '../lib/i18n.js'
import { cone } from '../router.js'
import timeImg from '../images/time.png'
import locationImg from '../images/location.png'
import speechImg from '../images/speech.png'

const { div, img, span } = van.tags

export const ListItem = (event) => {
  const title = getItemTitle(event)
  const summary = getItemSummary(event)
  const photo = getItemImage(event)
  const tags = getItemTags(event)
  const taken = isTaken(event)
  const geo = getItemGeo(event)

  const dist = () => {
    if (!geo || store.position.loading) return null
    return haversineDistance(store.position.lat, store.position.lng, geo.lat, geo.lng)
  }

  const onClick = () => {
    currentItemId.val = event.id
    cone.navigate('item', {})
  }

  return div({ class: `item-card ${taken ? 'taken' : ''}`, onclick: onClick },
    div({ class: 'item-card-img' },
      photo
        ? img({ src: photo, alt: title || 'item', loading: 'lazy' })
        : div({ class: 'photo-placeholder', style: 'font-size:36px;display:flex;align-items:center;justify-content:center;width:90px;height:90px;background:var(--bg)' },
            span(tags[0] ? '📦' : '✨')
          )
    ),
    div({ class: 'item-card-body' },
      title ? div({ class: 'item-card-title' }, title) : null,
      summary ? div({ class: 'item-card-desc' }, summary) : null,
    ),
    div({ class: 'item-card-tags' },
      ...tags.slice(0, 3).map(tag =>
        div({ class: 'tag', style: `background:${getTagColor(tag)}` }, tag)
      )
    ),
    div({ class: 'item-card-pills' },
      div({ class: 'pill' }, img({ src: timeImg }), formatRelative(event.created_at)),
      () => {
        const d = dist()
        return d !== null ? div({ class: 'pill' }, img({ src: locationImg }), formatDistance(d)) : div()
      },
    ),
    taken ? div({ class: 'taken-stamp' }, t('item.taken')) : null,
  )
}
