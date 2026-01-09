import { ICollection } from '..'
import { useMediaServerLibraries } from '../../../api/media-server'

interface ICollectionItem {
  collection: ICollection
  onClick?: (collection: ICollection) => void
}

const CollectionItem = (props: ICollectionItem) => {
  const { data: libraries } = useMediaServerLibraries()

  return (
    <>
      <a
        className="hover:cursor-pointer"
        {...(props.onClick
          ? { onClick: () => props.onClick!(props.collection) }
          : {})}
      >
        {props.collection.media && props.collection.media.length > 1 ? (
          <div className="absolute inset-0 z-[-100] flex flex-row overflow-hidden">
            <img
              className="backdrop-image"
              width="600"
              height="800"
              src={`https://image.tmdb.org/t/p/w500${props.collection.media[0].image_path}`}
              alt="img"
            />
            <img
              className="backdrop-image"
              width="600"
              height="800"
              src={`https://image.tmdb.org/t/p/w500/${props.collection.media[1].image_path}`}
              alt="img"
            />
            <div className="collection-backdrop"></div>
          </div>
        ) : undefined}
        <div className="inset-0 z-0 h-fit p-3">
          <div className="overflow-hidden overflow-ellipsis whitespace-nowrap text-base font-bold text-white sm:text-lg">
            <div>
              {props.collection.manualCollection
                ? `${props.collection.manualCollectionName} (manual)`
                : props.collection.title}
            </div>
          </div>
          <div className="h-12 max-h-12 overflow-y-hidden whitespace-normal text-base text-zinc-400 hover:overflow-y-scroll">
            {props.collection.manualCollection
              ? `Handled by rule: '${props.collection.title}'`
              : props.collection.description}
          </div>
        </div>

        <div className="inset-0 z-0 flex h-fit flex-row p-3 text-base sm:flex-row">
          <div className="mr-5 flex flex-row sm:mr-0 sm:mt-auto sm:flex-col">
            <div className="mb-5 mr-5 sm:mr-0">
              <p className="font-bold">Library</p>
              <p className="text-amber-500">
                {libraries?.find(
                  (lib) =>
                    String(lib.id) === String(props.collection.libraryId),
                )?.title ?? <>&nbsp;</>}
              </p>
            </div>

            <div className="mr-5 sm:mr-0">
              <p className="font-bold">Items</p>
              <p className="text-amber-500">
                {' '}
                {`${
                  props.collection.media ? props.collection.media.length : 0
                }`}
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-row text-right sm:mt-auto sm:flex-col">
            <div className="mb-5 mr-5 sm:mr-0">
              <p className="font-bold">Status</p>
              <p>
                {props.collection.isActive ? (
                  <span className="text-green-500">Active</span>
                ) : (
                  <span className="text-red-500">Inactive</span>
                )}
              </p>
            </div>

            <div className="mr-0 sm:mr-0">
              <p className="font-bold">Delete</p>
              <p className="text-amber-500">
                {props.collection.deleteAfterDays == null
                  ? 'Never'
                  : `After ${props.collection.deleteAfterDays} days`}
              </p>
            </div>
          </div>
        </div>
      </a>
    </>
  )
}
export default CollectionItem
