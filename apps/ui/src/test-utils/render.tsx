import {
  render as rtlRender,
  RenderOptions,
  RenderResult,
} from '@testing-library/react'
import { ReactElement, ReactNode } from 'react'
import { I18nTestProvider } from './i18n'

const Wrapper = ({ children }: { children: ReactNode }) => (
  <I18nTestProvider>{children}</I18nTestProvider>
)

/**
 * Drop-in for @testing-library/react's `render` that supplies the i18n
 * context every translated component needs. Import from here instead of
 * from @testing-library/react and specs keep working as strings get wrapped.
 */
export const render = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult => rtlRender(ui, { wrapper: Wrapper, ...options })

// Explicit local exports win over the star re-export, so `render` above is
// the one callers get while screen/fireEvent/waitFor pass straight through.
export * from '@testing-library/react'
