import { useState } from 'react'
import { ICollection } from '..'
import { useMediaServerLibraries } from '../../../api/media-server'
import CollectionModal, { CollectionSummaryGrid } from './CollectionModal'
import PosterCard from '../../Common/Poster/PosterCard'
import { toProviderIds } from '../../../utils/mediaTypeUtils'

interface ICollectionItem {
  collection: ICollection
  onClick?: (collection: ICollection) => void
}

const CollectionItem = (props: ICollectionItem) => {
  const [showCollectionModal, setShowCollectionModal] = useState(false)
  const { data: libraries } = useMediaServerLibraries()
  const libraryTitle =
    libraries?.find(
      (lib) => String(lib.id) === String(props.collection.libraryId),
    )?.title ?? '-'
  const previewMedia = props.collection.media?.[0]

  const handleCardClick = () => {
    if (props.onClick) {
      props.onClick(props.collection)
      return
    }

    setShowCollectionModal(true)
  }

  return (
    <>
      <PosterCard
        imagePath={previewMedia?.image_path}
        mediaType={props.collection.type}
        providerIds={toProviderIds({
          tmdbId: previewMedia?.tmdbId,
          tvdbId: previewMedia?.tvdbId,
        })}
        className="relative transform-gpu cursor-pointer overflow-hidden rounded-xl bg-zinc-800 bg-cover outline-none transition duration-300"
        imageClassName="backdrop-image"
        onClick={handleCardClick}
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
              <CollectionSummaryGrid
                collection={props.collection}
                libraryTitle={libraryTitle}
                layout="card"
              />
            </div>
          </>
        )}
      </PosterCard>
      {showCollectionModal ? (
        <CollectionModal
          collection={props.collection}
          libraryTitle={libraryTitle}
          onClose={() => setShowCollectionModal(false)}
          onOpenDetail={props.onClick}
        />
      ) : undefined}
    </>
  )
}
export default CollectionItem
