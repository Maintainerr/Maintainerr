import type {
  MediaItem,
  MediaLibrary,
  MediaLibrarySortParams,
} from '@maintainerr/contracts'
import {
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import { useMediaServerLibraries } from '../../api/media-server'
import SearchContext from '../../contexts/search-context'
import useLibrarySelection from '../../hooks/useLibrarySelection'
import { useRequestGeneration } from '../../hooks/useRequestGeneration'
import GetApiHandler from '../../utils/ApiHandler'
import LibrarySwitcher from '../Common/LibrarySwitcher'
import { SmallLoadingSpinner } from '../Common/LoadingSpinner'
import {
  getMediaLibrarySortConfig,
  MediaLibrarySortControl,
  sortMediaItems,
  useMediaLibrarySort,
} from '../Common/MediaLibrarySortControl'
import OverviewContent from './Content'

export const buildLibraryContentQuery = ({
  page,
  limit,
  libraryType,
  sortParams,
}: {
  page: number
  limit: number
  libraryType?: MediaLibrary['type']
  sortParams?: MediaLibrarySortParams
}) => {
  return new URLSearchParams({
    page: `${page}`,
    limit: `${limit}`,
    ...(libraryType ? { type: libraryType } : {}),
    ...(sortParams ?? {}),
  })
}

const Overview = () => {
  const loadingRef = useRef<boolean>(false)
  const loadingExtraRef = useRef<boolean>(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingExtra, setIsLoadingExtra] = useState(false)

  const [data, setData] = useState<MediaItem[]>([])
  const dataRef = useRef<MediaItem[]>([])

  const [totalSize, setTotalSize] = useState<number>(999)
  const totalSizeRef = useRef<number>(999)

  const {
    selectedLibrary,
    selectedLibraryRef,
    applySelectedLibrary,
    shouldSkipLibrarySwitch,
  } = useLibrarySelection()
  const [searchUsed, setSearchUsed] = useState<boolean>(false)
  const lastAutoSyncKeyRef = useRef<string | undefined>(undefined)

  const pageData = useRef<number>(0)
  const fetchingRef = useRef<boolean>(false)
  const { invalidate, guardedFetch } = useRequestGeneration()
  const SearchCtx = useContext(SearchContext)

  const {
    data: libraries,
    error: librariesError,
    isLoading: librariesLoading,
  } = useMediaServerLibraries()
  const defaultLibraryId = libraries?.[0]?.id
  const currentLibraryType = libraries?.find(
    (library) =>
      library.id ===
      (selectedLibraryRef.current ?? selectedLibrary ?? defaultLibraryId),
  )?.type
  const sortConfig = getMediaLibrarySortConfig(currentLibraryType)
  const { sortValue, sortParams, onSortChange } =
    useMediaLibrarySort(sortConfig)

  const fetchAmount = 30

  const setLoading = (val: boolean) => {
    loadingRef.current = val
    setIsLoading(val)
  }

  const setLoadingExtra = (val: boolean) => {
    loadingExtraRef.current = val
    setIsLoadingExtra(val)
  }

  const setFetching = (val: boolean) => {
    fetchingRef.current = val
  }

  const invalidateFetches = useCallback(() => {
    invalidate()
    setFetching(false)
  }, [invalidate])

  const fetchData = useCallback(
    async (
      libraryId = selectedLibraryRef.current,
      requestSortParams = sortParams,
      options?: { replaceExisting?: boolean },
    ) => {
      if (
        fetchingRef.current ||
        !libraryId ||
        SearchCtx.search.text !== '' ||
        (!options?.replaceExisting &&
          !(totalSizeRef.current >= pageData.current * fetchAmount))
      ) {
        return
      }

      setFetching(true)
      if (!loadingRef.current) {
        setLoadingExtra(true)
      }

      try {
        const libraryType = libraries?.find(
          (library) => library.id === libraryId,
        )?.type
        const query = buildLibraryContentQuery({
          page: pageData.current + 1,
          limit: fetchAmount,
          libraryType,
          sortParams: requestSortParams,
        })

        const result = await guardedFetch<{
          totalSize: number
          items: MediaItem[]
        }>(() =>
          GetApiHandler(
            `/media-server/library/${libraryId}/content?${query.toString()}`,
          ),
        )

        if (result.status === 'success') {
          const nextItems = result.data.items ?? []
          const mergedItems = options?.replaceExisting
            ? nextItems
            : [...dataRef.current, ...nextItems]

          setTotalSize(result.data.totalSize)
          totalSizeRef.current = result.data.totalSize
          pageData.current = options?.replaceExisting ? 1 : pageData.current + 1
          dataRef.current = mergedItems
          setData(mergedItems)
          setLoadingExtra(false)
          setLoading(false)
          setFetching(false)
        }
      } catch {
        setLoadingExtra(false)
        setLoading(false)
        setFetching(false)
      }
    },
    [
      SearchCtx.search.text,
      guardedFetch,
      libraries,
      selectedLibraryRef,
      sortParams,
    ],
  )

  const performOverviewSync = useCallback(
    async (libraryId?: string, nextSortParams = sortParams) => {
      invalidateFetches()

      if (SearchCtx.search.text !== '') {
        setLoading(true)
        setLoadingExtra(false)
        if (libraryId) {
          applySelectedLibrary(libraryId)
        }

        const searchData = async () => {
          try {
            const result = await guardedFetch<MediaItem[]>(() =>
              GetApiHandler(`/media-server/search/${SearchCtx.search.text}`),
            )

            if (result.status === 'success') {
              setSearchUsed(true)
              setTotalSize(result.data.length)
              pageData.current = result.data.length * 50
              setData(sortMediaItems(result.data, nextSortParams))
              setLoading(false)
            }
          } catch {
            setLoading(false)
          }
        }

        await searchData()
        return
      }

      const nextLibraryId =
        libraryId ?? selectedLibraryRef.current ?? selectedLibrary
      const hasExistingData = dataRef.current.length > 0

      setSearchUsed(false)
      pageData.current = 0
      setLoading(true)
      setLoadingExtra(false)

      if (!hasExistingData) {
        setData([])
        dataRef.current = []
        setTotalSize(999)
        totalSizeRef.current = 999
      }

      if (!nextLibraryId) {
        setLoading(false)
        return
      }

      applySelectedLibrary(nextLibraryId)
      await fetchData(nextLibraryId, nextSortParams, { replaceExisting: true })
    },
    [
      SearchCtx.search.text,
      applySelectedLibrary,
      fetchData,
      guardedFetch,
      invalidateFetches,
      selectedLibrary,
      selectedLibraryRef,
      sortParams,
    ],
  )

  const syncOverviewData = useEffectEvent((libraryId?: string) => {
    void performOverviewSync(libraryId)
  })

  const onSwitchLibrary = useCallback(
    (libraryId: string) => {
      if (SearchCtx.search.text === '' && shouldSkipLibrarySwitch(libraryId)) {
        return
      }

      void performOverviewSync(libraryId)
    },
    [SearchCtx.search.text, performOverviewSync, shouldSkipLibrarySwitch],
  )

  const handleSortChange = (nextSortValue: string) => {
    const nextSortState = onSortChange(nextSortValue)
    if (!nextSortState) {
      return
    }

    void performOverviewSync(
      selectedLibraryRef.current ?? selectedLibrary ?? defaultLibraryId,
      nextSortState.sortParams,
    )
  }

  useEffect(() => {
    return () => {
      invalidateFetches()
      dataRef.current = []
      totalSizeRef.current = 999
      pageData.current = 0
      selectedLibraryRef.current = undefined
      setFetching(false)
    }
  }, [invalidateFetches, selectedLibraryRef])

  useEffect(() => {
    const nextLibraryId = selectedLibraryRef.current ?? defaultLibraryId
    const nextSyncKey =
      SearchCtx.search.text !== ''
        ? `search:${SearchCtx.search.text}`
        : nextLibraryId
          ? `library:${nextLibraryId}`
          : undefined

    if (!nextSyncKey || lastAutoSyncKeyRef.current === nextSyncKey) {
      return
    }

    lastAutoSyncKeyRef.current = nextSyncKey
    void syncOverviewData(nextLibraryId)
  }, [SearchCtx.search.text, defaultLibraryId, selectedLibraryRef])

  useEffect(() => {
    if (!libraries?.length || !selectedLibraryRef.current) {
      return
    }

    const isSelectedLibraryAvailable = libraries.some(
      (library) => library.id === selectedLibraryRef.current,
    )

    if (isSelectedLibraryAvailable) {
      return
    }

    lastAutoSyncKeyRef.current = undefined
    applySelectedLibrary(undefined)

    if (defaultLibraryId) {
      void performOverviewSync(defaultLibraryId)
    }
  }, [
    applySelectedLibrary,
    defaultLibraryId,
    libraries,
    performOverviewSync,
    selectedLibraryRef,
  ])

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    totalSizeRef.current = totalSize
  }, [totalSize])

  const hasData = data.length > 0
  const hasMoreData = data.length < totalSize
  const showRefreshing = isLoading && hasData
  const showBootstrapLoading =
    !searchUsed &&
    !hasData &&
    (librariesLoading ||
      isLoading ||
      (!selectedLibrary && Boolean(defaultLibraryId)))

  return (
    <>
      <title>Overview - Maintainerr</title>
      <div className="w-full">
        {!searchUsed ? (
          <div className="mb-5 flex w-full flex-col gap-3 sm:flex-row">
            <div className="w-full sm:w-1/2">
              <LibrarySwitcher
                shouldShowAllOption={false}
                onLibraryChange={onSwitchLibrary}
                selectedLibraryId={selectedLibrary ?? defaultLibraryId}
                formClassName="max-w-none"
                libraries={libraries}
                librariesLoading={librariesLoading}
                librariesError={!!librariesError}
              />
            </div>
            <div className="w-full sm:w-1/2">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <MediaLibrarySortControl
                    ariaLabel="Sort overview items"
                    options={sortConfig.options}
                    value={sortValue}
                    onSortChange={handleSortChange}
                  />
                </div>
                <div className="flex min-h-6 min-w-6 items-center justify-end">
                  {showRefreshing ? (
                    <SmallLoadingSpinner className="h-6 w-6" />
                  ) : undefined}
                </div>
              </div>
            </div>
          </div>
        ) : undefined}
        {showBootstrapLoading ? (
          <div className="flex min-h-[20rem] items-center justify-center">
            <SmallLoadingSpinner className="h-16 w-16" />
          </div>
        ) : selectedLibrary ? (
          <OverviewContent
            dataFinished={!hasMoreData}
            fetchData={fetchData}
            loading={isLoading}
            extrasLoading={isLoadingExtra && !isLoading && hasMoreData}
            data={data}
            libraryId={selectedLibrary!}
          />
        ) : undefined}
      </div>
    </>
  )
}
export default Overview
