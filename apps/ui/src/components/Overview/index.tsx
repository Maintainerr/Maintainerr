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
  useMemo,
  useRef,
  useState,
} from 'react'
import SearchContext from '../../contexts/search-context'
import useLibrarySelection from '../../hooks/useLibrarySelection'
import { useRequestGeneration } from '../../hooks/useRequestGeneration'
import GetApiHandler from '../../utils/ApiHandler'
import LibrarySwitcher from '../Common/LibrarySwitcher'
import LoadingSpinner from '../Common/LoadingSpinner'
import {
  getMediaLibrarySortConfig,
  MediaLibrarySortControl,
  sortMediaItems,
  useMediaLibrarySort,
} from '../Common/MediaLibrarySortControl'
import OverviewContent from './Content'

interface OverviewBootstrapResult {
  libraries: MediaLibrary[]
  selectedLibraryId?: string
  content: {
    totalSize: number
    items: MediaItem[]
  }
}

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
  const [libraries, setLibraries] = useState<MediaLibrary[] | undefined>()
  const [librariesLoading, setLibrariesLoading] = useState<boolean>(false)
  const [librariesError, setLibrariesError] = useState<boolean>(false)

  const {
    selectedLibrary,
    selectedLibraryRef,
    applySelectedLibrary,
    shouldSkipLibrarySwitch,
  } = useLibrarySelection()
  const [searchUsed, setSearchUsed] = useState<boolean>(false)
  const lastAutoSyncKeyRef = useRef<string | undefined>(undefined)
  const bootstrapRequestedRef = useRef<boolean>(false)

  const pageData = useRef<number>(0)
  const fetchingRef = useRef<boolean>(false)
  const { invalidate, guardedFetch } = useRequestGeneration()
  const SearchCtx = useContext(SearchContext)

  const defaultLibraryId = libraries?.[0]?.id
  const currentLibraryType = libraries?.find(
    (library) =>
      library.id ===
      (selectedLibraryRef.current ?? selectedLibrary ?? defaultLibraryId),
  )?.type
  const sortConfig = useMemo(
    () => getMediaLibrarySortConfig(currentLibraryType),
    [currentLibraryType],
  )
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

  const fetchBootstrapData = useCallback(
    async (requestSortParams = sortParams) => {
      invalidateFetches()
      bootstrapRequestedRef.current = true
      setFetching(true)
      setLoading(true)
      setLoadingExtra(false)
      setLibrariesLoading(true)
      setLibrariesError(false)

      try {
        const query = new URLSearchParams({
          limit: `${fetchAmount}`,
          ...(requestSortParams ?? {}),
        })

        const result = await guardedFetch<OverviewBootstrapResult>(() =>
          GetApiHandler(`/media-server/overview/bootstrap?${query.toString()}`),
        )

        if (result.status === 'success') {
          const nextLibraries = result.data.libraries ?? []
          const nextLibraryId = result.data.selectedLibraryId
          const nextContent = {
            totalSize: result.data.content.totalSize,
            items: result.data.content.items ?? [],
          }

          setLibraries(nextLibraries)
          setLibrariesError(false)
          applySelectedLibrary(nextLibraryId)
          lastAutoSyncKeyRef.current = nextLibraryId
            ? `library:${nextLibraryId}`
            : undefined
          pageData.current = nextLibraryId ? 1 : 0
          setTotalSize(nextContent.totalSize)
          totalSizeRef.current = nextContent.totalSize
          dataRef.current = nextContent.items
          setData(nextContent.items)
        }
      } catch {
        setLibrariesError(true)
      } finally {
        setLibrariesLoading(false)
        setLoadingExtra(false)
        setLoading(false)
        setFetching(false)
      }
    },
    [
      applySelectedLibrary,
      fetchAmount,
      guardedFetch,
      invalidateFetches,
      sortParams,
    ],
  )

  const fetchData = useCallback(
    async (
      libraryId = selectedLibraryRef.current,
      requestSortParams = sortParams,
      options?: {
        replaceExisting?: boolean
        preservedPageCount?: number
      },
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
        const preservedPageCount = options?.replaceExisting
          ? Math.max(1, options.preservedPageCount ?? 1)
          : undefined
        const query = buildLibraryContentQuery({
          page: options?.replaceExisting ? 1 : pageData.current + 1,
          limit: preservedPageCount
            ? preservedPageCount * fetchAmount
            : fetchAmount,
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
          pageData.current = preservedPageCount ?? pageData.current + 1
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
      const preservedPageCount =
        !searchUsed && hasExistingData ? Math.max(pageData.current, 1) : 1

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

      await fetchData(nextLibraryId, nextSortParams, {
        replaceExisting: true,
        preservedPageCount,
      })
    },
    [
      SearchCtx.search.text,
      applySelectedLibrary,
      fetchData,
      guardedFetch,
      invalidateFetches,
      searchUsed,
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

    if (!selectedLibraryRef.current && !defaultLibraryId) {
      void fetchBootstrapData(nextSortState.sortParams)
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
      bootstrapRequestedRef.current = false
      selectedLibraryRef.current = undefined
      setFetching(false)
    }
  }, [invalidateFetches, selectedLibraryRef])

  useEffect(() => {
    if (
      SearchCtx.search.text === '' &&
      !selectedLibraryRef.current &&
      !defaultLibraryId
    ) {
      if (!bootstrapRequestedRef.current) {
        void fetchBootstrapData()
      }

      return
    }

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
  }, [
    SearchCtx.search.text,
    defaultLibraryId,
    fetchBootstrapData,
    selectedLibraryRef,
  ])

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
    bootstrapRequestedRef.current = false

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
  const resolvedLibraryId = selectedLibrary ?? defaultLibraryId
  const canRequestLibraryContent = Boolean(resolvedLibraryId)
  const hasMoreData = data.length < totalSize
  const showRefreshing = isLoading && hasData
  const showBootstrapLoading =
    !searchUsed &&
    !hasData &&
    (librariesLoading ||
      isLoading ||
      (!selectedLibrary &&
        libraries === undefined &&
        (!librariesError || Boolean(defaultLibraryId))))

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
              <MediaLibrarySortControl
                ariaLabel="Sort overview items"
                options={sortConfig.options}
                value={sortValue}
                onSortChange={handleSortChange}
                isLoading={showRefreshing}
              />
            </div>
          </div>
        ) : undefined}
        {showBootstrapLoading ? (
          <div className="min-h-[20rem]">
            <LoadingSpinner />
          </div>
        ) : selectedLibrary ? (
          <OverviewContent
            dataFinished={!canRequestLibraryContent || !hasMoreData}
            fetchData={fetchData}
            loading={isLoading}
            extrasLoading={isLoadingExtra && !isLoading && hasMoreData}
            data={data}
            libraryId={resolvedLibraryId ?? ''}
          />
        ) : !searchUsed ? (
          <OverviewContent
            dataFinished={true}
            fetchData={fetchData}
            loading={false}
            extrasLoading={false}
            data={data}
            libraryId=""
          />
        ) : undefined}
      </div>
    </>
  )
}
export default Overview
