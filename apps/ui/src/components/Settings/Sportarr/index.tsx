import { Trans, useLingui } from '@lingui/react/macro'
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
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../useSettingsFeedback'
import ServarrSettingsModal from '../Servarr/ServarrSettingsModal'
import ServerInUseModal from '../Servarr/ServerInUseModal'

type DeleteSportarrSettingResponseDto =
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

export interface ISportarrSetting {
  id: number
  serverName: string
  url: string
  apiKey: string
}

const SportarrSettings = () => {
  const { t } = useLingui()
  const [loaded, setLoaded] = useState(false)
  const [settings, setSettings] = useState<ISportarrSetting[]>([])
  const [settingsModalActive, setSettingsModalActive] = useState<
    ISportarrSetting | boolean
  >()
  const [collectionsInUseWarning, setCollectionsInUseWarning] = useState<
    ICollection[] | undefined
  >()
  const { feedback, clear, showError, showInfo } = useSettingsFeedback()

  const handleSettingsSaved = (setting: ISportarrSetting) => {
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
      const resp = await DeleteApiHandler<DeleteSportarrSettingResponseDto>(
        `/settings/sportarr/${id}`,
      )

      if (resp.code === 1) {
        setSettings((currentSettings) =>
          currentSettings.filter((setting) => setting.id !== id),
        )
        setSettingsModalActive(undefined)
        showInfo(t`Sportarr server removed`)
        return true
      }

      if (resp.data?.collectionsInUse) {
        setCollectionsInUseWarning(resp.data.collectionsInUse)
      } else {
        showError(t`Failed to delete Sportarr setting.`)
      }
    } catch (error: unknown) {
      void logClientError(
        'Failed to delete Sportarr setting',
        error,
        'Settings.Sportarr.confirmedDelete',
      )
      showError(t`Failed to delete Sportarr setting. Check logs for details.`)
    }

    return false
  }

  useEffect(() => {
    GetApiHandler<ISportarrSetting[]>('/settings/sportarr').then((resp) => {
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
      <title>{t`Sportarr settings - Maintainerr`}</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">
            <Trans>Sportarr Settings</Trans>
          </h3>
          <p className="description">
            <Trans>Sportarr configuration</Trans>
          </p>
        </div>

        <SettingsFeedbackAlert feedback={feedback} />

        {/* Reserve the card-row height so the list doesn't pop in / shift the
            page (no layout shift) while the server list loads. */}
        <ul className="grid min-h-39 max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {loaded
            ? settings.map((setting) => (
                <li
                  key={setting.id}
                  className="h-full rounded-xl bg-zinc-800 p-4 text-zinc-400 shadow-sm ring-1 ring-zinc-700"
                >
                  <div className="mb-2 flex items-center gap-x-3 text-base font-medium text-white sm:text-lg">
                    {setting.serverName}
                  </div>
                  <p className="mb-4 space-x-2 truncate text-gray-300">
                    <span className="font-semibold">
                      <Trans>Address</Trans>
                    </span>
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
                      <p className="m-auto font-semibold">
                        <Trans>Edit</Trans>
                      </p>
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
            <li className="flex h-full min-h-39 items-center justify-center rounded-xl border-2 border-dashed border-gray-400 bg-zinc-800 p-4 text-zinc-400 shadow-sm">
              <button
                type="button"
                className="add-button m-auto flex h-9 rounded-md bg-maintainerr-600 px-4 text-zinc-200 shadow-md hover:bg-maintainerr"
                onClick={showAddModal}
              >
                {<PlusCircleIcon className="m-auto h-5" />}
                <p className="m-auto ml-1 font-semibold">
                  <Trans>Add server</Trans>
                </p>
              </button>
            </li>
          ) : null}
        </ul>
      </div>
      {settingsModalActive && (
        <ServarrSettingsModal
          title={t`Sportarr Settings`}
          docsPage="Configuration/#sportarr"
          settingsPath="/settings/sportarr"
          testPath="/settings/test/sportarr"
          serviceName="Sportarr"
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
        <ServerInUseModal
          collections={collectionsInUseWarning}
          onClose={() => setCollectionsInUseWarning(undefined)}
        />
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
        {showSureDelete ? <Trans>Are you sure?</Trans> : <Trans>Delete</Trans>}
      </p>
    </Button>
  )
}

export default SportarrSettings
