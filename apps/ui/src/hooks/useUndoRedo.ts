import { useCallback, useRef, useState } from 'react'

interface UndoRedoState<T> {
  current: T
  set: (value: T | ((prev: T) => T)) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  reset: (value: T) => void
}

const MAX_HISTORY = 50

/**
 * Generic undo/redo hook that tracks snapshots of a value.
 * Snapshots are stored as JSON strings to ensure deep equality.
 */
export function useUndoRedo<T>(initial: T): UndoRedoState<T> {
  const [current, setCurrent] = useState<T>(initial)
  const pastRef = useRef<string[]>([])
  const futureRef = useRef<string[]>([])

  const set = useCallback((value: T | ((prev: T) => T)) => {
    setCurrent((prev) => {
      const next =
        typeof value === 'function' ? (value as (p: T) => T)(prev) : value
      // Push current state to past
      const serialized = JSON.stringify(prev)
      pastRef.current = [...pastRef.current, serialized].slice(-MAX_HISTORY)
      futureRef.current = []
      return next
    })
  }, [])

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return
    setCurrent((prev) => {
      futureRef.current = [JSON.stringify(prev), ...futureRef.current]
      const last = pastRef.current[pastRef.current.length - 1]
      pastRef.current = pastRef.current.slice(0, -1)
      return JSON.parse(last) as T
    })
  }, [])

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return
    setCurrent((prev) => {
      pastRef.current = [...pastRef.current, JSON.stringify(prev)]
      const next = futureRef.current[0]
      futureRef.current = futureRef.current.slice(1)
      return JSON.parse(next) as T
    })
  }, [])

  const reset = useCallback((value: T) => {
    pastRef.current = []
    futureRef.current = []
    setCurrent(value)
  }, [])

  return {
    current,
    set,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    reset,
  }
}
