import { joinRoom } from 'trystero'
import { storeEvent } from './storage.js'
import { verifyEvent } from 'nostr-tools'

const APP_ID = 'glean-v1'
const TRACKER_URLS = [
  'wss://tracker.btorrent.xyz',
  'wss://tracker.openwebtorrent.com',
]

const rooms = new Map() // geohash -> { room, sendEvent, onEvent, peerCount }
let _onPeerCountChange = null
let _totalPeers = 0

export const initPeer = (onPeerCountChange) => {
  _onPeerCountChange = onPeerCountChange
}

const getRoomKey = (geohash) => `${APP_ID}:${geohash}`

export const joinAreaRoom = (geohash, onEvent) => {
  if (rooms.has(geohash)) {
    const existing = rooms.get(geohash)
    return () => leaveAreaRoom(geohash)
  }

  let room
  try {
    room = joinRoom(
      { appId: APP_ID, trackerUrls: TRACKER_URLS },
      getRoomKey(geohash)
    )
  } catch (e) {
    console.warn('Trystero room join failed:', e)
    return () => {}
  }

  const [sendEvent, receiveEvent] = room.makeAction('nostr-event')

  room.onPeerJoin(() => {
    _totalPeers++
    _onPeerCountChange?.(_totalPeers)
  })
  room.onPeerLeave(() => {
    _totalPeers = Math.max(0, _totalPeers - 1)
    _onPeerCountChange?.(_totalPeers)
  })

  receiveEvent((data) => {
    try {
      const event = typeof data === 'string' ? JSON.parse(data) : data
      if (!verifyEvent(event)) return
      storeEvent(event)
      onEvent(event)
    } catch {}
  })

  rooms.set(geohash, { room, sendEvent })
  return () => leaveAreaRoom(geohash)
}

export const broadcastEvent = (event, geohash) => {
  const roomData = rooms.get(geohash)
  if (!roomData) return
  try {
    roomData.sendEvent(event)
  } catch {}
}

export const leaveAreaRoom = (geohash) => {
  const roomData = rooms.get(geohash)
  if (!roomData) return
  try { roomData.room.leave() } catch {}
  rooms.delete(geohash)
}

export const getPeerCount = () => _totalPeers
