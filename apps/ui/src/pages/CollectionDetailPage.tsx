import { lazy, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useCollection } from '../api/collections'
import { useRuleGroupForCollection } from '../api/rules'
import { ICollection } from '../components/Collection'
import CollectionDetailControlRow from '../components/Collection/CollectionDetail/CollectionDetailControlRow'
import ReapplyOverlaysButton from '../components/Collection/CollectionDetail/ReapplyOverlaysButton'
import LazyModalBoundary from '../components/Common/LazyModalBoundary'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import TabbedLinks, { TabbedRoute } from '../components/Common/TabbedLinks'
import { prefetchRoute } from '../router'
import { logClientError } from '../utils/ClientLogger'

const TestMediaItem = lazy(
  () => import('../components/Collection/CollectionDetail/TestMediaItem'),
)

export interface CollectionDetailOutletContext {
  collection: ICollection
  canTestMedia: boolean
  openMediaTestModal: () => void
}

const CollectionDetailPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const [mediaTestModalOpen, setMediaTestModalOpen] = useState<boolean>(false)

  // Determine current tab from URL path
  const getCurrentTab = () => {
    const path = location.pathname
    if (path.endsWith('/exclusions')) return 'exclusions'
    if (path.endsWith('/info')) return 'info'
    return 'media'
  }

  const currentTab = getCurrentTab()
  const showCollectionOverlayActions = Boolean(collection?.overlayEnabled)

  const { data: ruleGroup, isLoading: ruleGroupLoading } =
    useRuleGroupForCollection(id)

  const {
    data: collection,
    error: collectionError,
    isLoading,
  } = useCollection(id)

  useEffect(() => {
    if (!collectionError) {
      return
    }

    void logClientError(
      'Failed to load collection',
      collectionError,
      'CollectionDetailPage.fetchData',
    )
    toast.error('Failed to load collection. Check logs for details.')
  }, [collectionError])

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

  if (collectionError) {
    return null
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
      <div className="w-full px-4">
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
          {currentTab === 'info' &&
          (ruleGroup?.useRules || showCollectionOverlayActions) ? (
            <CollectionDetailControlRow
              canTestMedia={Boolean(ruleGroup?.useRules)}
              onOpenTestMedia={() => setMediaTestModalOpen(true)}
            >
              {showCollectionOverlayActions ? (
                <ReapplyOverlaysButton collection={collection} />
              ) : null}
            </CollectionDetailControlRow>
          ) : null}

          <Outlet
            context={{
              collection,
              canTestMedia: Boolean(ruleGroup?.useRules),
              openMediaTestModal: () => setMediaTestModalOpen(true),
            }}
          />
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
