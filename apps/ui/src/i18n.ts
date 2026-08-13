import { i18n } from '@lingui/core'

export const SOURCE_LOCALE = 'en'

// Display names stay in their own language: someone looking for Swedish scans
// the list for "Svenska", not "Swedish". English first, then alphabetical.
export const SUPPORTED_LOCALES: Record<string, string> = {
  en: 'English',
  cs: 'Čeština',
  da: 'Dansk',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  nl: 'Nederlands',
  nb: 'Norsk bokmål',
  pl: 'Polski',
  pt: 'Português',
  fi: 'Suomi',
  sv: 'Svenska',
}

const STORAGE_KEY = 'maintainerr.locale'

export const isSupportedLocale = (value: string | null | undefined): boolean =>
  value != null && Object.hasOwn(SUPPORTED_LOCALES, value)

// Stored choice wins, then the browser's preference list, then English.
export const detectLocale = (): string => {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (isSupportedLocale(stored)) {
    return stored as string
  }

  for (const tag of window.navigator.languages ?? []) {
    const separator = tag.indexOf('-')
    const base = separator === -1 ? tag : tag.slice(0, separator)
    if (isSupportedLocale(base)) {
      return base
    }
  }

  return SOURCE_LOCALE
}

export const storeLocale = (locale: string): void => {
  window.localStorage.setItem(STORAGE_KEY, locale)
}

// Called once before the first render, then again on every switch. Everything
// under I18nProvider re-renders when a catalog activates, so no effect is
// needed to keep the tree in sync.
export const loadCatalog = async (locale: string): Promise<void> => {
  const { messages } = await import(`./locales/${locale}.po`)
  i18n.loadAndActivate({ locale, messages })
}
