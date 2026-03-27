import { type MediaItem } from '@maintainerr/contracts'
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
import OverviewContent from './Content'

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

  const { data: libraries } = useMediaServerLibraries()

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

  const fetchData = async () => {
    if (
      fetchingRef.current ||
      !selectedLibraryRef.current ||
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
      const result = await guardedFetch<{
        totalSize: number
        items: MediaItem[]
      }>(() =>
        GetApiHandler(
          `/media-server/library/${selectedLibraryRef.current}/content?page=${
            pageData.current + 1
          }&limit=${fetchAmount}`,
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
  }

  const onSwitchLibrary = (libraryId: string) => {
    invalidateFetches()
    setLoading(true)
    setLoadingExtra(false)
    pageData.current = 0
    setTotalSize(999)
    setData([])
    dataRef.current = []
    setSearchUsed(false)
    setSelectedLibrary(libraryId)
  }

  const syncFallbackLibrary = useEffectEvent((libraryId: string) => {
    if (
      loadingRef.current &&
      dataRef.current.length === 0 &&
      !selectedLibraryRef.current &&
      SearchCtx.search.text === ''
    ) {
      onSwitchLibrary(libraryId)
    }
  })

  const syncOverviewData = useEffectEvent((libraryId?: string) => {
    invalidateFetches()

    if (SearchCtx.search.text !== '') {
      setLoading(true)
      setLoadingExtra(false)

      const searchData = async () => {
        try {
          const result = await guardedFetch<MediaItem[]>(() =>
            GetApiHandler(`/media-server/search/${SearchCtx.search.text}`),
          )

          if (result.status === 'success') {
            setSearchUsed(true)
            setTotalSize(result.data.length)
            pageData.current = result.data.length * 50
            setData(result.data)
            setLoading(false)
          }
        } catch {
          setLoading(false)
        }
      }

      void searchData()
      setSelectedLibrary(libraryId)
      return
    }

    setSearchUsed(false)
    setData([])
    setTotalSize(999)
    pageData.current = 0
    setLoading(true)
    setLoadingExtra(false)
    void fetchData()
  })

  const syncSelectedLibrary = useEffectEvent((libraryId?: string) => {
    selectedLibraryRef.current = libraryId
    void fetchData()
  })

  useEffect(() => {
    if (!libraries || libraries.length === 0) {
      return
    }

    const fallbackTimer = setTimeout(() => {
      syncFallbackLibrary(libraries[0].id)
    }, 300)

    return () => {
      clearTimeout(fallbackTimer)
      invalidateFetches()
      setData([])
      dataRef.current = []
      totalSizeRef.current = 999
      pageData.current = 0
    }
  }, [invalidateFetches, libraries])

  useEffect(() => {
    if (!libraries || libraries.length === 0) return

    syncOverviewData(libraries[0]?.id)
  }, [SearchCtx.search.text, libraries])

  useEffect(() => {
    syncSelectedLibrary(selectedLibrary)
  }, [selectedLibrary])

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
          <LibrarySwitcher
            shouldShowAllOption={false}
            onLibraryChange={onSwitchLibrary}
          />
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
