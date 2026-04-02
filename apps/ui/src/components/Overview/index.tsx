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
import { useRequestGeneration } from '../../hooks/useRequestGeneration'
import GetApiHandler from '../../utils/ApiHandler'
import LibrarySwitcher from '../Common/LibrarySwitcher'
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
    ...(libraryType && sortParams ? { type: libraryType } : {}),
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

  const [selectedLibrary, setSelectedLibrary] = useState<string>()
  const selectedLibraryRef = useRef<string | undefined>(undefined)
  const [searchUsed, setSearchUsed] = useState<boolean>(false)

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
    ) => {
      if (
        fetchingRef.current ||
        !libraryId ||
        SearchCtx.search.text !== '' ||
        !(totalSizeRef.current >= pageData.current * fetchAmount)
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
          setTotalSize(result.data.totalSize)
          pageData.current = pageData.current + 1
          setData([...dataRef.current, ...(result.data.items ?? [])])
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
    [SearchCtx.search.text, guardedFetch, libraries, sortParams],
  )

  const performOverviewSync = useCallback(
    async (libraryId?: string, nextSortParams = sortParams) => {
      invalidateFetches()

      if (SearchCtx.search.text !== '') {
        setLoading(true)
        setLoadingExtra(false)
        if (libraryId) {
          selectedLibraryRef.current = libraryId
          setSelectedLibrary(libraryId)
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

      setSearchUsed(false)
      setData([])
      dataRef.current = []
      setTotalSize(999)
      totalSizeRef.current = 999
      pageData.current = 0
      setLoading(true)
      setLoadingExtra(false)

      if (!nextLibraryId) {
        setLoading(false)
        return
      }

      selectedLibraryRef.current = nextLibraryId
      setSelectedLibrary(nextLibraryId)
      await fetchData(nextLibraryId, nextSortParams)
    },
    [
      SearchCtx.search.text,
      fetchData,
      guardedFetch,
      invalidateFetches,
      selectedLibrary,
      sortParams,
    ],
  )

  const syncOverviewData = useEffectEvent((libraryId?: string) => {
    void performOverviewSync(libraryId)
  })

  const onSwitchLibrary = useCallback(
    (libraryId: string) => {
      if (
        SearchCtx.search.text === '' &&
        selectedLibraryRef.current === libraryId
      ) {
        return
      }

      void performOverviewSync(libraryId)
    },
    [SearchCtx.search.text, performOverviewSync],
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
  }, [invalidateFetches])

  useEffect(() => {
    if (!defaultLibraryId) return

    void syncOverviewData(defaultLibraryId)
  }, [SearchCtx.search.text, defaultLibraryId])

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    totalSizeRef.current = totalSize
  }, [totalSize])

  const hasMoreData = data.length < totalSize

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
              />
            </div>
          </div>
        ) : undefined}
        {selectedLibrary ? (
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
