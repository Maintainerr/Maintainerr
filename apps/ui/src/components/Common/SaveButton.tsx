import { SaveIcon } from '@heroicons/react/solid'
import { useLingui } from '@lingui/react/macro'
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

// The fallbacks resolve in the body rather than as default parameter values:
// a default runs before `useLingui()` can subscribe this component to the
// active locale, so the label would keep the language loaded at first render.
export const SaveButtonContent = ({
  isPending,
  label,
  pendingLabel,
  contentSize,
}: BaseSaveButtonProps) => {
  const { t } = useLingui()
  const idleLabel = label ?? t`Save Changes`
  const busyLabel = pendingLabel ?? t`Saving...`

  return (
    <PendingButtonContent
      isPending={isPending}
      idleLabel={idleLabel}
      pendingLabel={busyLabel}
      idleIcon={<SaveIcon />}
      reserveLabel={idleLabel}
      contentSize={contentSize}
    />
  )
}

const SaveButton = ({
  isPending,
  label,
  pendingLabel,
  buttonType = 'primary',
  contentSize,
  ...buttonProps
}: SaveButtonProps) => {
  const { t } = useLingui()
  const idleLabel = label ?? t`Save Changes`
  const busyLabel = pendingLabel ?? t`Saving...`

  return (
    <PendingButton
      buttonType={buttonType}
      isPending={isPending}
      idleLabel={idleLabel}
      pendingLabel={busyLabel}
      idleIcon={<SaveIcon />}
      reserveLabel={idleLabel}
      contentSize={contentSize}
      {...buttonProps}
    />
  )
}

export default SaveButton
