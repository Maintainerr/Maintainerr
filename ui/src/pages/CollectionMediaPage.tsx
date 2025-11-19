import { debounce } from 'lodash-es'
import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { ICollection, ICollectionMedia } from '../components/Collection'
import GetApiHandler from '../utils/ApiHandler'
import OverviewContent, { IPlexMetadata } from '../components/Overview/Content'

interface CollectionContextType {
  collection: ICollection
}

const CollectionMediaPage = () => {
  const { collection } = useOutletContext<CollectionContextType>()
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<IPlexMetadata[]>([])
  const [media, setMedia] = useState<ICollectionMedia[]>([])
  // paging
  const pageData = useRef<number>(0)
  const fetchAmount = 25
  const [totalSize, setTotalSize] = useState<number>(999)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isLoadingExtra, setIsLoadingExtra] = useState<boolean>(false)

  const [page, setPage] = useState(0)
  const [pageDataCount, setPageDataCount] = useState(0)

  const handleScroll = () => {
    if (
      window.innerHeight + document.documentElement.scrollTop >=
      document.documentElement.scrollHeight * 0.9
    ) {
      if (
        !isLoading &&
        !isLoadingExtra &&
        !(fetchAmount * (pageData.current - 1) >= totalSize)
      ) {
        setPage(pageData.current + 1)
      }
    }
  }

  useEffect(() => {
    if (page !== 0) {
      // Ignore initial page render
      pageData.current = pageData.current + 1
      setPageDataCount(pageData.current)
      fetchData()
    }
  }, [page])

  useEffect(() => {
    const debouncedScroll = debounce(handleScroll, 200)
    window.addEventListener('scroll', debouncedScroll)
    return () => {
      window.removeEventListener('scroll', debouncedScroll)
      debouncedScroll.cancel() // Cancel pending debounced calls
    }
  }, [isLoading, isLoadingExtra, totalSize])

  useEffect(() => {
    // Initial first fetch
    setPage(1)
  }, [])

  const fetchData = async () => {
    if (!isLoading) {
      setIsLoadingExtra(true)
    }
    const resp: { totalSize: number; items: ICollectionMedia[] } =
      await GetApiHandler(
        `/collections/media/${id}/content/${pageData.current}?size=${fetchAmount}`,
      )

    setTotalSize(resp.totalSize)
    setMedia((prevMedia) => [...prevMedia, ...resp.items])

    setData((prevData) => [
      ...prevData,
      ...resp.items.map((el) => {
        el.plexData!.maintainerrIsManual = el.isManual ? el.isManual : false
        return el.plexData ? el.plexData : ({} as IPlexMetadata)
      }),
    ])
    setIsLoading(false)
    setIsLoadingExtra(false)
  }

  useEffect(() => {
    // If page is not filled yet, fetch more
    if (
      !isLoading &&
      !isLoadingExtra &&
      window.innerHeight + document.documentElement.scrollTop >=
        document.documentElement.scrollHeight * 0.9 &&
      !(fetchAmount * (pageData.current - 1) >= totalSize)
    ) {
      setPage(page + 1)
    }
  }, [data, isLoading, isLoadingExtra, totalSize])

  return (
    <OverviewContent
      dataFinished={true}
      fetchData={() => {}}
      loading={isLoading}
      data={data}
      libraryId={collection.libraryId}
      collectionPage={true}
      extrasLoading={
        isLoadingExtra && !isLoading && totalSize >= pageDataCount * fetchAmount
      }
      onRemove={(id: string) =>
        setTimeout(() => {
          setData((prevData) => prevData.filter((el) => +el.ratingKey !== +id))
          setMedia((prevMedia) => prevMedia.filter((el) => +el.plexId !== +id))
        }, 500)
      }
      collectionInfo={media.map((el) => {
        collection.media = []
        el.collection = collection
        return el
      })}
    />
  )
}

export default CollectionMediaPage
