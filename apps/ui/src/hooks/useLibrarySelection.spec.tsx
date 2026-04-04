import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import useLibrarySelection from './useLibrarySelection'

describe('useLibrarySelection', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps selected library state and ref in sync', () => {
    const { result } = renderHook(() =>
      useLibrarySelection({ initialLibraryId: 'all' }),
    )

    expect(result.current.selectedLibrary).toBe('all')
    expect(result.current.selectedLibraryRef.current).toBe('all')
    expect(result.current.shouldSkipLibrarySwitch('all')).toBe(true)
    expect(result.current.shouldSkipLibrarySwitch('movies')).toBe(false)

    act(() => {
      result.current.applySelectedLibrary('movies')
    })

    expect(result.current.selectedLibrary).toBe('movies')
    expect(result.current.selectedLibraryRef.current).toBe('movies')
    expect(result.current.shouldSkipLibrarySwitch('movies')).toBe(true)
    expect(result.current.shouldSkipLibrarySwitch('shows')).toBe(false)
  })

  it('treats empty library ids as no-op switches', () => {
    const { result } = renderHook(() => useLibrarySelection())

    expect(result.current.selectedLibrary).toBeUndefined()
    expect(result.current.shouldSkipLibrarySwitch(undefined)).toBe(true)
    expect(result.current.shouldSkipLibrarySwitch('')).toBe(true)
  })
})
