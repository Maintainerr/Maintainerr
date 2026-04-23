import { useEffect } from 'react'

/**
 * Module-level reference counter for active scroll locks.
 *
 * Using a counter (rather than snapshotting and restoring the previous
 * overflow value) avoids a race condition that occurs when multiple
 * simultaneously-mounted modals all unmount in the same React batch:
 * the last cleanup to run would restore whatever overflow value it
 * captured at mount time, which could be 'hidden' (captured while a
 * parent lock was already active), leaving the body scroll locked after
 * all modals have closed.
 */
let lockCount = 0

const acquire = (): void => {
  if (lockCount === 0) {
    document.body.style.overflow = 'hidden'
  }
  lockCount++
}

const release = (): void => {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = ''
  }
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
