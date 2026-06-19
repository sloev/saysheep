import van from 'vanjs-core'
import {
  store, openThread, getThreads, getThreadMessages, threadUnread,
  markThreadRead, sendThreadMessage, findItemByDtag, threadOther, openItem,
} from '../store.js'
import { parseThreadKey } from '../lib/dm.js'
import { getItemImage, getItemTitle, getItemTags, isExpired, shortPubkey } from '../lib/nostr.js'
import { translateTag } from '../lib/categories.js'
import { formatRelative } from '../helpers/format.js'
import { t } from '../lib/i18n.js'

const { div, span, img, input, button } = van.tags

const truncate = (s, n = 48) => (s && s.length > n ? s.slice(0, n - 1) + '…' : (s || ''))
const itemLabel = (item) => item ? (getItemTitle(item) || translateTag(getItemTags(item)[0] || 'other')) : t('item.default_title')

export const MessagesPage = () => {
  const draft = van.state('')

  const openThreadView = (key) => { draft.val = ''; openThread.val = key; markThreadRead(key) }

  // ── Thread list ── (one row per item+person, in-lifespan items only)
  const threadList = () => {
    const threads = getThreads().filter(th => {
      const item = findItemByDtag(th.itemId)
      return item && !isExpired(item)
    })
    if (!threads.length) {
      return div({ class: 'list-empty' }, span({ class: 'empty-emoji' }, '💬'), () => t('messages.empty'))
    }
    return div({ class: 'thread-list' },
      ...threads.map(th => {
        const item = findItemByDtag(th.itemId)
        const photo = item ? getItemImage(item) : null
        const other = threadOther(th.ownerPubkey, th.takerPubkey)
        const unread = threadUnread(th.key)
        return div({ class: `thread-row${unread ? ' unread' : ''}`, onclick: () => openThreadView(th.key) },
          photo
            ? img({ class: 'thread-thumb', src: photo, alt: '' })
            : div({ class: 'thread-thumb thread-thumb-empty' }, '📦'),
          div({ class: 'thread-main' },
            div({ class: 'thread-top' },
              span({ class: 'thread-title' }, itemLabel(item)),
              span({ class: 'thread-time' }, formatRelative(th.last.created_at))
            ),
            div({ class: 'thread-sub' },
              span({ class: 'thread-who' }, '🐑 ', shortPubkey(other)),
              span({ class: 'thread-last' }, (th.last.fromMe ? '🐺 ' : '') + truncate(th.last.text))
            )
          ),
          unread ? span({ class: 'thread-unread-dot' }) : ''
        )
      })
    )
  }

  // ── Thread view ── you(🐺) right / them(🐑) left
  const threadView = (key) => {
    const { ownerPubkey, takerPubkey, itemId } = parseThreadKey(key)
    const item = findItemByDtag(itemId)
    const other = threadOther(ownerPubkey, takerPubkey)

    const send = async () => {
      const text = draft.val.trim()
      if (!text) return
      draft.val = ''
      await sendThreadMessage(key, text)
      markThreadRead(key)
    }

    return div({ class: 'thread-view' },
      div({ class: 'thread-view-header' },
        button({ class: 'back-btn', style: 'margin:0', onclick: () => { openThread.val = null } }, t('item.back')),
        item
          ? img({ class: 'thread-thumb', src: getItemImage(item) || '', alt: '', onclick: () => openItem(item) })
          : div({ class: 'thread-thumb thread-thumb-empty' }, '📦'),
        div({ class: 'thread-view-title' },
          span({ class: 'thread-title' }, itemLabel(item)),
          span({ class: 'thread-who' }, '🐑 ', shortPubkey(other))
        )
      ),
      div({ class: 'thread-messages' },
        () => {
          const msgs = getThreadMessages(key)
          if (!msgs.length) return div({ class: 'thread-empty-hint' }, () => t('messages.start_hint'))
          return div({ style: 'display:flex;flex-direction:column;gap:8px' },
            ...msgs.map(m => div({ class: `chat-msg ${m.fromMe ? 'mine' : ''}` },
              span({ class: 'chat-avatar' }, m.fromMe ? '🐺' : '🐑'),
              div({ class: 'chat-bubble' },
                span(m.text),
                div({ class: 'chat-msg-meta' }, formatRelative(m.created_at))
              )
            ))
          )
        }
      ),
      item
        ? div({ class: 'chat-input-row' },
            input({
              class: 'chat-input',
              type: 'text',
              placeholder: () => t('item.chat.placeholder'),
              value: draft,
              oninput: e => { draft.val = e.target.value },
              onkeydown: e => { if (e.key === 'Enter') send() },
            }),
            button({ class: 'btn btn-sm btn-primary', onclick: send }, () => t('item.chat.send'))
          )
        : div({ class: 'thread-gone' }, () => t('messages.item_gone'))
    )
  }

  return div({ class: 'page-content' },
    // Reactive children always return a real element (never null) so the binding
    // stays live across the list ⇄ thread switch.
    () => openThread.val ? threadView(openThread.val) : threadList()
  )
}
