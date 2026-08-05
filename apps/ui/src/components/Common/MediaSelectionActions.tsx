import { CheckCircleIcon, PencilAltIcon } from '@heroicons/react/solid'
import type { MediaItem } from '@maintainerr/contracts'
import { useState } from 'react'
import MediaActionModal, {
  type MediaAction,
  type MediaActionOutcome,
} from './MediaActionModal'
import Button from './Button'

interface MediaSelectionActionsProps {
  selectionMode: boolean
  onToggleSelectionMode: () => void
  selectedIds: ReadonlySet<string>
  /** The grid the selection was made in, to read the picked items from. */
  items: MediaItem[]
  /** Id is optional only to match ICollection; a saved collection always has one. */
  lockedCollection?: { id?: number; title: string }
  hiddenActions?: MediaAction[]
  onSubmitted: (outcome: MediaActionOutcome) => void
}

/**
 * Both buttons hold a fixed width so toggling selection mode or the live count
 * cannot shift the control row.
 */
const MediaSelectionActions = ({
  selectionMode,
  onToggleSelectionMode,
  selectedIds,
  items,
  lockedCollection,
  hiddenActions,
  onSubmitted,
}: MediaSelectionActionsProps) => {
  const [modalOpen, setModalOpen] = useState(false)
  const selectedCount = selectedIds.size
  // A collection takes one media type from one library. Read both off the
  // picked items rather than the page: an exclusion list carries parent-type
  // rows, and search results span both, so neither can be assumed from context.
  const selected = items.filter((item) => selectedIds.has(item.id))
  const selectedTypes = new Set(selected.map((item) => item.type))
  const selectedLibraries = new Set(selected.map((item) => item.library?.id))
  const mediaType = selectedTypes.size === 1 ? [...selectedTypes][0] : undefined
  const libraryId =
    selectedLibraries.size === 1 ? [...selectedLibraries][0] : undefined

  return (
    <>
      <Button
        buttonType={selectionMode ? 'primary' : 'default'}
        className="min-w-44"
        onClick={onToggleSelectionMode}
      >
        <CheckCircleIcon className="h-4 w-4" />
        {selectionMode ? 'Done selecting' : 'Select items'}
      </Button>
      {/* Same weight as Test Media: this opens a form, it is not the
          destructive step. */}
      <Button
        buttonType="success"
        className="min-w-52"
        disabled={!selectionMode || selectedCount === 0}
        onClick={() => setModalOpen(true)}
      >
        <PencilAltIcon className="h-4 w-4" />
        {selectedCount > 0
          ? `Add/Exclude selected (${selectedCount})`
          : 'Add/Exclude selected'}
      </Button>

      {modalOpen ? (
        <MediaActionModal
          mediaIds={[...selectedIds]}
          mediaType={mediaType}
          libraryId={libraryId}
          lockedCollection={
            lockedCollection?.id !== undefined
              ? { id: lockedCollection.id, title: lockedCollection.title }
              : undefined
          }
          hiddenActions={hiddenActions}
          onCancel={() => setModalOpen(false)}
          onSubmitted={(outcome) => {
            setModalOpen(false)
            onSubmitted(outcome)
          }}
        />
      ) : null}
    </>
  )
}

export default MediaSelectionActions
