import { AxiosError } from 'axios'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { fetchCollections, useCollections } from '../api/collections'
import { ICollection } from '../components/Collection'
import CollectionOverview from '../components/Collection/CollectionOverview'
import useLibrarySelection from '../hooks/useLibrarySelection'
import { PostApiHandler } from '../utils/ApiHandler'

const CollectionsListPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isSwitchingLibrary, setIsSwitchingLibrary] = useState(false)
  const {
    selectedLibrary,
    selectedLibraryRef,
    applySelectedLibrary,
    shouldSkipLibrarySwitch,
  } = useLibrarySelection({ initialLibraryId: 'all' })
  const activeLibraryId =
    selectedLibrary !== 'all' ? selectedLibrary : undefined
  const { data: collections = [], isLoading } = useCollections(activeLibraryId)

  const onSwitchLibrary = async (id: string) => {
    if (shouldSkipLibrarySwitch(id)) {
      return
    }

    const nextLibraryId = id !== 'all' ? id : undefined

    setIsSwitchingLibrary(true)

    try {
      await queryClient.fetchQuery({
        queryKey: ['collections', nextLibraryId ?? 'all'],
        queryFn: async () => {
          return await fetchCollections(nextLibraryId)
        },
        staleTime: 0,
      })

      applySelectedLibrary(id)
    } catch {
      applySelectedLibrary(selectedLibraryRef.current ?? 'all')
    } finally {
      setIsSwitchingLibrary(false)
    }
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
      <div className="w-full">
        <CollectionOverview
          onSwitchLibrary={onSwitchLibrary}
          selectedLibraryId={selectedLibrary}
          isLoading={isLoading || isSwitchingLibrary}
          collections={collections}
          doActions={doActions}
          openDetail={openDetail}
        />
      </div>
    </>
  )
}

export default CollectionsListPage
