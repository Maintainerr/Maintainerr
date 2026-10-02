import { renderHook } from '../test-utils/render'
import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetLockBodyScrollForTests,
  useLockBodyScroll,
} from './useLockBodyScroll'

describe('useLockBodyScroll', () => {
  afterEach(() => {
    __resetLockBodyScrollForTests()
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

  it('release order does not affect final overflow (covers the parent→child vs child→parent race)', () => {
    const { unmount: unmountParent } = renderHook(() => useLockBodyScroll(true))
    const { unmount: unmountChild } = renderHook(() => useLockBodyScroll(true))

    expect(document.body.style.overflow).toBe('hidden')

    // Parent (mounted first) releases before child - the scenario from #2748.
    // The old snapshot-restore implementation would leave overflow='hidden'
    // here because the child had captured 'hidden' as its "original" value.
    unmountParent()
    expect(document.body.style.overflow).toBe('hidden')

    unmountChild()
    expect(document.body.style.overflow).toBe('')
  })

  it('restores a pre-existing inline overflow value after the final release', () => {
    document.body.style.overflow = 'scroll'

    const { unmount } = renderHook(() => useLockBodyScroll(true))
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('captures the pre-existing value only on the 0→1 transition, not on nested acquires', () => {
    document.body.style.overflow = 'scroll'

    // After the first mount, body becomes 'hidden'. If the nested acquire
    // re-snapshotted that value, the final restore would leak 'hidden'
    // instead of the 'scroll' captured at the 0→1 boundary.
    const { unmount: unmountA } = renderHook(() => useLockBodyScroll(true))
    const { unmount: unmountB } = renderHook(() => useLockBodyScroll(true))

    unmountA()
    unmountB()

    expect(document.body.style.overflow).toBe('scroll')
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
})
