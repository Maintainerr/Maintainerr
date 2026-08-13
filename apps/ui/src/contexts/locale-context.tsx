import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { createContext, ReactNode, useCallback, useState } from 'react'
import { loadCatalog, storeLocale, SUPPORTED_LOCALES } from '../i18n'

interface LocaleContextType {
  locale: string
  setLocale: (locale: string) => Promise<void>
  available: Record<string, string>
}

const LocaleContext = createContext<LocaleContextType>({
  locale: i18n.locale,
  setLocale: async () => {},
  available: SUPPORTED_LOCALES,
})
LocaleContext.displayName = 'LocaleContext'

export function LocaleProvider(props: { children: ReactNode }) {
  // main.tsx activates the initial catalog before render, so there is nothing
  // to synchronise on mount and no first-paint flash of source strings.
  const [locale, setLocale] = useState(i18n.locale)

  const changeLocale = useCallback(async (next: string) => {
    await loadCatalog(next)
    storeLocale(next)
    setLocale(next)
  }, [])

  const context: LocaleContextType = {
    locale,
    setLocale: changeLocale,
    available: SUPPORTED_LOCALES,
  }

  return (
    <LocaleContext value={context}>
      <I18nProvider i18n={i18n}>{props.children}</I18nProvider>
    </LocaleContext>
  )
}

export default LocaleContext
