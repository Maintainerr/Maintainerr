import { AxiosError } from 'axios'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { ICollection } from '../components/Collection'
import CollectionOverview from '../components/Collection/CollectionOverview'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import GetApiHandler, { PostApiHandler } from '../utils/ApiHandler'

const CollectionsListPage = () => {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [collections, setCollections] = useState<ICollection[]>()

  const getCollections = async (libraryId?: number) => {
    const colls: ICollection[] = libraryId
      ? await GetApiHandler(`/collections?libraryId=${libraryId}`)
      : await GetApiHandler('/collections')
    setCollections(colls)
    setIsLoading(false)
  }

  useEffect(() => {
    getCollections()
  }, [])

  const onSwitchLibrary = (id: number) => {
    getCollections(id != 9999 ? id : undefined)
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
