import { PlayIcon } from '@heroicons/react/solid'
import Router from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { ICollection, ICollectionMedia } from '..'
import GetApiHandler from '../../../utils/ApiHandler'
import OverviewContent, { IPlexMetadata } from '../../Overview/Content'
import _ from 'lodash'
import TestMediaItem from './TestMediaItem'

interface ICollectionDetail {
  libraryId: number
  collection: ICollection
  title: string
  onBack: () => void
}

const CollectionDetail: React.FC<ICollectionDetail> = (
  // TODO: this component uses it's own lazy loading mechanism instead of the one from OverviewContent. Update this.
  props: ICollectionDetail,
) => {
  const [data, setData] = useState<IPlexMetadata[]>([])
  const [media, setMedia] = useState<ICollectionMedia[]>([])
  const [mediaTestModalOpen, setMediaTestModalOpen] = useState<boolean>(false)
  // paging
  const pageData = useRef<number>(0)
  const fetchAmount = 25
  const [totalSize, setTotalSize] = useState<number>(999)
  const totalSizeRef = useRef<number>(999)
  const dataRef = useRef<IPlexMetadata[]>([])
  const mediaRef = useRef<ICollectionMedia[]>([])
  const loadingRef = useRef<boolean>(true)
  const loadingExtraRef = useRef<boolean>(false)

  const [page, setPage] = useState(0)

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
    window.addEventListener('scroll', _.debounce(handleScroll.bind(this), 200))
    return () => {
      window.removeEventListener(
        'scroll',
        _.debounce(handleScroll.bind(this), 200),
      )
    }
  }, [])

  useEffect(() => {
    // Initial first fetch
    setPage(1)
  }, [])

  const fetchData = async () => {
    if (!loadingRef.current) {
      loadingExtraRef.current = true
    }
    // setLoading(true)
    const resp: { totalSize: number; items: ICollectionMedia[] } =
      await GetApiHandler(
        `/collections/media/${props.collection.id}/content/${pageData.current}?size=${fetchAmount}`,
      )

    setTotalSize(resp.totalSize)
    // pageData.current = pageData.current + 1
    setMedia([...mediaRef.current, ...resp.items])

    setData([
      ...dataRef.current,
      ...resp.items.map((el) =>
        el.plexData ? el.plexData : ({} as IPlexMetadata),
      ),
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
    mediaRef.current = media
  }, [media])

  useEffect(() => {
    totalSizeRef.current = totalSize
  }, [totalSize])

  useEffect(() => {
    // trapping next router before-pop-state to manipulate router change on browser back button
    Router.beforePopState(() => {
      props.onBack()
      window.history.forward()
      return false
    })
    return () => {
      Router.beforePopState(() => {
        return true
      })
    }
  }, [])

  return (
    <div className="w-full">
      <div className="m-auto mb-3 flex w-full">
        <h1 className="w-full whitespace-nowrap overflow-hidden overflow-ellipsis flex text-lg font-bold text-zinc-200 sm:m-0 xl:m-0">
          {`${props.title}`}
        </h1>
      </div>

      <button
        className="edit-button mb-4 flex  rounded h-9 text-zinc-200 shadow-md"
        onClick={() => setMediaTestModalOpen(true)}
      >
        {<PlayIcon className="m-auto h-5 ml-5" />}{' '}
        <p className="m-auto rules-button-text ml-1 mr-5">Test Media</p>
      </button>
      <div>
        <OverviewContent
          dataFinished={true}
          fetchData={() => {}}
          loading={loadingRef.current}
          data={data}
          libraryId={props.libraryId}
          collectionPage={true}
          extrasLoading={
            loadingExtraRef &&
            !loadingRef.current &&
            totalSize >= pageData.current * fetchAmount
          }
          onRemove={(id: string) =>
            setTimeout(() => {
              setData(dataRef.current.filter((el) => +el.ratingKey !== +id))
              setMedia(mediaRef.current.filter((el) => +el.plexId !== +id))
            }, 500)
          }
          collectionInfo={media.map((el) => {
            props.collection.media = []
            el.collection = props.collection
            return el
          })}
        />
      </div>

      {mediaTestModalOpen && props.collection?.id ? (
        <TestMediaItem
          collectionId={+props.collection.id}
          onCancel={() => {
            setMediaTestModalOpen(false)
          }}
          onSubmit={() => {}}
        />
      ) : undefined}
    </div>
  )
}
export default CollectionDetail
