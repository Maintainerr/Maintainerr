import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLockBodyScroll } from './useLockBodyScroll'

describe('useLockBodyScroll', () => {
  beforeEach(() => {
    // Reset body overflow before each test so tests are independent.
    document.body.style.overflow = ''
  })

  afterEach(() => {
    // Unmount all hooks, which triggers release() for any active locks.
    cleanup()
    // Ensure the DOM is clean regardless of test outcome.
    document.body.style.overflow = ''
  })

  it('locks body overflow when mounted with isLocked=true', () => {
    renderHook(() => useLockBodyScroll(true))
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('does not lock body overflow when isLocked=false', () => {
    renderHook(() => useLockBodyScroll(false))
    expect(document.body.style.overflow).toBe('')
  })

  it('does not lock body overflow when disabled=true', () => {
    renderHook(() => useLockBodyScroll(true, true))
    expect(document.body.style.overflow).toBe('')
  })

  it('restores body overflow after unmount (single lock)', () => {
    const { unmount } = renderHook(() => useLockBodyScroll(true))
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('second concurrent lock is a no-op on overflow but increments counter', () => {
    const { unmount: unmountA } = renderHook(() => useLockBodyScroll(true))
    const { unmount: unmountB } = renderHook(() => useLockBodyScroll(true))

    // Both are locked – overflow is hidden.
    expect(document.body.style.overflow).toBe('hidden')

    // Releasing the first lock should NOT restore scrolling yet.
    unmountA()
    expect(document.body.style.overflow).toBe('hidden')

    // Only after the last lock is released should scrolling be restored.
    unmountB()
    expect(document.body.style.overflow).toBe('')
  })

  it('only the final release restores scrolling for three nested locks', () => {
    const { unmount: unmountA } = renderHook(() => useLockBodyScroll(true))
    const { unmount: unmountB } = renderHook(() => useLockBodyScroll(true))
    const { unmount: unmountC } = renderHook(() => useLockBodyScroll(true))

    expect(document.body.style.overflow).toBe('hidden')

    unmountA()
    expect(document.body.style.overflow).toBe('hidden')

    unmountB()
    expect(document.body.style.overflow).toBe('hidden')

    unmountC()
    expect(document.body.style.overflow).toBe('')
  })

  it('toggling isLocked true→false releases the lock without unmounting', () => {
    const { rerender } = renderHook(
      ({ locked }: { locked: boolean }) => useLockBodyScroll(locked),
      { initialProps: { locked: true } },
    )

    expect(document.body.style.overflow).toBe('hidden')

    act(() => {
      rerender({ locked: false })
    })

    expect(document.body.style.overflow).toBe('')
  })

  it('toggling isLocked false→true acquires the lock without unmounting', () => {
    const { rerender } = renderHook(
      ({ locked }: { locked: boolean }) => useLockBodyScroll(locked),
      { initialProps: { locked: false } },
    )

    expect(document.body.style.overflow).toBe('')

    act(() => {
      rerender({ locked: true })
    })

    expect(document.body.style.overflow).toBe('hidden')
  })

  it('enabling disabled prop while locked releases the lock', () => {
    const { rerender } = renderHook(
      ({ disabled }: { disabled: boolean }) =>
        useLockBodyScroll(true, disabled),
      { initialProps: { disabled: false } },
    )

    expect(document.body.style.overflow).toBe('hidden')

    act(() => {
      rerender({ disabled: true })
    })

    expect(document.body.style.overflow).toBe('')
  })
})
