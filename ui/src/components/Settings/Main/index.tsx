import { RefreshIcon, SaveIcon } from '@heroicons/react/solid'
import React, { useContext, useEffect, useRef, useState } from 'react'
import SettingsContext from '../../../contexts/settings-context'
import GetApiHandler, { PostApiHandler } from '../../../utils/ApiHandler'
import Alert from '../../Common/Alert'
import Button from '../../Common/Button'
import DocsButton from '../../Common/DocsButton'

const MainSettings = () => {
  const settingsCtx = useContext(SettingsContext)
  const hostnameRef = useRef<HTMLInputElement>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<boolean>()
  const [changed, setChanged] = useState<boolean>()

  useEffect(() => {
    document.title = 'Maintainerr - Settings - General'
  }, [])

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (hostnameRef.current?.value && apiKeyRef.current?.value) {
      const payload = {
        applicationUrl: hostnameRef.current.value,
        apikey: apiKeyRef.current.value,
      }
      const resp: { code: 0 | 1; message: string } = await PostApiHandler(
        '/settings',
        {
          ...settingsCtx.settings,
          ...payload,
        },
      )
      if (Boolean(resp.code)) {
        settingsCtx.addSettings({
          ...settingsCtx.settings,
          ...payload,
        })
        setError(false)
        setChanged(true)
      } else setError(true)
    } else {
      setError(true)
    }
  }

  const regenerateApi = async () => {
    const key = await GetApiHandler('/settings/api/generate')

    await PostApiHandler('/settings', {
      apikey: key,
    })

    settingsCtx.addSettings({
      ...settingsCtx.settings,
      apikey: key,
    })
  }

  return (
    <div className="h-full w-full">
      <div className="section h-full w-full">
        <h3 className="heading">General Settings</h3>
        <p className="description">Configure global settings</p>
      </div>
      {error ? (
        <Alert type="warning" title="Not all fields contain values" />
      ) : changed ? (
        <Alert type="info" title="Settings successfully updated" />
      ) : undefined}
      <div className="section">
        <form onSubmit={submit}>
          <div className="form-row">
            <label htmlFor="name" className="text-label">
              Hostname
            </label>
            <div className="form-input">
              <div className="form-input-field">
                <input
                  name="name"
                  id="name"
                  type="text"
                  ref={hostnameRef}
                  defaultValue={settingsCtx.settings.applicationUrl}
                ></input>
              </div>
            </div>
          </div>

          <div className="form-row">
            <label htmlFor="name" className="text-label">
              Api key
            </label>
            <div className="form-input">
              <div className="form-input-field">
                <input
                  name="name"
                  id="name"
                  type="text"
                  ref={apiKeyRef}
                  defaultValue={settingsCtx.settings.apikey}
                ></input>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    regenerateApi()
                  }}
                  className="input-action ml-3"
                >
                  <RefreshIcon />
                </button>
              </div>
            </div>
          </div>

          <div className="actions mt-5 w-full">
            <div className="flex justify-end">
              <div className="flex w-full">
                <span className="mr-auto flex rounded-md shadow-sm">
                  <DocsButton />
                </span>
                <span className="ml-auto flex rounded-md shadow-sm">
                  <Button buttonType="primary" type="submit">
                    <SaveIcon />
                    <span>Save Changes</span>
                  </Button>
                </span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
export default MainSettings
