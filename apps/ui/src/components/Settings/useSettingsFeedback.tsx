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
  // showUpdated/showUpdateError store which message to show, not its text: the
  // submit handler that calls them was created in a pre-switch render, so a
  // captured string would put the previous language's sentence on screen right
  // after the user changed language and saved. The title resolves below, at
  // render time, against the caller's freshly translated messages.
  const [stored, setStored] = useState<
    | { type: NonNullable<SettingsFeedback>['type']; title: string }
    | {
        type: NonNullable<SettingsFeedback>['type']
        kind: 'updated' | 'updateError'
      }
    | null
  >(null)

  const showFeedback = useCallback(
    (type: NonNullable<SettingsFeedback>['type'], title: string) => {
      setStored({ type, title })
    },
    [],
  )

  const clear = useCallback(() => {
    setStored(null)
  }, [])

  const clearError = useCallback(() => {
    setStored((current) => (current?.type === 'error' ? null : current))
  }, [])

  // Resolved per render rather than memoized: a memo keyed on anything but the
  // active locale would keep serving the language that was loaded when it
  // first ran.
  const updated = messages?.updated ?? t`Settings updated`
  const updateError = messages?.updateError ?? t`Settings could not be updated`

  const showUpdated = useCallback(() => {
    setStored({ type: 'success', kind: 'updated' })
  }, [])

  const showUpdateError = useCallback(() => {
    setStored({ type: 'error', kind: 'updateError' })
  }, [])

  const feedback: SettingsFeedback = useMemo(() => {
    if (!stored) return null
    if ('title' in stored) return stored
    return {
      type: stored.type,
      title: stored.kind === 'updated' ? updated : updateError,
    }
  }, [stored, updated, updateError])

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
