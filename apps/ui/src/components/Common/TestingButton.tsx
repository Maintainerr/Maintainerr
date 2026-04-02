import { BeakerIcon, CheckIcon, ExclamationIcon } from '@heroicons/react/solid'
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

export const TestingButtonContent = ({
  isPending,
  label = 'Test Connection',
  feedbackStatus,
  contentSize,
}: BaseTestingButtonProps) => {
  return (
    <PendingButtonContent
      isPending={isPending}
      idleLabel={label}
      pendingLabel={label}
      idleIcon={resolveTestingIcon(feedbackStatus)}
      reserveLabel={label}
      contentSize={contentSize}
    />
  )
}

const TestingButton = ({
  isPending,
  label = 'Test Connection',
  feedbackStatus,
  buttonType = 'success',
  contentSize,
  ...buttonProps
}: TestingButtonProps) => {
  return (
    <PendingButton
      buttonType={getTestingButtonType(buttonType, feedbackStatus, isPending)}
      isPending={isPending}
      idleLabel={label}
      pendingLabel={label}
      idleIcon={resolveTestingIcon(feedbackStatus)}
      reserveLabel={label}
      contentSize={contentSize}
      {...buttonProps}
    />
  )
}

export default TestingButton
