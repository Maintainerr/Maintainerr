import { SaveIcon } from '@heroicons/react/solid'
import { isValidCron } from 'cron-validator'
import { useContext, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import SettingsContext from '../../../contexts/settings-context'
import { PostApiHandler } from '../../../utils/ApiHandler'
import Alert from '../../Common/Alert'
import Button from '../../Common/Button'

const JobSettings = () => {
  const settingsCtx = useContext(SettingsContext)
  const rulehanderRef = useRef<HTMLInputElement>(null)
  const collectionHandlerRef = useRef<HTMLInputElement>(null)
  const [secondCronValid, setSecondCronValid] = useState(true)
  const [firstCronValid, setFirstCronValid] = useState(true)
  const [error, setError] = useState<boolean>(false)
  const [erroMessage, setErrorMessage] = useState<string>('')
  const [changed, setChanged] = useState<boolean>()

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
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
      const resp: { code: 0 | 1; message: string } = await PostApiHandler(
        '/settings',
        {
          ...settingsCtx.settings,
          ...payload,
        },
      )
      if (resp.code) {
        setError(false)
        setChanged(true)

        // set context values
        settingsCtx.settings.rules_handler_job_cron =
          payload.rules_handler_job_cron
        settingsCtx.settings.collection_handler_job_cron =
          payload.collection_handler_job_cron
      } else {
        setError(true)
        setErrorMessage(resp.message.length > 0 ? resp.message : '')
      }
    } else {
      setError(true)
      setErrorMessage('Please make sure all values are valid')
    }
  }

  return (
    <>
      <Helmet>
        <title>Maintainerr - Settings - Jobs</title>
      </Helmet>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Job Settings</h3>
          <p className="description">Job configuration</p>
        </div>

        {error ? (
          <Alert
            type="warning"
            title={
              erroMessage.length > 0
                ? erroMessage
                : 'Something went wrong, please check your values'
            }
          />
        ) : changed ? (
          <Alert type="info" title="Settings successfully updated" />
        ) : undefined}

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
                  patterns
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
                    defaultValue={settingsCtx.settings.rules_handler_job_cron}
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
                    defaultValue={
                      settingsCtx.settings.collection_handler_job_cron
                    }
                  ></input>
                </div>
              </div>
            </div>

            <div className="actions mt-5 w-full">
              <div className="flex justify-end">
                <span className="ml-3 inline-flex rounded-md shadow-sm">
                  <Button
                    buttonType="primary"
                    type="submit"
                    // disabled={isSubmitting || !isValid}
                  >
                    <SaveIcon />
                    <span>Save Changes</span>
                  </Button>
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
