import {
  DocumentAddIcon,
  PlusCircleIcon,
  TrashIcon,
} from '@heroicons/react/solid'
import { useEffect, useState } from 'react'
import GetApiHandler, { DeleteApiHandler } from '../../../utils/ApiHandler'
import { logClientError } from '../../../utils/ClientLogger'
import { ICollection } from '../../Collection'
import Button from '../../Common/Button'
import Modal from '../../Common/Modal'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'
import ServarrSettingsModal from '../Servarr/ServarrSettingsModal'

type DeleteRadarrSettingResponseDto =
  | {
      status: 'OK'
      code: 1
      message: string
      data?: never
    }
  | {
      status: 'NOK'
      code: 0
      message: string
      data: {
        collectionsInUse: ICollection[]
      } | null
    }

export interface IRadarrSetting {
  id: number
  serverName: string
  url: string
  apiKey: string
}

const RadarrSettings = () => {
  const [loaded, setLoaded] = useState(false)
  const [settings, setSettings] = useState<IRadarrSetting[]>([])
  const [settingsModalActive, setSettingsModalActive] = useState<
    IRadarrSetting | boolean
  >()
  const [collectionsInUseWarning, setCollectionsInUseWarning] = useState<
    ICollection[] | undefined
  >()
  const { feedback, clear, showError, showInfo } =
    useSettingsFeedback('Radarr settings')

  const handleSettingsSaved = (setting: IRadarrSetting) => {
    const newSettings = [...settings]
    const index = newSettings.findIndex((s) => s.id === setting.id)
    if (index !== -1) {
      newSettings[index] = setting
    } else {
      newSettings.push(setting)
    }

    setSettings(newSettings)
    setSettingsModalActive(undefined)
  }

  const confirmedDelete = async (id: number) => {
    try {
      const resp = await DeleteApiHandler<DeleteRadarrSettingResponseDto>(
        `/settings/radarr/${id}`,
      )

      if (resp.code === 1) {
        setSettings((currentSettings) =>
          currentSettings.filter((setting) => setting.id !== id),
        )
        setSettingsModalActive(undefined)
        showInfo('Radarr server removed')
        return true
      }

      if (resp.data?.collectionsInUse) {
        setCollectionsInUseWarning(resp.data.collectionsInUse)
      } else {
        showError('Failed to delete Radarr setting.')
      }
    } catch (error: unknown) {
      void logClientError(
        'Failed to delete Radarr setting',
        error,
        'Settings.Radarr.confirmedDelete',
      )
      showError('Failed to delete Radarr setting. Check logs for details.')
    }

    return false
  }

  useEffect(() => {
    GetApiHandler<IRadarrSetting[]>('/settings/radarr').then((resp) => {
      setSettings(resp)
      setLoaded(true)
    })
  }, [])

  const showAddModal = () => {
    clear()
    setSettingsModalActive(true)
  }

  return (
    <>
      <title>Radarr settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Radarr Settings</h3>
          <p className="description">Radarr configuration</p>
        </div>

        <SettingsFeedbackAlert feedback={feedback} />

        <ul className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {loaded
            ? settings.map((setting) => (
                <li
                  key={setting.id}
                  className="h-full rounded-xl bg-zinc-800 p-4 text-zinc-400 shadow ring-1 ring-zinc-700"
                >
                  <div className="mb-2 flex items-center gap-x-3 text-base font-medium text-white sm:text-lg">
                    {setting.serverName}
                  </div>
                  <p className="mb-4 space-x-2 truncate text-gray-300">
                    <span className="font-semibold">Address</span>
                    <a href={setting.url} className="hover:underline">
                      {setting.url}
                    </a>
                  </p>
                  <div>
                    <Button
                      buttonType="twin-primary-l"
                      buttonSize="md"
                      className="h-10 w-1/2"
                      onClick={() => {
                        clear()
                        setSettingsModalActive(setting)
                      }}
                    >
                      {<DocumentAddIcon className="m-auto" />}{' '}
                      <p className="m-auto font-semibold">Edit</p>
                    </Button>
                    <DeleteButton
                      onDeleteRequested={() => {
                        void confirmedDelete(setting.id)
                      }}
                    />
                  </div>
                </li>
              ))
            : null}

          {loaded ? (
            <li className="flex h-full min-h-[9.75rem] items-center justify-center rounded-xl border-2 border-dashed border-gray-400 bg-zinc-800 p-4 text-zinc-400 shadow">
              <button
                type="button"
                className="add-button bg-maintainerr-600 hover:bg-maintainerr m-auto flex h-9 rounded px-4 text-zinc-200 shadow-md"
                onClick={showAddModal}
              >
                {<PlusCircleIcon className="m-auto h-5" />}
                <p className="m-auto ml-1 font-semibold">Add server</p>
              </button>
            </li>
          ) : null}
        </ul>
      </div>
      {settingsModalActive && (
        <ServarrSettingsModal
          title="Radarr Settings"
          docsPage="Configuration/#radarr"
          settingsPath="/settings/radarr"
          testPath="/settings/test/radarr"
          serviceName="Radarr"
          settings={
            typeof settingsModalActive === 'boolean'
              ? undefined
              : settingsModalActive
          }
          onUpdate={handleSettingsSaved}
          onDelete={confirmedDelete}
          onCancel={() => {
            setSettingsModalActive(undefined)
          }}
        />
      )}
      {collectionsInUseWarning ? (
        <Modal
          title="Server in-use"
          size="sm"
          footerActions={
            <Button
              buttonType="primary"
              className="ml-3"
              onClick={() => setCollectionsInUseWarning(undefined)}
            >
              Ok
            </Button>
          }
        >
          <p className="mb-4">
            This server is currently being used by the following rules:
            <ul className="list-inside list-disc">
              {collectionsInUseWarning.map((x) => (
                <li key={x.id}>{x.title}</li>
              ))}
            </ul>
          </p>
          <p>
            You must re-assign these rules to a different server before
            deleting.
          </p>
        </Modal>
      ) : undefined}
    </>
  )
}

const DeleteButton = ({
  onDeleteRequested,
}: {
  onDeleteRequested: () => void
}) => {
  const [showSureDelete, setShowSureDelete] = useState(false)

  return (
    <Button
      buttonSize="md"
      buttonType="twin-secondary-r"
      className="h-10 w-1/2"
      onClick={() => {
        if (showSureDelete) {
          onDeleteRequested()
          setShowSureDelete(false)
        } else {
          setShowSureDelete(true)
        }
      }}
    >
      {<TrashIcon className="m-auto" />}{' '}
      <p className="m-auto font-semibold">
        {showSureDelete ? <>Are you sure?</> : <>Delete</>}
      </p>
    </Button>
  )
}

export default RadarrSettings
