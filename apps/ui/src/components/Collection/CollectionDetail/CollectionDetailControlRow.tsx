import type { ReactNode } from 'react'
import PageControlRow from '../../Common/PageControlRow'
import ExecuteButton from '../../Common/ExecuteButton'

interface CollectionDetailControlRowProps {
  canTestMedia: boolean
  onOpenTestMedia: () => void
  children?: ReactNode
}

const CollectionDetailControlRow = ({
  canTestMedia,
  onOpenTestMedia,
  children,
}: CollectionDetailControlRowProps) => {
  if (!canTestMedia && !children) {
    return null
  }

  return (
    <PageControlRow
      actions={
        canTestMedia ? (
          <ExecuteButton onClick={onOpenTestMedia} text="Test Media" />
        ) : undefined
      }
      controls={children}
    />
  )
}

export default CollectionDetailControlRow
