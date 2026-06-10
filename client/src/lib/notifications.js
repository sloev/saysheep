import Geohash from 'ngeohash'

let _permissionGranted = false

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') { _permissionGranted = true; return true }
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  _permissionGranted = result === 'granted'
  return _permissionGranted
}

export const getNotificationPermission = () =>
  ('Notification' in window) ? Notification.permission : 'unsupported'

// Check whether a new event matches any saved subscription and notify if so.
// Subscriptions: [{ id, geohash, tags: string[], label }]
export const notifyIfMatches = (event, subscriptions) => {
  if (!_permissionGranted) return
  if (!event?.tags) return
  if (subscriptions?.length === 0) return

  const eventGeoTags = event.tags.filter(t => t[0] === 'g').map(t => t[1])
  const eventTags = event.tags.filter(t => t[0] === 't').map(t => t[1].toLowerCase())
  const title = event.tags.find(t => t[0] === 'title')?.[1]

  for (const sub of (subscriptions || [])) {
    // Geohash match: event must be within or overlap the subscription area
    const geoMatch = eventGeoTags.some(g =>
      g.startsWith(sub.geohash) || sub.geohash.startsWith(g)
    )
    if (!geoMatch) continue

    // Tag match: if sub has tags, at least one must match
    const tagMatch = !sub.tags?.length ||
      sub.tags.some(st => eventTags.includes(st.toLowerCase()))
    if (!tagMatch) continue

    // Show notification
    const notifTitle = title || 'New free item nearby!'
    const body = sub.tags?.length
      ? `${sub.tags.join(', ')} — near ${sub.label || sub.geohash}`
      : `New item near ${sub.label || sub.geohash}`

    try {
      new Notification(notifTitle, {
        body,
        icon: './images/icon.png',
        badge: './images/icon.png',
        tag: event.id, // deduplicate same event
        renotify: false,
      })
    } catch {}
    return // one notification per event is enough
  }
}
