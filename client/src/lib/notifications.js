import Geohash from 'ngeohash'
import { getSearchableTerms } from './categories.js'

let _permissionGranted = false
let _capacitorPlugin = null

const isCapacitorAndroid = () =>
  typeof window !== 'undefined' &&
  window.Capacitor?.isNativePlatform?.() === true

const getLocalNotifications = async () => {
  if (!isCapacitorAndroid()) return null
  if (_capacitorPlugin) return _capacitorPlugin
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    _capacitorPlugin = LocalNotifications
    return _capacitorPlugin
  } catch { return null }
}

// Same matching as the list search box, so an agent's saved query notifies on
// exactly the items it would show.
const matchesQuery = (event, query) => {
  const q = (query || '').toLowerCase().trim()
  if (!q) return true
  const { title, content, tags } = getSearchableTerms(event)
  return title.includes(q) || content.includes(q) || tags.some(t => t.includes(q))
}

export const requestNotificationPermission = async () => {
  const plugin = await getLocalNotifications()
  if (plugin) {
    try {
      const result = await plugin.requestPermissions()
      _permissionGranted = result.display === 'granted'
      return _permissionGranted
    } catch { return false }
  }
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') { _permissionGranted = true; return true }
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  _permissionGranted = result === 'granted'
  return _permissionGranted
}

export const getNotificationPermission = () => {
  if (isCapacitorAndroid()) {
    return _permissionGranted ? 'granted' : 'default'
  }
  return ('Notification' in window) ? Notification.permission : 'unsupported'
}

// Return the first agent whose query + map bounds match this event, or null.
// Agent: { name, query, bounds, notificationsEnabled }. Pure — used for both the
// OS notification and the in-app notification feed.
export const findAgentMatch = (event, agents) => {
  if (!event?.tags || !agents?.length) return null

  const geoTags = event.tags.filter(t => t[0] === 'g').map(t => t[1])
  if (!geoTags.length) return null
  const gh = geoTags.sort((a, b) => b.length - a.length)[0]
  const { latitude: lat, longitude: lng } = Geohash.decode(gh)

  for (const agent of agents) {
    if (agent.notificationsEnabled === false) continue
    const b = agent.bounds
    if (b && (lat < b.sw.lat || lat > b.ne.lat || lng < b.sw.lng || lng > b.ne.lng)) continue
    if (!matchesQuery(event, agent.query)) continue
    return agent
  }
  return null
}

// Fire an OS notification if a new event matches any agent.
export const notifyIfMatches = async (event, agents) => {
  if (!_permissionGranted) return
  const agent = findAgentMatch(event, agents)
  if (!agent) return

  const title = event.tags.find(t => t[0] === 'title')?.[1]
  const label = agent.name || 'agent'
  const body = agent.query ? `${agent.query} — ${label}` : `New item — ${label}`

  const plugin = await getLocalNotifications()
  if (plugin) {
    try {
      await plugin.schedule({
        notifications: [{
          title: title || 'New free item nearby!',
          body,
          id: Math.abs(parseInt(event.id.substring(0, 8), 16)) % 2147483647,
          smallIcon: 'ic_notification',
          iconColor: '#a0c878',
        }]
      })
    } catch {}
    return
  }

  try {
    new Notification(title || 'New free item nearby!', {
      body,
      icon: './images/icon.png',
      badge: './images/icon.png',
      tag: event.id, // deduplicate same event
      renotify: false,
    })
  } catch {}
}
