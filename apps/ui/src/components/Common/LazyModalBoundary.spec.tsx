import { lazy } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetLockBodyScrollForTests } from '../../hooks/useLockBodyScroll'
import { fireEvent, render, screen } from '../../test-utils/render'
import LazyModalBoundary from './LazyModalBoundary'

vi.mock('./LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner" />,
}))

// A chunk that never arrives keeps the boundary in its fallback.
const NeverLoads = lazy(() => new Promise<never>(() => {}))

describe('LazyModalBoundary', () => {
  afterEach(() => {
    __resetLockBodyScrollForTests()
  })

  it('dims and locks the page behind the delayed spinner, with no dialog', () => {
    const onCancel = vi.fn()
    render(
      <LazyModalBoundary onCancel={onCancel}>
        <NeverLoads />
      </LazyModalBoundary>,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('loading-spinner')).toBeTruthy()
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
