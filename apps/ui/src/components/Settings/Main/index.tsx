import {
  ClipboardCopyIcon,
  RefreshIcon,
  SaveIcon,
} from '@heroicons/react/solid'
import axios from 'axios'
import React, { useRef, useState } from 'react'
import { useSettingsOutletContext } from '..'
import { usePatchSettings } from '../../../api/settings'
import GetApiHandler, { API_BASE_PATH } from '../../../utils/ApiHandler'
import Alert from '../../Common/Alert'
import Button from '../../Common/Button'
import DocsButton from '../../Common/DocsButton'

const MainSettings = () => {
  const hostnameRef = useRef<HTMLInputElement>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const [missingValuesError, setMissingValuesError] = useState<boolean>()
  const [downloadingDb, setDownloadingDb] = useState(false)
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

  const downloadDatabase = async () => {
    setDownloadingDb(true)
    try {
      const response = await axios.get(
        `${API_BASE_PATH}/api/settings/database/download`,
        { responseType: 'blob' },
      )

      const blob = new Blob([response.data], {
        type: 'application/octet-stream',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'maintainerr.sqlite'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } finally {
      setDownloadingDb(false)
    }
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
                    defaultValue={settings.applicationUrl}
                  ></input>
                </div>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="name" className="text-label">
                API key
              </label>
              <div className="form-input">
                <div className="form-input-field">
                  <input
                    name="name"
                    id="name"
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
              <div className="flex justify-end">
                <div className="flex w-full">
                  <span className="mr-auto flex rounded-md shadow-sm">
                    <div className="flex gap-2">
                      <DocsButton />
                      <Button
                        buttonType="default"
                        type="button"
                        disabled={downloadingDb}
                        onClick={downloadDatabase}
                      >
                        <ClipboardCopyIcon />
                        <span>
                          {downloadingDb
                            ? 'Downloading...'
                            : 'Download Database'}
                        </span>
                      </Button>
                    </div>
                  </span>
                  <span className="ml-auto flex rounded-md shadow-sm">
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
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
export default MainSettings
