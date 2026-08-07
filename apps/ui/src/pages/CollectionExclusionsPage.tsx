import { useOutletContext } from 'react-router-dom'
import CollectionExclusions from '../components/Collection/CollectionDetail/Exclusions'
import type { CollectionDetailOutletContext } from './CollectionDetailPage'

const CollectionExclusionsPage = () => {
  const { collection } = useOutletContext<CollectionDetailOutletContext>()

  return <CollectionExclusions collection={collection} />
}

export default CollectionExclusionsPage
