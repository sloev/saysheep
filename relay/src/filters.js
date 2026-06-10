export const matchesFilter = (event, filter) => {
  if (filter.ids?.length && !filter.ids.some(id => event.id.startsWith(id))) return false
  if (filter.kinds?.length && !filter.kinds.includes(event.kind)) return false
  if (filter.authors?.length && !filter.authors.some(a => event.pubkey.startsWith(a))) return false
  if (filter.since != null && event.created_at < filter.since) return false
  if (filter.until != null && event.created_at > filter.until) return false
  for (const [key, values] of Object.entries(filter)) {
    if (key.startsWith('#') && key.length === 2 && Array.isArray(values)) {
      const tagName = key[1]
      const eventVals = event.tags.filter(t => t[0] === tagName).map(t => t[1])
      if (!values.some(v => eventVals.includes(v))) return false
    }
  }
  return true
}

export const matchesAny = (event, filters) => filters.some(f => matchesFilter(event, f))
