import { useEffect, useState } from 'react'
import GetApiHandler from '../../../../../utils/ApiHandler'
import { IRadarrSetting } from '../../../../Settings/Radarr'
import { ISonarrSetting } from '../../../../Settings/Sonarr'

type ArrType = 'Radarr' | 'Sonarr'

interface ArrActionProps {
  type: ArrType
  arrAction?: number
  settingId?: number | null // null for when the user has selected 'None', undefined for when this is a new rule
  options: Option[]
  onUpdate: (arrAction: number, settingId?: number | null) => void
}

interface Option {
  id: number
  name: string
}

const ArrAction = (props: ArrActionProps) => {
  const selectedSetting =
    props.settingId === undefined ? '-1' : (props.settingId?.toString() ?? '')
  const [settings, setSettings] = useState<(IRadarrSetting | ISonarrSetting)[]>(
    [],
  )
  const [loading, setLoading] = useState<boolean>(true)
  const action = props.arrAction ?? 0

  const handleSelectedSettingIdChange = (id?: number | null) => {
    const actionUpdate = id == null ? 0 : action
    props.onUpdate(actionUpdate, id)
  }

  const handleActionChange = (value: number) => {
    props.onUpdate(value, props.settingId)
  }

  const loadArrSettings = async (type: ArrType) => {
    setLoading(true)
    setSettings([])
    const settingsResponse = await GetApiHandler<IRadarrSetting[]>(
      `/settings/${type.toLowerCase()}`,
    )
    setSettings(settingsResponse)
    setLoading(false)

    // The selected server does not exist anymore (old client data potentially) so deselect
    if (
      props.settingId &&
      settingsResponse.find((x) => x.id === props.settingId) == null
    ) {
      handleSelectedSettingIdChange(undefined)
    }
  }

  useEffect(() => {
    loadArrSettings(props.type)
  }, [props.type])

  const noneServerSelected = selectedSetting === ''

  const options: Option[] = noneServerSelected
    ? [
        {
          id: 0,
          name: 'Delete',
        },
        {
          id: 4,
          name: 'Do nothing',
        },
      ]
    : props.options

  return (
    <div>
      <div className="form-row items-center">
        <label htmlFor={`${props.type}-server`} className="text-label">
          {props.type} server *
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <select
              name={`${props.type}-server`}
              id={`${props.type}-server`}
              value={selectedSetting}
              onChange={(e) => {
                handleSelectedSettingIdChange(
                  e.target.value == '' ? null : +e.target.value,
                )
              }}
            >
              {selectedSetting === '-1' && (
                <option value="-1" disabled></option>
              )}
              <option value="">None</option>
              {settings.map((e) => {
                return (
                  <option key={e.id} value={e.id}>
                    {e.serverName}
                  </option>
                )
              })}
              {loading && (
                <option value="" disabled>
                  Loading servers...
                </option>
              )}
            </select>
          </div>
        </div>
      </div>
      <div className="form-row items-center">
        <label htmlFor={`${props.type}-action`} className="text-label">
          {noneServerSelected ? 'Plex' : props.type} action
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <select
              name={`${props.type}-action`}
              id={`${props.type}-action`}
              value={action}
              onChange={(e) => {
                handleActionChange(+e.target.value)
              }}
            >
              {options.map((e) => {
                return (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                )
              })}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
export default ArrAction
