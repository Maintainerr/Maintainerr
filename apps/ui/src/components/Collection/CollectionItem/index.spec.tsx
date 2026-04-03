import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaServerLibraries } from '../../../api/media-server'
import CollectionItem from './index'

vi.mock('../../../api/media-server', () => ({
  useMediaServerLibraries: vi.fn(),
}))

vi.mock('../../Common/Button', () => ({
  default: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

describe('CollectionItem', () => {
  const librariesHookMock = vi.mocked(useMediaServerLibraries)

  beforeEach(() => {
    librariesHookMock.mockReturnValue({
      data: [{ id: 'library-1', title: 'Movies', type: 'movie' }],
      error: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useMediaServerLibraries>)
  })

  afterEach(() => {
    cleanup()
  })

  it('delegates direct card clicks to detail navigation when a click handler is provided', () => {
    const openDetail = vi.fn()

    render(
      <CollectionItem
        collection={
          {
            id: 1,
            title: 'Action',
            libraryId: 'library-1',
            description: 'Collection description',
            isActive: true,
            type: 'movie',
            arrAction: 0,
            media: [],
            manualCollection: false,
            manualCollectionName: '',
            addDate: new Date(),
            handledMediaAmount: 0,
            lastDurationInSeconds: 0,
            keepLogsForMonths: 0,
          } as any
        }
        onClick={openDetail}
      />,
    )

    fireEvent.click(screen.getByText('Action'))

    expect(openDetail).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Open Collection')).toBe(null)
  })

  it('opens the shared collection modal when no detail handler is provided', () => {
    render(
      <CollectionItem
        collection={
          {
            id: 1,
            title: 'Action',
            libraryId: 'library-1',
            description: 'Collection description',
            isActive: true,
            type: 'movie',
            arrAction: 0,
            media: [],
            manualCollection: false,
            manualCollectionName: '',
            addDate: new Date(),
            handledMediaAmount: 0,
            lastDurationInSeconds: 0,
            keepLogsForMonths: 0,
          } as any
        }
      />,
    )

    fireEvent.click(screen.getByText('Action'))

    expect(screen.getByText('Close')).toBeTruthy()
    expect(screen.queryByText('Open Collection')).toBe(null)
  })
})
