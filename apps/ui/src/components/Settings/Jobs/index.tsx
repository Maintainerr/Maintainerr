import { isValidCron } from 'cron-validator'
import { useState } from 'react'
import { useSettingsOutletContext } from '..'
import { usePatchSettings } from '../../../api/settings'
import SaveButton from '../../Common/SaveButton'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'

interface JobSettingsFormProps {
  initialRuleHandlerCron: string
  initialCollectionHandlerCron: string
}

const JobSettings = () => {
  const { settings } = useSettingsOutletContext()
  const initialRuleHandlerCron = settings.rules_handler_job_cron ?? ''
  const initialCollectionHandlerCron =
    settings.collection_handler_job_cron ?? ''

  return (
    <JobSettingsForm
      key={`${initialRuleHandlerCron}:${initialCollectionHandlerCron}`}
      initialRuleHandlerCron={initialRuleHandlerCron}
      initialCollectionHandlerCron={initialCollectionHandlerCron}
    />
  )
}

const JobSettingsForm = ({
  initialRuleHandlerCron,
  initialCollectionHandlerCron,
}: JobSettingsFormProps) => {
  const [ruleHandlerCron, setRuleHandlerCron] = useState(initialRuleHandlerCron)
  const [collectionHandlerCron, setCollectionHandlerCron] = useState(
    initialCollectionHandlerCron,
  )
  const [savedRuleHandlerCron, setSavedRuleHandlerCron] = useState(
    initialRuleHandlerCron,
  )
  const [savedCollectionHandlerCron, setSavedCollectionHandlerCron] = useState(
    initialCollectionHandlerCron,
  )
  const [secondCronValid, setSecondCronValid] = useState(
    initialCollectionHandlerCron === '' ||
      isValidCron(initialCollectionHandlerCron),
  )
  const [firstCronValid, setFirstCronValid] = useState(
    initialRuleHandlerCron === '' || isValidCron(initialRuleHandlerCron),
  )
  const { feedback, showError, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback('Job settings')
  const { mutateAsync: updateSettings, isPending: updateSettingsPending } =
    usePatchSettings()

  const hasChanges =
    ruleHandlerCron !== savedRuleHandlerCron ||
    collectionHandlerCron !== savedCollectionHandlerCron
  const canSave =
    hasChanges &&
    ruleHandlerCron !== '' &&
    collectionHandlerCron !== '' &&
    firstCronValid &&
    secondCronValid &&
    !updateSettingsPending

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    clearError()

    if (
      ruleHandlerCron &&
      collectionHandlerCron &&
      isValidCron(ruleHandlerCron) &&
      isValidCron(collectionHandlerCron)
    ) {
      const payload = {
        collection_handler_job_cron: collectionHandlerCron,
        rules_handler_job_cron: ruleHandlerCron,
      }

      try {
        await updateSettings(payload)
        setSavedRuleHandlerCron(ruleHandlerCron)
        setSavedCollectionHandlerCron(collectionHandlerCron)
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
          <form onSubmit={submit}>
            <div className="form-row">
              <label htmlFor="ruleHandler" className="text-label">
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
                    name="ruleHandler"
                    id="ruleHandler"
                    type="text"
                    value={ruleHandlerCron}
                    className={
                      !firstCronValid
                        ? '!border-error-700 focus:!border-error-700 focus:outline-none focus:!ring-0'
                        : undefined
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value
                      clearError()
                      setRuleHandlerCron(nextValue)
                      setFirstCronValid(
                        nextValue !== '' && isValidCron(nextValue),
                      )
                    }}
                  ></input>
                </div>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="collectionHanlder" className="text-label">
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
                    name="collectionHanlder"
                    id="collectionHanlder"
                    type="text"
                    value={collectionHandlerCron}
                    className={
                      !secondCronValid
                        ? '!border-error-700 focus:!border-error-700 focus:outline-none focus:!ring-0'
                        : undefined
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value
                      clearError()
                      setCollectionHandlerCron(nextValue)
                      setSecondCronValid(
                        nextValue !== '' && isValidCron(nextValue),
                      )
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
