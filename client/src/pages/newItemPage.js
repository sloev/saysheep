import van from 'vanjs-core'
import { store } from '../store.js'
import { publishItem } from '../lib/sync.js'
import { TagInput } from '../fragments/tagInput.js'
import { t } from '../lib/i18n.js'
import { cone } from '../router.js'
import { randomUUID, computeReceiptHash, generateSecureVerificationCode, normalizeVerificationCode } from '../lib/nostr.js'
import { LocationPicker } from '../fragments/locationPicker.js'
import cameraImg from '../images/camera.png'
const { div, button, input, textarea, video, canvas, label, span, img, select, option } = van.tags

export const NewItemPage = () => {
  // Pre-fill from Web Share Target API params (?title=...&description=...&url=...)
  const _params = new URLSearchParams(window.location.search)
  const _sharedTitle = _params.get('title') || ''
  const _sharedDesc = [_sharedTitle, _params.get('text'), _params.get('url')].filter(Boolean).join('\n')

  const cameraOn = van.state(false)
  const hasPhoto = van.state(false)
  const photoData = van.state(null)
  const description = van.state(_sharedDesc)
  const tags = van.state([])
  const customLat = van.state('')
  const customLng = van.state('')
  const customExpiry = van.state(7)
  const submitting = van.state(false)
  const error = van.state('')

  const itemId = van.state(randomUUID())
  const verificationCode = van.state(generateSecureVerificationCode())
  const receiptHash = van.state('')

  van.derive(() => {
    if (verificationCode.val && itemId.val && store.identity.pubkey) {
      const normalized = normalizeVerificationCode(verificationCode.val)
      computeReceiptHash(normalized, itemId.val, store.identity.pubkey).then(h => {
        receiptHash.val = h
      })
    }
  })

  if (typeof window !== 'undefined' && typeof customElements !== 'undefined' && !customElements.get('camera-cleanup')) {
    customElements.define('camera-cleanup', class extends HTMLElement {
      disconnectedCallback() {
        if (this.onunmount) this.onunmount()
      }
    })
  }

  const cleanupEl = typeof document !== 'undefined' ? document.createElement('camera-cleanup') : {}

  const videoEl = video({ autoplay: true, playsinline: true, style: 'width:100%;height:100%;object-fit:cover' })
  const canvasEl = canvas({ style: 'display:none' })

  let activeStream = null

  cleanupEl.onunmount = () => {
    stopCamera()
  }

  const startCamera = () => {
    if (cameraOn.val) return
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(stream => {
        activeStream = stream
        if (cone.currentPage.val !== 'new' || !cleanupEl.isConnected) {
          stream.getTracks().forEach(t => t.stop())
          activeStream = null
          return
        }
        videoEl.srcObject = stream
        cameraOn.val = true
      })
      .catch(() => error.val = t('error.no_camera'))
  }

  const stopCamera = () => {
    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop())
      activeStream = null
    }
    videoEl.srcObject?.getTracks().forEach(t => t.stop())
    videoEl.srcObject = null
    cameraOn.val = false
  }

  const takePhoto = () => {
    const w = videoEl.videoWidth || 640
    const h = videoEl.videoHeight || 480
    const maxDim = 800
    let targetW = w
    let targetH = h
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        targetH = Math.round((h * maxDim) / w)
        targetW = maxDim
      } else {
        targetW = Math.round((w * maxDim) / h)
        targetH = maxDim
      }
    }

    canvasEl.width = targetW
    canvasEl.height = targetH
    const ctx = canvasEl.getContext('2d')
    ctx.drawImage(videoEl, 0, 0, targetW, targetH)

    try {
      photoData.val = canvasEl.toDataURL('image/jpeg', 0.7)
      hasPhoto.val = true
    } catch (err) {
      console.error('Failed to capture photo:', err)
    }
    stopCamera()
  }

  const retake = () => {
    hasPhoto.val = false
    photoData.val = null
    startCamera()
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const imgEl = document.createElement('img')
      imgEl.onload = () => {
        const w = imgEl.width || 640
        const h = imgEl.height || 480
        const maxDim = 800
        let targetW = w
        let targetH = h
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            targetH = Math.round((h * maxDim) / w)
            targetW = maxDim
          } else {
            targetW = Math.round((w * maxDim) / h)
            targetH = maxDim
          }
        }
        canvasEl.width = targetW
        canvasEl.height = targetH
        const ctx = canvasEl.getContext('2d')
        ctx.drawImage(imgEl, 0, 0, targetW, targetH)
        photoData.val = canvasEl.toDataURL('image/jpeg', 0.7)
        hasPhoto.val = true
        stopCamera()
      }
      imgEl.onerror = () => {
        alert(t('new.photo.failed'))
      }
      imgEl.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  const resetForm = () => {
    hasPhoto.val = false
    photoData.val = null
    description.val = ''
    tags.val = []
    customLat.val = ''
    customLng.val = ''
    customExpiry.val = 7
    submitting.val = false
    error.val = ''
    itemId.val = randomUUID()
    verificationCode.val = generateSecureVerificationCode()
    stopCamera()
  }

  van.derive(() => {
    const isNewPage = cone.currentPage.val === 'new'
    if (isNewPage) {
      if (!cameraOn.val && !hasPhoto.val) startCamera()
    } else {
      if (cameraOn.val) stopCamera()
      videoEl.srcObject?.getTracks().forEach(t => t.stop())
      videoEl.srcObject = null
    }
  })

  // The map pin is authoritative — it seeds at the current GPS location and the
  // user can drag/tap it elsewhere to set the location manually. Fall back to raw
  // GPS only if the pin hasn't been placed yet.
  const getGeo = () => {
    const lat = parseFloat(customLat.val)
    const lng = parseFloat(customLng.val)
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng }
    if (store.position.loading || !store.position.lat || store.position.isFallback) return null
    return { lat: store.position.lat, lng: store.position.lng }
  }

  const canSubmit = () => {
    const geo = getGeo()
    // receiptHash (the pickup-code commitment) must be ready: every listing is
    // published with an h tag so it can only be claimed with the right code.
    return !submitting.val && tags.val.length > 0 && !!geo && !!receiptHash.val
  }

  const submit = async () => {
    const geo = getGeo()
    if (!geo || tags.val.length === 0) {
      error.val = tags.val.length === 0 ? t('new.need_tags') : t('error.no_gps')
      return
    }
    if (!receiptHash.val) {
      error.val = t('new.need_pickup_code')
      return
    }
    error.val = ''
    submitting.val = true
    try {
      const days = customExpiry.val
      const availableUntil = Date.now() + days * 24 * 3600 * 1000
      await publishItem({
        id: itemId.val,
        description: description.val,
        tags: tags.val,
        photo: photoData.val,
        geo,
        availableUntil,
        receiptHash: receiptHash.val,
      })
      alert(t('new.pickup_code_alert', { code: verificationCode.val }))
      resetForm()
      cone.navigate('map', {})
    } catch (e) {
      error.val = e.message
    }
    submitting.val = false
  }

  const el = div({ class: 'page-content' },
    div({ class: 'page-header' },
      div({ class: 'page-title' }, () => t('new.heading'))
    ),
    div({ class: 'form-section' },
      // Photo area
      div({ class: 'photo-area' },
        () => hasPhoto.val
          ? img({ src: photoData.val, style: 'width:100%;height:100%;object-fit:cover' })
          : cameraOn.val
            ? videoEl
            : div({ class: 'photo-placeholder' }, span('📷'), span(() => t('new.photo.take')))
        ,
        canvasEl,
      ),
      // Photo buttons
      div({ style: 'display:flex;gap:8px' },
        () => {
          if (hasPhoto.val) {
            return button({ class: 'btn btn-sm', onclick: retake }, () => t('new.photo.retake'))
          }
          if (cameraOn.val) {
            return button({ class: 'btn btn-sm btn-primary', onclick: takePhoto }, () => t('new.photo.take'))
          }
          return button({ class: 'btn btn-sm', onclick: startCamera }, () => t('new.photo.take'))
        },
        label({ class: 'btn btn-sm', style: 'cursor:pointer' },
          () => t('new.photo.upload'),
          input({ type: 'file', accept: 'image/*', style: 'display:none', onchange: handleFileUpload })
        )
      ),

      // Tags (required)
      div(
        div({ class: 'form-label' }, () => t('new.tags')),
        TagInput({ tags, onTagsChange: (v) => tags.val = v })
      ),



      // Description
      div(
        div({ class: 'form-label' }, () => t('new.description')),
        textarea({ class: 'form-textarea', placeholder: () => t('new.description'), maxlength: 500,
          oninput: e => description.val = e.target.value }, description)
      ),

      // Location — always a map, defaulted to the current location, with a
      // movable pin. Built once (not inside a reactive toggle) so it never
      // flickers, and a small hint tells the user they can move it.
      div(
        div({ class: 'form-label' }, () => t('new.location.heading')),
        div({ style: 'font-size:13px;color:var(--muted);margin-bottom:6px' }, () => t('new.location.tap_map')),
        LocationPicker({
          initialLat: customLat.val ? parseFloat(customLat.val) : null,
          initialLng: customLng.val ? parseFloat(customLng.val) : null,
          onPick: (lat, lng) => { customLat.val = String(lat); customLng.val = String(lng) },
        }),
        () => (customLat.val && customLng.val)
          ? div({ style: 'font-size:13px;font-weight:700;margin-top:6px' },
              `📍 ${parseFloat(customLat.val).toFixed(5)}, ${parseFloat(customLng.val).toFixed(5)}`)
          : ''
      ),

      // Available until
      div(
        div({ class: 'form-label' }, () => t('new.available_until')),
        select({
          class: 'form-select',
          value: customExpiry,
          onchange: e => customExpiry.val = parseInt(e.target.value)
        },
          // Daily granularity for the first week, then weekly up to 8 weeks.
          ...[1, 2, 3, 4, 5, 6, 7, 14, 21, 28, 35, 42, 49, 56].map(day =>
            option({ value: day, selected: () => customExpiry.val === day },
              () => day >= 14
                ? `${day / 7} ${t('new.weeks')}`
                : `${day} ${day === 1 ? t('new.day') : t('new.days')}`
            )
          )
        )
      ),


      // Error
      () => error.val ? div({ style: 'color:var(--pink);font-size:13px;font-weight:600' }, error.val) : div(),

      // Submit
      button({
        class: 'btn btn-submit',
        disabled: () => !canSubmit(),
        onclick: submit,
      }, () => submitting.val ? '...' : t('new.submit'))
    )
  )

  if (typeof document !== 'undefined') {
    el.appendChild(cleanupEl)
  }
  return el
}
