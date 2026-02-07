import { ICollection } from '..'
import { usePlexLibraries } from '../../../api/plex'
import { EPlexDataType } from '../../../utils/PlexDataType-enum'

interface ICollectionItem {
  collection: ICollection
  onClick?: (collection: ICollection) => void
}

const CollectionItem = (props: ICollectionItem) => {
  const { data: plexLibraries } = usePlexLibraries()
  const displayName = props.collection.ruleName ?? props.collection.title
  const totalCollectionSize =
    props.collection.media?.reduce(
      (sum, media) => sum + (media.size && media.size > 0 ? media.size : 0),
      0,
    ) ?? 0

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    )
    const value = bytes / Math.pow(1024, index)
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(2)} ${units[index]}`
  }

  const getMediaTypeLabel = (type: EPlexDataType) => {
    switch (type) {
      case EPlexDataType.MOVIES:
        return 'Movies'
      case EPlexDataType.SHOWS:
        return 'Shows'
      case EPlexDataType.SEASONS:
        return 'Seasons'
      case EPlexDataType.EPISODES:
        return 'Episodes'
      default:
        return 'Unknown'
    }
  }

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
                : displayName}
            </div>
          </div>
          <div className="mt-1 h-12 max-h-12 overflow-y-hidden whitespace-normal text-base text-zinc-400 hover:overflow-y-scroll">
            {props.collection.manualCollection
              ? `Handled by rule: '${displayName}'`
              : props.collection.description}
          </div>
        </div>

        <div className="inset-0 z-0 p-3 pt-1 text-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-md bg-zinc-900/70 p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Library
              </p>
              <p className="truncate text-amber-500">
                {plexLibraries?.find(
                  (el) => +el.key === +props.collection.libraryId,
                )?.title ?? '-'}
              </p>
            </div>

            {props.collection.type !== EPlexDataType.MOVIES ? (
              <div className="rounded-md bg-zinc-900/70 p-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Media Type
                </p>
                <p className="text-amber-500">
                  {getMediaTypeLabel(props.collection.type)}
                </p>
              </div>
            ) : (
              <div
                aria-hidden="true"
                className="pointer-events-none rounded-md bg-zinc-900/70 p-2 opacity-0 select-none"
              >
                <p className="text-xs font-semibold uppercase tracking-wide">
                  Media Type
                </p>
                <p>-</p>
              </div>
            )}

            <div className="rounded-md bg-zinc-900/70 p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Items
              </p>
              <p className="text-amber-500">
                {props.collection.media ? props.collection.media.length : 0}
              </p>
            </div>

            <div className="rounded-md bg-zinc-900/70 p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Size
              </p>
              <p className="text-amber-500">{formatBytes(totalCollectionSize)}</p>
            </div>

            <div className="rounded-md bg-zinc-900/70 p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Delete
              </p>
              <p className="text-amber-500">
                {props.collection.deleteAfterDays == null
                  ? 'Never'
                  : `After ${props.collection.deleteAfterDays}d`}
              </p>
            </div>

            <div className="rounded-md bg-zinc-900/70 p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Status
              </p>
              <p>
                {props.collection.isActive ? (
                  <span className="text-green-500">Active</span>
                ) : (
                  <span className="text-red-500">Inactive</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </a>
    </>
  )
}
export default CollectionItem
