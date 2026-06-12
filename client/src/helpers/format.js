import { t } from '../lib/i18n.js'

export const formatRelative = (timestamp) => {
  const ms = Date.now() - (timestamp > 1e12 ? timestamp : timestamp * 1000)
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

export const formatDistance = (meters) => {
  if (!meters && meters !== 0) return ''
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  if (meters >= 100) return `${Math.round(meters)} m`
  return `${Math.round(meters)} m`
}

export const formatDate = (timestamp) => {
  const d = new Date(timestamp > 1e12 ? timestamp : timestamp * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const formatExpiry = (timestamp) => {
  const target = timestamp > 1e12 ? timestamp : timestamp * 1000
  const ms = target - Date.now()
  if (ms <= 0) return t('format.expired')
  const secs = Math.floor(ms / 1000)
  const mins = Math.floor(secs / 60)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)

  const d = new Date(target)
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  if (days > 0) {
    return days === 1
      ? t('format.left.day', { n: days, date: dateStr })
      : t('format.left.days', { n: days, date: dateStr })
  }
  if (hrs > 0) {
    return hrs === 1
      ? t('format.left.hour', { n: hrs, date: dateStr })
      : t('format.left.hours', { n: hrs, date: dateStr })
  }
  return mins === 1
    ? t('format.left.minute', { n: mins, date: dateStr })
    : t('format.left.minutes', { n: mins, date: dateStr })
}

