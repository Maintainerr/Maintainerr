import { MediaItemTypeLabels } from '@maintainerr/contracts'
import { ICollection } from '..'
import { useMediaServerLibraries } from '../../../api/media-server'
import { toProviderIds } from '../../../utils/mediaTypeUtils'
import PosterCard from '../../Common/Poster/PosterCard'

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
  const libraryTitle =
    libraries?.find(
      (lib) => String(lib.id) === String(props.collection.libraryId),
    )?.title ?? '-'
  const deleteAfterLabel =
    props.collection.deleteAfterDays == null
      ? 'Never'
      : `After ${props.collection.deleteAfterDays}d`
  const mediaCount =
    props.collection.mediaCount ?? props.collection.media?.length ?? 0
  const previewMedia = props.collection.media?.[0]

  return (
    <PosterCard
      imagePath={previewMedia?.image_path}
      mediaType={props.collection.type}
      providerIds={toProviderIds({
        tmdbId: previewMedia?.tmdbId,
        tvdbId: previewMedia?.tvdbId,
      })}
      className="relative transform-gpu cursor-pointer overflow-hidden rounded-xl bg-zinc-800 bg-cover pb-[150%] outline-none ring-1 transition duration-300"
      imageClassName="backdrop-image"
      onClick={() => props.onClick?.(props.collection)}
    >
      {(previewImage) => (
        <>
          {previewImage ? (
            <div className="absolute inset-0 z-[-100] overflow-hidden">
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
            <div className="tiny-scrollbar mb-2 mt-1 h-12 max-h-12 overflow-y-hidden whitespace-normal pr-2 text-base text-zinc-400 hover:overflow-y-auto">
              {props.collection.manualCollection
                ? `Handled by rule: '${props.collection.title}'`
                : props.collection.description}
            </div>
          </div>

          <div className="inset-0 z-0 mt-2 px-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] sm:gap-y-2 [&>div:nth-child(2n)]:text-right sm:[&>div:nth-child(2n)]:text-left sm:[&>div:nth-child(3n)]:text-right sm:[&>div:nth-child(3n-1)]:text-center">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Library
                </p>
                <p className="truncate text-amber-500" title={libraryTitle}>
                  {libraryTitle}
                </p>
              </div>

              {props.collection.type !== 'movie' ? (
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Media Type
                  </p>
                  <p className="text-amber-500">
                    {MediaItemTypeLabels[props.collection.type]}
                  </p>
                </div>
              ) : (
                <div
                  aria-hidden="true"
                  className="pointer-events-none min-w-0 select-none opacity-0"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    Media Type
                  </p>
                  <p>-</p>
                </div>
              )}

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Items
                </p>
                <p className="text-amber-500">{`${mediaCount}`}</p>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Size
                </p>
                <p className="text-amber-500">
                  {formatSize(props.collection.totalSizeBytes)}
                </p>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Delete
                </p>
                <p
                  className="truncate whitespace-nowrap text-amber-500"
                  title={deleteAfterLabel}
                >
                  {deleteAfterLabel}
                </p>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Status
                </p>
                <p>
                  {props.collection.isActive ? (
                    <span className="text-success-500">Active</span>
                  ) : (
                    <span className="text-error-500">Inactive</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </PosterCard>
  )
}

export default CollectionItem
