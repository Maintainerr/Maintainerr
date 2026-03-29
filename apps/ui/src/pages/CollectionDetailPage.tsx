import { PlayIcon } from '@heroicons/react/solid'
import { lazy, useEffect, useEffectEvent, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useRuleGroupForCollection } from '../api/rules'
import { ICollection } from '../components/Collection'
import LazyModalBoundary from '../components/Common/LazyModalBoundary'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import TabbedLinks, { TabbedRoute } from '../components/Common/TabbedLinks'
import { useRequestGeneration } from '../hooks/useRequestGeneration'
import { prefetchRoute } from '../router'
import GetApiHandler from '../utils/ApiHandler'
import { logClientError } from '../utils/ClientLogger'

const TestMediaItem = lazy(
  () => import('../components/Collection/CollectionDetail/TestMediaItem'),
)

const CollectionDetailPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const [collection, setCollection] = useState<ICollection | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [mediaTestModalOpen, setMediaTestModalOpen] = useState<boolean>(false)
  const { invalidate, guardedFetch } = useRequestGeneration()

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

  const fetchData = async (collectionId: string) => {
    try {
      const result = await guardedFetch(() =>
        GetApiHandler(`/collections/collection/${collectionId}`),
      )

      if (result.status === 'success') {
        setCollection(result.data)
        setIsLoading(false)
      }
    } catch (error) {
      void logClientError(
        'Failed to load collection',
        error,
        'CollectionDetailPage.fetchData',
      )
      toast.error('Failed to load collection. Check logs for details.')
      setIsLoading(false)
    }
  }

  const loadCollection = useEffectEvent((collectionId: string) => {
    invalidate()
    void fetchData(collectionId)
  })

  useEffect(() => {
    if (id) {
      loadCollection(id)
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

  const handleTabPrefetch = (tab: string) => {
    if (!id) {
      return
    }

    if (tab === 'media') {
      void prefetchRoute(`/collections/${id}`)
      return
    }

    void prefetchRoute(`/collections/${id}/${tab}`)
  }

  if (isLoading || !collection || ruleGroupLoading) {
    return (
      <>
        <title>Collection - Maintainerr</title>
        <LoadingSpinner />
      </>
    )
  }

  return (
    <>
      <title>{collection.title} - Maintainerr</title>
      <div className="w-full">
        <div className="m-auto mb-3 flex w-full">
          <h1 className="flex w-full justify-center overflow-hidden overflow-ellipsis whitespace-nowrap text-lg font-bold text-zinc-200 sm:m-0 sm:justify-start xl:m-0">
            {collection.title}
          </h1>
        </div>

        <div>
          <div className="flex h-full items-center justify-center">
            <div className="mb-4 mt-0 w-fit sm:w-full">
              <TabbedLinks
                onChange={handleTabChange}
                onPrefetch={handleTabPrefetch}
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
          <LazyModalBoundary
            title="Test Media"
            onCancel={() => {
              setMediaTestModalOpen(false)
            }}
            size="5xl"
          >
            <TestMediaItem
              collectionId={+collection.id}
              onCancel={() => {
                setMediaTestModalOpen(false)
              }}
              onSubmit={() => {}}
            />
          </LazyModalBoundary>
        ) : undefined}
      </div>
    </>
  )
}

export default CollectionDetailPage
