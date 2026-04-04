import { SaveIcon } from '@heroicons/react/solid'
import type { ButtonHTMLAttributes } from 'react'
import { type ButtonType } from './Button'
import PendingButton from './PendingButton'
import PendingButtonContent, {
  type PendingButtonContentSize,
} from './PendingButtonContent'

type BaseSaveButtonProps = {
  isPending: boolean
  label?: string
  pendingLabel?: string
  contentSize?: PendingButtonContentSize
}

type SaveButtonProps = BaseSaveButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    buttonType?: ButtonType
  }

export const SaveButtonContent = ({
  isPending,
  label = 'Save Changes',
  pendingLabel = 'Saving...',
  contentSize,
}: BaseSaveButtonProps) => {
  return (
    <PendingButtonContent
      isPending={isPending}
      idleLabel={label}
      pendingLabel={pendingLabel}
      idleIcon={<SaveIcon />}
      reserveLabel={label}
      contentSize={contentSize}
    />
  )
}

const SaveButton = ({
  isPending,
  label = 'Save Changes',
  pendingLabel = 'Saving...',
  buttonType = 'primary',
  contentSize,
  ...buttonProps
}: SaveButtonProps) => {
  return (
    <PendingButton
      buttonType={buttonType}
      isPending={isPending}
      idleLabel={label}
      pendingLabel={pendingLabel}
      idleIcon={<SaveIcon />}
      reserveLabel={label}
      contentSize={contentSize}
      {...buttonProps}
    />
  )
}

export default SaveButton
