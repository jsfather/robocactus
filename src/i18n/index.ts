import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import fa from './locales/fa.json'
import en from './locales/en.json'

export type AppLocale = 'fa' | 'en'

const STORAGE_KEY = 'robocactus-locale'

export function getStoredLocale(): AppLocale {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'en' ? 'en' : 'fa'
}

export function applyDocumentDirection(locale: AppLocale) {
  const dir = locale === 'fa' ? 'rtl' : 'ltr'
  document.documentElement.lang = locale
  document.documentElement.dir = dir
}

void i18n.use(initReactI18next).init({
  resources: {
    fa: { translation: fa },
    en: { translation: en },
  },
  lng: getStoredLocale(),
  fallbackLng: 'fa',
  interpolation: { escapeValue: false },
})

applyDocumentDirection(getStoredLocale())

i18n.on('languageChanged', (lng) => {
  const locale = lng === 'en' ? 'en' : 'fa'
  localStorage.setItem(STORAGE_KEY, locale)
  applyDocumentDirection(locale)
})

export default i18n
