import { AxiosError } from 'axios'
import { useContext, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import LibrariesContext, { ILibrary } from '../contexts/libraries-context'
import GetApiHandler, { PostApiHandler } from '../utils/ApiHandler'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import CollectionOverview from '../components/Collection/CollectionOverview'
import { ICollection } from '../components/Collection'

const CollectionsListPage = () => {
  const navigate = useNavigate()
  const LibrariesCtx = useContext(LibrariesContext)
  const [isLoading, setIsLoading] = useState(true)
  const [library, setLibrary] = useState<ILibrary>()
  const [collections, setCollections] = useState<ICollection[]>()

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
    navigate(`/collections/${collection.id}`)
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
        <CollectionOverview
          onSwitchLibrary={onSwitchLibrary}
          collections={collections}
          doActions={doActions}
          openDetail={openDetail}
        />
      </div>
    </>
  )
}

export default CollectionsListPage
