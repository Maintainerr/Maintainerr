import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GetApiHandler from '../../../utils/ApiHandler'
import { useMediaServerLibraries } from '../../../api/media-server'
import CollectionItem from './index'

vi.mock('../../../api/media-server', () => ({
  useMediaServerLibraries: vi.fn(),
}))

vi.mock('../../../utils/ApiHandler', () => ({
  default: vi.fn(),
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
  const getApiHandlerMock = vi.mocked(GetApiHandler)
  const librariesHookMock = vi.mocked(useMediaServerLibraries)

  beforeEach(() => {
    getApiHandlerMock.mockReset()
    librariesHookMock.mockReturnValue({
      data: [{ id: 'library-1', title: 'Movies', type: 'movie' }],
      error: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useMediaServerLibraries>)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders collection preview images inside the wide backdrop layout', async () => {
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
            media: [
              { image_path: 'https://image.example/one.jpg' },
              { image_path: 'https://image.example/two.jpg' },
            ],
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

    await waitFor(() => {
      expect(screen.getAllByAltText('img')).toHaveLength(2)
    })

    expect(getApiHandlerMock).not.toHaveBeenCalled()
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
  })

  it('does not render a collection modal when no detail handler is provided', () => {
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

    expect(screen.queryByText('Close')).toBe(null)
  })
})
