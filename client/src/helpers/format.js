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
  if (ms <= 0) return 'expired'
  const secs = Math.floor(ms / 1000)
  const mins = Math.floor(secs / 60)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)

  const d = new Date(target)
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  if (days > 0) {
    const unit = days === 1 ? 'day' : 'days'
    return `${days} ${unit} left (${dateStr})`
  }
  if (hrs > 0) {
    const unit = hrs === 1 ? 'hour' : 'hours'
    return `${hrs} ${unit} left (${dateStr})`
  }
  const unit = mins === 1 ? 'minute' : 'minutes'
  return `${mins} ${unit} left (${dateStr})`
}

