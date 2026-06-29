import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useMemo,
} from 'react'
import { useSettings } from '../api/settings'
import {
  type LocaleCode,
  type TranslationKey,
  translations,
} from '../i18n/translations'

type InterpolationValues = Record<string, string | number>

type I18nContextValue = {
  locale: LocaleCode
  t: (key: TranslationKey, values?: InterpolationValues) => string
}

const fallbackLocale: LocaleCode = 'en'

const normalizeLocale = (locale?: string | null): LocaleCode => {
  if (!locale) {
    return fallbackLocale
  }

  const normalized = locale.toLowerCase()
  if (normalized.startsWith('es')) {
    return 'es'
  }

  return fallbackLocale
}

const resolveMessage = (
  locale: LocaleCode,
  key: TranslationKey,
): string | undefined => {
  return translations[locale][key]
}

const interpolate = (message: string, values?: InterpolationValues): string => {
  if (!values) {
    return message
  }

  return Object.entries(values).reduce(
    (current, [key, value]) =>
      current.replaceAll(`{${key}}`, String(value)),
    message,
  )
}

const I18nContext = createContext<I18nContextValue>({
  locale: fallbackLocale,
  t: (key) => resolveMessage(fallbackLocale, key) ?? key,
})
I18nContext.displayName = 'I18nContext'

export const I18nProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { data: settings } = useSettings()
  const locale = normalizeLocale(settings?.locale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      t: (key, values) =>
        interpolate(
          resolveMessage(locale, key) ??
            resolveMessage(fallbackLocale, key) ??
            key,
          values,
        ),
    }),
    [locale],
  )

  return <I18nContext value={value}>{children}</I18nContext>
}

export const useI18n = () => use(I18nContext)
