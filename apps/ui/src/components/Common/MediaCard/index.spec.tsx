import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MediaCard from './index'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../AddModal', () => ({
  default: () => null,
}))

vi.mock('../../Collection/CollectionDetail/RemoveFromCollectionButton', () => ({
  default: () => null,
}))

vi.mock('../Button', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}))

vi.mock('../Poster/PosterCard', () => ({
  default: ({ children }: { children: (image?: string) => ReactNode }) => (
    <div>{children(undefined)}</div>
  ),
}))

vi.mock('./MediaModal', () => ({
  default: () => null,
}))

describe('MediaCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the exclusion badge on overview cards only for global exclusions', () => {
    render(
      <MediaCard
        id="movie-1"
        title="Movie"
        mediaType="movie"
        collectionPage={false}
        exclusionId={5}
        exclusionType="global"
      />,
    )

    expect(screen.getByText('EXCL')).toBeTruthy()
    expect(screen.queryByText('INCL')).toBeNull()
  })

  it('does not show the exclusion badge on overview cards for collection-specific exclusions', () => {
    render(
      <MediaCard
        id="movie-1"
        title="Movie"
        mediaType="movie"
        collectionPage={false}
        exclusionId={5}
        exclusionType="specific"
      />,
    )

    expect(screen.queryByText('EXCL')).toBeNull()
  })

  it('keeps the collection page manual badge without an overview include badge', () => {
    render(
      <MediaCard
        id="movie-1"
        title="Movie"
        mediaType="movie"
        collectionPage={true}
        isManual={true}
      />,
    )

    expect(screen.getByText('MANUAL')).toBeTruthy()
    expect(screen.queryByText('INCL')).toBeNull()
  })
})
