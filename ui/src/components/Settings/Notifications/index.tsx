import {
  DocumentAddIcon,
  PlusCircleIcon,
  TrashIcon,
} from '@heroicons/react/solid'
import { useContext, useEffect, useState } from 'react'
import { useToasts } from 'react-toast-notifications'
import SettingsContext from '../../../contexts/settings-context'
import GetApiHandler, { DeleteApiHandler } from '../../../utils/ApiHandler'
import Button from '../../Common/Button'
import CreateNotificationModal, {
  AgentConfiguration,
} from './CreateNotificationModal'
import CachedImage from '../../Common/CachedImage'

const NotificationSettings = () => {
  const settingsCtx = useContext(SettingsContext)
  const [addModalActive, setAddModalActive] = useState(false)
  const [configurations, setConfigurations] = useState<AgentConfiguration[]>()
  const [editConfig, setEditConfig] = useState<AgentConfiguration>()
  const { addToast } = useToasts()

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

  useEffect(() => {
    document.title = 'Maintainerr - Settings - Notifications'
    GetApiHandler('/notifications/configurations').then((configs) =>
      setConfigurations(configs),
    )
  }, [])

  const updateAddModalActive = (active: boolean) => {
    setAddModalActive(active)
    GetApiHandler('/notifications/configurations').then((configs) =>
      setConfigurations(configs),
    )
  }

  const doEdit = (id: number) => {
    const config = configurations?.find((c) => c.id === id)

    setEditConfig(config)
    updateAddModalActive(!addModalActive)
  }

  function confirmedDelete(id: any) {
    DeleteApiHandler(`/notifications/configuration/${id}`).then(() => {
      setConfigurations(configurations?.filter((c) => c.id !== id))
    })
  }

  return (
    <div className="h-full w-full">
      <div className="mb-5 mt-6 text-white h-full w-full">
        <h3 className="heading flex items-center gap-2">
          Notification Settings
          <CachedImage
            className="h-[1em] w-[2.5em]"
            width={'0'}
            height={'0'}
            src={`${basePath}/beta.svg`}
            alt="BETA"
          />
        </h3>
        <p className="description">Notification configuration</p>
      </div>

      <div>
        <ul className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {configurations?.map((config) => (
            <li
              key={config.id}
              className="h-full rounded-xl bg-zinc-800 p-4 text-zinc-400 shadow ring-1 ring-zinc-700"
            >
              <div className="mb-2 flex items-center gap-x-3">
                <div className="text-base font-bold text-white sm:text-lg">
                  {config.name}
                </div>
                {!config.enabled && (
                  <div className="rounded bg-amber-600 px-2 py-0.5 text-xs text-zinc-200 shadow-md">
                    Disabled
                  </div>
                )}
              </div>

              <p className="mb-4 space-x-2 truncate text-gray-300">
                <span className="font-semibold">{config.agent}</span>
              </p>
              <div>
                <Button
                  buttonType="twin-primary-l"
                  buttonSize="md"
                  className="h-10 w-1/2"
                  onClick={() => {
                    if (config.id) {
                      doEdit(config.id)
                    }
                  }}
                >
                  {<DocumentAddIcon className="m-auto" />}{' '}
                  <p className="m-auto font-semibold">Edit</p>
                </Button>
                <DeleteButton
                  onDeleteRequested={() => confirmedDelete(config.id)}
                />
              </div>
            </li>
          ))}

          <li className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-gray-400 bg-zinc-800 p-4 text-zinc-400 shadow">
            <button
              type="button"
              className="add-button m-auto flex h-9 rounded bg-amber-600 px-4 text-zinc-200 shadow-md hover:bg-amber-500"
              onClick={() => setAddModalActive(!addModalActive)}
            >
              {<PlusCircleIcon className="m-auto h-5" />}
              <p className="m-auto ml-1 font-semibold">Add Notification</p>
            </button>
          </li>
        </ul>
      </div>

      {addModalActive ? (
        <CreateNotificationModal
          onCancel={() => {
            setAddModalActive(!addModalActive)
            setEditConfig(undefined)
          }}
          onSave={(bool) => {
            setAddModalActive(!addModalActive)
            setEditConfig(undefined)
            if (bool) {
              addToast('Successfully saved notification agent', {
                autoDismiss: true,
                appearance: 'success',
              })
            } else {
              addToast("Didn't save incomplete notification agent", {
                autoDismiss: true,
                appearance: 'error',
              })
            }
          }}
          onTest={() => {}}
          {...(editConfig
            ? {
                selected: {
                  id: editConfig.id!,
                  name: editConfig.name!,
                  enabled: editConfig.enabled!,
                  agent: editConfig.agent!,
                  types: editConfig.types!,
                  options: editConfig.options!,
                  aboutScale: editConfig.aboutScale!,
                },
              }
            : {})}
        />
      ) : null}
    </div>
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

export default NotificationSettings
