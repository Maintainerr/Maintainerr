import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaServerLibraries } from '../../../api/media-server'
import { useTaskStatusContext } from '../../../contexts/taskstatus-context'
import CollectionOverview from './index'

vi.mock('../../../api/media-server', () => ({
  useMediaServerLibraries: vi.fn(),
}))

vi.mock('../../../contexts/taskstatus-context', () => ({
  useTaskStatusContext: vi.fn(),
}))

vi.mock('../../Common/LibrarySwitcher', () => ({
  default: () => <div data-testid="library-switcher" />,
}))

vi.mock('../../Common/ExecuteButton', () => ({
  default: () => <button type="button">Handle Collections</button>,
}))

vi.mock('../../Common/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner" />,
  SmallLoadingSpinner: ({ className }: { className?: string }) => (
    <div data-testid="small-loading-spinner" className={className} />
  ),
}))

vi.mock('../CollectionItem', () => ({
  default: ({ collection }: { collection: { title: string } }) => (
    <div>{collection.title}</div>
  ),
}))

describe('CollectionOverview', () => {
  const librariesHookMock = vi.mocked(useMediaServerLibraries)
  const taskStatusHookMock = vi.mocked(useTaskStatusContext)

  beforeEach(() => {
    librariesHookMock.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useMediaServerLibraries>)
    taskStatusHookMock.mockReturnValue({
      collectionHandlerRunning: false,
    } as unknown as ReturnType<typeof useTaskStatusContext>)
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps rendered collections visible while a refresh is in flight', () => {
    render(
      <CollectionOverview
        collections={[
          {
            id: 1,
            title: 'Action',
          } as any,
        ]}
        onSwitchLibrary={vi.fn()}
        selectedLibraryId="all"
        isLoading={true}
        doActions={vi.fn()}
        openDetail={vi.fn()}
      />,
    )

    expect(screen.getByText('Action')).toBeTruthy()
    expect(screen.getAllByTestId('small-loading-spinner')).toHaveLength(1)
    expect(screen.queryByText('No collections found for this library.')).toBe(
      null,
    )
  })

  it('shows an inline loading placeholder before the first collection batch arrives', () => {
    render(
      <CollectionOverview
        collections={[]}
        onSwitchLibrary={vi.fn()}
        selectedLibraryId="all"
        isLoading={true}
        doActions={vi.fn()}
        openDetail={vi.fn()}
      />,
    )

    expect(screen.getByTestId('loading-spinner')).toBeTruthy()
    expect(screen.queryByTestId('small-loading-spinner')).toBe(null)
    expect(screen.queryByText('No collections found for this library.')).toBe(
      null,
    )
  })
})
