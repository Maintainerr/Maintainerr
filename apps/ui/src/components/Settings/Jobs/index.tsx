import { isValidCron } from 'cron-validator'
import { useForm, useWatch } from 'react-hook-form'
import { useSettingsOutletContext } from '..'
import { usePatchSettings } from '../../../api/settings'
import SaveButton from '../../Common/SaveButton'
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
}

const JobSettings = () => {
  const { settings } = useSettingsOutletContext()
  const { feedback, showError, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback('Job settings')
  const { mutateAsync: updateSettings, isPending: updateSettingsPending } =
    usePatchSettings()
  const { register, handleSubmit, setValue, reset, control } =
    useForm<JobSettingsFormValues>({
      defaultValues: {
        rules_handler_job_cron: settings.rules_handler_job_cron ?? '',
        collection_handler_job_cron: settings.collection_handler_job_cron ?? '',
      },
    })

  const ruleHandlerCron =
    useWatch({ control, name: 'rules_handler_job_cron' }) ?? ''
  const collectionHandlerCron =
    useWatch({ control, name: 'collection_handler_job_cron' }) ?? ''
  const firstCronValid =
    ruleHandlerCron === '' || isValidCronExpression(ruleHandlerCron)
  const secondCronValid =
    collectionHandlerCron === '' || isValidCronExpression(collectionHandlerCron)

  const canSave =
    ruleHandlerCron !== '' &&
    collectionHandlerCron !== '' &&
    firstCronValid &&
    secondCronValid &&
    !updateSettingsPending

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

  const submit = async (data: JobSettingsFormValues) => {
    clearError()

    const normalizedRuleHandlerCron = normalizeCronExpression(
      data.rules_handler_job_cron,
    )
    const normalizedCollectionHandlerCron = normalizeCronExpression(
      data.collection_handler_job_cron,
    )

    if (
      normalizedRuleHandlerCron !== '' &&
      normalizedCollectionHandlerCron !== '' &&
      isValidCronExpression(normalizedRuleHandlerCron) &&
      isValidCronExpression(normalizedCollectionHandlerCron)
    ) {
      try {
        await updateSettings({
          collection_handler_job_cron: normalizedCollectionHandlerCron,
          rules_handler_job_cron: normalizedRuleHandlerCron,
        })
        reset({
          collection_handler_job_cron: normalizedCollectionHandlerCron,
          rules_handler_job_cron: normalizedRuleHandlerCron,
        })
        showUpdated()
      } catch {
        showUpdateError()
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
                  <input
                    {...register('rules_handler_job_cron')}
                    id="rules_handler_job_cron"
                    type="text"
                    value={ruleHandlerCron}
                    className={
                      !firstCronValid
                        ? '!border-error-700 focus:!border-error-700 focus:outline-none focus:!ring-0'
                        : undefined
                    }
                    onBlur={normalizeRuleHandler}
                    onChange={(event) => {
                      handleRuleHandlerChange(event.target.value)
                    }}
                  ></input>
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
                  <input
                    {...register('collection_handler_job_cron')}
                    id="collection_handler_job_cron"
                    type="text"
                    value={collectionHandlerCron}
                    className={
                      !secondCronValid
                        ? '!border-error-700 focus:!border-error-700 focus:outline-none focus:!ring-0'
                        : undefined
                    }
                    onBlur={normalizeCollectionHandler}
                    onChange={(event) => {
                      handleCollectionHandlerChange(event.target.value)
                    }}
                  ></input>
                </div>
              </div>
            </div>

            <div className="actions mt-5 w-full">
              <div className="flex justify-end">
                <span className="ml-3 inline-flex rounded-md shadow-sm">
                  <SaveButton
                    type="submit"
                    disabled={!canSave}
                    isPending={updateSettingsPending}
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
