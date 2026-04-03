import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PosterCard from './PosterCard'

describe('PosterCard', () => {
  afterEach(() => {
    cleanup()
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
})
