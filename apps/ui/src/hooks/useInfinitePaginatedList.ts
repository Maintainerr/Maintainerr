import { debounce } from 'lodash-es'
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { defaultInfiniteScrollThreshold } from '../utils/infiniteScroll'

interface PaginatedResponse<TPageItem> {
  totalSize: number
  items: TPageItem[]
}

type PaginatedPageFetcher<TPageItem> = (
  page: number,
) => Promise<PaginatedResponse<TPageItem>>

interface UseInfinitePaginatedListOptions<TPageItem, TItem> {
  fetchAmount: number
  fetchPage: PaginatedPageFetcher<TPageItem>
  mapPageItems: (items: TPageItem[]) => TItem[]
  onAppendPageItems?: (items: TPageItem[]) => void
  onReset?: () => void
  scrollThreshold?: number
}

interface ResetAndLoadOptions<TPageItem> {
  fetchPage?: PaginatedPageFetcher<TPageItem>
}

const defaultTotalSize = 999
const useInfinitePaginatedList = <TPageItem, TItem>({
  fetchAmount,
  fetchPage,
  mapPageItems,
  onAppendPageItems,
  onReset,
  scrollThreshold = defaultInfiniteScrollThreshold,
}: UseInfinitePaginatedListOptions<TPageItem, TItem>) => {
  const [data, setData] = useState<TItem[]>([])
  const dataRef = useRef<TItem[]>([])
  const pageDataRef = useRef<number>(0)
  const totalSizeRef = useRef<number>(defaultTotalSize)
  const [totalSize, setTotalSize] = useState<number>(defaultTotalSize)
  const loadingRef = useRef<boolean>(true)
  const loadingExtraRef = useRef<boolean>(false)
  const fetchingRef = useRef<boolean>(false)
  const requestGenerationRef = useRef<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingExtra, setIsLoadingExtra] = useState(false)

  const setLoading = useCallback((value: boolean) => {
    loadingRef.current = value
    setIsLoading(value)
  }, [])

  const setLoadingExtra = useCallback((value: boolean) => {
    loadingExtraRef.current = value
    setIsLoadingExtra(value)
  }, [])

  const invalidateRequests = useCallback(() => {
    requestGenerationRef.current += 1
    fetchingRef.current = false
  }, [])

  const updateData = useCallback(
    (updater: (currentData: TItem[]) => TItem[]) => {
      const nextData = updater(dataRef.current)
      dataRef.current = nextData
      setData(nextData)
    },
    [],
  )

  const fetchRequestedPage = useEffectEvent(
    async (
      page: number,
      fetchPageOverride?: PaginatedPageFetcher<TPageItem>,
    ) => {
      return await (fetchPageOverride ?? fetchPage)(page)
    },
  )

  const mapRequestedPageItems = useEffectEvent((items: TPageItem[]) => {
    return mapPageItems(items)
  })

  const appendRequestedPageItems = useEffectEvent((items: TPageItem[]) => {
    onAppendPageItems?.(items)
  })

  const runReset = useEffectEvent(() => {
    onReset?.()
  })

  const canLoadMoreData = useEffectEvent(() => {
    return fetchAmount * (pageDataRef.current - 1) < totalSizeRef.current
  })

  const isNearBottom = useEffectEvent(() => {
    return (
      window.innerHeight + document.documentElement.scrollTop >=
      document.documentElement.scrollHeight * scrollThreshold
    )
  })

  const loadNextPage = useCallback(async (options?: ResetAndLoadOptions<TPageItem>) => {
    if (fetchingRef.current) {
      return
    }

    if (!loadingRef.current && !canLoadMoreData()) {
      return
    }

    const requestGeneration = requestGenerationRef.current
    const nextPage = pageDataRef.current + 1

    fetchingRef.current = true
    if (!loadingRef.current) {
      setLoadingExtra(true)
    }

    try {
      const response = await fetchRequestedPage(nextPage, options?.fetchPage)

      if (requestGeneration !== requestGenerationRef.current) {
        return
      }

      pageDataRef.current = nextPage
      totalSizeRef.current = response.totalSize
      setTotalSize(response.totalSize)
      appendRequestedPageItems(response.items)

      const nextData = [
        ...dataRef.current,
        ...mapRequestedPageItems(response.items),
      ]
      dataRef.current = nextData
      setData(nextData)
    } finally {
      if (requestGeneration === requestGenerationRef.current) {
        fetchingRef.current = false
        setLoading(false)
        setLoadingExtra(false)
      }
    }
  }, [
    appendRequestedPageItems,
    canLoadMoreData,
    fetchRequestedPage,
    mapRequestedPageItems,
    setLoading,
    setLoadingExtra,
  ])

  const loadNextPageIfNeeded = useEffectEvent(() => {
    if (
      isNearBottom() &&
      !loadingRef.current &&
      !loadingExtraRef.current &&
      canLoadMoreData()
    ) {
      void loadNextPage()
    }
  })

  const reset = useCallback(() => {
    invalidateRequests()
    dataRef.current = []
    pageDataRef.current = 0
    totalSizeRef.current = defaultTotalSize
    setData([])
    setTotalSize(defaultTotalSize)
    setLoading(true)
    setLoadingExtra(false)
    runReset()
  }, [invalidateRequests, runReset, setLoading, setLoadingExtra])

  const resetAndLoad = useCallback((options?: ResetAndLoadOptions<TPageItem>) => {
    reset()
    void loadNextPage(options)
  }, [loadNextPage, reset])

  const loadInitialPage = useEffectEvent(() => {
    void loadNextPage()
  })

  const handleScroll = useEffectEvent(() => {
    loadNextPageIfNeeded()
  })

  useEffect(() => {
    loadInitialPage()

    return () => {
      invalidateRequests()
      dataRef.current = []
      pageDataRef.current = 0
      totalSizeRef.current = defaultTotalSize
    }
  }, [invalidateRequests])

  useEffect(() => {
    const debouncedScroll = debounce(handleScroll, 200)
    window.addEventListener('scroll', debouncedScroll)

    return () => {
      window.removeEventListener('scroll', debouncedScroll)
      debouncedScroll.cancel()
    }
  }, [])

  useEffect(() => {
    loadNextPageIfNeeded()
  }, [data])

  return {
    data,
    hasMoreData: data.length < totalSize,
    isLoading,
    isLoadingExtra,
    resetAndLoad,
    updateData,
  }
}

export default useInfinitePaginatedList
