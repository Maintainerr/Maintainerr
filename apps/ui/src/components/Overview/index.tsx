import { type MediaItem } from '@maintainerr/contracts'
import { useContext, useEffect, useRef, useState } from 'react'
import { useMediaServerLibraries } from '../../api/media-server'
import SearchContext from '../../contexts/search-context'
import GetApiHandler from '../../utils/ApiHandler'
import LibrarySwitcher from '../Common/LibrarySwitcher'
import OverviewContent from './Content'

const Overview = () => {
  const loadingRef = useRef<boolean>(false)

  const [loadingExtra, setLoadingExtra] = useState<boolean>(false)

  const [data, setData] = useState<MediaItem[]>([])
  const dataRef = useRef<MediaItem[]>([])

  const [totalSize, setTotalSize] = useState<number>(999)
  const totalSizeRef = useRef<number>(999)

  const [selectedLibrary, setSelectedLibrary] = useState<string>()
  const selectedLibraryRef = useRef<string | undefined>(undefined)
  const [searchUsed, setSearchUsed] = useState<boolean>(false)

  const pageData = useRef<number>(0)
  const fetchingRef = useRef<boolean>(false)
  const fetchGenerationRef = useRef<number>(0)
  const SearchCtx = useContext(SearchContext)

  const { data: libraries } = useMediaServerLibraries()

  const fetchAmount = 30

  const setIsLoading = (val: boolean) => {
    loadingRef.current = val
  }

  const setFetching = (val: boolean) => {
    fetchingRef.current = val
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
      setData([])
      dataRef.current = []
      totalSizeRef.current = 999
      pageData.current = 0
    }
  }, [libraries])

  useEffect(() => {
    if (!libraries || libraries.length === 0) return

    if (SearchCtx.search.text !== '') {
      GetApiHandler(`/media-server/search/${SearchCtx.search.text}`).then(
        (resp: MediaItem[]) => {
          setSearchUsed(true)
          setTotalSize(resp.length)
          pageData.current = resp.length * 50
          setData(resp ? resp : [])
          setIsLoading(false)
        },
      )
      setSelectedLibrary(libraries[0]?.id)
    } else {
      setSearchUsed(false)
      setData([])
      setTotalSize(999)
      pageData.current = 0
      setIsLoading(true)
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
    fetchGenerationRef.current = fetchGenerationRef.current + 1
    setIsLoading(true)
    setLoadingExtra(false)
    setFetching(false)
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
    const fetchGeneration = fetchGenerationRef.current
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

      if (fetchGeneration === fetchGenerationRef.current) {
        setTotalSize(resp.totalSize)
        pageData.current = pageData.current + 1
        setData([...dataRef.current, ...(resp && resp.items ? resp.items : [])])
      }
    } finally {
      if (fetchGeneration === fetchGenerationRef.current) {
        setLoadingExtra(false)
        setIsLoading(false)
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
            fetchData={() => fetchData()}
            loading={loadingRef.current}
            extrasLoading={
              loadingExtra &&
              !loadingRef.current &&
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
