import type { ReactNode } from 'react'
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
    <div className="mb-5 flex w-full flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-wrap items-center gap-2">
        {canTestMedia ? (
          <ExecuteButton onClick={onOpenTestMedia} text="Test Media" />
        ) : null}
      </div>

      {children ? (
        <div className="w-full sm:ml-auto sm:w-[18rem]">{children}</div>
      ) : null}
    </div>
  )
}

export default CollectionDetailControlRow
