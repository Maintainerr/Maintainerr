import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    isIncluded,
    inclusionTone,
    exclusionId,
  }: {
    title: string
    isIncluded?: boolean
    inclusionTone?: 'info' | 'danger'
    exclusionId?: number
  }) => (
    <div>
      <span>{title}</span>
      {isIncluded ? (
        <span data-testid={`included-${title}`}>{inclusionTone}</span>
      ) : null}
      {exclusionId ? (
        <span data-testid={`excluded-${title}`}>excluded</span>
      ) : null}
    </div>
  ),
}))

describe('OverviewContent', () => {
  afterEach(() => {
    cleanup()
  })

  it('uses the delayed shared spinner for the initial empty overview load', () => {
    render(
      <OverviewContent
        data={[]}
        dataFinished={false}
        loading={true}
        extrasLoading={false}
        fetchData={vi.fn()}
        libraryId="library-1"
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
        libraryId="library-1"
      />,
    )

    expect(screen.getByText('Item One')).toBeTruthy()
    expect(
      screen.getByRole('status', { name: 'Loading more items' }),
    ).toBeTruthy()
    expect(screen.getByTestId('small-loading-spinner')).toBeTruthy()
    expect(screen.queryByTestId('loading-spinner')).toBeNull()
  })

  it('does not render a second grid spinner while a sort or refresh request is replacing visible data', () => {
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
        loading={true}
        extrasLoading={false}
        fetchData={vi.fn()}
        libraryId="library-1"
      />,
    )

    expect(screen.queryByTestId('small-loading-spinner')).toBeNull()
    expect(
      screen.queryByRole('status', { name: 'Loading more items' }),
    ).toBeNull()
  })

  it('passes included and excluded overview state through to media cards', () => {
    render(
      <OverviewContent
        data={[
          {
            id: '1',
            title: 'Item One',
            type: 'movie',
            maintainerrIsIncluded: true,
            maintainerrInclusionTone: 'danger',
            maintainerrExclusionId: 42,
          } as any,
        ]}
        dataFinished={true}
        loading={false}
        extrasLoading={false}
        fetchData={vi.fn()}
        libraryId="library-1"
      />,
    )

    expect(screen.getByTestId('included-Item One').textContent).toBe('danger')
    expect(screen.getByTestId('excluded-Item One')).toBeTruthy()
  })
})
