import { ClockIcon } from '@heroicons/react/solid'
import { Trans, useLingui } from '@lingui/react/macro'
import { POSTPONE_MAX_DAYS, POSTPONE_MIN_DAYS } from '@maintainerr/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  invalidateCollectionQueries,
  postponeCollectionItem,
} from '../../../../api/collections'
import ConfirmActionButton from '../../../Common/ConfirmActionButton'
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

const DEFAULT_DAYS = 14

const PostponeButton = ({
  collection,
  mediaServerId,
  onPostponed,
  buttonLabel,
}: PostponeButtonProps) => {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [days, setDays] = useState(DEFAULT_DAYS)

  const daysInvalid =
    !Number.isInteger(days) ||
    days < POSTPONE_MIN_DAYS ||
    days > POSTPONE_MAX_DAYS

  const handlePostpone = async () => {
    if (!collection.id) {
      return
    }

    const result = await postponeCollectionItem(
      collection.id,
      mediaServerId,
      days,
    )

    await invalidateCollectionQueries(queryClient)

    onPostponed?.(result.addDate)
  }

  return (
    <ConfirmActionButton
      buttonLabel={buttonLabel ?? t`Postpone`}
      buttonIcon={<ClockIcon className="mr-2 h-4 w-4" />}
      modalTitle={t`Postpone deletion`}
      modalSize="md"
      confirmLabel={t`Postpone now`}
      pendingLabel={t`Postponing...`}
      confirmDisabled={!collection.id || daysInvalid}
      errorMessage={t`Failed to postpone the deletion for this item.`}
      errorLogSummary="Failed to postpone the deletion for this item"
      errorContext="PostponeButton.handlePostpone"
      onConfirm={handlePostpone}
    >
      <p>
        <Trans>
          Push this item&apos;s deletion further out by the number of days
          below. An item already past its deletion date is counted from today.
        </Trans>
      </p>
      <div className="form-row mt-3 mb-0!">
        <label className="text-label" htmlFor="postpone_days">
          <Trans>Days to postpone</Trans>
        </label>
        <div className="form-input">
          <div className="form-input-field flex w-32 flex-col">
            <Input
              type="number"
              name="postpone_days"
              id="postpone_days"
              min={POSTPONE_MIN_DAYS}
              max={POSTPONE_MAX_DAYS}
              error={daysInvalid}
              value={Number.isNaN(days) ? '' : days}
              onChange={(e) => setDays(e.target.valueAsNumber)}
            />
          </div>
          {daysInvalid ? (
            <p className="mt-1 text-xs text-error-400">
              <Trans>
                Enter a whole number between {POSTPONE_MIN_DAYS} and{' '}
                {POSTPONE_MAX_DAYS}.
              </Trans>
            </p>
          ) : null}
        </div>
      </div>
    </ConfirmActionButton>
  )
}

export default PostponeButton
