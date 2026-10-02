import { fireEvent, render, screen } from '../../../test-utils/render'
import { describe, expect, it, vi } from 'vitest'
import OverviewContent from './index'

vi.mock('../../Common/LoadingSpinner', () => ({
  default: ({ containerClassName }: { containerClassName?: string }) => (
    <div
      data-testid="loading-spinner"
      data-container-class={containerClassName}
    />
  ),
  SmallLoadingSpinner: ({ className }: { className?: string }) => (
    <div data-testid="small-loading-spinner" data-class-name={className} />
  ),
}))

vi.mock('../../Common/MediaCard', () => ({
  default: ({
    title,
    exclusionId,
    seasonNumber,
    episodeNumber,
    episodeTitle,
    summary,
    id,
    selectionMode,
    selected,
    onToggleSelection,
  }: {
    title: string
    id: string
    exclusionId?: number
    seasonNumber?: number
    episodeNumber?: number
    episodeTitle?: string
    summary?: string
    selectionMode?: boolean
    selected?: boolean
    onToggleSelection?: (mediaId: string, selected: boolean) => void
  }) => (
    <div>
      <span>{title}</span>
      {exclusionId ? (
        <span data-testid={`excluded-${title}`}>excluded</span>
      ) : null}
      <span data-testid={`season-${title}`}>{seasonNumber ?? 'none'}</span>
      <span data-testid={`episode-${title}`}>{episodeNumber ?? 'none'}</span>
      <span data-testid={`episode-title-${title}`}>
        {episodeTitle ?? 'none'}
      </span>
      <span data-testid={`summary-${title}`}>{summary ?? 'none'}</span>
      {selectionMode ? (
        <button
          data-testid={`select-${title}`}
          onClick={() => onToggleSelection?.(id, !selected)}
        >
          Select
        </button>
      ) : null}
    </div>
  ),
}))

describe('OverviewContent', () => {
  it('uses the delayed shared spinner for the initial empty overview load', () => {
    render(
      <OverviewContent
        data={[]}
        dataFinished={false}
        loading={true}
        extrasLoading={false}
        fetchData={vi.fn()}
      />,
    )

    expect(screen.getByTestId('loading-spinner')).toBeTruthy()
    expect(screen.queryByTestId('small-loading-spinner')).toBeNull()
  })

  it('keeps rendered items visible while append loading uses the small spinner slot', () => {
    render(
      <OverviewContent
        data={[
          {
            id: '1',
            title: 'Item One',
            type: 'movie',
          } as any,
        ]}
        dataFinished={false}
        loading={false}
        extrasLoading={true}
        fetchData={vi.fn()}
      />,
    )

    expect(screen.getByText('Item One')).toBeTruthy()
    const loadingMoreStatus = screen.getByRole('status', {
      name: 'Loading more items',
    })

    expect(loadingMoreStatus).toBeTruthy()
    expect(loadingMoreStatus.parentElement?.style.overflowAnchor).toBe('none')
    expect(screen.getByTestId('small-loading-spinner')).toBeTruthy()
    expect(screen.queryByTestId('loading-spinner')).toBeNull()
  })

  it('passes selection state and changes through to overview cards', () => {
    const onSelectionChange = vi.fn()

    render(
      <OverviewContent
        data={[
          {
            id: '1',
            title: 'Item One',
            type: 'movie',
          } as any,
        ]}
        dataFinished={true}
        loading={false}
        extrasLoading={false}
        fetchData={vi.fn()}
        selectionMode
        selectedMediaIds={new Set(['1'])}
        onToggleSelection={onSelectionChange}
      />,
    )

    fireEvent.click(screen.getByTestId('select-Item One'))
    expect(onSelectionChange).toHaveBeenCalledWith('1', false)
  })

  it('gives season cards their season number and the season description', () => {
    render(
      <OverviewContent
        data={[
          {
            id: '1',
            title: 'Season 2',
            parentTitle: 'Sample Series',
            type: 'season',
            index: 2,
            summary: 'What happens in the second season.',
          } as any,
        ]}
        dataFinished={true}
        loading={false}
        extrasLoading={false}
        fetchData={vi.fn()}
      />,
    )

    expect(screen.getByTestId('season-Sample Series').textContent).toBe('2')
    expect(screen.getByTestId('summary-Sample Series').textContent).toBe(
      'What happens in the second season.',
    )
  })

  it('gives episode cards their episode number, title and description', () => {
    render(
      <OverviewContent
        data={[
          {
            id: '1',
            title: 'A Quiet Arrival',
            grandparentTitle: 'Sample Series',
            type: 'episode',
            index: 4,
            parentIndex: 2,
            summary: 'What happens in the fourth episode.',
          } as any,
        ]}
        dataFinished={true}
        loading={false}
        extrasLoading={false}
        fetchData={vi.fn()}
      />,
    )

    expect(screen.getByTestId('episode-Sample Series').textContent).toBe('4')
    // The episode's season, so its poster and still resolve to the right one.
    expect(screen.getByTestId('season-Sample Series').textContent).toBe('2')
    expect(screen.getByTestId('episode-title-Sample Series').textContent).toBe(
      'A Quiet Arrival',
    )
    expect(screen.getByTestId('summary-Sample Series').textContent).toBe(
      'What happens in the fourth episode.',
    )
  })
})
