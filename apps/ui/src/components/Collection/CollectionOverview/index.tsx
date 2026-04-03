import { ICollection } from '..'
import { useMediaServerLibraries } from '../../../api/media-server'
import { useTaskStatusContext } from '../../../contexts/taskstatus-context'
import ExecuteButton from '../../Common/ExecuteButton'
import LibrarySwitcher from '../../Common/LibrarySwitcher'
import LoadingSpinner from '../../Common/LoadingSpinner'
import CollectionItem from '../CollectionItem'

interface ICollectionOverview {
  collections: ICollection[] | undefined
  onSwitchLibrary: (id: string) => void
  selectedLibraryId: string
  isLoading: boolean
  doActions: () => void
  openDetail: (collection: ICollection) => void
}

const CollectionOverview = (props: ICollectionOverview) => {
  const { collectionHandlerRunning } = useTaskStatusContext()
  const {
    data: libraries,
    error: librariesError,
    isLoading: librariesLoading,
  } = useMediaServerLibraries()

  return (
    <div>
      <LibrarySwitcher
        onLibraryChange={props.onSwitchLibrary}
        selectedLibraryId={props.selectedLibraryId}
        libraries={libraries}
        librariesLoading={librariesLoading}
        librariesError={!!librariesError}
      />

      <div className="m-auto mb-3 flex">
        <div className="m-auto sm:m-0">
          <ExecuteButton
            onClick={props.doActions}
            text="Handle Collections"
            executing={collectionHandlerRunning}
            disabled={collectionHandlerRunning}
          />
        </div>
      </div>

      <div className="w-full">
        <div className="m-auto mb-3 flex">
          <h1 className="m-auto text-lg font-bold text-zinc-200 sm:m-0 xl:m-0">
            {'Automatic collections'}
          </h1>
        </div>
        {props.isLoading ? (
          <LoadingSpinner />
        ) : (
          <ul className="xs:grid xs:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] xs:gap-4">
            {props.collections?.map((col) => (
              <li
                key={+col.id!}
                className="collection relative mb-5 flex h-fit transform-gpu flex-col overflow-hidden rounded-xl bg-zinc-800 bg-cover bg-center p-4 text-zinc-400 shadow ring-1 ring-zinc-700 xs:w-full sm:mb-0 sm:mr-5"
              >
                <CollectionItem
                  key={col.id}
                  collection={col}
                  onClick={() => props.openDetail(col)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
export default CollectionOverview
