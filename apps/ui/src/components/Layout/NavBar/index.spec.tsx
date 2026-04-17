import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SearchContext from '../../../contexts/search-context'
import NavBar from './index'

const useMediaServerType = vi.fn()

vi.mock('../../../hooks/useMediaServerType', () => ({
  useMediaServerType: () => useMediaServerType(),
}))

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

const renderNavBar = () =>
  render(
    <MemoryRouter>
      <SearchContext.Provider
        value={{
          search: { text: '' },
          addText: vi.fn(),
          removeText: vi.fn(),
        }}
      >
        <NavBar setClosed={vi.fn()} />
      </SearchContext.Provider>
    </MemoryRouter>,
  )

describe('NavBar', () => {
  it('hides the overlays navigation entry for Jellyfin', () => {
    useMediaServerType.mockReturnValue({ isPlex: false })

    renderNavBar()

    expect(screen.queryByText('Overlays')).toBeNull()
  })

  it('shows the overlays navigation entry for Plex', () => {
    useMediaServerType.mockReturnValue({ isPlex: true })

    renderNavBar()

    expect(screen.getAllByText('Overlays')).toHaveLength(2)
  })
})
