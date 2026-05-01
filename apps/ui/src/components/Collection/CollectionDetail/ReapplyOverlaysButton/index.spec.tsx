import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  processCollectionOverlays,
  useOverlaySettings,
} from '../../../../api/overlays'
import { logClientError } from '../../../../utils/ClientLogger'
import ReapplyOverlaysButton from './index'

vi.mock('../../../../api/overlays', () => ({
  processCollectionOverlays: vi.fn(),
  useOverlaySettings: vi.fn(),
}))

vi.mock('../../../../utils/ClientLogger', () => ({
  logClientError: vi.fn(),
}))

describe('ReapplyOverlaysButton', () => {
  const processCollectionOverlaysMock = vi.mocked(processCollectionOverlays)
  const useOverlaySettingsMock = vi.mocked(useOverlaySettings)
  const logClientErrorMock = vi.mocked(logClientError)

  beforeEach(() => {
    processCollectionOverlaysMock.mockReset()
    processCollectionOverlaysMock.mockResolvedValue({
      processed: 2,
      reverted: 0,
      errors: 0,
    })
    useOverlaySettingsMock.mockReset()
    useOverlaySettingsMock.mockReturnValue({
      data: { enabled: true },
      isLoading: false,
    } as ReturnType<typeof useOverlaySettings>)
    logClientErrorMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  const renderButton = (overlayEnabled = true) => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ReapplyOverlaysButton
          collection={{
            id: 7,
            title: 'Testing',
            libraryId: '1',
            type: 'movie',
            isActive: true,
            arrAction: 0,
            media: [],
            manualCollection: false,
            manualCollectionName: '',
            addDate: new Date(),
            handledMediaAmount: 0,
            lastDurationInSeconds: 0,
            keepLogsForMonths: 6,
            overlayEnabled,
          }}
        />
      </QueryClientProvider>,
    )
  }

  it('does not render when overlays are not enabled for the collection', () => {
    renderButton(false)

    expect(
      screen.queryByRole('button', { name: 'Reapply This Collection' }),
    ).toBeNull()
  })

  it('disables the action when overlays are globally disabled', () => {
    useOverlaySettingsMock.mockReturnValueOnce({
      data: { enabled: false },
      isLoading: false,
    } as ReturnType<typeof useOverlaySettings>)

    renderButton()

    expect(
      screen.getByRole('button', { name: 'Reapply This Collection' }),
    ).toHaveProperty('disabled', true)
  })

  it('opens a confirmation modal and triggers a forced collection reapply', async () => {
    renderButton()

    fireEvent.click(
      screen.getByRole('button', { name: 'Reapply This Collection' }),
    )

    expect(screen.getByText(/only this collection/i)).toBeTruthy()
    expect(
      screen.getByText(
        /does not restore originals and it will not process unrelated collections/i,
      ),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Reapply now' }))

    await waitFor(() => {
      expect(processCollectionOverlaysMock).toHaveBeenCalledWith(7, {
        force: true,
      })
    })

    expect(
      await screen.findByText('Processed: 2, Reverted: 0, Errors: 0'),
    ).toBeTruthy()
  })

  it('shows a server-provided error message when the request fails', async () => {
    processCollectionOverlaysMock.mockRejectedValueOnce(
      new Error('Overlay processing is already running.'),
    )

    renderButton()

    fireEvent.click(
      screen.getByRole('button', { name: 'Reapply This Collection' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reapply now' }))

    expect(
      await screen.findByText('Overlay processing is already running.'),
    ).toBeTruthy()
    expect(logClientErrorMock).toHaveBeenCalled()
  })
})
