import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useInfinitePaginatedList from './useInfinitePaginatedList'

const createPageResponse = (value: string) => ({
  totalSize: 1,
  items: [value],
})

describe('useInfinitePaginatedList', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 0,
    })
    Object.defineProperty(document.documentElement, 'scrollTop', {
      configurable: true,
      value: 0,
    })
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 100,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('uses the override fetcher for the first page after resetAndLoad', async () => {
    const initialFetchPage = vi
      .fn()
      .mockResolvedValue(createPageResponse('initial'))
    const overrideFetchPage = vi
      .fn()
      .mockResolvedValue(createPageResponse('override'))

    const { result } = renderHook(() =>
      useInfinitePaginatedList<string, string>({
        fetchAmount: 25,
        fetchPage: initialFetchPage,
        mapPageItems: (items) => items,
      }),
    )

    await waitFor(() => {
      expect(initialFetchPage).toHaveBeenCalledWith(1)
      expect(result.current.data).toEqual(['initial'])
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.resetAndLoad({
        fetchPage: overrideFetchPage,
      })
    })

    await waitFor(() => {
      expect(overrideFetchPage).toHaveBeenCalledWith(1)
      expect(result.current.data).toEqual(['override'])
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('uses the latest fetchPage after rerendering', async () => {
    const firstFetchPage = vi.fn().mockResolvedValue(createPageResponse('one'))
    const secondFetchPage = vi.fn().mockResolvedValue(createPageResponse('two'))

    const { result, rerender } = renderHook(
      ({ fetchPage }) =>
        useInfinitePaginatedList<string, string>({
          fetchAmount: 25,
          fetchPage,
          mapPageItems: (items) => items,
        }),
      {
        initialProps: {
          fetchPage: firstFetchPage,
        },
      },
    )

    await waitFor(() => {
      expect(firstFetchPage).toHaveBeenCalledWith(1)
      expect(result.current.data).toEqual(['one'])
    })

    rerender({
      fetchPage: secondFetchPage,
    })

    act(() => {
      result.current.resetAndLoad()
    })

    await waitFor(() => {
      expect(secondFetchPage).toHaveBeenCalledWith(1)
      expect(result.current.data).toEqual(['two'])
    })
  })
})
