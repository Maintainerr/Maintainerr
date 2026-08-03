import { type ReactNode, useState } from 'react'
import { getApiErrorMessage } from '../../utils/ApiError'
import { logClientError } from '../../utils/ClientLogger'
import Alert from './Alert'
import Button, { type ButtonType } from './Button'
import Modal from './Modal'
import PendingButton from './PendingButton'

interface ConfirmActionButtonProps {
  buttonLabel: string
  buttonIcon: ReactNode
  buttonType?: ButtonType
  modalTitle: string
  modalSize?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  confirmLabel: string
  pendingLabel: string
  disabled?: boolean
  confirmDisabled?: boolean
  // Shown when the action throws without a usable message, and logged as the
  // client-error summary.
  errorMessage: string
  // Identifies the call site in the client error log.
  errorContext: string
  onConfirm: () => Promise<void>
  children: ReactNode
}

/**
 * Button that opens a confirmation dialog and runs one async action, handling
 * the pending state, error reporting and dialog lifecycle. `children` are the
 * dialog body, so each caller only supplies its own copy and inputs.
 */
const ConfirmActionButton = ({
  buttonLabel,
  buttonIcon,
  buttonType = 'default',
  modalTitle,
  modalSize,
  confirmLabel,
  pendingLabel,
  disabled = false,
  confirmDisabled = false,
  errorMessage,
  errorContext,
  onConfirm,
  children,
}: ConfirmActionButtonProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const handleConfirm = async () => {
    if (disabled || executing || confirmDisabled) {
      return
    }

    setExecuting(true)
    setError(undefined)

    try {
      await onConfirm()

      setExecuting(false)
      setConfirmOpen(false)
    } catch (error) {
      void logClientError(errorMessage, error, errorContext)

      setError(getApiErrorMessage(error, errorMessage))
      setExecuting(false)
    }
  }

  return (
    <>
      <Button
        buttonType={buttonType}
        disabled={disabled}
        onClick={() => setConfirmOpen(true)}
      >
        {buttonIcon}
        {buttonLabel}
      </Button>

      {confirmOpen ? (
        <Modal
          title={modalTitle}
          size={modalSize}
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
              disabled={disabled || executing || confirmDisabled}
              isPending={executing}
              idleLabel={confirmLabel}
              pendingLabel={pendingLabel}
              onClick={() => {
                void handleConfirm()
              }}
            />
          }
        >
          {children}
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

export default ConfirmActionButton
