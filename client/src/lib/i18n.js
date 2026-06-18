import van from 'vanjs-core'

const translations = {}
export const currentLanguage = van.state('en')
// Bumped whenever a translation bundle finishes loading. t() reads it so that
// reactive bindings rendered before load (e.g. the topbar) refresh once the
// strings arrive — switching to the same language ('en'->'en') wouldn't trigger
// currentLanguage on its own.
export const i18nVersion = van.state(0)

const SUPPORTED = ['en', 'da', 'de', 'es', 'fr', 'hi', 'ja', 'pt', 'ru', 'zh', 'bn']

// ISO country → supported locale, for guessing a new user's language from their
// request origin. Only a representative set of countries per language.
const COUNTRY_LOCALE = {
  DK: 'da', GL: 'da', FO: 'da',
  DE: 'de', AT: 'de', CH: 'de', LI: 'de',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es',
  GT: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es',
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr',
  IN: 'hi', JP: 'ja',
  PT: 'pt', BR: 'pt', AO: 'pt', MZ: 'pt',
  RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
  CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh',
  BD: 'bn',
}

// Best-effort geo-IP country lookup (no API key, CORS-enabled). Times out fast
// and returns null on any failure so it never blocks startup for long.
const detectCountryLocale = async () => {
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch('https://get.geojs.io/v1/ip/country.json', { signal: ctrl.signal })
    clearTimeout(to)
    if (!res.ok) return null
    const { country } = await res.json()
    return COUNTRY_LOCALE[(country || '').toUpperCase()] || null
  } catch { return null }
}

export const initI18n = async () => {
  const stored = localStorage.getItem('saysheep_lang')
  if (stored) { await setLang(stored); return }

  // New user: guess from request-origin country, else browser language, else
  // English. setLang() persists the choice so this only runs on first launch.
  const browserLang = navigator.language?.split('-')[0]
  const browserLocale = SUPPORTED.includes(browserLang) ? browserLang : null
  const geoLocale = await detectCountryLocale()
  await setLang(geoLocale || browserLocale || 'en')
}

export const setLang = async (lang) => {
  if (!SUPPORTED.includes(lang)) lang = 'en'
  if (!translations['en']) {
    try {
      const mod = await import('../locales/en.json')
      translations['en'] = mod.default
    } catch {}
  }
  if (!translations[lang]) {
    try {
      const mod = await import(`../locales/${lang}.json`)
      translations[lang] = mod.default
    } catch {}
  }
  currentLanguage.val = lang
  i18nVersion.val++
  localStorage.setItem('saysheep_lang', lang)
  document.documentElement.lang = lang
}

export const getLang = () => currentLanguage.val
export const getSupportedLangs = () => SUPPORTED

export const t = (key, vars = {}) => {
  i18nVersion.val // reactive dep: refresh bindings when bundles load
  const lang = currentLanguage.val
  const str = translations[lang]?.[key] || translations['en']?.[key] || key
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
}

