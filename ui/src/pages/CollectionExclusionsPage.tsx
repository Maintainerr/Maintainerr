import { useOutletContext } from 'react-router-dom'
import { ICollection } from '../components/Collection'
import CollectionExclusions from '../components/Collection/CollectionDetail/Exclusions'

interface CollectionContextType {
  collection: ICollection
}

const CollectionExclusionsPage = () => {
  const { collection } = useOutletContext<CollectionContextType>()

  return (
    <CollectionExclusions
      collection={collection}
      libraryId={collection.libraryId}
    />
  )
}

export default CollectionExclusionsPage
