import { PlayIcon } from '@heroicons/react/solid'
import { ServarrAction } from '@maintainerr/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { triggerCollectionItemAction } from '../../../../api/collections'
import { getApiErrorMessage } from '../../../../utils/ApiError'
import { logClientError } from '../../../../utils/ClientLogger'
import Alert from '../../../Common/Alert'
import Button from '../../../Common/Button'
import Modal from '../../../Common/Modal'
import PendingButton from '../../../Common/PendingButton'
import type { ICollection } from '../../index'

interface TriggerRuleActionBtnProps {
  collection: ICollection
  mediaServerId: number | string
  onHandled?: () => void
}

const getActionSummary = (collection: ICollection) => {
  switch (collection.arrAction as ServarrAction) {
    case ServarrAction.DELETE:
      return collection.type === 'show'
        ? 'Delete this show'
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
      return `Unmonitor this ${collection.type}`
    case ServarrAction.DELETE_SHOW_IF_EMPTY:
      return 'Delete this season and remove the show if it becomes empty'
    case ServarrAction.UNMONITOR_SHOW_IF_EMPTY:
      return 'Unmonitor this season and unmonitor the show if it becomes empty'
    case ServarrAction.CHANGE_QUALITY_PROFILE:
      return 'Change the quality profile and trigger a search'
    default:
      return 'Run the collection action'
  }
}

const TriggerRuleActionBtn = ({
  collection,
  mediaServerId,
  onHandled,
}: TriggerRuleActionBtnProps) => {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const actionSummary = getActionSummary(collection)

  const handleTriggerAction = async () => {
    if (!collection.id || executing) {
      return
    }

    setExecuting(true)
    setError(undefined)

    try {
      await triggerCollectionItemAction(collection.id, mediaServerId)

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['collections'] }),
        queryClient.invalidateQueries({ queryKey: ['calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['overlay-data'] }),
      ])

      setExecuting(false)
      setConfirmOpen(false)
      onHandled?.()
    } catch (error) {
      void logClientError(
        'Failed to trigger the collection action for this item.',
        error,
        'TriggerRuleActionBtn.handleTriggerAction',
      )

      setError(
        getApiErrorMessage(
          error,
          'Failed to trigger the collection action for this item.',
        ),
      )
      setExecuting(false)
    }
  }

  return (
    <>
      <Button buttonType="primary" onClick={() => setConfirmOpen(true)}>
        <PlayIcon className="mr-2 h-4 w-4" />
        Trigger Rule Action
      </Button>

      {confirmOpen ? (
        <Modal
          title="Trigger Rule Action"
          onCancel={() => {
            if (!executing) {
              setConfirmOpen(false)
            }
          }}
          backgroundClickable={!executing}
          footerActions={
            <PendingButton
              buttonType="primary"
              className="ml-3"
              disabled={executing}
              isPending={executing}
              idleLabel="Trigger now"
              pendingLabel="Triggering..."
              onClick={() => {
                void handleTriggerAction()
              }}
            />
          }
        >
          <p>
            This will immediately run the collection action for this item:
            <span className="font-semibold text-zinc-100">
              {' '}
              {actionSummary}
            </span>
            .
          </p>
          <p className="mt-3">
            If the action succeeds, the item will be removed from the collection
            right away instead of waiting for the normal schedule.
          </p>
          {error ? (
            <div className="mt-3">
              <Alert type="error" title={error} />
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  )
}

export default TriggerRuleActionBtn
