import van from 'vanjs-core'
import { store, currentItemId, mutePubkey } from '../store.js'
import { subscribeChat, sendChatMessage, markTaken, deleteItem, reportItem } from '../lib/sync.js'
import { getItemTitle, getItemSummary, getItemImage, getItemTags, getItemGeo, isTaken, isExpired, getItemExpiry, shortPubkey, computeReceiptHash, normalizeVerificationCode } from '../lib/nostr.js'
import { getTagColor, translateTag } from '../lib/categories.js'
import { formatRelative, formatDistance, formatDate, formatExpiry } from '../helpers/format.js'
import { haversineDistance } from '../lib/geo.js'
import { t } from '../lib/i18n.js'
import { cone } from '../router.js'
import timeImg from '../images/time.png'
import locationImg from '../images/location.png'
const { div, img, button, input, span, h1, p, select, option } = van.tags

export const ItemPage = () => {
  const messages = van.state([])
  const chatInput = van.state('')
  const sending = van.state(false)
  let unsub = null

   const showReportModal = van.state(false)
  const reportReason = van.state('spam')
  const reportSubmitted = van.state(false)
  const isIllegal = van.state(false)
  const deleting = van.state(false)

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
    const newMsg = await sendChatMessage(ev.id, text, ev)
    if (newMsg) {
      const existing = messages.val.find(m => m.id === newMsg.id)
      if (!existing) {
        messages.val = [...messages.val, newMsg].sort((a, b) => a.created_at - b.created_at)
      }
    }
    sending.val = false
  }

  const handleTake = async () => {
    const ev = event()
    if (!ev) return
    const hTag = ev.tags.find(t => t[0] === 'h')?.[1]
    const dTag = ev.tags.find(t => t[0] === 'd')?.[1] || ''
    // A valid pickup code is mandatory. An item without an h commitment cannot
    // be verified, so it must not be markable as taken (legacy/unverifiable).
    if (!hTag) {
      alert(t('item.take.unverifiable'))
      return
    }
    const entered = prompt(t('item.take.prompt'))
    if (!entered) return
    const normalized = normalizeVerificationCode(entered)
    const hCheck = await computeReceiptHash(normalized, dTag, ev.pubkey)
    if (hCheck !== hTag) {
      alert(t('item.take.invalid'))
      return
    }
    await markTaken(ev, normalized)
  }

  const handleDelete = async () => {
    const ev = event()
    if (!ev) return
    if (!confirm(t('settings.identity.confirm_delete'))) return
    deleting.val = true
    try {
      await deleteItem(ev)
      cone.navigate('list', {})
    } catch (err) {
      alert("Failed to delete: " + err.message)
    } finally {
      deleting.val = false
    }
  }

  const handleShare = () => {
    const ev = event()
    if (!ev) return
    const title = getItemTitle(ev) || t('item.default_title')
    const url = window.location.href
    if (navigator.share) {
      navigator.share({ title, text: t('item.share_text', { title }), url })
    } else {
      navigator.clipboard.writeText(`${title}\n${url}`)
    }
  }

  return div({ class: 'page-content' },
    button({ class: 'back-btn', onclick: () => cone.navigate('list', {}) }, t('item.back')),
    () => {
      const ev = event()
      if (!ev) return div({ style: 'padding:40px;text-align:center;color:var(--muted)' }, t('item.not_found'))

      const tags = getItemTags(ev)
      const title = getItemTitle(ev) || translateTag(tags[0] || 'other')
      const summary = getItemSummary(ev)
      const photo = getItemImage(ev)
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
            ...tags.map(tag => div({ class: 'tag', style: `background:${getTagColor(tag)}` }, translateTag(tag)))
          ) : null,

          // Meta pills
          div({ class: 'item-detail-meta' },
            div({ class: 'pill' }, img({ src: timeImg }), formatRelative(ev.created_at)),
            dist !== null ? div({ class: 'pill' }, img({ src: locationImg }), formatDistance(dist)) : null,
            expiry ? div({ class: 'pill' }, '⏰ ', formatExpiry(expiry)) : null,
          ),

          // Description
          summary ? p({ class: 'item-detail-desc' }, summary) : null,

          taken
            ? div({},
                div({ class: 'taken-stamp', style: 'padding:12px;text-align:center;font-weight:800;font-size:18px;color:var(--muted)' }, () => t('item.taken')),
                isOwner
                  ? button({
                      class: 'btn btn-danger',
                      style: 'width:100%;margin-top:8px;display:flex;align-items:center;justify-content:center;gap:8px;',
                      onclick: handleDelete,
                      disabled: deleting
                    },
                      () => deleting.val ? div({ class: 'spinner' }) : '',
                      () => t('item.delete')
                    )
                  : null
              )
            : (isOwner
                ? button({
                    class: 'btn btn-danger',
                    style: 'width:100%;display:flex;align-items:center;justify-content:center;gap:8px;',
                    onclick: handleDelete,
                    disabled: deleting
                  },
                    () => deleting.val ? div({ class: 'spinner' }) : '',
                    () => t('item.delete')
                  )
                : button({ class: 'btn btn-take', style: 'width:100%', onclick: handleTake }, () => t('item.take'))
              ),

          // Owner actions
          div({ style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px' },
            button({ class: 'btn btn-sm', onclick: handleShare }, () => t('item.share')),
            !isOwner ? button({ class: 'btn btn-sm btn-danger', onclick: () => showReportModal.val = true }, () => t('item.report')) : null
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
                  const isClaim = msg.kind === 30403
                  return div({ class: `chat-msg ${mine ? 'mine' : ''} ${isClaim ? 'claim-msg' : ''}` },
                    isClaim
                      ? span({ style: 'font-weight: 800; display: flex; align-items: center; gap: 4px;' }, '🐑 ', t('item.taken'))
                      : span(msg.content),
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
              placeholder: () => t('item.chat.placeholder'),
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
    },
    () => {
      if (!showReportModal.val) return div({ style: 'display: none' })

      if (reportSubmitted.val) {
        return div({ class: 'modal-overlay' },
          div({ class: 'modal-content' },
            div({ class: 'modal-title' }, () => t('report.done')),
            div({ class: 'modal-body' },
              () => isIllegal.val
                ? div(
                    p(() => t('report.illegal_notice')),
                    p({ style: 'font-weight: bold; margin-top: 8px;' }, 'politi.dk')
                  )
                : p(() => t('report.done'))
            ),
            div({ class: 'modal-actions' },
              button({
                class: 'btn btn-primary btn-sm',
                onclick: () => {
                  showReportModal.val = false
                  reportSubmitted.val = false
                  isIllegal.val = false
                  cone.navigate('list', {})
                }
              }, 'OK')
            )
          )
        )
      }

      return div({ class: 'modal-overlay' },
        div({ class: 'modal-content' },
          div({ class: 'modal-title' }, () => t('report.heading')),
          div({ class: 'modal-body' },
            select({
              class: 'form-select',
              value: reportReason,
              onchange: e => reportReason.val = e.target.value
            },
              option({ value: 'spam' }, () => t('report.reason.spam')),
              option({ value: 'nudity' }, () => t('report.reason.nudity')),
              option({ value: 'illegal' }, () => t('report.reason.illegal')),
              option({ value: 'harassment' }, () => t('report.reason.harassment')),
              option({ value: 'other' }, () => t('report.reason.other'))
            )
          ),
          div({ class: 'modal-actions' },
            button({
              class: 'btn btn-sm',
              onclick: () => showReportModal.val = false
            }, () => t('report.cancel')),
            button({
              class: 'btn btn-sm btn-primary',
              onclick: async () => {
                const ev = event()
                if (!ev) return
                const reason = reportReason.val
                await reportItem(ev, reason)
                mutePubkey(ev.pubkey)
                if (reason === 'illegal') {
                  isIllegal.val = true
                }
                reportSubmitted.val = true
              }
            }, () => t('report.submit'))
          )
        )
      )
    }
  )
}
