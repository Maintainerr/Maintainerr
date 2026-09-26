import { PlusCircleIcon, TrashIcon } from '@heroicons/react/solid'
import { Trans, useLingui } from '@lingui/react/macro'
import { type ReactNode, useState } from 'react'
import Alert from '../Common/Alert'
import Button from '../Common/Button'
import type { SettingsFeedback } from './useSettingsFeedback'

const ServiceCard = ({
  title,
  actions,
  children,
}: {
  title: ReactNode
  actions?: ReactNode
  // Omitted for a collapsed card, which is its header alone.
  children?: ReactNode
}) => (
  <div className="flex h-full flex-col rounded-xl bg-zinc-800 px-4 pt-5 pb-4 text-zinc-400 shadow-sm ring-1 ring-zinc-700">
    <div
      className={`flex min-h-8 items-center justify-between gap-4 ${children ? 'mb-4' : ''}`}
    >
      <h4 className="min-w-0 truncate text-base font-medium text-white sm:text-lg">
        {title}
      </h4>
      {actions ? (
        <div className="flex shrink-0 items-center gap-3">{actions}</div>
      ) : null}
    </div>
    {children}
  </div>
)

// Always rendered at a fixed height, so a message appearing never moves the
// controls around it. An error shows as one short label, its reason on hover.
export const ServiceStatus = ({ status }: { status?: SettingsFeedback }) => {
  const { t } = useLingui()

  return (
    <div role="status" className="flex min-h-10 min-w-0 flex-1 items-center">
      {status ? (
        <span className="flex min-w-0" title={status.title}>
          <Alert
            inline
            type={status.type}
            title={
              status.type === 'error' ? t`Error (check logs)` : status.title
            }
          />
          {status.type === 'error' ? (
            <span className="sr-only">{status.title}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}

export const ServiceActions = ({
  status,
  children,
}: {
  status?: SettingsFeedback
  children: ReactNode
}) => (
  <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
    <ServiceStatus status={status} />
    {children}
  </div>
)

export const ServiceCardFooter = ({
  status,
  children,
}: {
  status?: SettingsFeedback
  children: ReactNode
}) => (
  <div className="mt-auto w-full pt-4">
    <ServiceActions status={status}>
      <div className="flex flex-col gap-3 *:h-10 *:w-full sm:flex-row sm:*:w-auto">
        {children}
      </div>
    </ServiceActions>
  </div>
)

// The dashed tile that opens a new card for adding another server or agent.
export const ServiceCardAddTile = ({
  label,
  onClick,
}: {
  label: ReactNode
  onClick: () => void
}) => (
  <div className="flex min-h-39 items-center justify-center rounded-xl border-2 border-dashed border-gray-400 bg-zinc-800 p-4 text-zinc-400 shadow-sm">
    <button
      type="button"
      className="add-button m-auto flex h-9 rounded-md bg-maintainerr-600 px-4 text-zinc-200 shadow-md hover:bg-maintainerr"
      onClick={onClick}
    >
      <PlusCircleIcon className="m-auto h-5" />
      <p className="m-auto ml-1 font-semibold">{label}</p>
    </button>
  </div>
)

export const ServiceCardCancelButton = ({
  onClick,
}: {
  onClick?: () => void
}) => (
  <Button buttonType="ghost" buttonSize="sm" type="button" onClick={onClick}>
    <span className="font-semibold">
      <Trans>Cancel</Trans>
    </span>
  </Button>
)

// Two-step delete for a card's header: the first click asks, the second acts.
// Red, like the rule editor's delete button.
export const ServiceCardDeleteButton = ({
  disabled,
  onConfirm,
}: {
  disabled?: boolean
  onConfirm: () => void
}) => {
  const [confirming, setConfirming] = useState(false)

  return (
    <Button
      buttonType="danger"
      buttonSize="sm"
      type="button"
      disabled={disabled}
      onClick={() => {
        setConfirming(!confirming)
        if (confirming) {
          onConfirm()
        }
      }}
    >
      {confirming ? null : <TrashIcon />}
      <span className="font-semibold">
        {confirming ? <Trans>Are you sure?</Trans> : <Trans>Delete</Trans>}
      </span>
    </Button>
  )
}

export default ServiceCard
