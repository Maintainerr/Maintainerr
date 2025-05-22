<<<<<<< HEAD
import { debounce } from 'lodash-es'
=======
import _ from 'lodash'
>>>>>>> fafbad29 (initial commit after updating to new branch and fixing conflicts)
import { useEffect, useRef, useState } from 'react'
import { ICollection } from '../..'
import GetApiHandler from '../../../../utils/ApiHandler'
import OverviewContent, { IPlexMetadata } from '../../../Overview/Content'

interface ICollectionExclusions {
  collection: ICollection
  libraryId: number
}

export interface IExclusionMedia {
  id: number
  plexId: number
  ruleGroupId: number
  parent: number
  type: number
  plexData?: IPlexMetadata
}

const CollectionExcludions = (props: ICollectionExclusions) => {
  const [data, setData] = useState<IPlexMetadata[]>([])
  // paging
  const pageData = useRef<number>(0)
  const fetchAmount = 25
  const [totalSize, setTotalSize] = useState<number>(999)
  const totalSizeRef = useRef<number>(999)
  const dataRef = useRef<IPlexMetadata[]>([])
  const loadingRef = useRef<boolean>(true)
  const loadingExtraRef = useRef<boolean>(false)
  const [page, setPage] = useState(0)

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
      loadingExtraRef.current = true
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
        el.plexData!.maintainerrExclusionId = el.id
        el.plexData!.maintainerrExclusionType = el.ruleGroupId
          ? 'specific'
          : 'global'
        return el.plexData ? el.plexData : ({} as IPlexMetadata)
      }),
    ])
    loadingRef.current = false
    loadingExtraRef.current = false
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
      loading={loadingRef.current}
      viewMode="poster"
      data={data}
      libraryId={props.libraryId}
      collectionPage={true}
      collectionId={props.collection.id}
      onRemove={(id: string) =>
        setTimeout(() => {
          setData(dataRef.current.filter((el) => +el.ratingKey !== +id))
        }, 500)
      }
    />
  )
}
export default CollectionExcludions
