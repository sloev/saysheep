import van from 'vanjs-core'
import { store, updateIdentity } from '../store.js'
import { setMode, CONNECTIVITY } from '../lib/sync.js'
import { addRelay, removeRelay, getRelays } from '../lib/relay.js'
import { getLang, setLang, getSupportedLangs, t } from '../lib/i18n.js'
import { getPubkey, getSecretKeyHex, isWebAuthnSupported, hasPasskey, registerPasskey, verifyPasskey, clearPasskey } from '../lib/identity.js'
import { requestNotificationPermission, getNotificationPermission } from '../lib/notifications.js'
const { div, button, input, span, select, option, label, p } = van.tags


export const SettingsPage = () => {
  const relayInput = van.state('')
  const showPrivkey = van.state(false)
  const currentLang = van.state(getLang())
  const relays = van.state(getRelays())
  const notifPerm = van.state(getNotificationPermission())
  const passkeyRegistered = van.state(hasPasskey())
  const importInput = van.state('')


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
        () => div({ style: 'display:flex;flex-direction:column;gap:8px' },
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
      div({ style: 'margin-top:12px; display:flex; flex-direction:column; gap:12px;' },
        p({ style: 'font-size:12px;color:var(--muted);line-height:1.4' },
          t('settings.identity.export_warning')
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
                  alert('Passkey verification failed: ' + err.message)
                  return
                }
              }
              showPrivkey.val = !showPrivkey.val
            }
          }, () => showPrivkey.val ? 'Hide Private Key' : t('settings.identity.export')),
          
          button({
            class: 'btn btn-sm btn-muted',
            onclick: async () => {
              if (hasPasskey()) {
                try {
                  const ok = await verifyPasskey()
                  if (!ok) return
                } catch (err) {
                  alert('Passkey verification failed: ' + err.message)
                  return
                }
              }
              const secretKeyHex = getSecretKeyHex()
              const data = JSON.stringify({ secretKeyHex, pubkey: getPubkey() }, null, 2)
              const blob = new Blob([data], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `glean-backup-${getPubkey().substring(0, 8)}.json`
              a.click()
              URL.revokeObjectURL(url)
            }
          }, 'Download Backup File')
        ),
        
        () => showPrivkey.val
          ? div({ class: 'pubkey-display', style: 'margin-top:4px;' }, getSecretKeyHex())
          : div(),

        // Import actions
        div({ style: 'border-top:1.5px dashed rgba(0,0,0,0.1); margin-top:8px; padding-top:12px;' },
          div({ class: 'form-label', style: 'margin-bottom:6px;' }, 'Import Private Key / Backup'),
          div({ style: 'display:flex; gap:8px;' },
            input({
              class: 'form-input',
              style: 'font-family:monospace; font-size:12px;',
              placeholder: 'Paste 64-char private key hex...',
              value: importInput,
              oninput: e => importInput.val = e.target.value
            }),
            button({
              class: 'btn btn-sm btn-primary',
              onclick: () => {
                const clean = importInput.val.trim()
                if (clean.length !== 64) {
                  alert('Private key must be a 64-character hex string')
                  return
                }
                try {
                  updateIdentity(clean)
                  importInput.val = ''
                  alert('Identity imported successfully!')
                } catch (err) {
                  alert('Failed to import: ' + err.message)
                }
              }
            }, 'Import')
          ),
          label({ class: 'btn btn-sm btn-muted', style: 'margin-top:8px; display:inline-block; cursor:pointer; text-align:center;' },
            'Upload Backup JSON File',
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
                      alert('Identity imported successfully from backup!')
                    } else {
                      alert('Invalid backup file structure')
                    }
                  } catch (err) {
                    alert('Failed to parse backup file')
                  }
                }
                reader.readAsText(file)
              }
            })
          )
        ),

        // Passkey / WebAuthn protection
        div({ style: 'border-top:1.5px dashed rgba(0,0,0,0.1); margin-top:8px; padding-top:12px;' },
          div({ class: 'form-label', style: 'margin-bottom:4px;' }, 'Passkey Protection (WebAuthn)'),
          p({ style: 'font-size:12px; color:var(--muted); margin-bottom:8px; line-height:1.4' },
            'Add an extra layer of biometric security to protect your private key from being unauthorizedly viewed or exported.'
          ),
          () => {
            if (!isWebAuthnSupported()) {
              return div({ style: 'font-size:12px; color:var(--muted)' }, 'WebAuthn is not supported by this browser.')
            }
            if (passkeyRegistered.val) {
              return div({ style: 'display:flex; flex-direction:column; gap:8px;' },
                div({ style: 'font-size:12px; color:var(--mint); font-weight:bold;' }, '✓ Protected by Device Passkey'),
                div({ style: 'display:flex; gap:8px;' },
                  button({
                    class: 'btn btn-sm btn-primary',
                    onclick: async () => {
                      try {
                        const ok = await verifyPasskey()
                        if (ok) {
                          alert('Passkey verified successfully!')
                        }
                      } catch (err) {
                        alert('Passkey verification failed: ' + err.message)
                      }
                    }
                  }, 'Test Passkey'),
                  button({
                    class: 'btn btn-sm btn-danger',
                    onclick: () => {
                      clearPasskey()
                      passkeyRegistered.val = false
                      alert('Passkey protection disabled.')
                    }
                  }, 'Disable Passkey')
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
                      alert('Passkey protection enabled successfully!')
                    }
                  } catch (err) {
                    alert('Failed to register Passkey: ' + err.message)
                  }
                }
              }, 'Enable Passkey Protection')
            }
          }
        )
      )
    )
  )
}

