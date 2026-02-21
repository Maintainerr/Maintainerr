import { DownloadIcon, RefreshIcon, SaveIcon } from '@heroicons/react/solid'
import React, { useRef, useState } from 'react'
import { useSettingsOutletContext } from '..'
import { usePatchSettings } from '../../../api/settings'
import GetApiHandler from '../../../utils/ApiHandler'
import Alert from '../../Common/Alert'
import Button from '../../Common/Button'
import DocsButton from '../../Common/DocsButton'
import DatabaseBackupModal from './DatabaseBackupModal'

const MainSettings = () => {
  const hostnameRef = useRef<HTMLInputElement>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const [missingValuesError, setMissingValuesError] = useState<boolean>()
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const { settings } = useSettingsOutletContext()
  const {
    mutateAsync: updateSettings,
    isSuccess,
    isPending,
  } = usePatchSettings()

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMissingValuesError(false)
    if (hostnameRef.current?.value && apiKeyRef.current?.value) {
      const payload = {
        applicationUrl: hostnameRef.current.value,
        apikey: apiKeyRef.current.value,
      }

      await updateSettings(payload)
    } else {
      setMissingValuesError(true)
    }
  }

  const regenerateApi = async () => {
    const key = await GetApiHandler('/settings/api/generate')

    await updateSettings({
      apikey: key,
    })
  }

  return (
    <>
      <title>General settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">General Settings</h3>
          <p className="description">Configure global settings</p>
        </div>
        {missingValuesError && (
          <Alert type="error" title="Not all fields contain values" />
        )}

        {isSuccess && (
          <Alert type="info" title="Settings successfully updated" />
        )}

        {showDownloadModal && (
          <DatabaseBackupModal onClose={() => setShowDownloadModal(false)} />
        )}

        <div className="section">
          <form onSubmit={submit}>
            <div className="form-row">
              <label htmlFor="hostname" className="text-label">
                Hostname
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <input
                    name="hostname"
                    id="hostname"
                    type="text"
                    ref={hostnameRef}
                    defaultValue={settings.applicationUrl}
                  ></input>
                </div>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="api-key" className="text-label">
                API key
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <input
                    className="!rounded-r-none"
                    name="api-key"
                    id="api-key"
                    type="text"
                    ref={apiKeyRef}
                    defaultValue={settings.apikey}
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
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex rounded-md shadow-sm">
                    <DocsButton />
                  </span>
                  <span className="flex rounded-md shadow-sm">
                    <Button
                      buttonType="default"
                      type="button"
                      onClick={() => setShowDownloadModal(true)}
                    >
                      <DownloadIcon />
                      <span>Backup Database</span>
                    </Button>
                  </span>
                </div>
                <span className="flex rounded-md shadow-sm sm:ml-auto">
                  <Button
                    buttonType="primary"
                    type="submit"
                    disabled={isPending}
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
export default MainSettings
