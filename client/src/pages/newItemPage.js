import van from 'vanjs-core'
import { store } from '../store.js'
import { publishItem } from '../lib/sync.js'
import { TagInput } from '../fragments/tagInput.js'
import { t } from '../lib/i18n.js'
import { cone } from '../router.js'
import { randomUUID, computeReceiptHash } from '../lib/nostr.js'
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
  const manualLocation = van.state(false)
  const customLat = van.state('')
  const customLng = van.state('')
  const customExpiry = van.state(7)
  const submitting = van.state(false)
  const error = van.state('')

  const itemId = randomUUID()
  const verificationCode = van.state(Math.floor(10000000 + Math.random() * 90000000).toString())
  const receiptHash = van.state('')

  computeReceiptHash(verificationCode.val, itemId, store.identity.pubkey).then(h => {
    receiptHash.val = h
  })

  const videoEl = video({ autoplay: true, playsinline: true, style: 'width:100%;height:100%;object-fit:cover' })
  const canvasEl = canvas({ style: 'display:none' })

  const startCamera = () => {
    if (cameraOn.val) return
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(stream => {
        videoEl.srcObject = stream
        cameraOn.val = true
      })
      .catch(() => error.val = t('error.no_camera'))
  }

  const stopCamera = () => {
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

  van.derive(() => {
    const isNewPage = cone.currentPage.val === 'new'
    if (isNewPage && !cameraOn.val && !hasPhoto.val) startCamera()
    if (!isNewPage && cameraOn.val) stopCamera()
  })

  const getGeo = () => {
    if (manualLocation.val) {
      const lat = parseFloat(customLat.val)
      const lng = parseFloat(customLng.val)
      if (isNaN(lat) || isNaN(lng)) return null
      return { lat, lng }
    }
    if (store.position.loading || !store.position.lat) return null
    return { lat: store.position.lat, lng: store.position.lng }
  }

  const canSubmit = () => {
    const geo = getGeo()
    return !submitting.val && tags.val.length > 0 && !!geo
  }

  const submit = async () => {
    const geo = getGeo()
    if (!geo || tags.val.length === 0) {
      error.val = tags.val.length === 0 ? t('new.need_tags') : t('error.no_gps')
      return
    }
    error.val = ''
    submitting.val = true
    try {
      const days = customExpiry.val
      const availableUntil = Date.now() + days * 24 * 3600 * 1000
      await publishItem({
        id: itemId,
        description: description.val,
        tags: tags.val,
        photo: photoData.val,
        geo,
        availableUntil,
        receiptHash: receiptHash.val,
      })
      alert(`Pickup Verification Code: ${verificationCode.val}\n\nGive this 8-digit code to the taker when they pick up the item. They will enter it to mark the item as taken.`)
      cone.navigate('map', {})
    } catch (e) {
      error.val = e.message
    }
    submitting.val = false
  }

  return div({ class: 'page-content' },
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

      // Location
      div(
        div({ class: 'form-label' }, () => t('nav.map')),
        div({ class: 'toggle-row' },
          input({ type: 'checkbox', id: 'manual-loc',
            onchange: e => manualLocation.val = e.target.checked }),
          label({ for: 'manual-loc' }, () => t('new.location.manual'))
        ),
        () => !manualLocation.val
          ? div({ style: 'font-size:13px;color:var(--muted);margin-top:6px' },
              store.position.loading ? t('new.waiting_gps') : t('new.location.auto')
            )
          : div({ style: 'display:flex;gap:8px;margin-top:6px' },
              input({ class: 'form-input', type: 'number', placeholder: 'lat', step: 'any',
                oninput: e => customLat.val = e.target.value }),
              input({ class: 'form-input', type: 'number', placeholder: 'lng', step: 'any',
                oninput: e => customLng.val = e.target.value }),
            )
      ),

      // Available until
      div(
        div({ class: 'form-label' }, () => t('new.available_until')),
        select({
          class: 'form-select',
          value: customExpiry,
          onchange: e => customExpiry.val = parseInt(e.target.value)
        },
          ...Array.from({ length: 14 }, (_, i) => i + 1).map(day =>
            option({ value: day, selected: () => customExpiry.val === day },
              () => `${day} ${day === 1 ? t('new.day') : t('new.days')}`
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
}
