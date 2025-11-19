import { useOutletContext } from 'react-router-dom'
import { ICollection } from '../components/Collection'
import CollectionInfo from '../components/Collection/CollectionDetail/CollectionInfo'

interface CollectionContextType {
  collection: ICollection
}

const CollectionInfoPage = () => {
  const { collection } = useOutletContext<CollectionContextType>()

  return <CollectionInfo collection={collection} />
}

export default CollectionInfoPage
