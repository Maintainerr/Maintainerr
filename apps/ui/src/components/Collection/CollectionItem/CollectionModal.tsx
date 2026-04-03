import { MediaItemTypeLabels } from '@maintainerr/contracts'
import type { ReactNode } from 'react'
import Button from '../../Common/Button'
import PosterImage from '../../Common/Poster/PosterImage'
import PosterModal from '../../Common/Poster/PosterModal'
import type { ICollection } from '..'
import { toProviderIds } from '../../../utils/mediaTypeUtils'

interface CollectionModalProps {
  collection: ICollection
  libraryTitle: string
  onClose: () => void
  onOpenDetail?: (collection: ICollection) => void
}

export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return 'N/A'
  const gb = bytes / 1073741824
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / 1048576
  if (mb >= 1) return `${mb.toFixed(0)} MB`
  return '< 1 MB'
}

type CollectionSummaryLayout = 'card' | 'modal'

interface CollectionSummaryGridProps {
  collection: ICollection
  libraryTitle: string
  layout: CollectionSummaryLayout
}

interface CollectionSummaryItem {
  label: string
  value?: ReactNode
  title?: string
  itemClassName?: string
  valueClassName?: string
  placeholder?: boolean
}

const getCollectionSummaryItems = (
  collection: ICollection,
  libraryTitle: string,
  layout: CollectionSummaryLayout,
): CollectionSummaryItem[] => {
  const deleteAfterLabel =
    collection.deleteAfterDays == null
      ? 'Never'
      : `After ${collection.deleteAfterDays}d`
  const mediaCount = collection.mediaCount ?? collection.media?.length ?? 0
  const isCard = layout === 'card'
  const amberValueClassName = isCard ? 'text-amber-500' : 'mt-1 text-amber-500'

  return [
    {
      label: 'Library',
      value: libraryTitle,
      title: libraryTitle,
      itemClassName: isCard ? 'min-w-0' : undefined,
      valueClassName: isCard ? 'truncate text-amber-500' : amberValueClassName,
    },
    {
      label: 'Media Type',
      value: MediaItemTypeLabels[collection.type],
      itemClassName: isCard ? 'min-w-0' : undefined,
      valueClassName: amberValueClassName,
      placeholder: isCard && collection.type === 'movie',
    },
    {
      label: 'Items',
      value: `${mediaCount}`,
      itemClassName: isCard ? 'min-w-0' : undefined,
      valueClassName: amberValueClassName,
    },
    {
      label: 'Size',
      value: formatSize(collection.totalSizeBytes),
      itemClassName: isCard ? 'min-w-0' : undefined,
      valueClassName: amberValueClassName,
    },
    {
      label: 'Delete',
      value: deleteAfterLabel,
      title: deleteAfterLabel,
      itemClassName: isCard ? 'min-w-0' : undefined,
      valueClassName: isCard
        ? 'truncate whitespace-nowrap text-amber-500'
        : amberValueClassName,
    },
    {
      label: 'Status',
      value: collection.isActive ? (
        <span className="text-success-500">Active</span>
      ) : (
        <span className="text-error-500">Inactive</span>
      ),
      itemClassName: isCard ? 'min-w-0' : undefined,
      valueClassName: isCard ? undefined : 'mt-1',
    },
  ]
}

export const CollectionSummaryGrid = ({
  collection,
  libraryTitle,
  layout,
}: CollectionSummaryGridProps) => {
  const isCard = layout === 'card'

  return (
    <div
      className={
        isCard
          ? 'grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] sm:gap-y-2 [&>div:nth-child(2n)]:text-right sm:[&>div:nth-child(2n)]:text-left sm:[&>div:nth-child(3n)]:text-right sm:[&>div:nth-child(3n-1)]:text-center'
          : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
      }
    >
      {getCollectionSummaryItems(collection, libraryTitle, layout).map(
        ({
          label,
          value,
          title,
          itemClassName,
          valueClassName,
          placeholder,
        }) =>
          placeholder ? (
            <div
              key={label}
              aria-hidden="true"
              className="pointer-events-none min-w-0 select-none opacity-0"
            >
              <p className="text-xs font-semibold uppercase tracking-wide">
                {label}
              </p>
              <p>-</p>
            </div>
          ) : (
            <div key={label} className={itemClassName}>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {label}
              </p>
              <p className={valueClassName} {...(title ? { title } : {})}>
                {value}
              </p>
            </div>
          ),
      )}
    </div>
  )
}

const CollectionModal = ({
  collection,
  libraryTitle,
  onClose,
  onOpenDetail,
}: CollectionModalProps) => {
  const previewMedia = collection.media?.[0]

  return (
    <PosterImage
      imagePath={previewMedia?.image_path}
      mediaType={collection.type}
      providerIds={toProviderIds({
        tmdbId: previewMedia?.tmdbId,
        tvdbId: previewMedia?.tvdbId,
      })}
    >
      {(image) => (
        <PosterModal onClose={onClose}>
          <div className="relative h-72 w-full overflow-hidden p-2 xl:h-96">
            <div
              className="h-full w-full rounded-xl bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: image
                  ? `url(${image})`
                  : 'linear-gradient(to bottom, #1e293b, #1e293b)',
              }}
            />
            <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-zinc-900/25 to-zinc-900/85" />
            <div className="absolute left-0 top-0 z-10 flex h-full w-full flex-col justify-end gap-3 p-6">
              <div className="max-w-fit rounded-lg bg-black/60 px-3 py-2 text-xs font-medium uppercase text-zinc-200">
                {collection.type === 'movie'
                  ? 'Collection'
                  : `${MediaItemTypeLabels[collection.type]} Collection`}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white xl:text-3xl">
                  {collection.manualCollection
                    ? `${collection.manualCollectionName} (manual)`
                    : collection.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-zinc-200 xl:text-base">
                  {collection.manualCollection
                    ? `Handled by rule: '${collection.title}'`
                    : (collection.description ?? 'No description available.')}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-6 text-zinc-200">
            <CollectionSummaryGrid
              collection={collection}
              libraryTitle={libraryTitle}
              layout="modal"
            />

            <div className="flex flex-wrap justify-end gap-3">
              <Button buttonType="default" onClick={onClose}>
                Close
              </Button>
              {onOpenDetail ? (
                <Button
                  buttonType="primary"
                  onClick={() => {
                    onClose()
                    onOpenDetail(collection)
                  }}
                >
                  Open Collection
                </Button>
              ) : undefined}
            </div>
          </div>
        </PosterModal>
      )}
    </PosterImage>
  )
}

export default CollectionModal
