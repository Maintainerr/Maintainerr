import enMessages from './locales/en.json'
import esMessages from './locales/es.json'

export type TranslationKey = keyof typeof enMessages
export type TranslationMessages = Record<TranslationKey, string>

const en: TranslationMessages = enMessages
const es: TranslationMessages = esMessages

export const translations = {
  en,
  es,
} as const

export type LocaleCode = keyof typeof translations

