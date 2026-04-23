import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OverlaysWrapper from './index'

const useMediaServerType = vi.fn()

vi.mock('../../hooks/useMediaServerType', () => ({
  useMediaServerType: () => useMediaServerType(),
}))

vi.mock('../Common/LoadingSpinner', () => ({
  default: () => <div>loading</div>,
}))

vi.mock('../Settings/Tabs', () => ({
  default: () => <div data-testid="settings-tabs">tabs</div>,
}))

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">outlet</div>,
  }
})

describe('OverlaysWrapper', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps the tabs shell visible while the media server type is unresolved', () => {
    useMediaServerType.mockReturnValue({ isLoading: true })

    render(<OverlaysWrapper />)

    expect(screen.getAllByTestId('settings-tabs').length).toBeGreaterThan(0)
    expect(screen.getByText('loading')).toBeTruthy()
    expect(screen.queryByTestId('outlet')).toBeNull()
  })

  it('renders overlay tabs and outlet once the media server type resolves', () => {
    useMediaServerType.mockReturnValue({ isLoading: false })

    render(<OverlaysWrapper />)

    expect(screen.getAllByTestId('settings-tabs').length).toBeGreaterThan(0)
    expect(screen.getByTestId('outlet')).toBeTruthy()
    expect(screen.queryByText('loading')).toBeNull()
  })
})
