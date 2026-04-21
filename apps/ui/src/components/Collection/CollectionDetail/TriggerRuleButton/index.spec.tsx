import { ServarrAction } from '@maintainerr/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { triggerCollectionItemAction } from '../../../../api/collections'
import { logClientError } from '../../../../utils/ClientLogger'
import TriggerRuleButton from './index'

vi.mock('../../../../api/collections', () => ({
  triggerCollectionItemAction: vi.fn(),
}))

vi.mock('../../../../utils/ClientLogger', () => ({
  logClientError: vi.fn(),
}))

describe('TriggerRuleButton', () => {
  const triggerCollectionItemActionMock = vi.mocked(triggerCollectionItemAction)
  const logClientErrorMock = vi.mocked(logClientError)

  beforeEach(() => {
    triggerCollectionItemActionMock.mockReset()
    triggerCollectionItemActionMock.mockResolvedValue(undefined)
    logClientErrorMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  const renderButton = (onHandled = vi.fn()) => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <TriggerRuleButton
          collection={{
            id: 7,
            title: 'Testing',
            libraryId: '1',
            type: 'movie',
            isActive: true,
            arrAction: ServarrAction.DELETE,
            media: [],
            manualCollection: false,
            manualCollectionName: '',
            addDate: new Date(),
            handledMediaAmount: 0,
            lastDurationInSeconds: 0,
            keepLogsForMonths: 6,
          }}
          mediaServerId="123"
          onHandled={onHandled}
        />
      </QueryClientProvider>,
    )

    return { onHandled }
  }

  it('shows a confirmation modal and triggers the item action', async () => {
    const { onHandled } = renderButton()

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Trigger Rule Action' })[0],
    )

    expect(screen.getAllByText('Trigger Rule Action')).toHaveLength(2)
    expect(screen.getByText(/Delete this movie/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Trigger now' }))

    await waitFor(() => {
      expect(triggerCollectionItemActionMock).toHaveBeenCalledWith(7, '123')
    })

    await waitFor(() => {
      expect(onHandled).toHaveBeenCalled()
    })
  })

  it('shows a server-provided error message when the request fails', async () => {
    triggerCollectionItemActionMock.mockRejectedValueOnce(
      new Error('Collection handling is already running.'),
    )

    renderButton()

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Trigger Rule Action' })[0],
    )
    fireEvent.click(screen.getByRole('button', { name: 'Trigger now' }))

    expect(
      await screen.findByText('Collection handling is already running.'),
    ).toBeTruthy()
    expect(logClientErrorMock).toHaveBeenCalled()
  })
})
