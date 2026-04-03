import { SaveIcon } from '@heroicons/react/solid'
import { isValidCron } from 'cron-validator'
import { useRef, useState } from 'react'
import { useSettingsOutletContext } from '..'
import { usePatchSettings } from '../../../api/settings'
import PendingButton from '../../Common/PendingButton'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'

const JobSettings = () => {
  const rulehanderRef = useRef<HTMLInputElement>(null)
  const collectionHandlerRef = useRef<HTMLInputElement>(null)
  const [secondCronValid, setSecondCronValid] = useState(true)
  const [firstCronValid, setFirstCronValid] = useState(true)
  const { feedback, showError, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback('Job settings')
  const { mutateAsync: updateSettings, isPending: updateSettingsPending } =
    usePatchSettings()
  const { settings } = useSettingsOutletContext()

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    clearError()

    if (
      rulehanderRef.current?.value &&
      collectionHandlerRef.current?.value &&
      isValidCron(rulehanderRef.current.value) &&
      isValidCron(collectionHandlerRef.current.value)
    ) {
      const payload = {
        collection_handler_job_cron: collectionHandlerRef.current.value,
        rules_handler_job_cron: rulehanderRef.current.value,
      }

      try {
        await updateSettings(payload)
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
                <div
                  className={`form-input-field' ${
                    !firstCronValid ? 'border-2 border-red-700' : ''
                  }`}
                >
                  <input
                    name="ruleHandler"
                    id="ruleHandler"
                    type="text"
                    onChange={() => {
                      setFirstCronValid(
                        rulehanderRef.current?.value
                          ? isValidCron(rulehanderRef.current.value)
                          : false,
                      )
                    }}
                    ref={rulehanderRef}
                    defaultValue={settings.rules_handler_job_cron}
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
                <div
                  className={`form-input-field' ${
                    !secondCronValid ? 'border-2 border-red-700' : ''
                  }`}
                >
                  <input
                    name="collectionHanlder"
                    id="collectionHanlder"
                    type="text"
                    onChange={() => {
                      setSecondCronValid(
                        collectionHandlerRef.current?.value
                          ? isValidCron(collectionHandlerRef.current.value)
                          : false,
                      )
                    }}
                    ref={collectionHandlerRef}
                    defaultValue={settings.collection_handler_job_cron}
                  ></input>
                </div>
              </div>
            </div>

            <div className="actions mt-5 w-full">
              <div className="flex justify-end">
                <span className="ml-3 inline-flex rounded-md shadow-sm">
                  <PendingButton
                    buttonType="primary"
                    type="submit"
                    disabled={updateSettingsPending}
                    idleLabel="Save Changes"
                    pendingLabel="Saving..."
                    isPending={updateSettingsPending}
                    idleIcon={<SaveIcon />}
                    reserveLabel="Save Changes"
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
