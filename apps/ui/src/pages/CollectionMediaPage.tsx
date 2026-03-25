import { type MediaItem } from '@maintainerr/contracts'
import { debounce } from 'lodash-es'
import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { ICollection, ICollectionMedia } from '../components/Collection'
import OverviewContent from '../components/Overview/Content'
import GetApiHandler from '../utils/ApiHandler'

interface CollectionContextType {
  collection: ICollection
}

const CollectionMediaPage = () => {
  const { collection } = useOutletContext<CollectionContextType>()
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<MediaItem[]>([])
  const [media, setMedia] = useState<ICollectionMedia[]>([])
  // paging
  const pageData = useRef<number>(0)
  const fetchAmount = 25
  const [totalSize, setTotalSize] = useState<number>(999)
  const totalSizeRef = useRef<number>(999)
  const dataRef = useRef<MediaItem[]>([])
  const mediaRef = useRef<ICollectionMedia[]>([])
  const loadingRef = useRef<boolean>(true)
  const loadingExtraRef = useRef<boolean>(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingExtra, setIsLoadingExtra] = useState(false)
  const [page, setPage] = useState(0)

  const setLoading = (value: boolean) => {
    loadingRef.current = value
    setIsLoading(value)
  }

  const setLoadingExtra = (value: boolean) => {
    loadingExtraRef.current = value
    setIsLoadingExtra(value)
  }

  useEffect(() => {
    // Initial first fetch
    setPage(1)
  }, [])

  const handleScroll = () => {
    if (
      window.innerHeight + document.documentElement.scrollTop >=
      document.documentElement.scrollHeight * 0.9
    ) {
      if (
        !loadingRef.current &&
        !loadingExtraRef.current &&
        !(fetchAmount * (pageData.current - 1) >= totalSizeRef.current)
      ) {
        setPage(pageData.current + 1)
      }
    }
  }

  const fetchData = async () => {
    if (!loadingRef.current) {
      setLoadingExtra(true)
    }
    try {
      const resp: { totalSize: number; items: ICollectionMedia[] } =
        await GetApiHandler(
          `/collections/media/${id}/content/${pageData.current}?size=${fetchAmount}`,
        )

      setTotalSize(resp.totalSize)

      setMedia([...mediaRef.current, ...resp.items])

      setData([
        ...dataRef.current,
        ...resp.items.map((el) => {
          if (el.mediaData) {
            el.mediaData.maintainerrIsManual = el.isManual ? el.isManual : false
          }
          return el.mediaData ? el.mediaData : ({} as MediaItem)
        }),
      ])
    } finally {
      setLoading(false)
      setLoadingExtra(false)
    }
  }

  useEffect(() => {
    if (page !== 0) {
      // Ignore initial page render
      pageData.current = pageData.current + 1
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
  }, [])

  useEffect(() => {
    dataRef.current = data

    // If page is not filled yet, fetch more
    if (
      !loadingRef.current &&
      !loadingExtraRef.current &&
      window.innerHeight + document.documentElement.scrollTop >=
        document.documentElement.scrollHeight * 0.9 &&
      !(fetchAmount * (pageData.current - 1) >= totalSizeRef.current)
    ) {
      setPage(page + 1)
    }
  }, [data])

  useEffect(() => {
    mediaRef.current = media
  }, [media])

  useEffect(() => {
    totalSizeRef.current = totalSize
  }, [totalSize])

  return (
    <OverviewContent
      dataFinished={true}
      fetchData={() => {}}
      loading={isLoading}
      data={data}
      libraryId={collection.libraryId}
      collectionPage={true}
      extrasLoading={
        isLoadingExtra &&
        !isLoading &&
        totalSize >= pageData.current * fetchAmount
      }
      onRemove={(id: string) =>
        setTimeout(() => {
          setData(dataRef.current.filter((el) => el.id !== id))
          setMedia(mediaRef.current.filter((el) => el.mediaServerId !== id))
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
