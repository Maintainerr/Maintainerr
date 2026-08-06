import type { ReactNode } from 'react'
import PageControlRow from '../../Common/PageControlRow'
import ExecuteButton from '../../Common/ExecuteButton'

interface CollectionDetailControlRowProps {
  canTestMedia: boolean
  onOpenTestMedia: () => void
  actions?: ReactNode
  children?: ReactNode
}

const CollectionDetailControlRow = ({
  canTestMedia,
  onOpenTestMedia,
  actions,
  children,
}: CollectionDetailControlRowProps) => {
  if (!canTestMedia && !actions && !children) {
    return null
  }

  return (
    <PageControlRow
      actions={
        canTestMedia || actions ? (
          <>
            {canTestMedia ? (
              <ExecuteButton onClick={onOpenTestMedia} text="Test Media" />
            ) : null}
            {actions}
          </>
        ) : undefined
      }
      controls={children}
    />
  )
}

export default CollectionDetailControlRow
