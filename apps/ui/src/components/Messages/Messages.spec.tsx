import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MaintainerrEvent } from '@maintainerr/contracts'
import { useEffect } from 'react'
import { useEvent } from '../../contexts/events-context'
import Messages from './Messages'

vi.mock('../../contexts/events-context', () => ({
  useEvent: vi.fn(),
}))

vi.mock('../Common/LoadingSpinner', () => ({
  SmallLoadingSpinner: ({ className }: { className?: string }) => (
    <div data-testid="small-loading-spinner" className={className} />
  ),
}))

vi.mock('@headlessui/react', () => ({
  Transition: ({
    children,
    show,
  }: {
    children: React.ReactNode
    show: boolean
  }) => (show ? <>{children}</> : null),
}))

describe('Messages', () => {
  const useEventMock = vi.mocked(useEvent)
  let collectionProgressEvent:
    | {
        type: MaintainerrEvent.CollectionHandler_Progressed
        totalCollections: number
        processingCollection: {
          name: string
          processedMedias: number
          totalMedias: number
        }
        totalMediaToHandle: number
        processedMedias: number
        processedCollections: number
      }
    | undefined

  beforeEach(() => {
    collectionProgressEvent = {
      type: MaintainerrEvent.CollectionHandler_Progressed,
      totalCollections: 3,
      processingCollection: {
        name: 'Sonarr + Seerr',
        processedMedias: 2,
        totalMedias: 10,
      },
      totalMediaToHandle: 50,
      processedMedias: 20,
      processedCollections: 1,
    }

    useEventMock.mockImplementation((eventType, listener) => {
      useEffect(() => {
        if (
          eventType === MaintainerrEvent.CollectionHandler_Progressed &&
          collectionProgressEvent
        ) {
          listener?.(collectionProgressEvent as never)
        }
      }, [eventType, listener])

      return collectionProgressEvent
    })
  })

  afterEach(() => {
    cleanup()
    useEventMock.mockReset()
  })

  it('renders the current collection progress separately from total progress', async () => {
    render(<Messages />)

    expect(await screen.findByText('Processing: Sonarr + Seerr')).toBeTruthy()
    expect(
      (screen.getByTestId('collection-handler-current-progress') as HTMLElement)
        .style.width,
    ).toBe('20%')
    expect(
      (screen.getByTestId('collection-handler-total-progress') as HTMLElement)
        .style.width,
    ).toBe('40%')
  })

  it('hides collection progress bars when no collection work is in flight', async () => {
    collectionProgressEvent = {
      type: MaintainerrEvent.CollectionHandler_Progressed,
      totalCollections: 3,
      processingCollection: {
        name: 'Sonarr + Seerr',
        processedMedias: 0,
        totalMedias: 0,
      },
      totalMediaToHandle: 0,
      processedMedias: 0,
      processedCollections: 0,
    }

    render(<Messages />)

    await screen.findByText('Processing: Sonarr + Seerr')

    expect(screen.queryByTestId('collection-handler-current-progress')).toBe(
      null,
    )
    expect(screen.queryByTestId('collection-handler-total-progress')).toBe(null)
  })
})
