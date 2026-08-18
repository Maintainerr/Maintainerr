import { CheckCircleIcon, PencilAltIcon } from '@heroicons/react/solid'
import { Trans } from '@lingui/react/macro'
import type { MediaItem } from '@maintainerr/contracts'
import { useState } from 'react'
import MediaActionModal, { type MediaActionOutcome } from './MediaActionModal'
import Button from './Button'

interface MediaSelectionActionsProps {
  selectionMode: boolean
  onToggleSelectionMode: () => void
  selectedIds: ReadonlySet<string>
  /** The grid the selection was made in, to read the picked items from. */
  items: MediaItem[]
  /**
   * The library the grid is showing, or undefined when it spans several (a
   * search), in which case the picked items are asked instead.
   */
  libraryId?: string
  /** The collection the calling page shows, if it is showing one. */
  defaultCollectionId?: number
  onSubmitted: (outcome: MediaActionOutcome) => void
}

/**
 * On a phone: small text, one shared minimum width so the pair reads as a unit,
 * and a full-height tap target. The app's normal button size from `sm`, where
 * each button takes its own width.
 */
const compactOnMobile = 'h-9 min-w-36 sm:h-auto sm:px-4 sm:py-2 sm:text-sm'

/**
 * Both buttons hold a fixed width so toggling selection mode or the live count
 * cannot shift the row. Below `sm` the labels also drop their tail, so the pair
 * fits one line of the pinned control row on a phone; the tail is a suffix, so
 * the accessible name reads in full at either width.
 */
const MediaSelectionActions = ({
  selectionMode,
  onToggleSelectionMode,
  selectedIds,
  items,
  libraryId,
  defaultCollectionId,
  onSubmitted,
}: MediaSelectionActionsProps) => {
  const [modalOpen, setModalOpen] = useState(false)
  const selectedCount = selectedIds.size
  // A collection takes one media type. Read it off the picked items rather than
  // the page: an exclusion list carries parent-type rows and search results
  // span types, so neither can be assumed from where the selection was made.
  const selected = items.filter((item) => selectedIds.has(item.id))
  const selectedTypes = new Set(selected.map((item) => item.type))
  const mediaType = selectedTypes.size === 1 ? [...selectedTypes][0] : undefined
  // The page's library wins; a search has none, so fall back to the one the
  // picked items agree on. An empty id is an unfilled read, not every library.
  const selectedLibraryIds = selected.map((item) => item.library?.id)
  const resolvedLibraryId =
    libraryId ??
    (selectedLibraryIds.length > 0 &&
    selectedLibraryIds.every((id) => id && id === selectedLibraryIds[0])
      ? selectedLibraryIds[0]
      : undefined)

  return (
    <>
      <Button
        buttonType={selectionMode ? 'primary' : 'default'}
        buttonSize="sm"
        className={`${compactOnMobile} sm:min-w-44`}
        onClick={onToggleSelectionMode}
      >
        <CheckCircleIcon className="h-4 w-4" />
        {/* One span, so the space before the tail survives the button's flex
            row - whitespace between flex items is dropped. */}
        {selectionMode ? (
          <span>
            <Trans>
              Done <span className="hidden sm:inline">selecting</span>
            </Trans>
          </span>
        ) : (
          <span>
            <Trans>
              Select <span className="hidden sm:inline">items</span>
            </Trans>
          </span>
        )}
      </Button>
      {/* Same weight as Test Media: this opens a form, it is not the
          destructive step. */}
      <Button
        buttonType="success"
        buttonSize="sm"
        className={`${compactOnMobile} sm:min-w-52`}
        disabled={!selectionMode || selectedCount === 0}
        onClick={() => setModalOpen(true)}
      >
        <PencilAltIcon className="h-4 w-4" />
        <span>
          <Trans>
            Add/Exclude <span className="hidden sm:inline">selected</span>
          </Trans>
          {selectedCount > 0 ? ` (${selectedCount})` : ''}
        </span>
      </Button>

      {modalOpen ? (
        <MediaActionModal
          mediaIds={[...selectedIds]}
          mediaType={mediaType}
          libraryId={resolvedLibraryId}
          defaultCollectionId={defaultCollectionId}
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
