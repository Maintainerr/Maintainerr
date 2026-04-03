import type { ReactNode } from 'react'
import { SmallLoadingSpinner } from './LoadingSpinner'

export type PendingButtonContentSize = 'default' | 'compact'

interface PendingButtonContentProps {
  isPending: boolean
  idleLabel: string
  pendingLabel: string
  idleIcon?: ReactNode
  reserveLabel?: string
  contentSize?: PendingButtonContentSize
}

const PendingButtonContent = ({
  isPending,
  idleLabel,
  pendingLabel,
  idleIcon,
  reserveLabel,
  contentSize = 'default',
}: PendingButtonContentProps) => {
  const placeholderLabel = reserveLabel ?? pendingLabel
  const showIconSlot = Boolean(idleIcon)
  const iconSlotClass =
    contentSize === 'compact'
      ? 'inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full'
      : 'inline-flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full'
  const contentRowClass =
    contentSize === 'compact'
      ? 'flex items-center gap-1'
      : 'flex items-center gap-2'
  const spinnerClass = contentSize === 'compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <span className="inline-grid">
      <span
        aria-hidden="true"
        className={`invisible col-start-1 row-start-1 ${contentRowClass}`}
      >
        {showIconSlot ? (
          <span className={iconSlotClass}>{idleIcon ?? null}</span>
        ) : null}
        <span>{placeholderLabel}</span>
      </span>
      <span className={`col-start-1 row-start-1 ${contentRowClass}`}>
        {showIconSlot ? (
          <span className={iconSlotClass}>
            {isPending ? (
              <SmallLoadingSpinner className={spinnerClass} />
            ) : (
              (idleIcon ?? null)
            )}
          </span>
        ) : null}
        <span>{isPending ? pendingLabel : idleLabel}</span>
      </span>
    </span>
  )
}

export default PendingButtonContent
