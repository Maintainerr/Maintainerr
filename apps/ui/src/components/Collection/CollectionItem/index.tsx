import { ICollection } from '..'
import { useMediaServerLibraries } from '../../../api/media-server'

interface ICollectionItem {
  collection: ICollection
  onClick?: (collection: ICollection) => void
}

function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return 'N/A'
  const gb = bytes / 1073741824
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / 1048576
  if (mb >= 1) return `${mb.toFixed(0)} MB`
  return '< 1 MB'
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

        <div className="inset-0 z-0 h-fit p-3 pt-1 text-base">
          <div className="mb-3">
            <p className="font-bold">Library</p>
            <p className="text-amber-500">
              {libraries?.find(
                (lib) => String(lib.id) === String(props.collection.libraryId),
              )?.title ?? <>&nbsp;</>}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-y-3">
            <div>
              <p className="font-bold">Items</p>
              <p className="text-amber-500">
                {`${props.collection.media ? props.collection.media.length : 0}`}
              </p>
            </div>

            <div className="text-right">
              <p className="font-bold">Status</p>
              <p>
                {props.collection.isActive ? (
                  <span className="text-green-500">Active</span>
                ) : (
                  <span className="text-red-500">Inactive</span>
                )}
              </p>
            </div>

            <div>
              <p className="font-bold">Size</p>
              <p className="text-amber-500">
                {formatSize(props.collection.totalSizeBytes)}
              </p>
            </div>

            <div className="text-right">
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
