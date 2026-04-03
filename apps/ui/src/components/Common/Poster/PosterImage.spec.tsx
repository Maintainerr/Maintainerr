import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GetApiHandler from '../../../utils/ApiHandler'
import PosterImage from './PosterImage'

vi.mock('../../../utils/ApiHandler', () => ({
  default: vi.fn(),
}))

describe('PosterImage', () => {
  const getApiHandlerMock = vi.mocked(GetApiHandler)

  afterEach(() => {
    cleanup()
    getApiHandlerMock.mockReset()
  })

  it('renders a direct image path without fetching metadata', () => {
    render(
      <PosterImage
        imagePath="https://image.example/poster.jpg"
        mediaType="movie"
      >
        {(image) => <div>{image}</div>}
      </PosterImage>,
    )

    expect(screen.getByText('https://image.example/poster.jpg')).toBeTruthy()
    expect(getApiHandlerMock).not.toHaveBeenCalled()
  })

  it('resolves metadata-backed images through the shared API path', async () => {
    getApiHandlerMock.mockResolvedValue({
      url: 'https://image.example/resolved.jpg',
    })

    render(
      <PosterImage mediaType="show" providerIds={{ tmdb: ['123'] }}>
        {(image) => <div>{image ?? 'missing'}</div>}
      </PosterImage>,
    )

    expect(getApiHandlerMock).toHaveBeenCalledWith(
      '/metadata/image/show?tmdbId=123',
    )

    await waitFor(() => {
      expect(
        screen.getByText('https://image.example/resolved.jpg'),
      ).toBeTruthy()
    })
  })
})
