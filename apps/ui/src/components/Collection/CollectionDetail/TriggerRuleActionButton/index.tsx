import { PlayIcon } from '@heroicons/react/solid'
import { t as globalT } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
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
          ? globalT`Delete this league`
          : globalT`Delete this show`
        : collection.type === 'movie'
          ? globalT`Delete this movie`
          : globalT`Delete this item`
    case ServarrAction.UNMONITOR_DELETE_ALL:
      return globalT`Unmonitor the show and delete all existing episodes`
    case ServarrAction.UNMONITOR_DELETE_EXISTING:
      return collection.type === 'movie'
        ? globalT`Unmonitor this movie and delete its files`
        : globalT`Unmonitor and delete existing files`
    case ServarrAction.UNMONITOR:
      return isSportarr && collection.type === 'show'
        ? globalT`Unmonitor this league`
        : collection.type === 'movie'
          ? globalT`Unmonitor this movie`
          : collection.type === 'show'
            ? globalT`Unmonitor this show`
            : collection.type === 'season'
              ? globalT`Unmonitor this season`
              : globalT`Unmonitor this episode`
    case ServarrAction.DELETE_SHOW_IF_EMPTY:
      return globalT`Delete this season and remove the show if it becomes empty`
    case ServarrAction.UNMONITOR_SHOW_IF_EMPTY:
      return globalT`Unmonitor this season and unmonitor the show if it becomes empty`
    case ServarrAction.CHANGE_QUALITY_PROFILE:
      return isSportarr
        ? globalT`Change the quality profile`
        : globalT`Change the quality profile and trigger a search`
    default:
      return globalT`Run the collection action`
  }
}

const TriggerRuleActionButton = ({
  collection,
  mediaServerId,
  onHandled,
  buttonLabel,
}: TriggerRuleActionButtonProps) => {
  const { t } = useLingui()
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
      buttonLabel={buttonLabel ?? t`Trigger Rule Action`}
      buttonIcon={<PlayIcon className="mr-2 h-4 w-4" />}
      buttonType="primary"
      modalTitle={t`Trigger Rule Action`}
      confirmLabel={t`Trigger now`}
      pendingLabel={t`Triggering...`}
      confirmDisabled={!collection.id}
      errorMessage={t`Failed to trigger the collection action for this item.`}
      errorLogSummary="Failed to trigger the collection action for this item"
      errorContext="TriggerRuleActionButton.handleTriggerAction"
      onConfirm={handleTriggerAction}
    >
      <p>
        <Trans>
          This will immediately run the collection action for this item:
          <span className="font-semibold text-zinc-100"> {actionSummary}</span>.
        </Trans>
      </p>
      <p className="mt-3">
        <Trans>
          If the action succeeds, the item will be removed from the collection
          right away instead of waiting for the normal schedule.
        </Trans>
      </p>
    </ConfirmActionButton>
  )
}

export default TriggerRuleActionButton
