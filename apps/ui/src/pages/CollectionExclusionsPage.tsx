import { useOutletContext } from 'react-router-dom'
import CollectionExclusions from '../components/Collection/CollectionDetail/Exclusions'
import type { CollectionDetailOutletContext } from './CollectionDetailPage'

const CollectionExclusionsPage = () => {
  const { collection, canTestMedia, openMediaTestModal } =
    useOutletContext<CollectionDetailOutletContext>()

  return (
    <CollectionExclusions
      collection={collection}
      canTestMedia={canTestMedia}
      onOpenTestMedia={openMediaTestModal}
    />
  )
}

export default CollectionExclusionsPage
