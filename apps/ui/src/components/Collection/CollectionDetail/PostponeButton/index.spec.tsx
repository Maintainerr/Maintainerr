import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '../../../../test-utils/render'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../../../test-utils/queryClient'
import type { ICollection } from '../../index'
import PostponeButton from './index'

const postponeCollectionItem = vi.fn()
const invalidateCollectionQueries = vi.fn()

vi.mock('../../../../api/collections', () => ({
  postponeCollectionItem: (...args: unknown[]) =>
    postponeCollectionItem(...args),
  invalidateCollectionQueries: (...args: unknown[]) =>
    invalidateCollectionQueries(...args),
}))

vi.mock('../../../../utils/ClientLogger', () => ({
  logClientError: vi.fn(),
}))

const collection = { id: 8, deleteAfterDays: 30 } as ICollection

const renderButton = (
  onPostponed?: (addDate: string) => void,
): ReactElement => (
  <QueryClientProvider client={createTestQueryClient()}>
    <PostponeButton
      collection={collection}
      mediaServerId="item-5"
      onPostponed={onPostponed}
    />
  </QueryClientProvider>
)

const openDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Postpone' }))
}

const setDays = (value: string) => {
  fireEvent.change(screen.getByLabelText('Days to postpone'), {
    target: { value },
  })
}

describe('PostponeButton', () => {
  beforeEach(() => {
    postponeCollectionItem.mockReset()
    invalidateCollectionQueries.mockReset()
    invalidateCollectionQueries.mockResolvedValue(undefined)
  })

  it('posts the entered days and hands the new addDate back to the caller', async () => {
    postponeCollectionItem.mockResolvedValue({
      addDate: '2026-07-30T00:00:00.000Z',
      deletionDate: '2026-08-29T00:00:00.000Z',
      deleteAfterDays: 30,
    })
    const onPostponed = vi.fn()

    render(renderButton(onPostponed))
    openDialog()
    setDays('2')
    fireEvent.click(screen.getByRole('button', { name: 'Postpone now' }))

    await vi.waitFor(() => {
      expect(onPostponed).toHaveBeenCalledWith('2026-07-30T00:00:00.000Z')
    })
    expect(postponeCollectionItem).toHaveBeenCalledWith(8, 'item-5', 2)
    expect(invalidateCollectionQueries).toHaveBeenCalled()
    expect(screen.queryByText('Postpone deletion')).toBeNull()
  })

  it('blocks submission for a day count outside the accepted range', () => {
    render(renderButton())
    openDialog()
    setDays('0')

    expect(
      screen
        .getByRole('button', { name: 'Postpone now' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen.getByText('Enter a whole number between 1 and 3650.'),
    ).toBeTruthy()
    expect(postponeCollectionItem).not.toHaveBeenCalled()
  })

  it('keeps the dialog open and skips the callback when the request fails', async () => {
    postponeCollectionItem.mockRejectedValue(
      new Error('Collection handling is already running.'),
    )
    const onPostponed = vi.fn()

    render(renderButton(onPostponed))
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Postpone now' }))

    expect(
      await screen.findByText('Collection handling is already running.'),
    ).toBeTruthy()
    expect(onPostponed).not.toHaveBeenCalled()
    expect(screen.getByText('Postpone deletion')).toBeTruthy()
  })

  it('drops the previous error when the dialog is cancelled and reopened', async () => {
    postponeCollectionItem.mockRejectedValue(
      new Error('Collection handling is already running.'),
    )

    render(renderButton())
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Postpone now' }))
    await screen.findByText('Collection handling is already running.')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    openDialog()

    expect(
      screen.queryByText('Collection handling is already running.'),
    ).toBeNull()
  })
})
