import { useEffect } from 'react'

/**
 * Module-level state. A single counter tracks how many consumers want the
 * body locked; the inline overflow value that was present before the first
 * lock is captured once on the 0→1 transition and restored once on the 1→0
 * transition. This preserves the hook's original "restore the previous
 * overflow" contract while avoiding the per-consumer snapshot race that
 * left the body locked when sibling/parent modals unmounted in the same
 * React batch.
 */
let lockCount = 0
let previousOverflow: string | null = null

const acquire = (): void => {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount++
}

const release = (): void => {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow ?? ''
    previousOverflow = null
  }
}

/**
 * Resets the module-level counter and clears the body overflow style.
 * Intended for test teardown only — keeps counter leaks from propagating
 * across cases if a test throws before its hooks are tracked by RTL.
 */
export const __resetLockBodyScrollForTests = (): void => {
  lockCount = 0
  previousOverflow = null
  document.body.style.overflow = ''
}

/**
 * Hook to lock the body scroll whenever a component is mounted or
 * whenever isLocked is set to true.
 *
 * Multiple concurrent locks are safe: the body scroll is only restored
 * once the last active lock is released.
 *
 * @param isLocked Toggle the scroll lock
 * @param disabled Disables the entire hook (allows conditional skipping of the lock)
 */
export const useLockBodyScroll = (
  isLocked: boolean,
  disabled?: boolean,
): void => {
  useEffect(() => {
    if (!isLocked || disabled) return
    acquire()
    return () => {
      release()
    }
  }, [isLocked, disabled])
}
