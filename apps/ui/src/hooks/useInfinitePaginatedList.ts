import { debounce } from 'lodash-es'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_INFINITE_SCROLL_THRESHOLD } from '../utils/uiBehavior'

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
  scrollThreshold = DEFAULT_INFINITE_SCROLL_THRESHOLD,
}: UseInfinitePaginatedListOptions<TPageItem, TItem>) => {
  const [data, setData] = useState<TItem[]>([])
  const dataRef = useRef<TItem[]>([])
  const fetchPageRef = useRef(fetchPage)
  const mapPageItemsRef = useRef(mapPageItems)
  const onAppendPageItemsRef = useRef(onAppendPageItems)
  const onResetRef = useRef(onReset)
  const fetchAmountRef = useRef(fetchAmount)
  const scrollThresholdRef = useRef(scrollThreshold)
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

  useEffect(() => {
    fetchPageRef.current = fetchPage
    mapPageItemsRef.current = mapPageItems
    onAppendPageItemsRef.current = onAppendPageItems
    onResetRef.current = onReset
    fetchAmountRef.current = fetchAmount
    scrollThresholdRef.current = scrollThreshold
  }, [
    fetchAmount,
    fetchPage,
    mapPageItems,
    onAppendPageItems,
    onReset,
    scrollThreshold,
  ])

  const canLoadMoreData = useCallback(() => {
    return (
      fetchAmountRef.current * (pageDataRef.current - 1) < totalSizeRef.current
    )
  }, [])

  const isNearBottom = useCallback(() => {
    return (
      window.innerHeight + document.documentElement.scrollTop >=
      document.documentElement.scrollHeight * scrollThresholdRef.current
    )
  }, [])

  const loadNextPage = useCallback(
    async (options?: ResetAndLoadOptions<TPageItem>) => {
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
        const response = await (options?.fetchPage ?? fetchPageRef.current)(
          nextPage,
        )

        if (requestGeneration !== requestGenerationRef.current) {
          return
        }

        pageDataRef.current = nextPage
        totalSizeRef.current = response.totalSize
        setTotalSize(response.totalSize)
        onAppendPageItemsRef.current?.(response.items)

        const nextData = [
          ...dataRef.current,
          ...mapPageItemsRef.current(response.items),
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
    },
    [canLoadMoreData, setLoading, setLoadingExtra],
  )

  const loadNextPageIfNeeded = useCallback(() => {
    if (
      isNearBottom() &&
      !loadingRef.current &&
      !loadingExtraRef.current &&
      canLoadMoreData()
    ) {
      void loadNextPage()
    }
  }, [canLoadMoreData, isNearBottom, loadNextPage])

  const reset = useCallback(() => {
    invalidateRequests()
    dataRef.current = []
    pageDataRef.current = 0
    totalSizeRef.current = defaultTotalSize
    setData([])
    setTotalSize(defaultTotalSize)
    setLoading(true)
    setLoadingExtra(false)
    onResetRef.current?.()
  }, [invalidateRequests, setLoading, setLoadingExtra])

  const resetAndLoad = useCallback(
    (options?: ResetAndLoadOptions<TPageItem>) => {
      reset()
      void loadNextPage(options)
    },
    [loadNextPage, reset],
  )

  useEffect(() => {
    void loadNextPage()

    return () => {
      invalidateRequests()
      dataRef.current = []
      pageDataRef.current = 0
      totalSizeRef.current = defaultTotalSize
    }
  }, [invalidateRequests, loadNextPage])

  useEffect(() => {
    const debouncedScroll = debounce(loadNextPageIfNeeded, 200)
    window.addEventListener('scroll', debouncedScroll)

    return () => {
      window.removeEventListener('scroll', debouncedScroll)
      debouncedScroll.cancel()
    }
  }, [loadNextPageIfNeeded])

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
