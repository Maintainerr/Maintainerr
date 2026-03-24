import { type MediaItem } from '@maintainerr/contracts'
import { debounce } from 'lodash-es'
import { useEffect, useRef, useState } from 'react'
import { ICollection } from '../..'
import GetApiHandler from '../../../../utils/ApiHandler'
import OverviewContent from '../../../Overview/Content'

interface ICollectionExclusions {
  collection: ICollection
  libraryId: string
}

export interface IExclusionMedia {
  id: number
  mediaServerId: string
  ruleGroupId: number
  parent: number
  type: number
  /** Server-agnostic media metadata */
  mediaData?: MediaItem
}

const CollectionExcludions = (props: ICollectionExclusions) => {
  const [data, setData] = useState<MediaItem[]>([])
  // paging
  const pageData = useRef<number>(0)
  const fetchAmount = 25
  const [totalSize, setTotalSize] = useState<number>(999)
  const totalSizeRef = useRef<number>(999)
  const dataRef = useRef<MediaItem[]>([])
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

  const fetchData = async () => {
    if (!loadingRef.current) {
      setLoadingExtra(true)
    }
    try {
      const resp: { totalSize: number; items: IExclusionMedia[] } =
        await GetApiHandler(
          `/collections/exclusions/${props.collection.id}/content/${pageData.current}?size=${fetchAmount}`,
        )

      setTotalSize(resp.totalSize)

      setData([
        ...dataRef.current,
        ...resp.items.map((el) => {
          if (el.mediaData) {
            el.mediaData.maintainerrExclusionId = el.id
            el.mediaData.maintainerrExclusionType = el.ruleGroupId
              ? 'specific'
              : 'global'
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
    totalSizeRef.current = totalSize
  }, [totalSize])

  return (
    <OverviewContent
      dataFinished={true}
      fetchData={() => {}}
      loading={isLoading}
      data={data}
      libraryId={props.libraryId}
      collectionPage={true}
      collectionId={props.collection.id}
      extrasLoading={
        isLoadingExtra &&
        !isLoading &&
        totalSize >= pageData.current * fetchAmount
      }
      onRemove={(id: string) =>
        setTimeout(() => {
          setData(dataRef.current.filter((el) => el.id !== id))
        }, 500)
      }
    />
  )
}
export default CollectionExcludions
