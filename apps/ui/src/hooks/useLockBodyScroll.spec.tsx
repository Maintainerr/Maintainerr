import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLockBodyScroll } from './useLockBodyScroll'

// The hook relies on a module-level lock counter. Tests rely on RTL's
// cleanup() to unmount every renderHook result between tests, which drives
// the counter back to 0 via the hook's own release path. The manual overflow
// reset is a belt-and-braces safety net in case a test fails mid-assertion.
describe('useLockBodyScroll', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })

  afterEach(() => {
    cleanup()
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

    rerender({ locked: false })

    expect(document.body.style.overflow).toBe('')
  })

  it('toggling isLocked false→true acquires the lock without unmounting', () => {
    const { rerender } = renderHook(
      ({ locked }: { locked: boolean }) => useLockBodyScroll(locked),
      { initialProps: { locked: false } },
    )

    expect(document.body.style.overflow).toBe('')

    rerender({ locked: true })

    expect(document.body.style.overflow).toBe('hidden')
  })

  it('enabling disabled prop while locked releases the lock', () => {
    const { rerender } = renderHook(
      ({ disabled }: { disabled: boolean }) =>
        useLockBodyScroll(true, disabled),
      { initialProps: { disabled: false } },
    )

    expect(document.body.style.overflow).toBe('hidden')

    rerender({ disabled: true })

    expect(document.body.style.overflow).toBe('')
  })
})
