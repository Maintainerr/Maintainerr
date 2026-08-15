import { BeakerIcon, CheckIcon, ExclamationIcon } from '@heroicons/react/solid'
import { useLingui } from '@lingui/react/macro'
import type { ButtonHTMLAttributes } from 'react'
import { type ButtonType } from './Button'
import PendingButton from './PendingButton'
import PendingButtonContent, {
  type PendingButtonContentSize,
} from './PendingButtonContent'

type BaseTestingButtonProps = {
  isPending: boolean
  label?: string
  feedbackStatus?: boolean | null
  contentSize?: PendingButtonContentSize
}

type TestingButtonProps = BaseTestingButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    buttonType?: ButtonType
  }

const resolveTestingIcon = (feedbackStatus?: boolean | null) => {
  if (feedbackStatus === true) {
    return <CheckIcon />
  }

  if (feedbackStatus === false) {
    return <ExclamationIcon />
  }

  return <BeakerIcon />
}

export const getTestingButtonType = (
  baseButtonType: ButtonType = 'success',
  feedbackStatus?: boolean | null,
  isPending = false,
): ButtonType => {
  if (isPending || feedbackStatus == null) {
    return baseButtonType
  }

  if (baseButtonType.startsWith('twin-')) {
    return baseButtonType
  }

  return feedbackStatus ? 'success' : 'danger'
}

// The fallback resolves in the body rather than as a default parameter value:
// a default runs before `useLingui()` can subscribe this component to the
// active locale, so the label would keep the language loaded at first render.
export const TestingButtonContent = ({
  isPending,
  label,
  feedbackStatus,
  contentSize,
}: BaseTestingButtonProps) => {
  const { t } = useLingui()
  const idleLabel = label ?? t`Test Connection`

  return (
    <PendingButtonContent
      isPending={isPending}
      idleLabel={idleLabel}
      pendingLabel={idleLabel}
      idleIcon={resolveTestingIcon(feedbackStatus)}
      reserveLabel={idleLabel}
      contentSize={contentSize}
    />
  )
}

const TestingButton = ({
  isPending,
  label,
  feedbackStatus,
  buttonType = 'success',
  contentSize,
  ...buttonProps
}: TestingButtonProps) => {
  const { t } = useLingui()
  const idleLabel = label ?? t`Test Connection`

  return (
    <PendingButton
      buttonType={getTestingButtonType(buttonType, feedbackStatus, isPending)}
      isPending={isPending}
      idleLabel={idleLabel}
      pendingLabel={idleLabel}
      idleIcon={resolveTestingIcon(feedbackStatus)}
      reserveLabel={idleLabel}
      contentSize={contentSize}
      {...buttonProps}
    />
  )
}

export default TestingButton
