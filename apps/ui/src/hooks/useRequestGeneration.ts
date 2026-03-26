import { useCallback, useRef } from 'react'

export const useRequestGeneration = () => {
  const generationRef = useRef(0)

  const invalidate = useCallback(() => {
    generationRef.current += 1
    return generationRef.current
  }, [])

  const getCurrent = useCallback(() => generationRef.current, [])

  const isCurrent = useCallback(
    (generation: number) => generation === generationRef.current,
    [],
  )

  return {
    getCurrent,
    invalidate,
    isCurrent,
  }
}
