import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ReactNode } from 'react'
import { SOURCE_LOCALE } from '../i18n'

// Activated on import, and listed in setupFiles so it also runs for specs
// that never render a component - a plain module translates through this
// singleton rather than through React context.
//
// An empty catalog makes Lingui fall back to the message id, which is the
// English source text - exactly what assertions are written against.
i18n.loadAndActivate({ locale: SOURCE_LOCALE, messages: {} })

// Any component using <Trans> or useLingui needs this ancestor in tests.
export const I18nTestProvider = ({ children }: { children: ReactNode }) => (
  <I18nProvider i18n={i18n}>{children}</I18nProvider>
)
