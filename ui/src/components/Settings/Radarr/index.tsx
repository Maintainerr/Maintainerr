import {
  DocumentAddIcon,
  PlusCircleIcon,
  TrashIcon,
} from '@heroicons/react/solid'
import { useEffect, useState } from 'react'
import GetApiHandler, { DeleteApiHandler } from '../../../utils/ApiHandler'
import Button from '../../Common/Button'
import LoadingSpinner from '../../Common/LoadingSpinner'
import RadarrSettingsModal from './SettingsModal'
import { ICollection } from '../../Collection'
import Modal from '../../Common/Modal'

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

  const confirmedDelete = (id: number) => {
    DeleteApiHandler<DeleteRadarrSettingResponseDto>(`/settings/radarr/${id}`)
      .then((resp) => {
        if (resp.code === 1) {
          setSettings(settings.filter((s) => s.id !== id))
        } else if (resp.data?.collectionsInUse) {
          setCollectionsInUseWarning(resp.data.collectionsInUse)
        }
      })
      .catch((err) => {
        console.log(err)
      })
  }

  useEffect(() => {
    if (loaded) return

    GetApiHandler<IRadarrSetting[]>('/settings/radarr').then((resp) => {
      setSettings(resp)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    document.title = 'Maintainerr - Settings - Radarr'
  }, [])

  const showAddModal = () => {
    setSettingsModalActive(true)
  }

  if (!loaded) {
    return (
      <>
        <div className="mt-6">
          <LoadingSpinner />
        </div>
      </>
    )
  }

  return (
    <>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Radarr Settings</h3>
          <p className="description">Radarr configuration</p>
        </div>

        <ul className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {settings.map((setting) => (
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
                    setSettingsModalActive(setting)
                  }}
                >
                  {<DocumentAddIcon className="m-auto" />}{' '}
                  <p className="m-auto font-semibold">Edit</p>
                </Button>
                <DeleteButton
                  onDeleteRequested={() => confirmedDelete(setting.id)}
                />
              </div>
            </li>
          ))}

          <li className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-gray-400 bg-zinc-800 p-4 text-zinc-400 shadow">
            <button
              type="button"
              className="add-button m-auto flex h-9 rounded bg-amber-600 px-4 text-zinc-200 shadow-md hover:bg-amber-500"
              onClick={showAddModal}
            >
              {<PlusCircleIcon className="m-auto h-5" />}
              <p className="m-auto ml-1 font-semibold">Add server</p>
            </button>
          </li>
        </ul>
      </div>
      {settingsModalActive && (
        <RadarrSettingsModal
          settings={
            typeof settingsModalActive === 'boolean'
              ? undefined
              : settingsModalActive
          }
          onUpdate={handleSettingsSaved}
          onCancel={() => {
            setSettingsModalActive(undefined)
          }}
        />
      )}
      {collectionsInUseWarning ? (
        <Modal
          title="Server in-use"
          size="sm"
          onOk={() => setCollectionsInUseWarning(undefined)}
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
