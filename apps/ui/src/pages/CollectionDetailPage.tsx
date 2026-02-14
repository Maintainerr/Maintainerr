import { PlayIcon } from '@heroicons/react/solid'
import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useRuleGroupForCollection } from '../api/rules'
import { ICollection } from '../components/Collection'
import TestMediaItem from '../components/Collection/CollectionDetail/TestMediaItem'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import TabbedLinks, { TabbedRoute } from '../components/Common/TabbedLinks'
import GetApiHandler from '../utils/ApiHandler'

const CollectionDetailPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const [collection, setCollection] = useState<ICollection | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [mediaTestModalOpen, setMediaTestModalOpen] = useState<boolean>(false)

  // Determine current tab from URL path
  const getCurrentTab = () => {
    const path = location.pathname
    if (path.endsWith('/exclusions')) return 'exclusions'
    if (path.endsWith('/info')) return 'info'
    return 'media'
  }

  const currentTab = getCurrentTab()

  const { data: ruleGroup, isLoading: ruleGroupLoading } =
    useRuleGroupForCollection(id)

  useEffect(() => {
    if (id) {
      GetApiHandler(`/collections/collection/${id}`)
        .then((resp) => {
          setCollection(resp)
          setIsLoading(false)
        })
        .catch((err) => {
          console.error('Failed to load collection:', err)
          setIsLoading(false)
        })
    }
  }, [id])

  const tabbedRoutes: TabbedRoute[] = [
    {
      text: 'Media',
      route: 'media',
    },
    {
      text: 'Exclusions',
      route: 'exclusions',
    },
    {
      text: 'Info',
      route: 'info',
    },
  ]

  const handleTabChange = (tab: string) => {
    if (tab === 'media') {
      navigate(`/collections/${id}`)
    } else {
      navigate(`/collections/${id}/${tab}`)
    }
  }

  if (isLoading || !collection || ruleGroupLoading) {
    return (
      <>
        <title>Collection - Maintainerr</title>
        <LoadingSpinner />
      </>
    )
  }

  const displayName = collection.ruleName ?? collection.title

  return (
    <>
      <title>{displayName} - Maintainerr</title>
      <div className="w-full">
        <div className="m-auto mb-3 flex w-full">
          <h1 className="flex w-full justify-center overflow-hidden overflow-ellipsis whitespace-nowrap text-lg font-bold text-zinc-200 sm:m-0 sm:justify-start xl:m-0">
            {displayName}
          </h1>
        </div>

        <div>
          <div className="flex h-full items-center justify-center">
            <div className="mb-4 mt-0 w-fit sm:w-full">
              <TabbedLinks
                onChange={handleTabChange}
                routes={tabbedRoutes}
                currentRoute={currentTab}
                allEnabled={true}
              />
            </div>
          </div>
          {ruleGroup?.useRules && (
            <div className="flex justify-center sm:justify-start">
              <button
                className="edit-button mb-4 flex h-9 rounded text-zinc-200 shadow-md"
                onClick={() => setMediaTestModalOpen(true)}
              >
                {<PlayIcon className="m-auto ml-5 h-5" />}{' '}
                <p className="rules-button-text m-auto ml-1 mr-5">Test Media</p>
              </button>
            </div>
          )}

          <Outlet context={{ collection }} />
        </div>

        {mediaTestModalOpen && collection?.id ? (
          <TestMediaItem
            collectionId={+collection.id}
            onCancel={() => {
              setMediaTestModalOpen(false)
            }}
            onSubmit={() => {}}
          />
        ) : undefined}
      </div>
    </>
  )
}

export default CollectionDetailPage
