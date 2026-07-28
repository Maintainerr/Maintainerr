import { PlayIcon } from '@heroicons/react/solid'
import { ServarrAction } from '@maintainerr/contracts'
import { useQueryClient } from '@tanstack/react-query'
import {
  invalidateCollectionQueries,
  triggerCollectionItemAction,
} from '../../../../api/collections'
import ConfirmActionButton from '../../../Common/ConfirmActionButton'
import type { ICollection } from '../../index'

interface TriggerRuleActionButtonProps {
  collection: ICollection
  mediaServerId: number | string
  onHandled?: () => void
  buttonLabel?: string
}

const getActionSummary = (collection: ICollection) => {
  // Sportarr-managed collections hold leagues/events rather than shows.
  const isSportarr = collection.sportarrSettingsId != null
  switch (collection.arrAction as ServarrAction) {
    case ServarrAction.DELETE:
      return collection.type === 'show'
        ? isSportarr
          ? 'Delete this league'
          : 'Delete this show'
        : collection.type === 'movie'
          ? 'Delete this movie'
          : 'Delete this item'
    case ServarrAction.UNMONITOR_DELETE_ALL:
      return 'Unmonitor the show and delete all existing episodes'
    case ServarrAction.UNMONITOR_DELETE_EXISTING:
      return collection.type === 'movie'
        ? 'Unmonitor this movie and delete its files'
        : 'Unmonitor and delete existing files'
    case ServarrAction.UNMONITOR:
      return isSportarr && collection.type === 'show'
        ? 'Unmonitor this league'
        : `Unmonitor this ${collection.type}`
    case ServarrAction.DELETE_SHOW_IF_EMPTY:
      return 'Delete this season and remove the show if it becomes empty'
    case ServarrAction.UNMONITOR_SHOW_IF_EMPTY:
      return 'Unmonitor this season and unmonitor the show if it becomes empty'
    case ServarrAction.CHANGE_QUALITY_PROFILE:
      return isSportarr
        ? 'Change the quality profile'
        : 'Change the quality profile and trigger a search'
    default:
      return 'Run the collection action'
  }
}

const TriggerRuleActionButton = ({
  collection,
  mediaServerId,
  onHandled,
  buttonLabel = 'Trigger Rule Action',
}: TriggerRuleActionButtonProps) => {
  const queryClient = useQueryClient()

  const actionSummary = getActionSummary(collection)

  const handleTriggerAction = async () => {
    if (!collection.id) {
      return
    }

    await triggerCollectionItemAction(collection.id, mediaServerId)

    await invalidateCollectionQueries(queryClient)

    onHandled?.()
  }

  return (
    <ConfirmActionButton
      buttonLabel={buttonLabel}
      buttonIcon={<PlayIcon className="mr-2 h-4 w-4" />}
      buttonType="primary"
      modalTitle="Trigger Rule Action"
      confirmLabel="Trigger now"
      pendingLabel="Triggering..."
      confirmDisabled={!collection.id}
      errorMessage="Failed to trigger the collection action for this item."
      errorContext="TriggerRuleActionButton.handleTriggerAction"
      onConfirm={handleTriggerAction}
    >
      <p>
        This will immediately run the collection action for this item:
        <span className="font-semibold text-zinc-100"> {actionSummary}</span>.
      </p>
      <p className="mt-3">
        If the action succeeds, the item will be removed from the collection
        right away instead of waiting for the normal schedule.
      </p>
    </ConfirmActionButton>
  )
}

export default TriggerRuleActionButton
