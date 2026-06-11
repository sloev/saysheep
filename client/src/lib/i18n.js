import van from 'vanjs-core'

const translations = {}
export const currentLanguage = van.state('en')

const SUPPORTED = ['en', 'da', 'de', 'es', 'fr', 'hi', 'ja', 'pt', 'ru', 'zh', 'bn']

export const initI18n = async () => {
  const stored = localStorage.getItem('saysheep_lang')
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
  currentLanguage.val = lang
  localStorage.setItem('saysheep_lang', lang)
  document.documentElement.lang = lang
}

export const getLang = () => currentLanguage.val
export const getSupportedLangs = () => SUPPORTED

export const t = (key, vars = {}) => {
  const lang = currentLanguage.val
  const str = translations[lang]?.[key] || translations['en']?.[key] || key
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
}

