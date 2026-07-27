import { ClockIcon } from '@heroicons/react/solid'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  invalidateCollectionQueries,
  postponeCollectionItem,
} from '../../../../api/collections'
import { getApiErrorMessage } from '../../../../utils/ApiError'
import { logClientError } from '../../../../utils/ClientLogger'
import Alert from '../../../Common/Alert'
import Button from '../../../Common/Button'
import Modal from '../../../Common/Modal'
import PendingButton from '../../../Common/PendingButton'
import { Input } from '../../../Forms/Input'
import type { ICollection } from '../../index'

interface PostponeButtonProps {
  collection: ICollection
  mediaServerId: number | string
  // Receives the new addDate so the caller can refresh the "days left" badge
  // without a full refetch.
  onPostponed?: (addDate: string) => void
  buttonLabel?: string
}

// Keep in sync with the server-side bound (postponeCollectionMediaBodySchema).
const MIN_DAYS = 1
const MAX_DAYS = 3650
const DEFAULT_DAYS = 14

const PostponeButton = ({
  collection,
  mediaServerId,
  onPostponed,
  buttonLabel = 'Postpone',
}: PostponeButtonProps) => {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [days, setDays] = useState(DEFAULT_DAYS)

  const daysInvalid =
    !Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS

  const handlePostpone = async () => {
    if (!collection.id || executing || daysInvalid) {
      return
    }

    setExecuting(true)
    setError(undefined)

    try {
      const result = await postponeCollectionItem(
        collection.id,
        mediaServerId,
        days,
      )

      await invalidateCollectionQueries(queryClient)

      setExecuting(false)
      setConfirmOpen(false)
      onPostponed?.(result.addDate)
    } catch (error) {
      void logClientError(
        'Failed to postpone the deletion for this item.',
        error,
        'PostponeButton.handlePostpone',
      )

      setError(
        getApiErrorMessage(
          error,
          'Failed to postpone the deletion for this item.',
        ),
      )
      setExecuting(false)
    }
  }

  return (
    <>
      <Button buttonType="default" onClick={() => setConfirmOpen(true)}>
        <ClockIcon className="mr-2 h-4 w-4" />
        {buttonLabel}
      </Button>

      {confirmOpen ? (
        <Modal
          title="Postpone deletion"
          size="md"
          onCancel={() => {
            if (!executing) {
              setConfirmOpen(false)
              // Drop a failed attempt's message, so reopening doesn't warn
              // about an action that was never retried.
              setError(undefined)
            }
          }}
          backgroundClickable={!executing}
          footerActions={
            <PendingButton
              buttonType="primary"
              className="ml-3"
              disabled={executing || daysInvalid}
              isPending={executing}
              idleLabel="Postpone now"
              pendingLabel="Postponing..."
              onClick={() => {
                void handlePostpone()
              }}
            />
          }
        >
          <p>
            Push this item&apos;s deletion further out by the number of days
            below. An item already past its deletion date is counted from today.
          </p>
          <div className="form-row mt-3 mb-0!">
            <label className="text-label" htmlFor="postpone_days">
              Days to postpone
            </label>
            <div className="form-input">
              <div className="form-input-field flex w-32 flex-col">
                <Input
                  type="number"
                  name="postpone_days"
                  id="postpone_days"
                  min={MIN_DAYS}
                  max={MAX_DAYS}
                  error={daysInvalid}
                  value={Number.isNaN(days) ? '' : days}
                  onChange={(e) => setDays(e.target.valueAsNumber)}
                />
              </div>
              {daysInvalid ? (
                <p className="mt-1 text-xs text-error-400">
                  Enter a whole number between {MIN_DAYS} and {MAX_DAYS}.
                </p>
              ) : null}
            </div>
          </div>
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

export default PostponeButton
