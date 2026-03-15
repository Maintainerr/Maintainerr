import { type MediaItem } from '@maintainerr/contracts'
import { debounce } from 'lodash-es'
import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [pageDataState, setPageDataState] = useState<number>(0)
  const fetchAmount = 25
  const [totalSize, setTotalSize] = useState<number>(999)
  const totalSizeRef = useRef<number>(999)
  const dataRef = useRef<MediaItem[]>([])
  const loadingRef = useRef<boolean>(true)
  const [loading, setLoading] = useState<boolean>(true)
  const loadingExtraRef = useRef<boolean>(false)
  const [loadingExtra, setLoadingExtra] = useState<boolean>(false)
  const [page, setPage] = useState(0)

  const fetchData = useCallback(async () => {
    if (!loadingRef.current) {
      loadingExtraRef.current = true
      setLoadingExtra(true)
    }
    // setLoading(true)
    const resp: { totalSize: number; items: IExclusionMedia[] } =
      await GetApiHandler(
        `/collections/exclusions/${props.collection.id}/content/${pageData.current}?size=${fetchAmount}`,
      )

    setTotalSize(resp.totalSize)
    // pageData.current = pageData.current + 1

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
    loadingRef.current = false
    setLoading(false)
    loadingExtraRef.current = false
    setLoadingExtra(false)
  }, [props.collection.id, fetchAmount])

  const handleScroll = useCallback(() => {
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
  }, [fetchAmount])

  useEffect(() => {
    // Initial first fetch
    setPage(1)
  }, [])

  useEffect(() => {
    if (page !== 0) {
      // Ignore initial page render
      pageData.current = pageData.current + 1
      setPageDataState(pageData.current)
      fetchData()
    }
  }, [page, fetchData])

  useEffect(() => {
    const debouncedScroll = debounce(handleScroll, 200)
    window.addEventListener('scroll', debouncedScroll)
    return () => {
      window.removeEventListener('scroll', debouncedScroll)
      debouncedScroll.cancel() // Cancel pending debounced calls
    }
  }, [handleScroll])

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
  }, [data, page, fetchAmount])

  useEffect(() => {
    totalSizeRef.current = totalSize
  }, [totalSize])

  return (
    <OverviewContent
      dataFinished={true}
      fetchData={() => {}}
      loading={loading}
      data={data}
      libraryId={props.libraryId}
      collectionPage={true}
      collectionId={props.collection.id}
      extrasLoading={
        loadingExtra &&
        !loading &&
        totalSize >= pageDataState * fetchAmount
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
