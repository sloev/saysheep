import van from 'vanjs-core'
import { store, updateIdentity } from '../store.js'
import { setMode, CONNECTIVITY } from '../lib/sync.js'
import { addRelay, removeRelay, getRelays, getRelaysStatus } from '../lib/relay.js'
import { getLang, setLang, getSupportedLangs, t } from '../lib/i18n.js'
import { getPubkey, getSecretKeyHex, isWebAuthnSupported, hasPasskey, registerPasskey, verifyPasskey, clearPasskey } from '../lib/identity.js'
import { requestNotificationPermission, getNotificationPermission } from '../lib/notifications.js'
const { div, button, input, span, select, option, label, p } = van.tags


export const SettingsPage = () => {
  const relayInput = van.state('')
  const showPrivkey = van.state(false)
  const currentLang = van.state(getLang())
  const notifPerm = van.state(getNotificationPermission())
  const passkeyRegistered = van.state(hasPasskey())
  const importInput = van.state('')

  const relaysStatus = van.state(getRelaysStatus())
  const updateStatus = () => {
    relaysStatus.val = getRelaysStatus()
  }

  // Update status every second
  let statusInterval = null
  van.derive(() => {
    updateStatus()
    statusInterval = setInterval(updateStatus, 1000)
    return () => clearInterval(statusInterval)
  })

  return div({ class: 'page-content' },
    div({ class: 'page-header' },
      div({ class: 'page-title' }, () => t('settings.heading'))
    ),

    // Language
    div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, () => t('settings.language')),
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
            () => t(`lang.${lang}`)
          )
        )
      )
    ),

    // Relays
    div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, () => t('settings.relays')),
      div({ class: 'relay-list' },
        () => div({ style: 'display:flex;flex-direction:column;gap:8px' },
          ...relaysStatus.val.map(({ url, connected, nextReconnectAt }) => {
            let statusBadge
            if (connected) {
              statusBadge = span({ style: 'font-size:11px;color:var(--mint);font-weight:700;margin-top:2px' }, () => '🟢 ' + t('relay.status.connected'))
            } else {
              const secs = nextReconnectAt ? Math.ceil((nextReconnectAt - Date.now()) / 1000) : 0
              statusBadge = span({ style: 'font-size:11px;color:var(--pink);font-weight:700;margin-top:2px' }, 
                () => secs > 0 ? '🔴 ' + t('relay.status.retry', { secs }) : '🔴 ' + t('relay.status.connecting')
              )
            }

            return div({ class: 'relay-item', style: 'display:flex;align-items:center' },
              div({ style: 'flex:1;display:flex;flex-direction:column;min-width:0' },
                span({ style: 'overflow:hidden;text-overflow:ellipsis;font-size:14px;white-space:nowrap' }, url),
                statusBadge
              ),
              button({ class: 'btn btn-sm btn-danger', style: 'margin-left:8px;flex-shrink:0',
                onclick: () => { removeRelay(url); updateStatus() }
              }, '×')
            )
          })
        )
      ),
      div({ style: 'display:flex;gap:8px' },
        input({
          class: 'form-input',
          type: 'url',
          placeholder: () => t('settings.relay.placeholder'),
          value: relayInput,
          oninput: e => relayInput.val = e.target.value,
          onkeydown: e => {
            if (e.key === 'Enter' && relayInput.val.startsWith('wss://')) {
              addRelay(relayInput.val)
              updateStatus()
              relayInput.val = ''
            }
          }
        }),
        button({ class: 'btn btn-sm btn-primary',
          onclick: () => {
            if (relayInput.val.startsWith('wss://')) {
              addRelay(relayInput.val)
              updateStatus()
              relayInput.val = ''
            }
          }
        }, '+')
      )
    ),

    // Notifications
    div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, () => t('settings.notifications')),
      () => {
        const perm = notifPerm.val
        if (perm === 'unsupported') return div({ style: 'font-size:13px;color:var(--muted)' }, () => t('settings.notifications.unsupported'))
        if (perm === 'granted') return div({ style: 'font-size:13px;color:var(--mint)' }, '✓ ', () => t('settings.notifications.enabled'))
        if (perm === 'denied') return div({ style: 'font-size:13px;color:var(--muted)' }, () => t('settings.notifications.denied'))
        return button({
          class: 'btn btn-sm btn-primary',
          onclick: async () => {
            await requestNotificationPermission()
            notifPerm.val = getNotificationPermission()
          }
        }, () => t('settings.notifications.enable'))
      }
    ),

    // Identity
    div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, () => t('settings.identity')),
      div({ class: 'form-label' }, () => t('settings.identity.pubkey')),
      div({ class: 'pubkey-display' }, getPubkey()),
      div({ style: 'margin-top:12px; display:flex; flex-direction:column; gap:12px;' },
        p({ style: 'font-size:12px;color:var(--muted);line-height:1.4' },
          () => t('settings.identity.export_warning')
        ),
        
        // Export actions
        div({ style: 'display:flex; gap:8px; flex-wrap:wrap;' },
          button({
            class: 'btn btn-sm btn-primary',
            onclick: async () => {
              if (hasPasskey()) {
                try {
                  const ok = await verifyPasskey()
                  if (!ok) return
                } catch (err) {
                  alert(t('settings.identity.passkey.failed_verify', { error: err.message }))
                  return
                }
              }
              showPrivkey.val = !showPrivkey.val
            }
          }, () => showPrivkey.val ? t('settings.identity.hide_key') : t('settings.identity.export')),
          
          button({
            class: 'btn btn-sm btn-muted',
            onclick: async () => {
              if (hasPasskey()) {
                try {
                  const ok = await verifyPasskey()
                  if (!ok) return
                } catch (err) {
                  alert(t('settings.identity.passkey.failed_verify', { error: err.message }))
                  return
                }
              }
              const secretKeyHex = getSecretKeyHex()
              const data = JSON.stringify({ secretKeyHex, pubkey: getPubkey() }, null, 2)
              const blob = new Blob([data], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `saysheep-backup-${getPubkey().substring(0, 8)}.json`
              a.click()
              URL.revokeObjectURL(url)
            }
          }, () => t('settings.identity.download_backup'))
        ),
        
        () => showPrivkey.val
          ? div({ class: 'pubkey-display', style: 'margin-top:4px;' }, getSecretKeyHex())
          : div(),

        // Import actions
        div({ style: 'border-top:1.5px dashed rgba(0,0,0,0.1); margin-top:8px; padding-top:12px;' },
          div({ class: 'form-label', style: 'margin-bottom:6px;' }, () => t('settings.identity.import_heading')),
          div({ style: 'display:flex; gap:8px;' },
            input({
              class: 'form-input',
              style: 'font-family:monospace; font-size:12px;',
              placeholder: () => t('settings.identity.import_placeholder'),
              value: importInput,
              oninput: e => importInput.val = e.target.value
            }),
            button({
              class: 'btn btn-sm btn-primary',
              onclick: () => {
                const clean = importInput.val.trim()
                if (clean.length !== 64) {
                  alert(t('settings.identity.invalid_key'))
                  return
                }
                try {
                  updateIdentity(clean)
                  importInput.val = ''
                  alert(t('settings.identity.import.success'))
                } catch (err) {
                  alert(t('settings.identity.import.failed', { error: err.message }))
                }
              }
            }, () => t('settings.identity.import_btn'))
          ),
          label({ class: 'btn btn-sm btn-muted', style: 'margin-top:8px; display:inline-block; cursor:pointer; text-align:center;' },
            () => t('settings.identity.upload_backup'),
            input({
              type: 'file',
              accept: '.json',
              style: 'display:none;',
              onchange: (e) => {
                const file = e.target.files[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = (event) => {
                  try {
                    const parsed = JSON.parse(event.target.result)
                    if (parsed.secretKeyHex && parsed.secretKeyHex.length === 64) {
                      updateIdentity(parsed.secretKeyHex)
                      alert(t('settings.identity.import.success_backup'))
                    } else {
                      alert(t('settings.identity.import.invalid_backup'))
                    }
                  } catch (err) {
                    alert(t('settings.identity.import.failed_parse'))
                  }
                }
                reader.readAsText(file)
              }
            })
          )
        ),

        // Passkey / WebAuthn protection
        div({ style: 'border-top:1.5px dashed rgba(0,0,0,0.1); margin-top:8px; padding-top:12px;' },
          div({ class: 'form-label', style: 'margin-bottom:4px;' }, () => t('settings.identity.passkey_heading')),
          p({ style: 'font-size:12px; color:var(--muted); margin-bottom:8px; line-height:1.4' },
            () => t('settings.identity.passkey_desc')
          ),
          () => {
            if (!isWebAuthnSupported()) {
              return div({ style: 'font-size:12px; color:var(--muted)' }, () => t('settings.identity.passkey_unsupported'))
            }
            if (passkeyRegistered.val) {
              return div({ style: 'display:flex; flex-direction:column; gap:8px;' },
                div({ style: 'font-size:12px; color:var(--mint); font-weight:bold;' }, () => t('settings.identity.passkey_protected')),
                div({ style: 'display:flex; gap:8px;' },
                  button({
                    class: 'btn btn-sm btn-primary',
                    onclick: async () => {
                      try {
                        const ok = await verifyPasskey()
                        if (ok) {
                          alert(t('settings.identity.passkey.success_verify'))
                        }
                      } catch (err) {
                        alert(t('settings.identity.passkey.failed_verify', { error: err.message }))
                      }
                    }
                  }, () => t('settings.identity.passkey.test')),
                  button({
                    class: 'btn btn-sm btn-danger',
                    onclick: () => {
                      clearPasskey()
                      passkeyRegistered.val = false
                      alert(t('settings.identity.passkey.disabled'))
                    }
                  }, () => t('settings.identity.passkey_disable'))
                )
              )
            } else {
              return button({
                class: 'btn btn-sm btn-primary',
                onclick: async () => {
                  try {
                    const ok = await registerPasskey()
                    if (ok) {
                      passkeyRegistered.val = true
                      alert(t('settings.identity.passkey.success_enable'))
                    }
                  } catch (err) {
                    alert(t('settings.identity.passkey.failed_register', { error: err.message }))
                  }
                }
              }, () => t('settings.identity.passkey_enable'))
            }
          }
        )
      )
    )
  )
}

