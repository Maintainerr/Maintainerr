import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GetApiHandler from '../../../utils/ApiHandler'
import PosterCard, { resetPosterImageCache } from './PosterCard'

vi.mock('../../../utils/ApiHandler', () => ({
  default: vi.fn(),
}))

describe('PosterCard', () => {
  const getApiHandlerMock = vi.mocked(GetApiHandler)
  const observerInstances: MockIntersectionObserver[] = []

  class MockIntersectionObserver implements IntersectionObserver {
    root = null
    rootMargin = '400px 0px'
    thresholds = [0]
    observe = vi.fn()
    disconnect = vi.fn()
    unobserve = vi.fn()
    takeRecords = vi.fn(() => [])

    constructor(public callback: IntersectionObserverCallback) {
      observerInstances.push(this)
    }
  }

  beforeEach(() => {
    observerInstances.length = 0
    resetPosterImageCache()
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })

  afterEach(() => {
    cleanup()
    getApiHandlerMock.mockReset()
    resetPosterImageCache()
    vi.unstubAllGlobals()
  })

  it('uses the shared container and forwards click interactions', () => {
    const handleClick = vi.fn()

    render(
      <PosterCard mediaType="movie" onClick={handleClick} role="button">
        {() => <div>Poster content</div>}
      </PosterCard>,
    )

    fireEvent.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Poster content')).toBeTruthy()
  })

  it('renders a direct image path without fetching metadata', () => {
    render(
      <PosterCard
        imagePath="https://image.example/poster.jpg"
        mediaType="movie"
      >
        {(image) => <div>{image}</div>}
      </PosterCard>,
    )

    expect(screen.getByText('https://image.example/poster.jpg')).toBeTruthy()
    expect(getApiHandlerMock).not.toHaveBeenCalled()
  })

  it('waits to resolve metadata-backed images until the card enters the viewport', async () => {
    getApiHandlerMock.mockResolvedValue({
      url: 'https://image.example/resolved.jpg',
    })

    render(
      <PosterCard mediaType="show" providerIds={{ tmdb: ['123'] }}>
        {(image) => <div>{image ?? 'missing'}</div>}
      </PosterCard>,
    )

    expect(getApiHandlerMock).not.toHaveBeenCalled()

    observerInstances[0]?.callback(
      [
        {
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    )

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledWith(
        '/metadata/image/show?tmdbId=123',
      )
    })

    await waitFor(() => {
      expect(
        screen.getByText('https://image.example/resolved.jpg'),
      ).toBeTruthy()
    })
  })

  it('includes itemId in the metadata request for season cards', async () => {
    getApiHandlerMock.mockResolvedValue({
      url: 'https://image.example/show-poster.jpg',
    })

    render(
      <PosterCard
        mediaType="season"
        providerIds={{ tmdb: ['9999'] }}
        itemId="season-42"
      >
        {(image) => <div>{image ?? 'missing'}</div>}
      </PosterCard>,
    )

    observerInstances[0]?.callback(
      [
        {
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    )

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledWith(
        '/metadata/image/show?tmdbId=9999&itemId=season-42',
      )
    })

    await waitFor(() => {
      expect(
        screen.getByText('https://image.example/show-poster.jpg'),
      ).toBeTruthy()
    })
  })

  it('does not include itemId in the metadata request for show cards', async () => {
    getApiHandlerMock.mockResolvedValue({
      url: 'https://image.example/show-poster.jpg',
    })

    render(
      <PosterCard
        mediaType="show"
        providerIds={{ tmdb: ['9999'] }}
        itemId="show-1"
      >
        {(image) => <div>{image ?? 'missing'}</div>}
      </PosterCard>,
    )

    observerInstances[0]?.callback(
      [
        {
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    )

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledWith(
        '/metadata/image/show?tmdbId=9999',
      )
    })

    await waitFor(() => {
      expect(
        screen.getByText('https://image.example/show-poster.jpg'),
      ).toBeTruthy()
    })
  })

  it('reuses the same in-flight metadata image request across poster cards', async () => {
    let resolveRequest:
      | ((value: { url: string } | undefined) => void)
      | undefined

    getApiHandlerMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve
        }),
    )

    render(
      <>
        <PosterCard mediaType="show" providerIds={{ tmdb: ['123'] }}>
          {(image) => <div>{image ?? 'missing-a'}</div>}
        </PosterCard>
        <PosterCard mediaType="show" providerIds={{ tmdb: ['123'] }}>
          {(image) => <div>{image ?? 'missing-b'}</div>}
        </PosterCard>
      </>,
    )

    observerInstances.forEach((observer) => {
      observer.callback(
        [
          {
            isIntersecting: true,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      )
    })

    await waitFor(() => {
      expect(getApiHandlerMock).toHaveBeenCalledTimes(1)
    })

    resolveRequest?.({
      url: 'https://image.example/resolved.jpg',
    })

    await waitFor(() => {
      expect(
        screen.getAllByText('https://image.example/resolved.jpg'),
      ).toHaveLength(2)
    })
  })
})
