import { fireEvent, render, screen } from '../../../test-utils/render'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import MediaCard from './index'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../Collection/CollectionDetail/RemoveFromCollectionButton', () => ({
  default: () => <button type="button">Exclude</button>,
}))

vi.mock('../Button', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}))

vi.mock('../Poster/PosterCard', () => ({
  default: ({
    children,
    onClick,
    onKeyDown,
    role,
    'aria-pressed': ariaPressed,
    'aria-label': ariaLabel,
  }: {
    children: (image?: string) => ReactNode
    onClick?: () => void
    onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
    role?: string
    'aria-pressed'?: boolean
    'aria-label'?: string
  }) => (
    <div
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      aria-pressed={ariaPressed}
      aria-label={ariaLabel}
      tabIndex={0}
    >
      {children(undefined)}
    </div>
  ),
}))

vi.mock('./MediaModal', () => ({
  default: () => null,
}))

describe('MediaCard', () => {
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

  it('reports selection changes from a card in selection mode', () => {
    const onToggleSelection = vi.fn()

    render(
      <MediaCard
        id="movie-1"
        title="Movie"
        mediaType="movie"
        collectionPage={false}
        selectionMode
        selected={false}
        onToggleSelection={onToggleSelection}
      />,
    )

    const card = screen.getByRole('button', { name: 'Select Movie' })
    expect(card.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(card)
    expect(onToggleSelection).toHaveBeenCalledWith('movie-1', true)

    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onToggleSelection).toHaveBeenCalledTimes(2)
  })

  // Selection mode turns the whole card into a checkbox, so its own action
  // would fire on the click that picks it.
  it('hides the collection action while the grid is in selection mode', () => {
    const { rerender } = render(
      <MediaCard
        id="movie-1"
        title="Movie"
        mediaType="movie"
        collectionPage={true}
      />,
    )

    expect(screen.getByRole('button', { name: 'Exclude' })).toBeTruthy()

    rerender(
      <MediaCard
        id="movie-1"
        title="Movie"
        mediaType="movie"
        collectionPage={true}
        selectionMode
        onToggleSelection={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Exclude' })).toBeNull()
  })

  it('numbers the season badge so seasons of one show stay distinguishable', () => {
    render(
      <MediaCard
        id="season-1"
        title="Sample Series"
        mediaType="season"
        seasonNumber={2}
        collectionPage={true}
      />,
    )

    expect(screen.getByText('season 2')).toBeTruthy()
  })

  it('falls back to the plain type badge when the season number is unknown', () => {
    render(
      <MediaCard
        id="season-1"
        title="Sample Series"
        mediaType="season"
        collectionPage={true}
      />,
    )

    expect(screen.getByText('season')).toBeTruthy()
  })

  it('numbers the episode badge and shows the episode title', () => {
    render(
      <MediaCard
        id="episode-1"
        title="Sample Series"
        mediaType="episode"
        seasonNumber={2}
        episodeNumber={4}
        episodeTitle="A Quiet Arrival"
        summary="What happens in the fourth episode."
        collectionPage={true}
      />,
    )

    expect(screen.getByText('episode 4')).toBeTruthy()
    expect(screen.getByText('A Quiet Arrival')).toBeTruthy()
  })

  it('names the collections a library item is in, and collapses the rest', () => {
    const { rerender } = render(
      <MediaCard
        id="movie-1"
        title="Movie"
        mediaType="movie"
        collectionPage={false}
        collections={['Stale Movies']}
      />,
    )

    expect(screen.getByText('Stale Movies')).toBeTruthy()

    rerender(
      <MediaCard
        id="movie-1"
        title="Movie"
        mediaType="movie"
        collectionPage={false}
        collections={['Stale Movies', 'Franchise A', 'Watched']}
      />,
    )

    expect(screen.getByText('Stale Movies +2')).toBeTruthy()
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
