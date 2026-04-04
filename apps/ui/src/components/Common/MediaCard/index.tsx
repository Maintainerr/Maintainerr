import { Transition } from '@headlessui/react'
import { DocumentAddIcon, DocumentRemoveIcon } from '@heroicons/react/solid'
import { MediaItemType, type MediaProviderIds } from '@maintainerr/contracts'
import React, { memo, useState } from 'react'
import AddModal from '../../AddModal'
import RemoveFromCollectionBtn from '../../Collection/CollectionDetail/RemoveFromCollectionBtn'
import Button from '../Button'
import PosterCard from '../Poster/PosterCard'
import MediaModalContent from './MediaModal'

const mediaBadgeClasses = {
  movie: 'bg-zinc-900',
  show: 'bg-amber-900',
  season: 'bg-yellow-700',
  episode: 'bg-rose-900',
  info: 'bg-zinc-800',
  success: 'bg-emerald-700',
} as const

const renderBadge = (
  label: React.ReactNode,
  tone: keyof typeof mediaBadgeClasses | 'danger',
  className?: string,
) => (
  <div className={className}>
    <div
      className={`pointer-events-none z-40 rounded-full shadow ${tone === 'danger' ? 'bg-error-700' : mediaBadgeClasses[tone]}`}
    >
      <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-zinc-200 sm:h-5">
        {label}
      </div>
    </div>
  </div>
)

interface IMediaCard {
  id: number | string
  summary?: string
  year?: string
  mediaType: 'movie' | 'show' | 'season' | 'episode'
  title: string
  providerIds?: MediaProviderIds
  libraryId?: string
  type?: MediaItemType
  collectionPage: boolean
  daysLeft?: number
  exclusionId?: number
  exclusionType?: 'global' | 'specific' | undefined
  collectionId?: number
  isManual?: boolean
  onRemove?: (id: string) => void
}

const MediaCard: React.FC<IMediaCard> = ({
  id,
  summary,
  year,
  mediaType,
  title,
  libraryId,
  type,
  collectionId = 0,
  daysLeft = 9999,
  exclusionId = undefined,
  providerIds = undefined,
  collectionPage = false,
  exclusionType = undefined,
  isManual = false,
  onRemove = () => {},
}) => {
  const [showDetail, setShowDetail] = useState(false)
  const [excludeModal, setExcludeModal] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [showMediaModal, setShowMediaModal] = useState(false)
  const hasExclusion = exclusionId !== undefined || exclusionType !== undefined

  if (year && mediaType !== 'episode') {
    year = year.slice(0, 4)
  }

  return (
    <div className={'w-full'}>
      {excludeModal ? (
        <AddModal
          mediaServerId={id}
          {...(libraryId ? { libraryId: libraryId } : {})}
          {...(type ? { type: type } : {})}
          onSubmit={() => {
            setExcludeModal(false)
          }}
          onCancel={() => setExcludeModal(false)}
          modalType="exclude"
        />
      ) : undefined}

      {addModal ? (
        <AddModal
          mediaServerId={id}
          {...(libraryId ? { libraryId: libraryId } : {})}
          {...(type ? { type: type } : {})}
          onSubmit={() => {
            setAddModal(false)
          }}
          onCancel={() => setAddModal(false)}
          modalType="add"
        />
      ) : undefined}
      <PosterCard
        mediaType={mediaType}
        providerIds={providerIds}
        className={`media-card relative transform-gpu cursor-pointer overflow-hidden rounded-xl bg-zinc-800 bg-cover pb-[150%] outline-none ring-1 transition duration-300 ${showDetail ? 'show-detail' : ''}`}
        onMouseEnter={() => setShowDetail(true)}
        onMouseLeave={() => setShowDetail(false)}
        onClick={() => {
          if (showDetail) {
            setShowMediaModal(true)
          } else {
            setShowDetail(true)
          }
        }}
        role="link"
        tabIndex={0}
      >
        {(image) => (
          <>
            <div className="absolute left-0 right-0 flex items-center justify-between p-2">
              {renderBadge(mediaType, mediaType)}
              {!collectionPage && hasExclusion
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
              className="absolute inset-0 transform cursor-alias overflow-hidden rounded-xl transition"
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
                    {year && <div className="text-sm font-medium">{year}</div>}

                    <h1
                      className="w-full whitespace-normal text-sm font-bold leading-tight"
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
                    {mediaType == 'episode' && (
                      <div
                        className="whitespace-normal text-xs"
                        style={{
                          WebkitLineClamp: 5,
                          display: '-webkit-box',
                          overflow: 'hidden',
                          WebkitBoxOrient: 'vertical',
                          wordBreak: 'break-word',
                        }}
                      >
                        {summary}
                      </div>
                    )}

                    {!collectionPage ? (
                      <div>
                        <Button
                          buttonType="twin-primary-l"
                          buttonSize="md"
                          className="mb-1 mt-2 h-6 w-1/2 text-zinc-200 shadow-md"
                          onClick={(e) => {
                            e.stopPropagation()
                            setAddModal(true)
                          }}
                        >
                          {<DocumentAddIcon className="m-auto ml-3 h-3" />}{' '}
                          <p className="rules-button-text m-auto mr-2">
                            {'Add'}
                          </p>
                        </Button>
                        <Button
                          buttonSize="md"
                          buttonType="twin-primary-r"
                          className="mt-2 h-6 w-1/2"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExcludeModal(true)
                          }}
                        >
                          {<DocumentRemoveIcon className="m-auto ml-3 h-3" />}{' '}
                          <p className="rules-button-text m-auto mr-2">
                            {'Excl'}
                          </p>
                        </Button>
                      </div>
                    ) : (
                      <RemoveFromCollectionBtn
                        mediaServerId={id}
                        popup={exclusionType && exclusionType === 'global'}
                        onRemove={() => onRemove(id.toString())}
                        collectionId={collectionId}
                        exclusionId={exclusionId}
                      />
                    )}
                  </div>
                </div>
              </div>
            </Transition>
          </>
        )}
      </PosterCard>
      {!addModal && !excludeModal && showMediaModal && (
        <MediaModalContent
          id={id}
          onClose={() => setShowMediaModal(false)}
          title={title}
          summary={summary || 'No description available.'}
          mediaType={mediaType}
          providerIds={providerIds}
          year={year}
        />
      )}
    </div>
  )
}

export default memo(MediaCard)
