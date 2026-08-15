import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import type { MediaItemType } from '@maintainerr/contracts'
import { useEffect, useMemo, useState } from 'react'
import { ICollection } from '..'
import { useLibraryDisplay } from '../../../hooks/useLibraryDisplay'
import GetApiHandler from '../../../utils/ApiHandler'
import { formatSizeCompact } from '../../../utils/formatBytes'
import {
  buildMetadataPath,
  isAbsoluteUrl,
  toProviderIds,
} from '../../../utils/mediaTypeUtils'

// Contracts' MediaItemTypeLabels builds these by appending 's', which cannot
// be translated; the display copy lives here as descriptors instead.
const mediaTypeCountLabels: Record<MediaItemType, MessageDescriptor> = {
  movie: msg`Movies`,
  show: msg`Shows`,
  season: msg`Seasons`,
  episode: msg`Episodes`,
}

interface ICollectionItem {
  collection: ICollection
  onClick?: (collection: ICollection) => void
}

const CollectionItem = (props: ICollectionItem) => {
  const { t } = useLingui()
  const { title: resolvedLibraryTitle, isUnreachable: libraryUnreachable } =
    useLibraryDisplay(props.collection.libraryId)
  const libraryTitle =
    resolvedLibraryTitle ?? (libraryUnreachable ? t`Unavailable` : '-')
  const days = props.collection.deleteAfterDays
  // The day unit is formatted in code so no translation can drop or change it.
  const dayCount = days == null ? null : `${days}d`
  const deleteAfterLabel =
    dayCount == null ? t`Never` : t`After ${{ dayCount }}`
  const mediaCount =
    props.collection.mediaCount ?? props.collection.media?.length ?? 0
  const previewMedia = useMemo(
    () => props.collection.media?.slice(0, 2) ?? [],
    [props.collection.media],
  )
  const [previewImages, setPreviewImages] = useState<(string | null)[]>([])
  const resolvedPreviewImages = previewImages.filter((image): image is string =>
    Boolean(image),
  )

  useEffect(() => {
    let isActive = true

    void Promise.all(
      previewMedia.map(async (media) => {
        try {
          if (isAbsoluteUrl(media.image_path)) {
            return media.image_path
          }

          // Pass 'season' for TV collections so the backend can resolve
          // parent show IDs when the preview item's own IDs differ.
          const imageRequestPath = buildMetadataPath(
            'image',
            props.collection.type === 'movie' ? 'movie' : 'season',
            toProviderIds({
              tmdbId: media.tmdbId,
              tvdbId: media.tvdbId,
            }),
            media.mediaServerId,
          )

          if (!imageRequestPath) {
            return null
          }

          const response = await GetApiHandler<{ url: string } | undefined>(
            imageRequestPath,
          )

          return response?.url ?? null
        } catch {
          return null
        }
      }),
    ).then((images) => {
      if (isActive) {
        setPreviewImages(images)
      }
    })

    return () => {
      isActive = false
    }
  }, [previewMedia, props.collection.type])

  return (
    <a
      className="hover:cursor-pointer"
      {...(props.onClick
        ? { onClick: () => props.onClick!(props.collection) }
        : {})}
    >
      {resolvedPreviewImages.length > 1 ? (
        <div className="absolute inset-0 z-[-100] flex flex-row overflow-hidden">
          {resolvedPreviewImages[0] ? (
            <img
              className="backdrop-image"
              width="600"
              height="800"
              src={resolvedPreviewImages[0]}
              alt="Collection preview"
              loading="lazy"
              decoding="async"
            />
          ) : undefined}
          {resolvedPreviewImages[1] ? (
            <img
              className="backdrop-image"
              width="600"
              height="800"
              src={resolvedPreviewImages[1]}
              alt="Collection preview"
              loading="lazy"
              decoding="async"
            />
          ) : undefined}
          <div className="collection-backdrop"></div>
        </div>
      ) : resolvedPreviewImages[0] ? (
        <div className="absolute inset-0 z-[-100] overflow-hidden">
          <img
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: 0.08 }}
            width="1200"
            height="800"
            src={resolvedPreviewImages[0]}
            alt="Collection preview"
            loading="lazy"
            decoding="async"
          />
          <div className="collection-backdrop"></div>
        </div>
      ) : undefined}
      <div className="inset-0 z-0 h-fit p-3">
        <div className="overflow-hidden text-base font-bold text-ellipsis whitespace-nowrap text-white sm:text-lg">
          <div>
            {props.collection.manualCollection
              ? t`${{ collectionName: props.collection.manualCollectionName }} (custom)`
              : props.collection.title}
          </div>
        </div>
        <div className="tiny-scrollbar mt-1 mb-2 h-12 max-h-12 overflow-y-hidden pr-2 text-base whitespace-normal text-zinc-400 hover:overflow-y-auto">
          {props.collection.manualCollection
            ? // '' is the ICU escape for a literal apostrophe; a single one
              // would quote the placeholder braces and print them verbatim.
              t`Handled by rule: ''${{ ruleName: props.collection.title }}''`
            : props.collection.description}
        </div>
      </div>

      <div className="inset-0 z-0 mt-2 px-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] sm:gap-y-2 [&>div:nth-child(2n)]:text-right sm:[&>div:nth-child(2n)]:text-left sm:[&>div:nth-child(3n)]:text-right sm:[&>div:nth-child(3n-1)]:text-center">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              <Trans>Library</Trans>
            </p>
            <p
              className={
                libraryUnreachable
                  ? 'truncate text-warning-500'
                  : 'truncate text-maintainerr'
              }
              title={
                libraryUnreachable
                  ? t`Media server is unreachable. The stored library selection is preserved.`
                  : libraryTitle
              }
            >
              {libraryTitle}
            </p>
          </div>

          {props.collection.type !== 'movie' ? (
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                <Trans>Media Type</Trans>
              </p>
              <p className="text-maintainerr">
                {t(mediaTypeCountLabels[props.collection.type])}
              </p>
            </div>
          ) : (
            <div
              aria-hidden="true"
              className="pointer-events-none min-w-0 opacity-0 select-none"
            >
              <p className="text-xs font-semibold tracking-wide uppercase">
                <Trans>Media Type</Trans>
              </p>
              <p>-</p>
            </div>
          )}

          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              <Trans>Items</Trans>
            </p>
            <p className="text-maintainerr">{`${mediaCount}`}</p>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              <Trans>Size</Trans>
            </p>
            <p className="text-maintainerr">
              {formatSizeCompact(props.collection.totalSizeBytes)}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              <Trans>Delete</Trans>
            </p>
            <p
              className="truncate whitespace-nowrap text-maintainerr"
              title={deleteAfterLabel}
            >
              {deleteAfterLabel}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              <Trans>Status</Trans>
            </p>
            <p>
              {props.collection.isActive ? (
                <span className="text-success-500">
                  <Trans>Active</Trans>
                </span>
              ) : (
                <span className="text-error-500">
                  <Trans>Inactive</Trans>
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    </a>
  )
}

export default CollectionItem
