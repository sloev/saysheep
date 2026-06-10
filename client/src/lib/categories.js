export const CATEGORIES = [
  { id: 'food', emoji: '🥗', label: 'food', children: ['produce','vegetables','fruit','eggs','dairy','bread','baked goods','packaged food','canned food','beverages','meat','fish','frozen food','snacks','condiments','grains','cheese'] },
  { id: 'household', emoji: '🏠', label: 'household', children: ['furniture','kitchen','appliances','bedding','storage','decor','cleaning','bathroom','lighting','garden tools','curtains'] },
  { id: 'clothing', emoji: '👕', label: 'clothing', children: ['tops','bottoms','dresses','shoes','boots','bags','accessories','jackets','coats','underwear','sportswear','hats','scarves','gloves'] },
  { id: 'books', emoji: '📚', label: 'books & media', children: ['books','magazines','comics','music','vinyl','movies','board games','video games','textbooks','manga'] },
  { id: 'electronics', emoji: '📱', label: 'electronics', children: ['phones','computers','cables','chargers','accessories','speakers','headphones','cameras','tablets','keyboards','monitors'] },
  { id: 'garden', emoji: '🌱', label: 'garden & plants', children: ['plants','seeds','pots','soil','fertilizer','garden tools','bulbs','flowers','herbs','vegetables'] },
  { id: 'tools', emoji: '🔧', label: 'tools & diy', children: ['hand tools','power tools','hardware','paint','wood','building materials','screws','nails','tape'] },
  { id: 'sports', emoji: '🚴', label: 'sports & outdoor', children: ['bikes','cycling','camping','hiking','fitness','yoga','water sports','skates','skis','tennis','football'] },
  { id: 'toys', emoji: '🧸', label: 'toys & games', children: ['toys','games','puzzles','stuffed animals','lego','dolls','action figures','play-doh'] },
  { id: 'art', emoji: '🎨', label: 'art & crafts', children: ['art supplies','craft supplies','fabric','yarn','finished artwork','paint','canvas','sewing'] },
  { id: 'baby', emoji: '👶', label: 'baby & kids', children: ['baby clothes','kids clothes','stroller','baby gear','school supplies','backpacks','lunchboxes'] },
  { id: 'other', emoji: '✨', label: 'other', children: [] },
]

const ALL_TAGS = CATEGORIES.flatMap(c => [c.id, ...c.children])
const UNIQUE_TAGS = [...new Set(ALL_TAGS)]

export const searchTags = (query, max = 8) => {
  if (!query?.trim()) return []
  const q = query.toLowerCase().trim()
  const exact = UNIQUE_TAGS.filter(t => t.startsWith(q))
  const fuzzy = UNIQUE_TAGS.filter(t => !t.startsWith(q) && t.includes(q))
  return [...exact, ...fuzzy].slice(0, max)
}

export const getCategoryForTag = (tag) => {
  for (const cat of CATEGORIES) {
    if (cat.id === tag || cat.children.includes(tag)) return cat
  }
  return CATEGORIES[CATEGORIES.length - 1]
}

export const getTagColor = (tag) => {
  const cat = getCategoryForTag(tag)
  const colors = {
    food: '#ffd93d', household: '#a8e6cf', clothing: '#ffd6e7',
    books: '#c3b1e1', electronics: '#b8d4f0', garden: '#b5ead7',
    tools: '#ffdac1', sports: '#e2f0cb', toys: '#ffb7b2',
    art: '#ff9aa2', baby: '#ffeaa7', other: '#dfe6e9',
  }
  return colors[cat.id] || '#dfe6e9'
}
