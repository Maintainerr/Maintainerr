import { t as globalT } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { lazy, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useCollection } from '../api/collections'
import { useRuleGroupForCollection } from '../api/rules'
import { ICollection } from '../components/Collection'
import ExecuteButton from '../components/Common/ExecuteButton'
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
}

const CollectionDetailPage = () => {
  const { t } = useLingui()
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
    toast.error(globalT`Failed to load collection. Check logs for details.`)
  }, [collectionError])

  const tabbedRoutes: TabbedRoute[] = [
    {
      text: t`Media`,
      route: 'media',
    },
    {
      text: t`Exclusions`,
      route: 'exclusions',
    },
    {
      text: t`Info`,
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
        <title>{t`Collection - Maintainerr`}</title>
        <LoadingSpinner />
      </>
    )
  }

  return (
    <>
      <title>{t`${{ collectionTitle: collection.title }} - Maintainerr`}</title>
      <div className="w-full px-4">
        {/* Test Media belongs to this collection's rules, so it sits with its
            title: the same place on every tab, and out of the pinned row that
            carries the media actions. */}
        <div className="m-auto mb-3 flex w-full items-center gap-3">
          <h1 className="flex w-full justify-center overflow-hidden text-lg font-bold text-ellipsis whitespace-nowrap text-zinc-200 sm:m-0 sm:justify-start xl:m-0">
            {collection.title}
          </h1>
          {ruleGroup?.useRules ? (
            <ExecuteButton
              className="mx-0 shrink-0"
              onClick={() => setMediaTestModalOpen(true)}
              text={t`Test Media`}
            />
          ) : null}
        </div>

        <div>
          <div className="flex h-full items-center justify-center">
            <div className="mt-0 mb-4 w-fit sm:w-full">
              <TabbedLinks
                onChange={handleTabChange}
                onPrefetch={handleTabPrefetch}
                routes={tabbedRoutes}
                currentRoute={currentTab}
                allEnabled={true}
              />
            </div>
          </div>
          <Outlet context={{ collection }} />
        </div>

        {mediaTestModalOpen && collection?.id ? (
          <LazyModalBoundary
            title={t`Test Media`}
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
