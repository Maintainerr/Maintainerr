import type {
  MediaItem,
  MediaLibrary,
  MediaLibrarySortParams,
} from '@maintainerr/contracts'
import { MediaServerFeature, supportsFeature } from '@maintainerr/contracts'
import { CheckCircleIcon, DocumentRemoveIcon } from '@heroicons/react/solid'
import {
  useCallback,
  use,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'react-toastify'
import SearchContext from '../../contexts/search-context'
import { useBulkExcludeMedia } from '../../api/rules'
import useLibrarySelection from '../../hooks/useLibrarySelection'
import { useMediaServerType } from '../../hooks/useMediaServerType'
import { useRequestGeneration } from '../../hooks/useRequestGeneration'
import GetApiHandler from '../../utils/ApiHandler'
import Button from '../Common/Button'
import ConfirmActionButton from '../Common/ConfirmActionButton'
import LibrarySwitcher from '../Common/LibrarySwitcher'
import LoadingSpinner from '../Common/LoadingSpinner'
import PageControlRow from '../Common/PageControlRow'
import {
  getMediaLibrarySortConfig,
  MediaLibrarySortControl,
  sortMediaItems,
  useMediaLibrarySort,
} from '../Common/MediaLibrarySortControl'
import { invalidateMaintainerrStatusDetails } from '../Common/MediaCard/maintainerrStatus'
import OverviewContent from './Content'

interface OverviewBootstrapResult {
  libraries: MediaLibrary[]
  selectedLibraryId?: string
  content: {
    totalSize: number
    items: MediaItem[]
  }
}

const formatItemCount = (count: number): string =>
  `${count} item${count === 1 ? '' : 's'}`

export const buildLibraryContentQuery = ({
  page,
  limit,
  libraryType,
  sortParams,
}: {
  page: number
  limit: number
  libraryType?: MediaLibrary['type']
  sortParams?: MediaLibrarySortParams
}) => {
  return new URLSearchParams({
    page: `${page}`,
    limit: `${limit}`,
    ...(libraryType ? { type: libraryType } : {}),
    ...(sortParams ?? {}),
  })
}

const Overview = () => {
  const loadingRef = useRef<boolean>(false)
  const loadingExtraRef = useRef<boolean>(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingExtra, setIsLoadingExtra] = useState(false)

  const [data, setData] = useState<MediaItem[]>([])
  const dataRef = useRef<MediaItem[]>([])
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectionMode, setSelectionMode] = useState(false)
  const bulkExcludeMedia = useBulkExcludeMedia()

  const [totalSize, setTotalSize] = useState<number>(999)
  const totalSizeRef = useRef<number>(999)
  const [libraries, setLibraries] = useState<MediaLibrary[] | undefined>()
  const [librariesLoading, setLibrariesLoading] = useState<boolean>(false)
  const [librariesError, setLibrariesError] = useState<boolean>(false)

  const {
    selectedLibrary,
    selectedLibraryRef,
    applySelectedLibrary,
    shouldSkipLibrarySwitch,
  } = useLibrarySelection()
  const [searchUsed, setSearchUsed] = useState<boolean>(false)
  const lastAutoSyncKeyRef = useRef<string | undefined>(undefined)
  const bootstrapRequestedRef = useRef<boolean>(false)

  const pageDataRef = useRef<number>(0)
  const fetchingRef = useRef<boolean>(false)
  const { invalidate, guardedFetch } = useRequestGeneration()
  const SearchCtx = use(SearchContext)
  const { mediaServerType } = useMediaServerType()

  const defaultLibraryId = libraries?.[0]?.id
  const effectiveSelectedLibraryId =
    selectedLibrary &&
    libraries?.some((library) => library.id === selectedLibrary)
      ? selectedLibrary
      : defaultLibraryId
  const currentLibraryType = libraries?.find(
    (library) => library.id === effectiveSelectedLibraryId,
  )?.type
  const supportsStudioSort = supportsFeature(
    mediaServerType,
    MediaServerFeature.LIBRARY_STUDIO_SORT,
  )
  const sortConfig = useMemo(
    () => getMediaLibrarySortConfig(currentLibraryType, supportsStudioSort),
    [currentLibraryType, supportsStudioSort],
  )
  const { sortValue, sortParams, onSortChange } =
    useMediaLibrarySort(sortConfig)

  const fetchAmount = 30

  const setLoading = (val: boolean) => {
    loadingRef.current = val
    setIsLoading(val)
  }

  const setLoadingExtra = (val: boolean) => {
    loadingExtraRef.current = val
    setIsLoadingExtra(val)
  }

  const setFetching = (val: boolean) => {
    fetchingRef.current = val
  }

  const invalidateFetches = useCallback(() => {
    invalidate()
    setFetching(false)
  }, [invalidate])

  const fetchBootstrapData = useCallback(
    async (requestSortParams = sortParams) => {
      invalidateFetches()
      bootstrapRequestedRef.current = true
      setFetching(true)
      setLoading(true)
      setLoadingExtra(false)
      setLibrariesLoading(true)
      setLibrariesError(false)

      try {
        const query = new URLSearchParams({
          limit: `${fetchAmount}`,
          ...(requestSortParams ?? {}),
        })

        const result = await guardedFetch<OverviewBootstrapResult>(() =>
          GetApiHandler(`/media-server/overview/bootstrap?${query.toString()}`),
        )

        if (result.status === 'success') {
          const nextLibraries = result.data.libraries ?? []
          const nextLibraryId = result.data.selectedLibraryId
          const nextContent = {
            totalSize: result.data.content.totalSize,
            items: result.data.content.items ?? [],
          }

          setLibraries(nextLibraries)
          setLibrariesError(false)
          applySelectedLibrary(nextLibraryId)
          lastAutoSyncKeyRef.current = nextLibraryId
            ? `library:${nextLibraryId}`
            : undefined
          pageDataRef.current = nextLibraryId ? 1 : 0
          setTotalSize(nextContent.totalSize)
          totalSizeRef.current = nextContent.totalSize
          dataRef.current = nextContent.items
          setData(nextContent.items)
          setSelectedMediaIds(new Set())
          setSelectionMode(false)
        }
      } catch {
        setLibrariesError(true)
      } finally {
        setLibrariesLoading(false)
        setLoadingExtra(false)
        setLoading(false)
        setFetching(false)
      }
    },
    [
      applySelectedLibrary,
      fetchAmount,
      guardedFetch,
      invalidateFetches,
      sortParams,
    ],
  )

  const fetchData = useCallback(
    async (
      libraryId = selectedLibraryRef.current ?? effectiveSelectedLibraryId,
      requestSortParams = sortParams,
      options?: {
        replaceExisting?: boolean
        preservedPageCount?: number
      },
    ) => {
      if (
        fetchingRef.current ||
        !libraryId ||
        SearchCtx.search.text !== '' ||
        (!options?.replaceExisting &&
          !(totalSizeRef.current >= pageDataRef.current * fetchAmount))
      ) {
        return
      }

      setFetching(true)
      if (!loadingRef.current) {
        setLoadingExtra(true)
      }

      try {
        const libraryType = libraries?.find(
          (library) => library.id === libraryId,
        )?.type
        const preservedPageCount = options?.replaceExisting
          ? Math.max(1, options.preservedPageCount ?? 1)
          : undefined
        const query = buildLibraryContentQuery({
          page: options?.replaceExisting ? 1 : pageDataRef.current + 1,
          limit: preservedPageCount
            ? preservedPageCount * fetchAmount
            : fetchAmount,
          libraryType,
          sortParams: requestSortParams,
        })

        const result = await guardedFetch<{
          totalSize: number
          items: MediaItem[]
        }>(() =>
          GetApiHandler(
            `/media-server/library/${libraryId}/content?${query.toString()}`,
          ),
        )

        if (result.status === 'success') {
          const nextItems = result.data.items ?? []
          const mergedItems = options?.replaceExisting
            ? nextItems
            : [...dataRef.current, ...nextItems]

          setTotalSize(result.data.totalSize)
          totalSizeRef.current = result.data.totalSize
          pageDataRef.current = preservedPageCount ?? pageDataRef.current + 1
          dataRef.current = mergedItems
          setData(mergedItems)
          if (options?.replaceExisting) {
            // The outgoing cards stay clickable while the replacement is in
            // flight, so anything selected in that window must not survive
            // into the new item set.
            setSelectedMediaIds(new Set())
          }
          setLoadingExtra(false)
          setLoading(false)
          setFetching(false)
        }
      } catch {
        setLoadingExtra(false)
        setLoading(false)
        setFetching(false)
      }
    },
    [
      SearchCtx.search.text,
      effectiveSelectedLibraryId,
      guardedFetch,
      libraries,
      selectedLibraryRef,
      sortParams,
    ],
  )

  const performOverviewSync = useCallback(
    async (libraryId?: string, nextSortParams = sortParams) => {
      invalidateFetches()
      // Every sync replaces the visible item set (search results, a library
      // switch, a sort change, or leaving search), so a selection made against
      // the previous set must never survive into the next one.
      setSelectedMediaIds(new Set())

      if (SearchCtx.search.text !== '') {
        setLoading(true)
        setLoadingExtra(false)
        if (libraryId) {
          applySelectedLibrary(libraryId)
        }

        const searchData = async () => {
          try {
            const result = await guardedFetch<MediaItem[]>(() =>
              GetApiHandler(`/media-server/search/${SearchCtx.search.text}`),
            )

            if (result.status === 'success') {
              setSearchUsed(true)
              setTotalSize(result.data.length)
              pageDataRef.current = result.data.length * 50
              setData(sortMediaItems(result.data, nextSortParams))
              setSelectedMediaIds(new Set())
              setLoading(false)
            }
          } catch {
            setLoading(false)
          }
        }

        await searchData()
        return
      }

      const nextLibraryId =
        libraryId ?? selectedLibraryRef.current ?? effectiveSelectedLibraryId
      const hasExistingData = dataRef.current.length > 0
      const preservedPageCount =
        !searchUsed && hasExistingData ? Math.max(pageDataRef.current, 1) : 1

      setSearchUsed(false)
      pageDataRef.current = 0
      setLoading(true)
      setLoadingExtra(false)

      if (!hasExistingData) {
        setData([])
        dataRef.current = []
        setTotalSize(999)
        totalSizeRef.current = 999
      }

      if (!nextLibraryId) {
        setLoading(false)
        return
      }

      applySelectedLibrary(nextLibraryId)

      await fetchData(nextLibraryId, nextSortParams, {
        replaceExisting: true,
        preservedPageCount,
      })
    },
    [
      SearchCtx.search.text,
      applySelectedLibrary,
      fetchData,
      guardedFetch,
      invalidateFetches,
      searchUsed,
      effectiveSelectedLibraryId,
      selectedLibraryRef,
      sortParams,
    ],
  )

  const syncOverviewData = useEffectEvent((libraryId?: string) => {
    void performOverviewSync(libraryId)
  })

  const onSwitchLibrary = useCallback(
    (libraryId: string) => {
      if (SearchCtx.search.text === '' && shouldSkipLibrarySwitch(libraryId)) {
        return
      }

      void performOverviewSync(libraryId)
    },
    [SearchCtx.search.text, performOverviewSync, shouldSkipLibrarySwitch],
  )

  const handleSortChange = (nextSortValue: string) => {
    const nextSortState = onSortChange(nextSortValue)
    if (!nextSortState) {
      return
    }

    if (!effectiveSelectedLibraryId) {
      void fetchBootstrapData(nextSortState.sortParams)
      return
    }

    void performOverviewSync(
      effectiveSelectedLibraryId,
      nextSortState.sortParams,
    )
  }

  // Stable identity: MediaCard is memoized, so an inline handler would
  // re-render every loaded card on each selection click.
  const handleSelectionChange = useCallback(
    (mediaId: string, selected: boolean) => {
      setSelectedMediaIds((currentIds) => {
        const nextIds = new Set(currentIds)
        if (selected) {
          nextIds.add(mediaId)
        } else {
          nextIds.delete(mediaId)
        }
        return nextIds
      })
    },
    [],
  )

  const handleSelectionModeChange = () => {
    const nextSelectionMode = !selectionMode
    setSelectionMode(nextSelectionMode)
    if (!nextSelectionMode) {
      setSelectedMediaIds(new Set())
    }
  }

  const handleBulkExclusion = async () => {
    const response = await bulkExcludeMedia.mutateAsync([...selectedMediaIds])
    const failedIds = new Set(
      response.results
        .filter((result) => result.code !== 1)
        .map((result) => result.mediaId),
    )
    const succeededIds = new Set(
      response.results
        .filter((result) => result.code === 1)
        .map((result) => result.mediaId),
    )

    setSelectedMediaIds(failedIds)

    if (succeededIds.size > 0) {
      // The server cascades an excluded show to its seasons and episodes, so
      // visible child cards (mixed search results) must be reconciled along
      // with the exact submitted ids.
      const isCovered = (item: MediaItem) =>
        succeededIds.has(item.id) ||
        (item.parentId !== undefined && succeededIds.has(item.parentId)) ||
        (item.grandparentId !== undefined &&
          succeededIds.has(item.grandparentId))

      const nextItems = dataRef.current.map((item) =>
        isCovered(item)
          ? { ...item, maintainerrExclusionType: 'global' as const }
          : item,
      )
      dataRef.current = nextItems
      setData(nextItems)

      const invalidated = new Set(succeededIds)
      for (const item of nextItems) {
        if (isCovered(item)) {
          invalidated.add(item.id)
        }
      }
      for (const mediaId of invalidated) {
        invalidateMaintainerrStatusDetails(mediaId)
      }
    }

    const succeeded = succeededIds.size
    const failed = failedIds.size
    if (failed > 0) {
      toast.error(
        `${formatItemCount(succeeded)} excluded. ${formatItemCount(failed)} could not be excluded; the failed items stay selected.`,
      )
    } else {
      toast.success(`${formatItemCount(succeeded)} excluded.`)
    }
  }

  useEffect(() => {
    return () => {
      invalidateFetches()
      dataRef.current = []
      totalSizeRef.current = 999
      pageDataRef.current = 0
      bootstrapRequestedRef.current = false
      selectedLibraryRef.current = undefined
      setFetching(false)
    }
  }, [invalidateFetches, selectedLibraryRef])

  useEffect(() => {
    if (SearchCtx.search.text === '' && !effectiveSelectedLibraryId) {
      if (!bootstrapRequestedRef.current) {
        void fetchBootstrapData()
      }

      return
    }

    const nextLibraryId = effectiveSelectedLibraryId
    const nextSyncKey =
      SearchCtx.search.text !== ''
        ? `search:${SearchCtx.search.text}`
        : nextLibraryId
          ? `library:${nextLibraryId}`
          : undefined

    if (!nextSyncKey || lastAutoSyncKeyRef.current === nextSyncKey) {
      return
    }

    lastAutoSyncKeyRef.current = nextSyncKey
    void syncOverviewData(nextLibraryId)
  }, [SearchCtx.search.text, effectiveSelectedLibraryId, fetchBootstrapData])

  useEffect(() => {
    if (!selectedLibraryRef.current) {
      return
    }

    const isSelectedLibraryAvailable = libraries?.some(
      (library) => library.id === selectedLibraryRef.current,
    )

    if (isSelectedLibraryAvailable) {
      return
    }

    lastAutoSyncKeyRef.current = undefined
    bootstrapRequestedRef.current = false
    applySelectedLibrary(undefined)
  }, [applySelectedLibrary, libraries, selectedLibraryRef])

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    totalSizeRef.current = totalSize
  }, [totalSize])

  const hasData = data.length > 0
  const resolvedLibraryId = effectiveSelectedLibraryId
  const canRequestLibraryContent = Boolean(resolvedLibraryId)
  const hasMoreData = data.length < totalSize
  const showRefreshing = isLoading && hasData
  const selectedCount = selectedMediaIds.size
  const showBootstrapLoading =
    !searchUsed &&
    !hasData &&
    (librariesLoading ||
      isLoading ||
      (!selectedLibrary &&
        libraries === undefined &&
        (!librariesError || Boolean(defaultLibraryId))))

  return (
    <>
      <title>Overview - Maintainerr</title>
      <div className="w-full px-4">
        <PageControlRow
          controlsClassName="sm:w-auto"
          actions={
            <>
              <Button
                buttonType={selectionMode ? 'primary' : 'default'}
                className="min-w-36"
                onClick={handleSelectionModeChange}
              >
                <CheckCircleIcon className="h-4 w-4" />
                {selectionMode ? 'Done selecting' : 'Select items'}
              </Button>
              <ConfirmActionButton
                buttonLabel={
                  selectedCount > 0
                    ? `Exclude selected (${selectedCount})`
                    : 'Exclude selected'
                }
                buttonIcon={<DocumentRemoveIcon className="h-4 w-4" />}
                buttonType="danger"
                disabled={!selectionMode || selectedCount === 0}
                modalTitle="Exclude selected items"
                confirmLabel="Exclude items"
                pendingLabel="Excluding items..."
                errorMessage="The selected items could not be excluded"
                errorContext="bulk media exclusion"
                onConfirm={handleBulkExclusion}
              >
                <p>
                  Exclude the selected items globally? Selected shows are
                  excluded together with all of their seasons and episodes, and
                  any scoped exclusions for the same items are replaced.
                </p>
              </ConfirmActionButton>
            </>
          }
          controls={
            !searchUsed ? (
              <div className="ml-auto flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                <div className="w-full sm:w-[18rem]">
                  <LibrarySwitcher
                    shouldShowAllOption={false}
                    containerClassName="mb-0"
                    onLibraryChange={onSwitchLibrary}
                    selectedLibraryId={effectiveSelectedLibraryId}
                    formClassName="max-w-none"
                    libraries={libraries}
                    librariesLoading={librariesLoading}
                    librariesError={!!librariesError}
                  />
                </div>
                <div className="w-full sm:w-[18rem]">
                  <MediaLibrarySortControl
                    ariaLabel="Sort overview items"
                    options={sortConfig.options}
                    value={sortValue}
                    onSortChange={handleSortChange}
                    isLoading={showRefreshing}
                  />
                </div>
              </div>
            ) : undefined
          }
        />
        {showBootstrapLoading ? (
          <div className="min-h-80">
            <LoadingSpinner />
          </div>
        ) : selectedLibrary ? (
          <OverviewContent
            dataFinished={!canRequestLibraryContent || !hasMoreData}
            fetchData={fetchData}
            loading={isLoading}
            extrasLoading={isLoadingExtra && !isLoading && hasMoreData}
            data={data}
            libraryId={resolvedLibraryId ?? ''}
            selectionMode={selectionMode}
            selectedMediaIds={selectedMediaIds}
            onToggleSelection={handleSelectionChange}
          />
        ) : (
          <OverviewContent
            dataFinished={true}
            fetchData={fetchData}
            loading={isLoading}
            extrasLoading={false}
            data={data}
            libraryId=""
            selectionMode={selectionMode}
            selectedMediaIds={selectedMediaIds}
            onToggleSelection={handleSelectionChange}
          />
        )}
      </div>
    </>
  )
}
export default Overview
