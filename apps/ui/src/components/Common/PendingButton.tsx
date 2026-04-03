import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Button, { type ButtonType } from './Button'
import PendingButtonContent, {
  type PendingButtonContentSize,
} from './PendingButtonContent'

interface PendingButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  isPending: boolean
  idleLabel: string
  pendingLabel: string
  idleIcon?: ReactNode
  reserveLabel?: string
  buttonType?: ButtonType
  contentSize?: PendingButtonContentSize
}

const PendingButton = ({
  isPending,
  idleLabel,
  pendingLabel,
  idleIcon,
  reserveLabel,
  buttonType,
  contentSize,
  ...buttonProps
}: PendingButtonProps) => {
  return (
    <Button buttonType={buttonType} {...buttonProps}>
      <PendingButtonContent
        isPending={isPending}
        idleLabel={idleLabel}
        pendingLabel={pendingLabel}
        idleIcon={idleIcon}
        reserveLabel={reserveLabel}
        contentSize={contentSize}
      />
    </Button>
  )
}

export default PendingButton
