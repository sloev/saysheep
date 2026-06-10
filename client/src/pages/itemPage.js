import van from 'vanjs-core'
import { store, currentItemId } from '../store.js'
import { subscribeChat, sendChatMessage, markTaken, deleteItem } from '../lib/sync.js'
import { getItemTitle, getItemSummary, getItemImage, getItemTags, getItemGeo, isTaken, isExpired, getItemExpiry, shortPubkey } from '../lib/nostr.js'
import { getTagColor } from '../lib/categories.js'
import { formatRelative, formatDistance, formatDate } from '../helpers/format.js'
import { haversineDistance } from '../lib/geo.js'
import { t } from '../lib/i18n.js'
import { cone } from '../router.js'
import timeImg from '../images/time.png'
import locationImg from '../images/location.png'
const { div, img, button, input, span, h1, p } = van.tags

export const ItemPage = () => {
  const messages = van.state([])
  const chatInput = van.state('')
  const sending = van.state(false)
  let unsub = null

  const event = () => {
    const id = currentItemId.val
    return id ? store.items[id] : null
  }

  van.derive(() => {
    const ev = event()
    if (!ev) return
    if (unsub) unsub()
    messages.val = []
    subscribeChat(ev.id, (msg) => {
      const existing = messages.val.find(m => m.id === msg.id)
      if (!existing) {
        messages.val = [...messages.val, msg].sort((a, b) => a.created_at - b.created_at)
      }
    }).then(u => { unsub = u })
  })

  const sendMsg = async () => {
    const ev = event()
    const text = chatInput.val.trim()
    if (!text || !ev || sending.val) return
    sending.val = true
    chatInput.val = ''
    await sendChatMessage(ev.id, text, ev)
    sending.val = false
  }

  const handleTake = async () => {
    const ev = event()
    if (!ev) return
    await markTaken(ev)
  }

  const handleDelete = async () => {
    const ev = event()
    if (!ev) return
    if (!confirm('Delete this post?')) return
    await deleteItem(ev)
    cone.navigate('list', {})
  }

  const handleShare = () => {
    const ev = event()
    if (!ev) return
    const title = getItemTitle(ev) || 'Free item'
    const url = window.location.href
    if (navigator.share) {
      navigator.share({ title, text: `${title} — free on Glean`, url })
    } else {
      navigator.clipboard.writeText(`${title}\n${url}`)
    }
  }

  return div({ class: 'page-content' },
    button({ class: 'back-btn', onclick: () => cone.navigate('list', {}) }, '← back'),
    () => {
      const ev = event()
      if (!ev) return div({ style: 'padding:40px;text-align:center;color:var(--muted)' }, 'Item not found')

      const title = getItemTitle(ev)
      const summary = getItemSummary(ev)
      const photo = getItemImage(ev)
      const tags = getItemTags(ev)
      const taken = isTaken(ev)
      const geo = getItemGeo(ev)
      const expiry = getItemExpiry(ev)
      const isOwner = ev.pubkey === store.identity.pubkey

      const dist = (!store.position.loading && geo)
        ? haversineDistance(store.position.lat, store.position.lng, geo.lat, geo.lng)
        : null

      return div({ class: 'item-detail' },
        // Photo
        photo
          ? img({ class: 'item-detail-img', src: photo, alt: title })
          : div({ class: 'item-detail-img' }, span({ style: 'font-size:80px' }, '📦')),

        div({ class: 'item-detail-body' },
          // Title
          title ? h1({ class: 'item-detail-title' }, title) : null,

          // Tags
          tags.length ? div({ class: 'item-card-tags', style: 'margin-bottom:10px' },
            ...tags.map(tag => div({ class: 'tag', style: `background:${getTagColor(tag)}` }, tag))
          ) : null,

          // Meta pills
          div({ class: 'item-detail-meta' },
            div({ class: 'pill' }, img({ src: timeImg }), formatRelative(ev.created_at)),
            dist !== null ? div({ class: 'pill' }, img({ src: locationImg }), formatDistance(dist)) : null,
            expiry ? div({ class: 'pill' }, '⏰ ', t('item.available_until'), ' ', formatDate(expiry)) : null,
          ),

          // Description
          summary ? p({ class: 'item-detail-desc' }, summary) : null,

          // Take / taken button
          taken
            ? div({ style: 'padding:12px;text-align:center;font-weight:800;font-size:18px;color:var(--muted)' }, t('item.taken'))
            : button({ class: 'btn btn-take', onclick: handleTake }, t('item.take')),

          // Owner actions
          div({ style: 'display:flex;gap:8px;flex-wrap:wrap' },
            button({ class: 'btn btn-sm', onclick: handleShare }, t('item.share')),
            isOwner ? button({ class: 'btn btn-sm btn-danger', onclick: handleDelete }, t('item.delete')) : null,
          ),

          div({ style: 'font-size:11px;color:var(--muted);margin-top:8px' },
            t('item.by'), ' ', shortPubkey(ev.pubkey)
          ),
        ),

        // Chat
        div({ class: 'chat-section' },
          div({ class: 'chat-header' }, t('item.chat')),
          div({ class: 'chat-messages', id: 'chat-scroll' },
            () => {
              const msgs = messages.val
              if (!msgs.length) return div({ style: 'color:var(--muted);font-size:13px;padding:16px' }, '...')
              return div({},
                ...msgs.map(msg => {
                  const mine = msg.pubkey === store.identity.pubkey
                  return div({ class: `chat-msg ${mine ? 'mine' : ''}` },
                    span(msg.content),
                    div({ class: 'chat-msg-meta' },
                      shortPubkey(msg.pubkey), ' · ', formatRelative(msg.created_at)
                    )
                  )
                })
              )
            }
          ),
          div({ class: 'chat-input-row' },
            input({
              class: 'chat-input',
              type: 'text',
              placeholder: t('item.chat.placeholder'),
              value: chatInput,
              oninput: e => { chatInput.val = e.target.value },
              onkeydown: e => { if (e.key === 'Enter') sendMsg() },
            }),
            button({
              class: 'btn btn-sm btn-primary',
              onclick: sendMsg,
              disabled: sending,
            }, t('item.chat.send'))
          )
        )
      )
    }
  )
}
