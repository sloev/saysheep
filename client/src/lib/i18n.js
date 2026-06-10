const translations = {}
let _lang = 'en'

const SUPPORTED = ['en', 'da', 'de', 'es', 'fr', 'hi', 'ja', 'pt', 'ru', 'zh', 'bn']

export const initI18n = async () => {
  const stored = localStorage.getItem('glean_lang')
  const browserLang = navigator.language?.split('-')[0]
  const lang = stored || (SUPPORTED.includes(browserLang) ? browserLang : 'en')
  await setLang(lang)
}

export const setLang = async (lang) => {
  if (!SUPPORTED.includes(lang)) lang = 'en'
  if (!translations[lang]) {
    try {
      const mod = await import(`../locales/${lang}.json`)
      translations[lang] = mod.default
    } catch {
      if (lang !== 'en') {
        if (!translations['en']) {
          const mod = await import('../locales/en.json')
          translations['en'] = mod.default
        }
      }
    }
  }
  _lang = lang
  localStorage.setItem('glean_lang', lang)
  document.documentElement.lang = lang
}

export const getLang = () => _lang
export const getSupportedLangs = () => SUPPORTED

export const t = (key, vars = {}) => {
  const str = translations[_lang]?.[key] || translations['en']?.[key] || key
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
}
