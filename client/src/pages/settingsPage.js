import van from 'vanjs-core'
import { store, updateIdentity, unmutePubkey } from '../store.js'
import { addRelay, removeRelay, getRelays, getRelaysStatus } from '../lib/relay.js'
import { getLang, setLang, getSupportedLangs, t } from '../lib/i18n.js'
import { getPubkey, getSecretKeyHex, isWebAuthnSupported, hasPasskey, registerPasskey, verifyPasskey, clearPasskey } from '../lib/identity.js'
import { requestNotificationPermission, getNotificationPermission } from '../lib/notifications.js'
import { shortPubkey } from '../lib/nostr.js'
import { installAvailable, promptInstall, isIOS, isStandalone, ANDROID_APK_URL } from '../lib/pwaInstall.js'
const { div, button, input, span, select, option, label, p, a } = van.tags


export const SettingsPage = () => {
  const relayInput = van.state('')
  const showPrivkey = van.state(false)
  const currentLang = van.state(getLang())
  const notifPerm = van.state(getNotificationPermission())
  const passkeyRegistered = van.state(hasPasskey())
  const importInput = van.state('')
  const relaysStatus = van.state(getRelaysStatus())

  const handleCopyRelay = (url) => {
    navigator.clipboard.writeText(url)
    alert(t('settings.relay.copied'))
  }

  const pageEl = div({ class: 'page-content' },

    // 0. Install Section
    isStandalone() ? '' : div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, () => t('settings.install')),
      () => installAvailable.val
        ? button({ class: 'btn btn-primary', style: 'width:100%', onclick: promptInstall }, () => t('settings.install.pwa'))
        : (isIOS()
            ? div({ style: 'font-size:13px;color:var(--muted);line-height:1.5' }, () => t('settings.install.ios_hint'))
            : ''),
      a({
        class: 'btn',
        style: 'width:100%;display:block;text-align:center;margin-top:8px;text-decoration:none;box-sizing:border-box',
        href: ANDROID_APK_URL,
        rel: 'noopener',
      }, () => t('settings.install.android'))
    ),

    // 1. Preferences Section
    div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, () => t('settings.preferences')),
      
      div({ class: 'settings-row' },
        span({ class: 'settings-label' }, () => t('settings.language')),
        select({
          class: 'form-select',
          style: 'width: auto; min-width: 120px;',
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

      div({ class: 'settings-row' },
        span({ class: 'settings-label' }, () => t('settings.notifications')),
        () => {
          const perm = notifPerm.val
          if (perm === 'unsupported') return span({ class: 'settings-text-muted' }, () => t('settings.notifications.unsupported'))
          if (perm === 'granted') return span({ class: 'settings-text-mint' }, '✓ ', () => t('settings.notifications.enabled'))
          if (perm === 'denied') return span({ class: 'settings-text-muted' }, () => t('settings.notifications.denied'))
          return button({
            class: 'btn btn-sm btn-primary',
            onclick: async () => {
              await requestNotificationPermission()
              notifPerm.val = getNotificationPermission()
            }
          }, () => t('settings.notifications.enable'))
        }
      )
    ),

    // 1.5 Muted Section
    div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, () => t('settings.muted')),
      () => {
        const mutedList = store.muted || []
        if (mutedList.length === 0) {
          return div({ class: 'settings-text-muted' }, () => t('settings.muted.empty'))
        }
        return div({ style: 'display:flex;flex-direction:column;gap:8px' },
          ...mutedList.map(pk =>
            div({ class: 'relay-item' },
              span({ style: 'font-family:monospace;font-size:14px' }, shortPubkey(pk)),
              button({
                class: 'btn btn-sm btn-muted',
                style: 'flex-shrink:0;margin-left:8px',
                onclick: () => unmutePubkey(pk)
              }, () => t('settings.muted.unmute'))
            )
          )
        )
      }
    ),

    // 2. Relays Section
    div({ class: 'settings-section' },
      div({ class: 'settings-section-title' }, () => t('settings.relays')),
      div({ class: 'relay-list' },
        () => div({ style: 'display:flex;flex-direction:column;gap:8px' },
          ...relaysStatus.val.map(({ url, connected, nextReconnectAt }) => {
            let statusBadge
            if (connected) {
              statusBadge = span({ class: 'settings-text-mint', style: 'margin-top:2px' }, () => '🟢 ' + t('relay.status.connected'))
            } else {
              const secs = nextReconnectAt ? Math.ceil((nextReconnectAt - Date.now()) / 1000) : 0
              statusBadge = span({ style: 'font-size:11px;color:var(--pink);font-weight:700;margin-top:2px' }, 
                () => secs > 0 ? '🔴 ' + t('relay.status.retry', { secs }) : '🔴 ' + t('relay.status.connecting')
              )
            }

            return div({ class: 'relay-item' },
              div({ 
                style: 'flex:1;display:flex;flex-direction:column;min-width:0;cursor:pointer;', 
                title: 'Click to copy',
                onclick: () => handleCopyRelay(url)
              },
                span({ style: 'overflow:hidden;text-overflow:ellipsis;font-size:14px;white-space:nowrap' }, url),
                statusBadge
              ),
              button({ class: 'btn btn-sm btn-danger', style: 'margin-left:8px;flex-shrink:0',
                onclick: () => {
                  if (confirm(t('settings.relay.confirm_remove', { url }))) {
                    removeRelay(url)
                    relaysStatus.val = getRelaysStatus()
                  }
                }
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
              relaysStatus.val = getRelaysStatus()
              relayInput.val = ''
            }
          }
        }),
        button({ class: 'btn btn-sm btn-primary',
          onclick: () => {
            if (relayInput.val.startsWith('wss://')) {
              addRelay(relayInput.val)
              relaysStatus.val = getRelaysStatus()
              relayInput.val = ''
            }
          }
        }, '+')
      )
    ),

    // 3. Identity & Security (Danger Zone)
    div({ class: 'settings-danger-zone' },
      div({ class: 'settings-section-title' }, () => t('settings.security')),

      // Identity Sub-section
      div({ class: 'settings-sub-section' },
        div({ class: 'settings-section-title-sub' }, () => t('settings.identity')),
        div({ class: 'form-label' }, () => t('settings.identity.pubkey')),
        div({ class: 'pubkey-display' }, getPubkey()),
        p({ class: 'settings-text-muted', style: 'margin: 6px 0;' },
          () => t('settings.identity.export_warning')
        ),
        div({ class: 'settings-btn-group' },
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
          ? div({ class: 'pubkey-display', style: 'margin-top:8px;' }, getSecretKeyHex())
          : div(),
      ),

      div({ class: 'settings-divider' }),

      // Backup & Restore Sub-section
      div({ class: 'settings-sub-section' },
        div({ class: 'settings-section-title-sub' }, () => t('settings.backup_restore')),
        div({ class: 'form-label', style: 'margin-bottom:2px;' }, () => t('settings.identity.import_heading')),
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
        label({ class: 'btn btn-sm btn-muted', style: 'display:inline-block; cursor:pointer; text-align:center; margin-top:4px;' },
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

      div({ class: 'settings-divider' }),

      // Passkey Sub-section
      div({ class: 'settings-sub-section' },
        div({ class: 'settings-section-title-sub' }, () => t('settings.identity.passkey_heading')),
        p({ class: 'settings-text-muted' },
          () => t('settings.identity.passkey_desc')
        ),
        () => {
          if (!isWebAuthnSupported()) {
            return div({ class: 'settings-text-muted' }, () => t('settings.identity.passkey_unsupported'))
          }
          if (passkeyRegistered.val) {
            return div({ class: 'settings-sub-section' },
              div({ class: 'settings-text-mint' }, () => t('settings.identity.passkey_protected')),
              div({ class: 'settings-btn-group' },
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
                    if (confirm(t('settings.identity.passkey_disable_confirm') || 'Disable passkey protection?')) {
                      clearPasskey()
                      passkeyRegistered.val = false
                      alert(t('settings.identity.passkey.disabled'))
                    }
                  }
                }, () => t('settings.identity.passkey_disable'))
              )
            )
          } else {
            return div({ class: 'settings-btn-group' },
              button({
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
            )
          }
        }
      ),

      div({ class: 'settings-divider' }),

      // About & Licenses Section
      div({ class: 'settings-section' },
        div({ class: 'settings-section-title' }, 'About & Licenses'),
        p({ class: 'settings-text-muted', style: 'font-size:13px;line-height:1.4;margin:0;' },
          'saysheep is a decentralized, offline-first P2P sharing application.',
          van.tags.br(),
          'Map data © ',
          van.tags.a({ href: 'https://www.openstreetmap.org/copyright', target: '_blank' }, 'OpenStreetMap contributors'),
          '.',
          van.tags.br(),
          'Geocoding and place data provided by ',
          van.tags.a({ href: 'https://www.geonames.org/', target: '_blank' }, 'GeoNames'),
          ' (CC-BY 4.0).'
        )
      )
    )
  )

  const statusInterval = setInterval(() => {
    if (!document.body.contains(pageEl)) {
      clearInterval(statusInterval)
      return
    }
    const newStatus = getRelaysStatus()
    if (JSON.stringify(newStatus) !== JSON.stringify(relaysStatus.val)) {
      relaysStatus.val = newStatus
    }
  }, 1000)

  return pageEl
}
