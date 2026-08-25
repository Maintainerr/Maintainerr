import { useEffect, useRef, useState } from 'react'

// Only the innermost dialog answers Escape, so a nested one does not close its
// parent along with itself. Ranked on first render, not on mount: effects run
// child-before-parent, which would invert a pair that mounts in one commit.
let nextDepth = 0
const openDialogs = new Set<number>()

/**
 * Closes a dialog on Escape.
 *
 * The listener sits on the document rather than the dialog element: a keydown
 * handler on the panel only fires while focus is inside it, and a dialog is
 * usually opened from a trigger that keeps focus.
 */
const useCloseOnEscape = (enabled: boolean, onEscape: () => void): void => {
  const [depth] = useState(() => nextDepth++)
  const escapeRef = useRef(onEscape)

  useEffect(() => {
    escapeRef.current = onEscape
  })

  useEffect(() => {
    if (!enabled) return

    openDialogs.add(depth)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && Math.max(...openDialogs) === depth) {
        escapeRef.current()
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      openDialogs.delete(depth)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, depth])
}

export default useCloseOnEscape
