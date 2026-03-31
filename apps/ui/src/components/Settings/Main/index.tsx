import { DownloadIcon, RefreshIcon, SaveIcon } from '@heroicons/react/solid'
import React, { useRef, useState } from 'react'
import { useSettingsOutletContext } from '..'
import { usePatchSettings } from '../../../api/settings'
import GetApiHandler from '../../../utils/ApiHandler'
import Button from '../../Common/Button'
import DocsButton from '../../Common/DocsButton'
import MediaServerSelector from '../MediaServerSelector'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'
import DatabaseBackupModal from './DatabaseBackupModal'

const MainSettings = () => {
  const hostnameRef = useRef<HTMLInputElement>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const { feedback, showError, showUpdated, showUpdateError, clearError } =
    useSettingsFeedback('General settings')
  const { settings } = useSettingsOutletContext()
  const { mutateAsync: updateSettings, isPending } = usePatchSettings()

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    clearError()

    if (hostnameRef.current?.value && apiKeyRef.current?.value) {
      const payload = {
        applicationUrl: hostnameRef.current.value,
        apikey: apiKeyRef.current.value,
      }

      try {
        await updateSettings(payload)
        showUpdated()
      } catch {
        showUpdateError()
      }
    } else {
      showError('Not all fields contain values')
    }
  }

  const regenerateApi = async () => {
    clearError()

    try {
      const key = await GetApiHandler('/settings/api/generate')

      await updateSettings({
        apikey: key,
      })

      showUpdated()
    } catch {
      showUpdateError()
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
        <SettingsFeedbackAlert feedback={feedback} />

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

        {/* Media Server Selector */}
        <MediaServerSelector currentType={settings.media_server_type ?? null} />
      </div>
    </>
  )
}
export default MainSettings
