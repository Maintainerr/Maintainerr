import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SearchContext from '../../../contexts/search-context'
import NavBar from './index'

vi.mock('../../../router', () => ({
  prefetchRoute: vi.fn(),
}))

vi.mock('../MediaServerSetupGuard', () => ({
  useMediaServerSetupNavigationGuard: () => ({
    isRouteBlocked: () => false,
    showBlockedNavigationToast: vi.fn(),
  }),
}))

vi.mock('../../Messages/Messages', () => ({
  default: () => null,
}))

vi.mock('../../VersionStatus', () => ({
  default: () => null,
}))

vi.mock('@headlessui/react', () => ({
  Transition: ({ children }: { children: ReactNode }) => <>{children}</>,
  TransitionChild: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const mediaServerTypeMock = vi.fn()
vi.mock('../../../hooks/useMediaServerType', () => ({
  useMediaServerType: () => mediaServerTypeMock(),
}))

const renderNavBar = () =>
  render(
    <MemoryRouter>
      <SearchContext
        value={{
          search: { text: '' },
          addText: vi.fn(),
          removeText: vi.fn(),
        }}
      >
        <NavBar setClosed={vi.fn()} />
      </SearchContext>
    </MemoryRouter>,
  )

describe('NavBar', () => {
  afterEach(() => {
    cleanup()
    mediaServerTypeMock.mockReset()
  })

  it('renders the overlays entry on servers that support overlays', () => {
    // One instance in the desktop nav, one in mobile.
    mediaServerTypeMock.mockReturnValue({ mediaServerType: 'plex' })
    renderNavBar()

    expect(screen.getAllByText('Overlays')).toHaveLength(2)
  })

  it('hides the overlays entry on servers without overlay support (Kodi)', () => {
    mediaServerTypeMock.mockReturnValue({ mediaServerType: 'kodi' })
    renderNavBar()

    expect(screen.queryByText('Overlays')).toBeNull()
  })
})
