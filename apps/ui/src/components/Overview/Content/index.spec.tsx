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
}))

vi.mock('../../Common/MediaCard', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}))

describe('OverviewContent', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps rendered items visible while append loading uses the delayed shared spinner slot', () => {
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
      screen
        .getByTestId('loading-spinner')
        .getAttribute('data-container-class'),
    ).toBe('h-24')
  })
})
