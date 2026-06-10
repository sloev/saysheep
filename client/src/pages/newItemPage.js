import van from 'vanjs-core'
import { store } from '../store.js'
import { publishItem } from '../lib/sync.js'
import { TagInput } from '../fragments/tagInput.js'
import { t } from '../lib/i18n.js'
import { cone } from '../router.js'
import cameraImg from '../images/camera.png'
const { div, button, input, textarea, video, canvas, label, span, img } = van.tags

export const NewItemPage = () => {
  const cameraOn = van.state(false)
  const hasPhoto = van.state(false)
  const photoData = van.state(null)
  const title = van.state('')
  const description = van.state('')
  const tags = van.state([])
  const manualLocation = van.state(false)
  const customLat = van.state('')
  const customLng = van.state('')
  const customExpiry = van.state('')
  const submitting = van.state(false)
  const error = van.state('')

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
    const maxW = 800
    const ratio = maxW / videoEl.videoWidth
    canvasEl.width = Math.min(maxW, videoEl.videoWidth)
    canvasEl.height = videoEl.videoHeight * ratio
    canvasEl.getContext('2d').drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height)
    photoData.val = canvasEl.toDataURL('image/jpeg', 0.8)
    hasPhoto.val = true
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
      photoData.val = ev.target.result
      hasPhoto.val = true
    }
    reader.readAsDataURL(file)
  }

  van.derive(() => {
    if (cone.isCurrentPage('new') && !cameraOn.val && !hasPhoto.val) startCamera()
    if (!cone.isCurrentPage('new') && cameraOn.val) stopCamera()
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
      let availableUntil = null
      if (customExpiry.val) availableUntil = new Date(customExpiry.val).getTime()
      await publishItem({
        title: title.val,
        description: description.val,
        tags: tags.val,
        photo: photoData.val,
        geo,
        availableUntil,
      })
      cone.navigate('map', {})
    } catch (e) {
      error.val = e.message
    }
    submitting.val = false
  }

  // Max date = 14 days from now
  const maxDate = new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 16)

  return div({ class: 'page-content' },
    div({ class: 'page-header' },
      div({ class: 'page-title' }, t('new.heading'))
    ),
    div({ class: 'form-section' },
      // Photo area
      div({ class: 'photo-area' },
        () => hasPhoto.val
          ? img({ src: photoData.val, style: 'width:100%;height:100%;object-fit:cover' })
          : cameraOn.val
            ? videoEl
            : div({ class: 'photo-placeholder' }, span('📷'), span(t('new.photo.take')))
        ,
        canvasEl,
      ),
      // Photo buttons
      div({ style: 'display:flex;gap:8px' },
        () => hasPhoto.val
          ? button({ class: 'btn btn-sm', onclick: retake }, t('new.photo.retake'))
          : button({ class: 'btn btn-sm', onclick: startCamera }, t('new.photo.take')),
        label({ class: 'btn btn-sm', style: 'cursor:pointer' },
          t('new.photo.upload'),
          input({ type: 'file', accept: 'image/*', style: 'display:none', onchange: handleFileUpload })
        )
      ),

      // Tags (required)
      div(
        div({ class: 'form-label' }, t('new.tags')),
        TagInput({ tags, onTagsChange: (v) => tags.val = v })
      ),

      // Title
      div(
        div({ class: 'form-label' }, t('new.title')),
        input({ class: 'form-input', type: 'text', placeholder: t('new.title'),
          value: title, oninput: e => title.val = e.target.value })
      ),

      // Description
      div(
        div({ class: 'form-label' }, t('new.description')),
        textarea({ class: 'form-textarea', placeholder: t('new.description'), maxlength: 500,
          oninput: e => description.val = e.target.value }, description)
      ),

      // Location
      div(
        div({ class: 'form-label' }, t('nav.map')),
        div({ class: 'toggle-row' },
          input({ type: 'checkbox', id: 'manual-loc',
            onchange: e => manualLocation.val = e.target.checked }),
          label({ for: 'manual-loc' }, t('new.location.manual'))
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
        div({ class: 'form-label' }, t('new.available_until')),
        input({ class: 'form-input', type: 'datetime-local', max: maxDate,
          oninput: e => customExpiry.val = e.target.value })
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
