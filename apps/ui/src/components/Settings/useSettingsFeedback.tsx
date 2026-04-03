import { useCallback, useMemo, useState } from 'react'
import Alert from '../Common/Alert'
import SettingsAlertSlot from './SettingsAlertSlot'

export type SettingsFeedback = {
  type: 'warning' | 'info' | 'error'
  title: string
} | null

export const useSettingsFeedback = (scope = 'Settings') => {
  const [feedback, setFeedback] = useState<SettingsFeedback>(null)

  const showFeedback = useCallback(
    (type: NonNullable<SettingsFeedback>['type'], title: string) => {
      setFeedback({ type, title })
    },
    [],
  )

  const clear = useCallback(() => {
    setFeedback(null)
  }, [])

  const clearError = useCallback(() => {
    setFeedback((current) => (current?.type === 'error' ? null : current))
  }, [])

  const scopedMessages = useMemo(
    () => ({
      updated: `${scope} updated`,
      updateError: `${scope} could not be updated`,
    }),
    [scope],
  )

  const showUpdated = useCallback(() => {
    showFeedback('info', scopedMessages.updated)
  }, [scopedMessages.updated, showFeedback])

  const showUpdateError = useCallback(() => {
    showFeedback('error', scopedMessages.updateError)
  }, [scopedMessages.updateError, showFeedback])

  const showInfo = useCallback(
    (title: string) => {
      showFeedback('info', title)
    },
    [showFeedback],
  )

  const showWarning = useCallback(
    (title: string) => {
      showFeedback('warning', title)
    },
    [showFeedback],
  )

  const showError = useCallback(
    (title: string) => {
      showFeedback('error', title)
    },
    [showFeedback],
  )

  return useMemo(
    () => ({
      feedback,
      clear,
      clearError,
      showFeedback,
      showUpdated,
      showUpdateError,
      showInfo,
      showWarning,
      showError,
    }),
    [
      clear,
      clearError,
      feedback,
      showError,
      showFeedback,
      showInfo,
      showUpdated,
      showUpdateError,
      showWarning,
    ],
  )
}

export const SettingsFeedbackAlert = ({
  feedback,
  reserveSpace = true,
}: {
  feedback: SettingsFeedback
  reserveSpace?: boolean
}) => {
  return (
    <SettingsAlertSlot reserveSpace={reserveSpace}>
      {feedback ? <Alert type={feedback.type} title={feedback.title} /> : null}
    </SettingsAlertSlot>
  )
}
