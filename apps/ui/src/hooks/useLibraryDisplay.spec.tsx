import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaServerLibraries } from '../api/media-server'
import { useLibraryDisplay } from './useLibraryDisplay'

vi.mock('../api/media-server', () => ({
  useMediaServerLibraries: vi.fn(),
}))

const mockHook = (overrides: {
  data?: { id: string; title: string; type: string }[]
  isError?: boolean
}) => {
  vi.mocked(useMediaServerLibraries).mockReturnValue({
    data: overrides.data,
    isError: overrides.isError ?? false,
  } as unknown as ReturnType<typeof useMediaServerLibraries>)
}

describe('useLibraryDisplay', () => {
  beforeEach(() => {
    vi.mocked(useMediaServerLibraries).mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('resolves the stored libraryId to a title when present', () => {
    mockHook({
      data: [{ id: 'library-1', title: 'Movies', type: 'movie' }],
    })

    const { result } = renderHook(() => useLibraryDisplay('library-1'))

    expect(result.current.title).toBe('Movies')
    expect(result.current.hasLibraryId).toBe(true)
    expect(result.current.isUnreachable).toBe(false)
  })

  it('flags an unreachable server when the query errored and the id is unresolved', () => {
    mockHook({ data: undefined, isError: true })

    const { result } = renderHook(() => useLibraryDisplay('library-1'))

    expect(result.current.title).toBeUndefined()
    expect(result.current.hasLibraryId).toBe(true)
    expect(result.current.isUnreachable).toBe(true)
  })

  it('does not flag unreachable when the query succeeded but the library is gone', () => {
    mockHook({
      data: [{ id: 'library-2', title: 'Shows', type: 'show' }],
      isError: false,
    })

    const { result } = renderHook(() => useLibraryDisplay('library-1'))

    expect(result.current.title).toBeUndefined()
    expect(result.current.isUnreachable).toBe(false)
  })

  it('returns hasLibraryId=false for empty identifiers', () => {
    mockHook({ data: [], isError: false })

    const { result } = renderHook(() => useLibraryDisplay(''))

    expect(result.current.hasLibraryId).toBe(false)
    expect(result.current.isUnreachable).toBe(false)
  })
})
