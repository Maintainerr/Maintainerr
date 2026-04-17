import { isValidCron } from 'cron-validator'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useSettingsOutletContext } from '..'
import {
  getOverlaySettings,
  updateOverlaySettings,
} from '../../../api/overlays'
import { usePatchSettings } from '../../../api/settings'
import { SmallLoadingSpinner } from '../../Common/LoadingSpinner'
import SaveButton from '../../Common/SaveButton'
import { Input } from '../../Forms/Input'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'

const normalizeCronExpression = (value: string) =>
  value
    .split(' ')
    .filter((segment) => segment !== '')
    .join(' ')

const isValidCronExpression = (value: string) => {
  const normalizedValue = normalizeCronExpression(value)

  return normalizedValue !== '' && isValidCron(normalizedValue)
}

interface JobSettingsFormValues {
  rules_handler_job_cron: string
  collection_handler_job_cron: string
  overlay_handler_job_cron: string
}

const JobSettings = () => {
  const { settings } = useSettingsOutletContext()
  const { feedback, showError, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback('Job settings')
  const { mutateAsync: updateSettings, isPending: updateSettingsPending } =
    usePatchSettings()
  const [overlayLoaded, setOverlayLoaded] = useState(false)
  const [overlayPending, setOverlayPending] = useState(false)
  const { register, handleSubmit, setValue, reset, control } =
    useForm<JobSettingsFormValues>({
      defaultValues: {
        rules_handler_job_cron: settings.rules_handler_job_cron ?? '',
        collection_handler_job_cron: settings.collection_handler_job_cron ?? '',
        overlay_handler_job_cron: '',
      },
    })

  useEffect(() => {
    let cancelled = false
    getOverlaySettings()
      .then((overlay) => {
        if (cancelled) return
        setValue('overlay_handler_job_cron', overlay?.cronSchedule ?? '', {
          shouldDirty: false,
        })
        setOverlayLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setOverlayLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [setValue])

  const ruleHandlerCron =
    useWatch({ control, name: 'rules_handler_job_cron' }) ?? ''
  const collectionHandlerCron =
    useWatch({ control, name: 'collection_handler_job_cron' }) ?? ''
  const overlayHandlerCron =
    useWatch({ control, name: 'overlay_handler_job_cron' }) ?? ''
  const firstCronValid =
    ruleHandlerCron === '' || isValidCronExpression(ruleHandlerCron)
  const secondCronValid =
    collectionHandlerCron === '' || isValidCronExpression(collectionHandlerCron)
  const overlayCronValid =
    overlayHandlerCron === '' || isValidCronExpression(overlayHandlerCron)

  const canSave =
    overlayLoaded &&
    ruleHandlerCron !== '' &&
    collectionHandlerCron !== '' &&
    firstCronValid &&
    secondCronValid &&
    overlayCronValid &&
    !updateSettingsPending &&
    !overlayPending

  const handleRuleHandlerChange = (nextValue: string) => {
    clearError()
    setValue('rules_handler_job_cron', nextValue, {
      shouldDirty: true,
    })
  }

  const handleCollectionHandlerChange = (nextValue: string) => {
    clearError()
    setValue('collection_handler_job_cron', nextValue, {
      shouldDirty: true,
    })
  }

  const normalizeRuleHandler = () => {
    const normalizedValue = normalizeCronExpression(ruleHandlerCron)
    setValue('rules_handler_job_cron', normalizedValue, {
      shouldDirty: true,
    })
  }

  const normalizeCollectionHandler = () => {
    const normalizedValue = normalizeCronExpression(collectionHandlerCron)
    setValue('collection_handler_job_cron', normalizedValue, {
      shouldDirty: true,
    })
  }

  const handleOverlayHandlerChange = (nextValue: string) => {
    clearError()
    setValue('overlay_handler_job_cron', nextValue, {
      shouldDirty: true,
    })
  }

  const normalizeOverlayHandler = () => {
    const normalizedValue = normalizeCronExpression(overlayHandlerCron)
    setValue('overlay_handler_job_cron', normalizedValue, {
      shouldDirty: true,
    })
  }

  const submit = async (data: JobSettingsFormValues) => {
    clearError()

    if (!overlayLoaded) {
      return
    }

    const normalizedRuleHandlerCron = normalizeCronExpression(
      data.rules_handler_job_cron,
    )
    const normalizedCollectionHandlerCron = normalizeCronExpression(
      data.collection_handler_job_cron,
    )
    const normalizedOverlayHandlerCron = normalizeCronExpression(
      data.overlay_handler_job_cron,
    )

    if (
      normalizedRuleHandlerCron !== '' &&
      normalizedCollectionHandlerCron !== '' &&
      isValidCronExpression(normalizedRuleHandlerCron) &&
      isValidCronExpression(normalizedCollectionHandlerCron) &&
      (normalizedOverlayHandlerCron === '' ||
        isValidCronExpression(normalizedOverlayHandlerCron))
    ) {
      try {
        setOverlayPending(true)
        const [, overlayUpdated] = await Promise.all([
          updateSettings({
            collection_handler_job_cron: normalizedCollectionHandlerCron,
            rules_handler_job_cron: normalizedRuleHandlerCron,
          }),
          updateOverlaySettings({
            cronSchedule: normalizedOverlayHandlerCron || null,
          }),
        ])
        reset({
          collection_handler_job_cron: normalizedCollectionHandlerCron,
          rules_handler_job_cron: normalizedRuleHandlerCron,
          overlay_handler_job_cron: overlayUpdated?.cronSchedule ?? '',
        })
        showUpdated()
      } catch {
        showUpdateError()
      } finally {
        setOverlayPending(false)
      }
    } else {
      showError('Please make sure all values are valid')
    }
  }

  return (
    <>
      <title>Job settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Job Settings</h3>
          <p className="description">Job configuration</p>
        </div>

        <SettingsFeedbackAlert feedback={feedback} />

        <div className="section">
          <form onSubmit={handleSubmit(submit)}>
            <div className="form-row">
              <label htmlFor="rules_handler_job_cron" className="text-label">
                Rule Handler
                <p className="text-xs font-normal">
                  Supports all standard{' '}
                  <a
                    href="http://crontab.org/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    cron
                  </a>{' '}
                  patterns. Can be overridden by individual rule groups.
                </p>
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <Input
                    {...register('rules_handler_job_cron')}
                    id="rules_handler_job_cron"
                    name="rules_handler_job_cron"
                    type="text"
                    value={ruleHandlerCron}
                    error={!firstCronValid}
                    className={
                      !firstCronValid
                        ? '!border-error-700 focus:!border-error-700'
                        : undefined
                    }
                    onBlur={normalizeRuleHandler}
                    onChange={(event) => {
                      handleRuleHandlerChange(event.target.value)
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <label
                htmlFor="collection_handler_job_cron"
                className="text-label"
              >
                Collection Handler
                <p className="text-xs font-normal">
                  Supports all standard{' '}
                  <a
                    href="http://crontab.org/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    cron
                  </a>{' '}
                  patterns
                </p>
              </label>

              <div className="form-input">
                <div className="form-input-field">
                  <Input
                    {...register('collection_handler_job_cron')}
                    id="collection_handler_job_cron"
                    name="collection_handler_job_cron"
                    type="text"
                    value={collectionHandlerCron}
                    error={!secondCronValid}
                    className={
                      !secondCronValid
                        ? '!border-error-700 focus:!border-error-700'
                        : undefined
                    }
                    onBlur={normalizeCollectionHandler}
                    onChange={(event) => {
                      handleCollectionHandlerChange(event.target.value)
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="overlay_handler_job_cron" className="text-label">
                Overlay Handler
                <p className="text-xs font-normal">
                  Supports all standard{' '}
                  <a
                    href="http://crontab.org/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    cron
                  </a>{' '}
                  patterns. Leave empty to disable scheduled overlay runs.
                </p>
              </label>

              <div className="form-input">
                <div className="form-input-field">
                  <Input
                    {...register('overlay_handler_job_cron')}
                    id="overlay_handler_job_cron"
                    name="overlay_handler_job_cron"
                    type="text"
                    value={overlayHandlerCron}
                    disabled={!overlayLoaded}
                    error={!overlayCronValid}
                    className={
                      !overlayCronValid
                        ? '!border-error-700 focus:!border-error-700'
                        : undefined
                    }
                    onBlur={normalizeOverlayHandler}
                    onChange={(event) => {
                      handleOverlayHandlerChange(event.target.value)
                    }}
                  />
                </div>
                <div className="mt-2 min-h-5">
                  {!overlayLoaded ? (
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <SmallLoadingSpinner className="h-4 w-4" />
                      <span>Loading current overlay schedule...</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="actions mt-5 w-full">
              <div className="flex justify-end">
                <span className="ml-3 inline-flex rounded-md shadow-sm">
                  <SaveButton
                    type="submit"
                    disabled={!canSave}
                    isPending={updateSettingsPending || overlayPending}
                  />
                </span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

export default JobSettings
