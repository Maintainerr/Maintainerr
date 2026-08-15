import { useLingui } from '@lingui/react/macro'
import { useCallback, useMemo, useState } from 'react'
import Alert from '../Common/Alert'
import SettingsAlertSlot from './SettingsAlertSlot'

export type SettingsFeedback = {
  type: 'warning' | 'info' | 'success' | 'error'
  title: string
} | null

/**
 * `messages` holds whole sentences rather than a scope noun this hook splices
 * into one. A noun dropped into "{scope} updated" cannot be translated: the
 * article, case and gender all depend on the noun, and Swedish marks
 * definiteness with a suffix that no placeholder can carry. Callers that never
 * call `showUpdated`/`showUpdateError` pass nothing.
 */
export const useSettingsFeedback = (messages?: {
  updated: string
  updateError: string
}) => {
  const { t } = useLingui()
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

  // Resolved per render rather than memoized: a memo keyed on anything but the
  // active locale would keep serving the language that was loaded when it
  // first ran. The callbacks below stay stable anyway - their dependency is
  // the string's value, not an object identity.
  const updated = messages?.updated ?? t`Settings updated`
  const updateError = messages?.updateError ?? t`Settings could not be updated`

  const showUpdated = useCallback(() => {
    showFeedback('success', updated)
  }, [updated, showFeedback])

  const showUpdateError = useCallback(() => {
    showFeedback('error', updateError)
  }, [updateError, showFeedback])

  const showInfo = useCallback(
    (title: string) => {
      showFeedback('info', title)
    },
    [showFeedback],
  )

  const showSuccess = useCallback(
    (title: string) => {
      showFeedback('success', title)
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
      showSuccess,
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
      showSuccess,
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
