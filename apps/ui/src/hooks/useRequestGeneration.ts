import { useCallback, useRef } from 'react'

export type GuardedResult<T> =
  | { status: 'success'; data: T }
  | { status: 'stale' }

export const useRequestGeneration = () => {
  const generationRef = useRef(0)

  const invalidate = useCallback(() => {
    generationRef.current += 1
    return generationRef.current
  }, [])

  const guardedFetch = useCallback(
    async <T>(fetcher: () => Promise<T>): Promise<GuardedResult<T>> => {
      const generation = generationRef.current

      try {
        const result = await fetcher()

        if (generation === generationRef.current) {
          return { status: 'success', data: result }
        }
      } catch (err) {
        if (generation === generationRef.current) {
          throw err
        }
      }

      return { status: 'stale' }
    },
    [],
  )

  return {
    invalidate,
    guardedFetch,
  }
}
