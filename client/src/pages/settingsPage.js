import van from 'vanjs-core'
import { store } from '../store.js'
import { setMode, CONNECTIVITY } from '../lib/sync.js'
import { addRelay, removeRelay, getRelays } from '../lib/relay.js'
import { getLang, setLang, getSupportedLangs, t } from '../lib/i18n.js'
import { getPubkey, getSecretKeyHex } from '../lib/identity.js'
import { requestNotificationPermission, getNotificationPermission } from '../lib/notifications.js'
const { div, button, input, span, select, option, label, p } = van.tags

export const SettingsPage = () => {
  const relayInput = van.state('')
  const showPrivkey = van.state(false)
  const currentLang = van.state(getLang())
  const relays = van.state(getRelays())
  const notifPerm = van.state(getNotificationPermission())

  const modes = [
    { value: CONNECTIVITY.BOTH, label: t('settings.connectivity.both') },
    { value: CONNECTIVITY.PEERS, label: t('settings.connectivity.peers') },
    { value: CONNECTIVITY.RELAYS, label: t('settings.connectivity.relays') },
  ]

  return div({ class: 'page-content' },
    div({ class: 'page-header' },
      div({ class: 'page-title' }, t('settings.heading'))
    ),

    // Language
    div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, t('settings.language')),
      select({
        class: 'form-select',
        value: currentLang,
        onchange: async (e) => {
          await setLang(e.target.value)
          currentLang.val = e.target.value
        }
      },
        ...getSupportedLangs().map(lang =>
          option({ value: lang, selected: () => currentLang.val === lang },
            t(`lang.${lang}`)
          )
        )
      )
    ),

    // Connectivity
    div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, t('settings.connectivity')),
      div({ class: 'connectivity-options' },
        ...modes.map(m =>
          div({
            class: () => `connectivity-option ${store.connectivity.mode === m.value ? 'active' : ''}`,
            onclick: () => {
              setMode(m.value)
              store.connectivity.mode = m.value
            }
          },
            input({ type: 'radio', name: 'mode', value: m.value,
              checked: () => store.connectivity.mode === m.value }),
            span(m.label)
          )
        )
      )
    ),

    // Relays
    div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, t('settings.relays')),
      div({ class: 'relay-list' },
        () => div({},
          ...relays.val.map(url =>
            div({ class: 'relay-item' },
              span({ style: 'flex:1;overflow:hidden;text-overflow:ellipsis' }, url),
              button({ class: 'btn btn-sm btn-danger', style: 'margin-left:8px;flex-shrink:0',
                onclick: () => { removeRelay(url); relays.val = getRelays() }
              }, '×')
            )
          )
        )
      ),
      div({ style: 'display:flex;gap:8px' },
        input({
          class: 'form-input',
          type: 'url',
          placeholder: t('settings.relay.placeholder'),
          value: relayInput,
          oninput: e => relayInput.val = e.target.value,
          onkeydown: e => {
            if (e.key === 'Enter' && relayInput.val.startsWith('wss://')) {
              addRelay(relayInput.val)
              relays.val = getRelays()
              relayInput.val = ''
            }
          }
        }),
        button({ class: 'btn btn-sm btn-primary',
          onclick: () => {
            if (relayInput.val.startsWith('wss://')) {
              addRelay(relayInput.val)
              relays.val = getRelays()
              relayInput.val = ''
            }
          }
        }, '+')
      )
    ),

    // Notifications
    div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, t('settings.notifications')),
      () => {
        const perm = notifPerm.val
        if (perm === 'unsupported') return div({ style: 'font-size:13px;color:var(--muted)' }, t('settings.notifications.unsupported'))
        if (perm === 'granted') return div({ style: 'font-size:13px;color:var(--mint)' }, '✓ ', t('settings.notifications.enabled'))
        if (perm === 'denied') return div({ style: 'font-size:13px;color:var(--muted)' }, t('settings.notifications.denied'))
        return button({
          class: 'btn btn-sm btn-primary',
          onclick: async () => {
            await requestNotificationPermission()
            notifPerm.val = getNotificationPermission()
          }
        }, t('settings.notifications.enable'))
      }
    ),

    // Identity
    div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, t('settings.identity')),
      div({ class: 'form-label' }, t('settings.identity.pubkey')),
      div({ class: 'pubkey-display' }, getPubkey()),
      div({ style: 'margin-top:12px' },
        p({ style: 'font-size:12px;color:var(--muted);margin-bottom:8px' },
          t('settings.identity.export_warning')
        ),
        button({
          class: 'btn btn-sm',
          onclick: () => showPrivkey.val = !showPrivkey.val
        }, t('settings.identity.export')),
        () => showPrivkey.val
          ? div({ class: 'pubkey-display', style: 'margin-top:8px' }, getSecretKeyHex())
          : div()
      )
    )
  )
}
