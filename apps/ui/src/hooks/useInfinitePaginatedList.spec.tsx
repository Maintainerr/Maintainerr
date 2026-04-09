import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('lodash-es', () => ({
  debounce: <T extends (...args: any[]) => void>(fn: T) => {
    const wrapped = ((...args: Parameters<T>) => fn(...args)) as T & {
      cancel: ReturnType<typeof vi.fn>
    }
    wrapped.cancel = vi.fn()
    return wrapped
  },
}))

import useInfinitePaginatedList from './useInfinitePaginatedList'

const createPageResponse = (value: string) => ({
  totalSize: 1,
  items: [value],
})

describe('useInfinitePaginatedList', () => {
  let scrollTop = 0

  beforeEach(() => {
    scrollTop = 0

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 100,
    })
    Object.defineProperty(document.documentElement, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
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

  it('auto-fetches another page after append when the viewport is still full (no scroll required)', async () => {
    // Regression: when the first page isn't tall enough to produce a
    // scrollbar, no scroll event ever fires. The hook must still load the
    // next page on its own, otherwise the list gets stuck (see issue #2637).
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        totalSize: 2,
        items: ['page-one'],
      })
      .mockResolvedValueOnce({
        totalSize: 2,
        items: ['page-two'],
      })

    const { result } = renderHook(() =>
      useInfinitePaginatedList<string, string>({
        fetchAmount: 1,
        fetchPage,
        mapPageItems: (items) => items,
      }),
    )

    await waitFor(() => {
      expect(fetchPage).toHaveBeenCalledTimes(2)
      expect(fetchPage).toHaveBeenNthCalledWith(1, 1)
      expect(fetchPage).toHaveBeenNthCalledWith(2, 2)
      expect(result.current.data).toEqual(['page-one', 'page-two'])
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isLoadingExtra).toBe(false)
    })
  })

  it('stops auto-fetching once totalSize is reached', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      totalSize: 1,
      items: ['only'],
    })

    const { result } = renderHook(() =>
      useInfinitePaginatedList<string, string>({
        fetchAmount: 30,
        fetchPage,
        mapPageItems: (items) => items,
      }),
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(['only'])
      expect(result.current.isLoading).toBe(false)
    })

    // Give the post-append effect a chance to run before asserting no
    // additional calls were made.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})
