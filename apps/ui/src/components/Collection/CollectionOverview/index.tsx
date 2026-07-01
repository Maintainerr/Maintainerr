import { ICollection } from '..'
import { useMediaServerLibraries } from '../../../api/media-server'
import { useI18n } from '../../../contexts/i18n-context'
import { useTaskStatusContext } from '../../../contexts/taskstatus-context'
import ExecuteButton from '../../Common/ExecuteButton'
import LibrarySwitcher from '../../Common/LibrarySwitcher'
import LoadingSpinner, {
  SmallLoadingSpinner,
} from '../../Common/LoadingSpinner'
import PageControlRow from '../../Common/PageControlRow'
import CollectionItem from '../CollectionItem'

interface ICollectionOverview {
  collections: ICollection[] | undefined
  onSwitchLibrary: (id: string) => void
  selectedLibraryId?: string
  isLoading: boolean
  doActions: () => void
  openDetail: (collection: ICollection) => void
}

const CollectionOverview = (props: ICollectionOverview) => {
  const { t } = useI18n()
  const { collectionHandlerRunning } = useTaskStatusContext()
  const {
    data: libraries,
    error: librariesError,
    isLoading: librariesLoading,
  } = useMediaServerLibraries()
  const collectionCount = props.collections?.length ?? 0
  const hasCollections = collectionCount > 0
  const showInitialLoading = props.isLoading && !hasCollections
  const showRefreshing = props.isLoading && hasCollections

  return (
    <div className="w-full px-4">
      <PageControlRow
        actions={
          <ExecuteButton
            onClick={props.doActions}
            text={t('pages.collections.handle')}
            executing={collectionHandlerRunning}
            disabled={collectionHandlerRunning}
            title={t('pages.collections.handleTitle')}
          />
        }
        controls={
          <LibrarySwitcher
            containerClassName="mb-0"
            formClassName="max-w-none"
            onLibraryChange={props.onSwitchLibrary}
            selectedLibraryId={props.selectedLibraryId}
            libraries={libraries}
            librariesLoading={librariesLoading}
            librariesError={!!librariesError}
          />
        }
      />

      <div className="w-full">
        <div className="m-auto mb-3 flex items-center justify-between gap-3">
          <h1 className="m-auto text-lg font-bold text-zinc-200 sm:m-0 xl:m-0">
            {t('pages.collections.heading')}
          </h1>
          <div className="flex min-h-6 min-w-6 items-center justify-end">
            {showRefreshing ? (
              <SmallLoadingSpinner className="h-6 w-6" />
            ) : undefined}
          </div>
        </div>
        {showInitialLoading ? (
          <div className="min-h-80">
            <LoadingSpinner />
          </div>
        ) : hasCollections ? (
          <ul
            aria-busy={props.isLoading}
            className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]"
          >
            {props.collections?.map((col, index) => (
              <li
                key={col.id ?? index}
                className="collection relative flex h-fit transform-gpu flex-col overflow-hidden rounded-xl bg-zinc-800 bg-cover bg-center p-4 text-zinc-400 shadow-sm ring-1 ring-zinc-700"
              >
                <CollectionItem
                  collection={col}
                  onClick={() => props.openDetail(col)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-6 text-sm text-zinc-400">
            {t('pages.collections.empty')}
          </div>
        )}
      </div>
    </div>
  )
}
export default CollectionOverview
