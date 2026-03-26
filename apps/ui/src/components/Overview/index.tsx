import { type MediaItem } from '@maintainerr/contracts'
import { useContext, useEffect, useRef, useState } from 'react'
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
  const { getCurrent, invalidate, isCurrent } = useRequestGeneration()
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

  const invalidateFetches = () => {
    const fetchGeneration = invalidate()
    setFetching(false)

    return fetchGeneration
  }

  useEffect(() => {
    if (!libraries || libraries.length === 0) {
      return
    }

    const fallbackTimer = setTimeout(() => {
      if (
        loadingRef.current &&
        dataRef.current.length === 0 &&
        !selectedLibraryRef.current &&
        SearchCtx.search.text === ''
      ) {
        switchLib(libraries[0].id)
      }
    }, 300)

    // Cleanup on unmount
    return () => {
      clearTimeout(fallbackTimer)
      invalidateFetches()
      setData([])
      dataRef.current = []
      totalSizeRef.current = 999
      pageData.current = 0
    }
  }, [libraries])

  useEffect(() => {
    if (!libraries || libraries.length === 0) return

    const fetchGeneration = invalidateFetches()

    if (SearchCtx.search.text !== '') {
      setLoading(true)
      setLoadingExtra(false)

      GetApiHandler(`/media-server/search/${SearchCtx.search.text}`).then(
        (resp: MediaItem[]) => {
          if (!isCurrent(fetchGeneration)) {
            return
          }

          setSearchUsed(true)
          setTotalSize(resp.length)
          pageData.current = resp.length * 50
          setData(resp ? resp : [])
          setLoading(false)
        },
      )
      setSelectedLibrary(libraries[0]?.id)
    } else {
      setSearchUsed(false)
      setData([])
      setTotalSize(999)
      pageData.current = 0
      setLoading(true)
      setLoadingExtra(false)
      fetchData()
    }
  }, [SearchCtx.search.text])

  useEffect(() => {
    selectedLibraryRef.current = selectedLibrary
    fetchData()
  }, [selectedLibrary])

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    totalSizeRef.current = totalSize
  }, [totalSize])

  const switchLib = (libraryId: string) => {
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
    const fetchGeneration = getCurrent()
    if (!loadingRef.current) {
      setLoadingExtra(true)
    }
    try {
      const resp: { totalSize: number; items: MediaItem[] } =
        await GetApiHandler(
          `/media-server/library/${selectedLibraryRef.current}/content?page=${
            pageData.current + 1
          }&limit=${fetchAmount}`,
        )

      if (isCurrent(fetchGeneration)) {
        setTotalSize(resp.totalSize)
        pageData.current = pageData.current + 1
        setData([...dataRef.current, ...(resp && resp.items ? resp.items : [])])
      }
    } finally {
      if (isCurrent(fetchGeneration)) {
        setLoadingExtra(false)
        setLoading(false)
        setFetching(false)
      }
    }
  }

  return (
    <>
      <title>Overview - Maintainerr</title>
      <div className="w-full">
        {!searchUsed ? (
          <LibrarySwitcher
            shouldShowAllOption={false}
            onLibraryChange={switchLib}
          />
        ) : undefined}
        {selectedLibrary ? (
          <OverviewContent
            dataFinished={
              !(totalSizeRef.current >= pageData.current * fetchAmount)
            }
            fetchData={fetchData}
            loading={isLoading}
            extrasLoading={
              isLoadingExtra &&
              !isLoading &&
              totalSizeRef.current >= pageData.current * fetchAmount
            }
            data={data}
            libraryId={selectedLibrary!}
          />
        ) : undefined}
      </div>
    </>
  )
}
export default Overview
