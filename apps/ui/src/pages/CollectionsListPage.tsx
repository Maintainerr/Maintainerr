import { AxiosError } from 'axios'
import { useEffect, useEffectEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { ICollection } from '../components/Collection'
import CollectionOverview from '../components/Collection/CollectionOverview'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import { useRequestGeneration } from '../hooks/useRequestGeneration'
import GetApiHandler, { PostApiHandler } from '../utils/ApiHandler'

const CollectionsListPage = () => {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [collections, setCollections] = useState<ICollection[]>([])
  const { invalidate, guardedFetch } = useRequestGeneration()

  const fetchData = async (libraryId?: string) => {
    try {
      const result = await guardedFetch<ICollection[]>(() =>
        libraryId
          ? GetApiHandler(`/collections?libraryId=${libraryId}`)
          : GetApiHandler('/collections'),
      )

      if (result.status === 'success') {
        setCollections(result.data)
        setIsLoading(false)
      }
    } catch {
      setIsLoading(false)
    }
  }

  const loadInitialCollections = useEffectEvent(() => {
    void fetchData()
  })

  useEffect(() => {
    loadInitialCollections()
  }, [])

  const onSwitchLibrary = (id: string) => {
    invalidate()
    fetchData(id !== 'all' ? id : undefined)
  }

  const doActions = async () => {
    try {
      await PostApiHandler(`/collections/handle`, {})

      toast.success('Initiated collection handling in the background.')
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 409) {
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

  return (
    <>
      <title>Collections - Maintainerr</title>
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="w-full">
          <CollectionOverview
            onSwitchLibrary={onSwitchLibrary}
            collections={collections}
            doActions={doActions}
            openDetail={openDetail}
          />
        </div>
      )}
    </>
  )
}

export default CollectionsListPage
