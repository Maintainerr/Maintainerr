import { AxiosError } from 'axios'
import { useContext, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { toast } from 'react-toastify'
import LibrariesContext, { ILibrary } from '../../contexts/libraries-context'
import GetApiHandler, { PostApiHandler } from '../../utils/ApiHandler'
import { EPlexDataType } from '../../utils/PlexDataType-enum'
import LoadingSpinner from '../Common/LoadingSpinner'
import { IPlexMetadata } from '../Overview/Content'
import CollectionDetail from './CollectionDetail'
import CollectionOverview from './CollectionOverview'

export interface ICollection {
  id?: number
  plexId?: number
  libraryId: number
  title: string
  description?: string
  isActive: boolean
  visibleOnRecommended?: boolean
  visibleOnHome?: boolean
  deleteAfterDays?: number
  listExclusions?: boolean
  forceOverseerr?: boolean
  type: EPlexDataType
  arrAction: number
  media: ICollectionMedia[]
  manualCollection: boolean
  manualCollectionName: string
  addDate: Date
  handledMediaAmount: number
  lastDurationInSeconds: number
  keepLogsForMonths: number
  tautulliWatchedPercentOverride?: number
  radarrSettingsId?: number
  sonarrSettingsId?: number
}

export interface ICollectionMedia {
  id: number
  collectionId: number
  plexId: number
  tmdbId: number
  tvdbid: number
  addDate: Date
  image_path: string
  isManual: boolean
  collection: ICollection
  plexData?: IPlexMetadata
}

const Collection = () => {
  const LibrariesCtx = useContext(LibrariesContext)
  const [isLoading, setIsLoading] = useState(true)
  const [detail, setDetail] = useState<{
    open: boolean
    collection: ICollection | undefined
  }>({ open: false, collection: undefined })
  const [library, setLibrary] = useState<ILibrary>()
  const [collections, setCollections] = useState<ICollection[]>()

  useEffect(() => {
  }, [])

  const onSwitchLibrary = (id: number) => {
    const lib =
      id != 9999
        ? LibrariesCtx.libraries.find((el) => +el.key === id)
        : undefined
    setLibrary(lib)
  }

  useEffect(() => {
    getCollections()
  }, [library])

  const getCollections = async () => {
    const colls: ICollection[] = library
      ? await GetApiHandler(`/collections?libraryId=${library.key}`)
      : await GetApiHandler('/collections')
    setCollections(colls)
    setIsLoading(false)
  }

  const doActions = async () => {
    try {
      await PostApiHandler(`/collections/handle`, {})

      toast.success('Initiated collection handling in the background.')
    } catch (e) {
      if (e instanceof AxiosError) {
        if (e.response?.status === 409) {
          toast.error('Collection handling is already running.')
          return
        }
      }

      toast.error('Failed to initiate collection handling.')
    }
  }

  const openDetail = (collection: ICollection) => {
    setDetail({ open: true, collection: collection })
  }

  const closeDetail = () => {
    setIsLoading(true)
    setDetail({ open: false, collection: undefined })
    getCollections()
    setIsLoading(false)
  }

  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Maintainerr - Collections</title>
        </Helmet>
        <LoadingSpinner />
      </>
    )
  }

  return (
    <>
      <Helmet>
        <title>Maintainerr - Collections</title>
      </Helmet>
      <div className="w-full">
        {detail.open ? (
          <CollectionDetail
            libraryId={detail.collection ? detail.collection.libraryId : 0}
            title={detail.collection ? detail.collection.title : ''}
            collection={detail.collection!}
            onBack={closeDetail}
          />
        ) : (
          <CollectionOverview
            onSwitchLibrary={onSwitchLibrary}
            collections={collections}
            doActions={doActions}
            openDetail={openDetail}
          />
        )}
      </div>
    </>
  )
}

export default Collection
