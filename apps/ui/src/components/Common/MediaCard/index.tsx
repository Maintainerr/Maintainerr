import { Transition } from '@headlessui/react'
import { MediaItemType, type MediaProviderIds } from '@maintainerr/contracts'
import React, { memo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mediaTypeLabel } from '../../../utils/mediaTypeUtils'
import type { ICollection } from '../../Collection'
import RemoveFromCollectionButton from '../../Collection/CollectionDetail/RemoveFromCollectionButton'
import PosterCard from '../Poster/PosterCard'
import MediaModalContent from './MediaModal'

const mediaBadgeClasses = {
  movie: 'bg-zinc-900',
  show: 'bg-maintainerrdark',
  season: 'bg-yellow-700',
  episode: 'bg-rose-900',
  info: 'bg-maintainerrdark',
  accent: 'bg-maintainerr',
  success: 'bg-emerald-700',
} as const

const renderBadge = (
  label: React.ReactNode,
  tone: keyof typeof mediaBadgeClasses | 'danger',
  className?: string,
) => (
  <div className={className}>
    <div
      className={`pointer-events-none z-40 min-w-0 rounded-full shadow-sm ${tone === 'danger' ? 'bg-error-700' : mediaBadgeClasses[tone]}`}
    >
      <div className="flex h-4 min-w-0 items-center px-2 py-2 text-center text-xs font-medium tracking-wider text-zinc-200 uppercase sm:h-5">
        {label}
      </div>
    </div>
  </div>
)

interface IMediaCard {
  id: number | string
  summary?: string
  year?: string
  mediaType: MediaItemType
  title: string
  seasonNumber?: number
  episodeNumber?: number
  episodeTitle?: string
  providerIds?: MediaProviderIds
  collectionPage: boolean
  daysLeft?: number
  exclusionId?: number
  exclusionType?: 'global' | 'specific' | undefined
  collectionId?: number
  collection?: ICollection
  collections?: string[]
  isManual?: boolean
  onRemove?: (id: string) => void
  onItemPostponed?: (id: string, addDate: string) => void
  selectionMode?: boolean
  selected?: boolean
  onToggleSelection?: (mediaId: string, selected: boolean) => void
  forceStatusLoad?: boolean
}

const MediaCard: React.FC<IMediaCard> = ({
  id,
  summary,
  year,
  mediaType,
  title,
  seasonNumber,
  episodeNumber,
  episodeTitle,
  collectionId = 0,
  daysLeft = 9999,
  exclusionId = undefined,
  providerIds = undefined,
  collectionPage = false,
  exclusionType = undefined,
  collection = undefined,
  collections,
  isManual = false,
  onRemove = () => {},
  onItemPostponed,
  selectionMode = false,
  selected = false,
  onToggleSelection,
  forceStatusLoad = false,
}) => {
  const navigate = useNavigate()
  const [showDetail, setShowDetail] = useState(false)
  const [showMediaModal, setShowMediaModal] = useState(false)
  const displayYear = year && mediaType !== 'episode' ? year.slice(0, 4) : year

  const handleStatusLink = (targetPath: string) => {
    if (!targetPath) {
      return
    }

    setShowMediaModal(false)
    navigate(targetPath)
  }

  return (
    <div className={'w-full'}>
      <PosterCard
        mediaType={mediaType}
        providerIds={providerIds}
        itemId={id}
        className={`media-card relative transform-gpu cursor-pointer overflow-hidden rounded-xl bg-zinc-800 bg-cover pb-[150%] outline-hidden transition duration-300 ${selectionMode && selected ? 'ring-4 ring-maintainerr-600' : 'ring-1'} ${showDetail ? 'show-detail' : ''}`}
        onMouseEnter={() => setShowDetail(true)}
        onMouseLeave={() => setShowDetail(false)}
        onClick={() => {
          if (selectionMode) {
            onToggleSelection?.(id.toString(), !selected)
            return
          }

          if (showDetail) {
            setShowMediaModal(true)
          } else {
            setShowDetail(true)
          }
        }}
        onKeyDown={(event) => {
          if (selectionMode && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            onToggleSelection?.(id.toString(), !selected)
          }
        }}
        role={selectionMode ? 'button' : 'link'}
        aria-pressed={selectionMode ? selected : undefined}
        aria-label={selectionMode ? `Select ${title}` : undefined}
        tabIndex={0}
      >
        {(image) => (
          <>
            <div className="absolute right-0 left-0 flex items-center justify-between p-2">
              {renderBadge(
                mediaTypeLabel(mediaType, { seasonNumber, episodeNumber }),
                mediaType,
              )}
              {!collectionPage && exclusionType === 'global'
                ? renderBadge('EXCL', mediaType)
                : undefined}
            </div>

            {collectionPage && isManual && !showDetail
              ? renderBadge(
                  'MANUAL',
                  mediaType,
                  'absolute bottom-0 left-1/2 flex -translate-x-1/2 transform items-center justify-between p-2',
                )
              : undefined}

            {!collectionPage && collections?.length && !showDetail
              ? renderBadge(
                  <span className="truncate" title={collections.join(', ')}>
                    {collections.length > 1
                      ? `${collections[0]} +${collections.length - 1}`
                      : collections[0]}
                  </span>,
                  'accent',
                  'absolute inset-x-0 bottom-0 flex justify-center p-2',
                )
              : undefined}

            {collectionPage && !exclusionType && daysLeft !== 9999
              ? renderBadge(
                  daysLeft,
                  daysLeft < 0 ? 'danger' : mediaType,
                  'absolute right-0 p-2',
                )
              : undefined}

            {collectionPage && exclusionType === 'global'
              ? renderBadge(
                  exclusionType.toUpperCase(),
                  mediaType,
                  'absolute right-0 p-2',
                )
              : undefined}

            <Transition
              as="div"
              show={!image || showDetail}
              className={`absolute inset-0 transform overflow-hidden rounded-xl transition ${selectionMode ? 'cursor-pointer' : 'cursor-alias'}`}
              enter="opacity-0"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="opacity-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div
                className="absolute inset-0 h-full w-full overflow-hidden text-left"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(45, 55, 72, 0.4) 0%, rgba(45, 55, 72, 0.9) 100%)',
                }}
              >
                <div className="flex h-full w-full items-end">
                  <div className={`w-full px-2 pb-1 text-zinc-200`}>
                    {displayYear && (
                      <div className="text-sm font-medium text-shadow-sm">
                        {displayYear}
                      </div>
                    )}

                    <h1
                      className="w-full text-sm leading-tight font-bold whitespace-normal text-shadow-sm"
                      style={{
                        WebkitLineClamp: 3,
                        display: '-webkit-box',
                        overflow: 'hidden',
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word',
                      }}
                    >
                      {title}
                    </h1>
                    {mediaType == 'episode' && episodeTitle && (
                      <div
                        className="text-xs whitespace-normal text-shadow-sm"
                        style={{
                          WebkitLineClamp: 5,
                          display: '-webkit-box',
                          overflow: 'hidden',
                          WebkitBoxOrient: 'vertical',
                          wordBreak: 'break-word',
                        }}
                      >
                        {episodeTitle}
                      </div>
                    )}

                    {/* Selection mode makes the whole card a checkbox, so its
                        own action would fire on the click that picks it. */}
                    {collectionPage && !selectionMode ? (
                      <RemoveFromCollectionButton
                        mediaServerId={id}
                        popup={exclusionType && exclusionType === 'global'}
                        onRemove={() => onRemove(id.toString())}
                        collectionId={collectionId}
                        exclusionId={exclusionId}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </Transition>
          </>
        )}
      </PosterCard>
      {showMediaModal && (
        <MediaModalContent
          id={id}
          onClose={() => setShowMediaModal(false)}
          title={title}
          summary={summary}
          mediaType={mediaType}
          seasonNumber={seasonNumber}
          episodeNumber={episodeNumber}
          providerIds={providerIds}
          year={displayYear}
          exclusionType={exclusionType}
          collection={collection}
          isManual={isManual}
          forceStatusLoad={forceStatusLoad}
          onStatusLink={handleStatusLink}
          onCollectionItemRemoved={() => {
            onRemove(id.toString())
            setShowMediaModal(false)
          }}
          onCollectionItemPostponed={(addDate) =>
            onItemPostponed?.(id.toString(), addDate)
          }
        />
      )}
    </div>
  )
}

export default memo(MediaCard)
