import Geohash from 'ngeohash'
import shape2geohash from 'shape2geohash'

export { Geohash }

export const encodeGeohash = (lat, lng, precision = 9) => Geohash.encode(lat, lng, precision)

export const decodeGeohash = (hash) => {
  const { latitude, longitude } = Geohash.decode(hash)
  return { lat: latitude, lng: longitude }
}

export const geohashBounds = (hash) => {
  const [minLat, minLng, maxLat, maxLng] = Geohash.decode_bbox(hash)
  return { sw: { lat: minLat, lng: minLng }, ne: { lat: maxLat, lng: maxLng } }
}

export const geohashesForBounds = async (sw, ne, precision) => {
  return shape2geohash(
    {
      type: 'Polygon',
      coordinates: [[
        [sw.lng, sw.lat],
        [ne.lng, sw.lat],
        [ne.lng, ne.lat],
        [sw.lng, ne.lat],
        [sw.lng, sw.lat],
      ]],
    },
    { precision, hashMode: 'intersect', minIntersect: 0, allowDuplicates: false }
  )
}

export const precisionForZoom = (zoom) => {
  if (zoom <= 4) return 2
  if (zoom <= 7) return 3
  if (zoom <= 10) return 4
  if (zoom <= 12) return 5
  if (zoom <= 14) return 6
  return 7
}

export const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const getHumanReadableLocation = async (lat, lng, geohash) => {
  const radius = geohash.length === 5 ? '5km' : '1.2km'
  return `${geohash} + ${radius}`
}
