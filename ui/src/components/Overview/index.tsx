import { clone } from 'lodash-es'
import { useContext, useEffect, useRef, useState } from 'react'
import LibrariesContext from '../../contexts/libraries-context'
import SearchContext from '../../contexts/search-context'
import GetApiHandler from '../../utils/ApiHandler'
import LibrarySwitcher from '../Common/LibrarySwitcher'
import OverviewContent, { IPlexMetadata } from './Content'

const Overview = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [loadingExtra, setLoadingExtra] = useState<boolean>(false)
  const [data, setData] = useState<IPlexMetadata[]>([])
  const [totalSize, setTotalSize] = useState<number>(999)
  const [selectedLibrary, setSelectedLibrary] = useState<number>()
  const [searchUsed, setsearchUsed] = useState<boolean>(false)
  const [pageDataCount, setPageDataCount] = useState<number>(0)

  const pageData = useRef<number>(0)
  const SearchCtx = useContext(SearchContext)
  const LibrariesCtx = useContext(LibrariesContext)

  const fetchAmount = 30

  const switchLib = (libraryId: number) => {
    // get all movies & shows from plex
    setIsLoading(true)
    pageData.current = 0
    setPageDataCount(0)
    setTotalSize(999)
    setData([])
    setsearchUsed(false)
    setSelectedLibrary(libraryId)
  }

  useEffect(() => {
    document.title = 'Maintainerr - Overview'
    setTimeout(() => {
      if (
        isLoading &&
        data.length === 0 &&
        SearchCtx.search.text === '' &&
        LibrariesCtx.libraries.length > 0
      ) {
        switchLib(
          selectedLibrary ? selectedLibrary : +LibrariesCtx.libraries[0].key,
        )
      }
    }, 300)

    // Cleanup on unmount
    return () => {
      setData([])
      pageData.current = 0
    }
  }, [])

  const fetchData = async () => {
    if (
      selectedLibrary &&
      SearchCtx.search.text === '' &&
      totalSize >= pageData.current * fetchAmount
    ) {
      const askedLib = clone(selectedLibrary)

      const resp: { totalSize: number; items: IPlexMetadata[] } =
        await GetApiHandler(
          `/plex/library/${selectedLibrary}/content/${
            pageData.current + 1
          }?amount=${fetchAmount}`,
        )

      if (askedLib === selectedLibrary) {
        // check lib again, we don't want to change array when lib was changed
        setTotalSize(resp.totalSize)
        pageData.current = pageData.current + 1
        setPageDataCount(pageData.current)
        setData((prevData) => [
          ...prevData,
          ...(resp && resp.items ? resp.items : []),
        ])
        setIsLoading(false)
      }
      setLoadingExtra(false)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (SearchCtx.search.text !== '') {
      GetApiHandler(`/plex/search/${SearchCtx.search.text}`).then(
        (resp: IPlexMetadata[]) => {
          setsearchUsed(true)
          setTotalSize(resp.length)
          pageData.current = resp.length * 50
          setPageDataCount(resp.length * 50)
          setData(resp ? resp : [])
          setIsLoading(false)
        },
      )
      setSelectedLibrary(+LibrariesCtx.libraries[0]?.key)
    } else {
      setsearchUsed(false)
      setData([])
      setTotalSize(999)
      pageData.current = 0
      setPageDataCount(0)
      setIsLoading(true)
      fetchData()
    }
  }, [SearchCtx.search.text])

  useEffect(() => {
    fetchData()
  }, [selectedLibrary])

  return (
    <div className="w-full">
      {!searchUsed ? (
        <LibrarySwitcher allPossible={false} onSwitch={switchLib} />
      ) : undefined}
      {selectedLibrary ? (
        <OverviewContent
          dataFinished={!(totalSize >= pageDataCount * fetchAmount)}
          fetchData={() => {
            setLoadingExtra(true)
            fetchData()
          }}
          loading={isLoading}
          extrasLoading={
            loadingExtra &&
            !isLoading &&
            totalSize >= pageDataCount * fetchAmount
          }
          data={data}
          libraryId={selectedLibrary}
        />
      ) : undefined}
    </div>
  )
}
export default Overview
