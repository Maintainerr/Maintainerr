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

// Called once before the first render, then again on every switch. Activating
// a catalog re-renders the components that *consume* the i18n context, not the
// whole tree - React reuses the untouched children element. A component that
// displays translated text must therefore call `useLingui()`, or it keeps the
// language it mounted with.
export const loadCatalog = async (locale: string): Promise<void> => {
  const { messages } = await import(`./locales/${locale}.po`)
  i18n.loadAndActivate({ locale, messages })
  // index.html ships lang="en". Without this every other locale would render
  // Swedish or Polish text while still declaring English, so a screen reader
  // picks the wrong voice and the browser offers to translate the page.
  // Every supported locale is left-to-right, so `dir` needs no handling.
  document.documentElement.lang = locale
}
