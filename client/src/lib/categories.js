import { getLang } from './i18n.js'

export const TAXONOMY = {
  // Top level: Household
  'household': { label: 'household', emoji: '🏠', children: ['furniture', 'kitchenware', 'appliances', 'decor', 'bedding'] },
  'furniture': { label: 'furniture', parent: 'household', children: ['chair', 'sofa', 'table', 'bed', 'desk', 'cabinet', 'bookshelf', 'wardrobe', 'dresser'] },
  'chair': { label: 'chair', parent: 'furniture' },
  'sofa': { label: 'sofa', parent: 'furniture' },
  'table': { label: 'table', parent: 'furniture' },
  'bed': { label: 'bed', parent: 'furniture' },
  'desk': { label: 'desk', parent: 'furniture' },
  'cabinet': { label: 'cabinet', parent: 'furniture' },
  'bookshelf': { label: 'bookshelf', parent: 'furniture' },
  'wardrobe': { label: 'wardrobe', parent: 'furniture' },
  'dresser': { label: 'dresser', parent: 'furniture' },
  'kitchenware': { label: 'kitchenware', parent: 'household', children: ['pots & pans', 'dishes', 'cutlery', 'utensils', 'glassware'] },
  'pots & pans': { label: 'pots & pans', parent: 'kitchenware' },
  'dishes': { label: 'dishes', parent: 'kitchenware' },
  'cutlery': { label: 'cutlery', parent: 'kitchenware' },
  'utensils': { label: 'utensils', parent: 'kitchenware' },
  'glassware': { label: 'glassware', parent: 'kitchenware' },
  'appliances': { label: 'appliances', parent: 'household', children: ['microwave', 'toaster', 'blender', 'coffee maker', 'vacuum cleaner', 'iron'] },
  'microwave': { label: 'microwave', parent: 'appliances' },
  'toaster': { label: 'toaster', parent: 'appliances' },
  'blender': { label: 'blender', parent: 'appliances' },
  'coffee maker': { label: 'coffee maker', parent: 'appliances' },
  'vacuum cleaner': { label: 'vacuum cleaner', parent: 'appliances' },
  'iron': { label: 'iron', parent: 'appliances' },
  'decor': { label: 'decor', parent: 'household', children: ['lamp', 'rug', 'mirror', 'painting', 'vase', 'clock'] },
  'lamp': { label: 'lamp', parent: 'decor' },
  'rug': { label: 'rug', parent: 'decor' },
  'mirror': { label: 'mirror', parent: 'decor' },
  'painting': { label: 'painting', parent: 'decor' },
  'vase': { label: 'vase', parent: 'decor' },
  'clock': { label: 'clock', parent: 'decor' },
  'bedding': { label: 'bedding', parent: 'household', children: ['sheets', 'pillow', 'blanket', 'towel'] },
  'sheets': { label: 'sheets', parent: 'bedding' },
  'pillow': { label: 'pillow', parent: 'bedding' },
  'blanket': { label: 'blanket', parent: 'bedding' },
  'towel': { label: 'towel', parent: 'bedding' },

  // Top level: Clothing
  'clothing': { label: 'clothing', emoji: '👕', children: ['mens clothing', 'womens clothing', 'kids clothing', 'shoes', 'accessories'] },
  'mens clothing': { label: 'mens clothing', parent: 'clothing', children: ['mens shirts', 'mens pants', 'mens jackets', 'mens suits'] },
  'mens shirts': { label: 'mens shirts', parent: 'mens clothing' },
  'mens pants': { label: 'mens pants', parent: 'mens clothing' },
  'mens jackets': { label: 'mens jackets', parent: 'mens clothing' },
  'mens suits': { label: 'mens suits', parent: 'mens clothing' },
  'womens clothing': { label: 'womens clothing', parent: 'clothing', children: ['dresses', 'womens tops', 'womens pants', 'womens skirts', 'womens jackets'] },
  'dresses': { label: 'dresses', parent: 'womens clothing' },
  'womens tops': { label: 'womens tops', parent: 'womens clothing' },
  'womens pants': { label: 'womens pants', parent: 'womens clothing' },
  'womens skirts': { label: 'womens skirts', parent: 'womens clothing' },
  'womens jackets': { label: 'womens jackets', parent: 'womens clothing' },
  'kids clothing': { label: 'kids clothing', parent: 'clothing' },
  'shoes': { label: 'shoes', parent: 'clothing', children: ['sneakers', 'boots', 'sandals', 'formal shoes', 'heels'] },
  'sneakers': { label: 'sneakers', parent: 'shoes' },
  'boots': { label: 'boots', parent: 'shoes' },
  'sandals': { label: 'sandals', parent: 'shoes' },
  'formal shoes': { label: 'formal shoes', parent: 'shoes' },
  'heels': { label: 'heels', parent: 'shoes' },
  'accessories': { label: 'accessories', parent: 'clothing', children: ['bag', 'backpack', 'wallet', 'belt', 'hat', 'sunglasses', 'watch', 'jewelry'] },
  'bag': { label: 'bag', parent: 'accessories' },
  'backpack': { label: 'backpack', parent: 'accessories' },
  'wallet': { label: 'wallet', parent: 'accessories' },
  'belt': { label: 'belt', parent: 'accessories' },
  'hat': { label: 'hat', parent: 'accessories' },
  'sunglasses': { label: 'sunglasses', parent: 'accessories' },
  'watch': { label: 'watch', parent: 'accessories' },
  'jewelry': { label: 'jewelry', parent: 'accessories' },

  // Top level: Electronics
  'electronics': { label: 'electronics', emoji: '📱', children: ['phones', 'computers', 'audio & video', 'cameras'] },
  'phones': { label: 'phones', parent: 'electronics', children: ['smartphones', 'phone cases', 'chargers'] },
  'smartphones': { label: 'smartphones', parent: 'phones' },
  'phone cases': { label: 'phone cases', parent: 'phones' },
  'chargers': { label: 'chargers', parent: 'phones' },
  'computers': { label: 'computers', parent: 'electronics', children: ['laptops', 'desktops', 'tablets', 'monitors', 'keyboards', 'mice'] },
  'laptops': { label: 'laptops', parent: 'computers' },
  'desktops': { label: 'desktops', parent: 'computers' },
  'tablets': { label: 'tablets', parent: 'computers' },
  'monitors': { label: 'monitors', parent: 'computers' },
  'keyboards': { label: 'keyboards', parent: 'computers' },
  'mice': { label: 'mice', parent: 'computers' },
  'audio & video': { label: 'audio & video', parent: 'electronics', children: ['tv', 'speakers', 'headphones', 'dvd player', 'projector'] },
  'tv': { label: 'tv', parent: 'audio & video' },
  'speakers': { label: 'speakers', parent: 'audio & video' },
  'headphones': { label: 'headphones', parent: 'audio & video' },
  'dvd player': { label: 'dvd player', parent: 'audio & video' },
  'projector': { label: 'projector', parent: 'audio & video' },
  'cameras': { label: 'cameras', parent: 'electronics', children: ['dslr', 'lens', 'tripod', 'action camera'] },
  'dslr': { label: 'dslr', parent: 'cameras' },
  'lens': { label: 'lens', parent: 'cameras' },
  'tripod': { label: 'tripod', parent: 'cameras' },
  'action camera': { label: 'action camera', parent: 'cameras' },

  // Top level: Sports & Leisure
  'sports': { label: 'sports', emoji: '🚴', children: ['bikes', 'fitness', 'outdoor sports', 'sports gear'] },
  'bikes': { label: 'bikes', parent: 'sports', children: ['mountain bikes', 'road bikes', 'kids bikes', 'electric bikes', 'bike accessories'] },
  'mountain bikes': { label: 'mountain bikes', parent: 'bikes' },
  'road bikes': { label: 'road bikes', parent: 'bikes' },
  'kids bikes': { label: 'kids bikes', parent: 'bikes' },
  'electric bikes': { label: 'electric bikes', parent: 'bikes' },
  'bike accessories': { label: 'bike accessories', parent: 'bikes' },
  'fitness': { label: 'fitness', parent: 'sports', children: ['treadmill', 'dumbbells', 'yoga mat', 'resistance bands'] },
  'treadmill': { label: 'treadmill', parent: 'fitness' },
  'dumbbells': { label: 'dumbbells', parent: 'fitness' },
  'yoga mat': { label: 'yoga mat', parent: 'fitness' },
  'resistance bands': { label: 'resistance bands', parent: 'fitness' },
  'outdoor sports': { label: 'outdoor sports', parent: 'sports', children: ['tent', 'sleeping bag', 'backpacking', 'camping stove'] },
  'tent': { label: 'tent', parent: 'outdoor sports' },
  'sleeping bag': { label: 'sleeping bag', parent: 'outdoor sports' },
  'backpacking': { label: 'backpacking', parent: 'outdoor sports' },
  'camping stove': { label: 'camping stove', parent: 'outdoor sports' },
  'sports gear': { label: 'sports gear', parent: 'sports', children: ['tennis racket', 'golf clubs', 'skateboard', 'skis', 'snowboard'] },
  'tennis racket': { label: 'tennis racket', parent: 'sports gear' },
  'golf clubs': { label: 'golf clubs', parent: 'sports gear' },
  'skateboard': { label: 'skateboard', parent: 'sports gear' },
  'skis': { label: 'skis', parent: 'sports gear' },
  'snowboard': { label: 'snowboard', parent: 'sports gear' },

  // Top level: Toys & Games
  'toys': { label: 'toys', emoji: '🧸', children: ['building blocks', 'board games', 'dolls'] },
  'building blocks': { label: 'building blocks', parent: 'toys', children: ['lego', 'duplo'] },
  'lego': { label: 'lego', parent: 'building blocks' },
  'duplo': { label: 'duplo', parent: 'building blocks' },
  'board games': { label: 'board games', parent: 'toys', children: ['boardgame', 'chess', 'puzzle'] },
  'boardgame': { label: 'boardgame', parent: 'board games' },
  'chess': { label: 'chess', parent: 'board games' },
  'puzzle': { label: 'puzzle', parent: 'board games' },
  'dolls': { label: 'dolls', parent: 'toys', children: ['doll', 'barbie', 'action figure'] },
  'doll': { label: 'doll', parent: 'dolls' },
  'barbie': { label: 'barbie', parent: 'dolls' },
  'action figure': { label: 'action figure', parent: 'dolls' },

  // Top level: Books & Media
  'books': { label: 'books', emoji: '📚', children: ['literature', 'music'] },
  'literature': { label: 'literature', parent: 'books', children: ['fiction', 'non-fiction', 'textbooks', 'comics', 'childrens books'] },
  'fiction': { label: 'fiction', parent: 'literature' },
  'non-fiction': { label: 'non-fiction', parent: 'literature' },
  'textbooks': { label: 'textbooks', parent: 'literature' },
  'comics': { label: 'comics', parent: 'literature' },
  'childrens books': { label: 'childrens books', parent: 'literature' },
  'music': { label: 'music', parent: 'books', children: ['guitar', 'keyboard instrument', 'drums', 'violin', 'vinyl records', 'cds'] },
  'guitar': { label: 'guitar', parent: 'music' },
  'keyboard instrument': { label: 'keyboard instrument', parent: 'music' },
  'drums': { label: 'drums', parent: 'music' },
  'violin': { label: 'violin', parent: 'music' },
  'vinyl records': { label: 'vinyl records', parent: 'music' },
  'cds': { label: 'cds', parent: 'music' },

  // Top level: Garden
  'garden': { label: 'garden', emoji: '🌱', children: ['plants', 'garden tools'] },
  'plants': { label: 'plants', parent: 'garden', children: ['indoor plants', 'seeds', 'flowers', 'herbs', 'vegetables'] },
  'indoor plants': { label: 'indoor plants', parent: 'plants' },
  'seeds': { label: 'seeds', parent: 'plants' },
  'flowers': { label: 'flowers', parent: 'plants' },
  'herbs': { label: 'herbs', parent: 'plants' },
  'vegetables': { label: 'vegetables', parent: 'plants' },
  'garden tools': { label: 'garden tools', parent: 'garden', children: ['shovels', 'lawn mower', 'watering can', 'flower pots'] },
  'shovels': { label: 'shovels', parent: 'garden tools' },
  'lawn mower': { label: 'lawn mower', parent: 'garden tools' },
  'watering can': { label: 'watering can', parent: 'garden tools' },
  'flower pots': { label: 'flower pots', parent: 'garden tools' },

  // Top level: Tools & DIY
  'tools': { label: 'tools', emoji: '🔧', children: ['hand tools', 'power tools', 'building materials'] },
  'hand tools': { label: 'hand tools', parent: 'tools', children: ['hammer', 'screwdriver', 'wrench', 'pliers', 'tape measure'] },
  'hammer': { label: 'hammer', parent: 'hand tools' },
  'screwdriver': { label: 'screwdriver', parent: 'hand tools' },
  'wrench': { label: 'wrench', parent: 'hand tools' },
  'pliers': { label: 'pliers', parent: 'hand tools' },
  'tape measure': { label: 'tape measure', parent: 'hand tools' },
  'power tools': { label: 'power tools', parent: 'tools', children: ['drill', 'saw', 'sander'] },
  'drill': { label: 'drill', parent: 'power tools' },
  'saw': { label: 'saw', parent: 'power tools' },
  'sander': { label: 'sander', parent: 'power tools' },
  'building materials': { label: 'building materials', parent: 'tools', children: ['paint', 'brushes', 'screws', 'lumber'] },
  'paint': { label: 'paint', parent: 'building materials' },
  'brushes': { label: 'brushes', parent: 'building materials' },
  'screws': { label: 'screws', parent: 'building materials' },
  'lumber': { label: 'lumber', parent: 'building materials' },

  // Top level: Baby & Kids
  'baby': { label: 'baby', emoji: '👶', children: ['baby gear', 'baby clothes'] },
  'baby gear': { label: 'baby gear', parent: 'baby', children: ['stroller', 'crib', 'car seat', 'baby monitor'] },
  'stroller': { label: 'stroller', parent: 'baby gear' },
  'crib': { label: 'crib', parent: 'baby gear' },
  'car seat': { label: 'car seat', parent: 'baby gear' },
  'baby monitor': { label: 'baby monitor', parent: 'baby gear' },
  'baby clothes': { label: 'baby clothes', parent: 'baby' },

  // Top level: Pets
  'pets': { label: 'pets', emoji: '🐱', children: ['dog supplies', 'cat supplies', 'aquarium'] },
  'dog supplies': { label: 'dog supplies', parent: 'pets', children: ['dog leash', 'dog bed', 'dog toys'] },
  'dog leash': { label: 'dog leash', parent: 'dog supplies' },
  'dog bed': { label: 'dog bed', parent: 'dog supplies' },
  'dog toys': { label: 'dog toys', parent: 'dog supplies' },
  'cat supplies': { label: 'cat supplies', parent: 'pets', children: ['litter box', 'cat toys', 'scratching post'] },
  'litter box': { label: 'litter box', parent: 'cat supplies' },
  'cat toys': { label: 'cat toys', parent: 'cat supplies' },
  'scratching post': { label: 'scratching post', parent: 'cat supplies' },
  'aquarium': { label: 'aquarium', parent: 'pets' },

  // Top level: Food
  'food': { label: 'food', emoji: '🥗', children: ['produce', 'bakery', 'pantry'] },
  'produce': { label: 'produce', parent: 'food' },
  'bakery': { label: 'bakery', parent: 'food' },
  'pantry': { label: 'pantry', parent: 'food' },

  // Top level: Vehicles
  'vehicles': { label: 'vehicles', emoji: '🚗', children: ['car parts', 'car accessories', 'tires'] },
  'car parts': { label: 'car parts', parent: 'vehicles' },
  'car accessories': { label: 'car accessories', parent: 'vehicles' },
  'tires': { label: 'tires', parent: 'vehicles' },

  // Top level: Health & Beauty
  'health & beauty': { label: 'health & beauty', emoji: '🧴', children: ['cosmetics', 'personal care', 'hair care'] },
  'cosmetics': { label: 'cosmetics', parent: 'health & beauty' },
  'personal care': { label: 'personal care', parent: 'health & beauty' },
  'hair care': { label: 'hair care', parent: 'health & beauty' },

  // Top level: Office Supplies
  'office': { label: 'office', emoji: '📎', children: ['stationery', 'writing instruments', 'desk organizers'] },
  'stationery': { label: 'stationery', parent: 'office' },
  'writing instruments': { label: 'writing instruments', parent: 'office' },
  'desk organizers': { label: 'desk organizers', parent: 'office' },

  // Top level: Other
  'other': { label: 'other', emoji: '✨' }
}

const LOCALIZED_NAMES = {
  da: {
    'food': 'mad',
    'produce': 'friske råvarer',
    'fruit': 'frugt',
    'vegetables': 'grøntsager',
    'herbs': 'krydderurter',
    'bakery': 'bagværk',
    'bread': 'brød',
    'pastries': 'kager & wienerbrød',
    'pantry': 'kolonial',
    'canned food': 'konserves',
    'grains': 'korn & ris',
    'snacks': 'snacks',
    'spices': 'krydderier',
    'household': 'husholdning',
    'furniture': 'møbler',
    'chair': 'stol',
    'sofa': 'sofa',
    'table': 'bord',
    'bed': 'seng',
    'desk': 'skrivebord',
    'cabinet': 'skab',
    'bookshelf': 'bogreol',
    'wardrobe': 'klædeskab',
    'dresser': 'kommode',
    'kitchenware': 'køkkenudstyr',
    'pots & pans': 'gryder & pander',
    'dishes': 'tallerkener & service',
    'cutlery': 'bestik',
    'utensils': 'køkkenredskaber',
    'glassware': 'glas',
    'appliances': 'hvidevarer & elapparater',
    'microwave': 'mikrobølgeovn',
    'toaster': 'brødrister',
    'blender': 'blender',
    'coffee maker': 'kaffemaskine',
    'vacuum cleaner': 'støvsuger',
    'iron': 'strygejern',
    'decor': 'boligindretning & lamper',
    'lamp': 'lampe',
    'rug': 'tæppe',
    'mirror': 'spejl',
    'painting': 'maleri',
    'vase': 'vase',
    'clock': 'ur',
    'bedding': 'sengelinned & håndklæder',
    'sheets': 'lagner',
    'pillow': 'pude',
    'blanket': 'tæppe',
    'towel': 'håndklæde',
    'clothing': 'tøj & beklædning',
    'mens clothing': 'herretøj',
    'mens shirts': 'skjorter til mænd',
    'mens pants': 'bukser til mænd',
    'mens jackets': 'jakker til mænd',
    'mens suits': 'jakkesæt',
    'womens clothing': 'dametøj',
    'dresses': 'kjoler',
    'womens tops': 'dametoppe',
    'womens pants': 'damebukser',
    'womens skirts': 'nederdele',
    'womens jackets': 'damejakker',
    'kids clothing': 'børnetøj',
    'shoes': 'sko',
    'sneakers': 'sneakers',
    'boots': 'støvler',
    'sandals': 'sandaler',
    'formal shoes': 'fine sko',
    'heels': 'høje hæle',
    'accessories': 'tilbehør & tasker',
    'bag': 'taske',
    'backpack': 'rygsæk',
    'wallet': 'pung',
    'belt': 'bælte',
    'hat': 'hat',
    'sunglasses': 'solbriller',
    'watch': 'armbåndsur',
    'jewelry': 'smykker',
    'electronics': 'elektronik & tech',
    'phones': 'telefoner & tilbehør',
    'smartphones': 'smartphones',
    'phone cases': 'mobilcovers',
    'chargers': 'opladere',
    'computers': 'computere & tablets',
    'laptops': 'bærbare computere',
    'desktops': 'stationære computere',
    'tablets': 'tablets',
    'monitors': 'skærme',
    'keyboards': 'tastaturer',
    'mice': 'mus',
    'audio & video': 'lyd & billede',
    'tv': 'fjernsyn',
    'speakers': 'højttalere',
    'headphones': 'hovedtelefoner',
    'dvd player': 'dvd-afspiller',
    'projector': 'projektor',
    'cameras': 'kameraer & foto',
    'dslr': 'spejlreflekskamera',
    'lens': 'objektiv',
    'tripod': 'stativ',
    'action camera': 'actionkamera',
    'sports': 'sport & fritid',
    'bikes': 'cykler',
    'mountain bikes': 'mountainbikes',
    'road bikes': 'racercykler',
    'kids bikes': 'børnecykler',
    'electric bikes': 'elcykler',
    'bike accessories': 'cykeltilbehør',
    'fitness': 'fitness & motion',
    'treadmill': 'løbebånd',
    'dumbbells': 'håndvægte',
    'yoga mat': 'yogamåtte',
    'resistance bands': 'træningselastikker',
    'outdoor sports': 'outdoor & camping',
    'tent': 'telt',
    'sleeping bag': 'sovepose',
    'backpacking': 'vandring',
    'camping stove': 'campingblus',
    'sports gear': 'sportsudstyr',
    'tennis racket': 'tennisketcher',
    'golf clubs': 'golfkøller',
    'skateboard': 'skateboard',
    'skis': 'ski',
    'snowboard': 'snowboard',
    'toys': 'legetøj & spil',
    'building blocks': 'byggeklodser',
    'lego': 'lego',
    'duplo': 'duplo',
    'board games': 'brætspil & puslespil',
    'boardgame': 'brætspil',
    'chess': 'skak',
    'puzzle': 'puslespil',
    'dolls': 'dukker & figurer',
    'doll': 'dukke',
    'barbie': 'barbie',
    'action figure': 'actionfigur',
    'books': 'bøger & medier',
    'literature': 'bøger & litteratur',
    'fiction': 'skønlitteratur',
    'non-fiction': 'faglitteratur',
    'textbooks': 'studiebøger',
    'comics': 'tegneserier',
    'childrens books': 'børnebøger',
    'music': 'musik & instrumenter',
    'guitar': 'guitar',
    'keyboard instrument': 'keyboard & klaver',
    'drums': 'trommer',
    'violin': 'violin',
    'vinyl records': 'vinylplader',
    'cds': 'cd\'er',
    'garden': 'have & planter',
    'plants': 'planter & blomster',
    'indoor plants': 'stueplanter',
    'seeds': 'frø',
    'flowers': 'blomster',
    'herbs': 'krydderurter',
    'vegetables': 'grøntsager',
    'garden tools': 'haveredskaber & krukker',
    'shovels': 'skovle',
    'lawn mower': 'plæneklipper',
    'watering can': 'vandkande',
    'flower pots': 'urtepotter',
    'tools': 'værktøj & byg',
    'hand tools': 'håndværktøj',
    'hammer': 'hammer',
    'screwdriver': 'skruetrækker',
    'wrench': 'skruenøgle',
    'pliers': 'tænger',
    'tape measure': 'målebånd',
    'power tools': 'el-værktøj',
    'drill': 'boremaskine',
    'saw': 'sav',
    'sander': 'slibemaskine',
    'building materials': 'byggematerialer & maling',
    'paint': 'maling',
    'brushes': 'pensler',
    'screws': 'skruer',
    'lumber': 'træ & brædder',
    'baby': 'baby & børn',
    'baby gear': 'babyudstyr',
    'stroller': 'barnevogn',
    'crib': 'tremmeseng',
    'car seat': 'autostol',
    'baby monitor': 'babyalarm',
    'baby clothes': 'babytøj',
    'kids clothes': 'børnetøj',
    'pets': 'kæledyr',
    'dog supplies': 'hundetilbehør',
    'dog leash': 'hundesnor',
    'dog bed': 'hundeseng',
    'dog toys': 'hundelegetøj',
    'cat supplies': 'kattetilbehør',
    'litter box': 'kattebakke',
    'cat toys': 'kattelegetøj',
    'aquarium': 'akvarium',
    'vehicles': 'køretøjer & tilbehør',
    'car parts': 'reservedele til biler',
    'car accessories': 'biltilbehør',
    'tires': 'dæk & fælge',
    'health & beauty': 'personlig pleje & skønhed',
    'cosmetics': 'kosmetik & makeup',
    'personal care': 'kropspleje',
    'hair care': 'hårpleje & styling',
    'office': 'kontorartikler',
    'stationery': 'papirvarer & kontorartikler',
    'writing instruments': 'skriveredskaber',
    'desk organizers': 'skrivebordsorganisering',
    'other': 'andet'
  }
}

export const UNIQUE_TAGS = Object.keys(TAXONOMY)

export const translateTag = (tag, lang = getLang()) => {
  return LOCALIZED_NAMES[lang]?.[tag] || tag
}

export const getAncestors = (tag) => {
  const ancestors = []
  let current = TAXONOMY[tag]
  while (current && current.parent) {
    ancestors.push(current.parent)
    current = TAXONOMY[current.parent]
  }
  return ancestors
}

export const getCategoryForTag = (tag) => {
  let current = tag
  while (current) {
    const node = TAXONOMY[current]
    if (node && node.emoji) {
      return { id: current, emoji: node.emoji, label: node.label }
    }
    current = node?.parent
  }
  return { id: 'other', emoji: '✨', label: 'other' }
}

export const getTagColor = (tag) => {
  const cat = getCategoryForTag(tag)
  const colors = {
    food: '#ffd93d', household: '#a8e6cf', clothing: '#ffd6e7',
    books: '#c3b1e1', electronics: '#b8d4f0', garden: '#b5ead7',
    tools: '#ffdac1', sports: '#e2f0cb', toys: '#ffb7b2',
    art: '#ff9aa2', baby: '#ffeaa7', pets: '#ffe0b2', other: '#dfe6e9',
  }
  return colors[cat.id] || '#dfe6e9'
}

export const searchTags = (query, lang = getLang(), max = 8) => {
  if (!query?.trim()) return []
  const q = query.toLowerCase().trim()
  
  const matches = UNIQUE_TAGS.filter(tag => {
    const localized = translateTag(tag, lang).toLowerCase()
    return localized.includes(q)
  })

  const exact = matches.filter(tag => {
    const localized = translateTag(tag, lang).toLowerCase()
    return localized.startsWith(q)
  })

  const fuzzy = matches.filter(tag => !exact.includes(tag))
  return [...exact, ...fuzzy].slice(0, max)
}

export const getSearchableTerms = (event, lang = getLang()) => {
  const title = event.tags.find(t => t[0] === 'title')?.[1] || ''
  const itemTags = event.tags.filter(t => t[0] === 't').map(t => t[1])
  
  const expandedTags = new Set()
  for (const tag of itemTags) {
    expandedTags.add(tag)
    const localized = translateTag(tag, lang)
    expandedTags.add(localized)
    
    const ancestors = getAncestors(tag)
    for (const ancestor of ancestors) {
      expandedTags.add(ancestor)
      const localizedAncestor = translateTag(ancestor, lang)
      expandedTags.add(localizedAncestor)
    }
  }

  const content = event.content || ''
  
  return {
    title: title.toLowerCase(),
    content: content.toLowerCase(),
    tags: [...expandedTags].map(t => t.toLowerCase())
  }
}
