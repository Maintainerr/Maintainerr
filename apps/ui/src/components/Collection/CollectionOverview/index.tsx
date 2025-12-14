import { ICollection } from '..'
import { useTaskStatusContext } from '../../../contexts/taskstatus-context'
import ExecuteButton from '../../Common/ExecuteButton'
import LibrarySwitcher from '../../Common/LibrarySwitcher'
import CollectionItem from '../CollectionItem'

interface ICollectionOverview {
  collections: ICollection[] | undefined
  onSwitchLibrary: (id: number) => void
  doActions: () => void
  openDetail: (collection: ICollection) => void
}

const CollectionOverview = (props: ICollectionOverview) => {
  const { collectionHandlerRunning } = useTaskStatusContext()

  return (
    <div>
      <LibrarySwitcher onLibraryChange={props.onSwitchLibrary} />

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
        <ul className="xs:grid xs:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] xs:gap-4">
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
      </div>
    </div>
  )
}
export default CollectionOverview
