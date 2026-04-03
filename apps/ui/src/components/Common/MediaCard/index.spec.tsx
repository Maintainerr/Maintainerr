import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MediaCard from './index'

vi.mock('../../AddModal', () => ({
  default: () => null,
}))

vi.mock('../../Collection/CollectionDetail/RemoveFromCollectionBtn', () => ({
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

  it('prioritizes the included badge over the exclusion badge on overview cards', () => {
    render(
      <MediaCard
        id="movie-1"
        title="Movie"
        mediaType="movie"
        collectionPage={false}
        isIncluded={true}
        inclusionTone="danger"
        exclusionId={5}
      />,
    )

    expect(screen.getByText('INCL')).toBeTruthy()
    expect(screen.queryByText('EXCL')).toBeNull()
  })

  it('keeps the collection page manual badge instead of the overview included badge', () => {
    render(
      <MediaCard
        id="movie-1"
        title="Movie"
        mediaType="movie"
        collectionPage={true}
        isIncluded={true}
        isManual={true}
      />,
    )

    expect(screen.getByText('MANUAL')).toBeTruthy()
    expect(screen.queryByText('INCL')).toBeNull()
  })

  it('shows the exclusion badge when the item is excluded but not currently included', () => {
    render(
      <MediaCard
        id="movie-1"
        title="Movie"
        mediaType="movie"
        collectionPage={false}
        exclusionId={5}
      />,
    )

    expect(screen.getByText('EXCL')).toBeTruthy()
    expect(screen.queryByText('INCL')).toBeNull()
  })
})
