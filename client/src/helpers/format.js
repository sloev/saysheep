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
