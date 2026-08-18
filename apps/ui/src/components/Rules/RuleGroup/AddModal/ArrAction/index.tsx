import { Trans, useLingui } from '@lingui/react/macro'
import { ServarrAction } from '@maintainerr/contracts'
import { useEffect } from 'react'
import { useServarrSettings } from '../../../../../api/settings'
import { Select } from '../../../../Forms/Select'
import { IRadarrSetting } from '../../../../Settings/Radarr'
import { ISonarrSetting } from '../../../../Settings/Sonarr'
import { ISportarrSetting } from '../../../../Settings/Sportarr'

type ArrType = 'Radarr' | 'Sonarr' | 'Sportarr'

interface ArrActionProps {
  type: ArrType
  arrAction?: number
  settingId?: number | null // null for when the user has selected 'None', undefined for when this is a new rule
  options: Option[]
  onUpdate: (arrAction: number, settingId?: number | null) => void
  accActionError?: string
  settingIdError?: string
  mediaServerName: string
}

interface Option {
  id: number
  name: string
}

const ArrAction = (props: ArrActionProps) => {
  const { t } = useLingui()
  const {
    type,
    arrAction,
    settingId,
    options: providedOptions,
    onUpdate,
    accActionError,
    settingIdError,
    mediaServerName,
  } = props
  const selectedSetting = settingId?.toString() ?? ''
  const {
    data: settings,
    isLoading: loading,
    isFetching,
  } = useServarrSettings<IRadarrSetting | ISonarrSetting | ISportarrSetting>(
    type.toLowerCase() as 'radarr' | 'sonarr' | 'sportarr',
  )
  const settingsList = settings ?? []
  const action = arrAction ?? 0

  const handleSelectedSettingIdChange = (id?: number | null) => {
    const actionUpdate = id == null ? 0 : action
    onUpdate(actionUpdate, id)
  }

  const handleActionChange = (value: number) => {
    onUpdate(value, settingId)
  }

  useEffect(() => {
    if (!settings) {
      return
    }

    if (
      settingId &&
      settings.find((setting) => setting.id === settingId) == null
    ) {
      onUpdate(0, undefined)
    }
  }, [onUpdate, settingId, settings])

  const noneServerSelected = selectedSetting === ''
  // Always a proper name (Plex, Radarr, ...) or the caller's translated
  // fallback - never a bare translated noun assembled here.
  const actionOwnerName = noneServerSelected ? mediaServerName : type

  const options: Option[] = noneServerSelected
    ? [
        {
          id: ServarrAction.DELETE,
          name: t`Delete`,
        },
        {
          id: ServarrAction.DO_NOTHING,
          name: t`Do nothing`,
        },
      ]
    : providedOptions

  return (
    <div>
      <div className="form-row items-center">
        <label htmlFor={`${type}-server`} className="text-label">
          <Trans>{type} server *</Trans>
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <Select
              name={`${type}-server`}
              id={`${type}-server`}
              value={selectedSetting}
              onChange={(e) => {
                handleSelectedSettingIdChange(
                  e.target.value == '' ? null : +e.target.value,
                )
              }}
            >
              <option value="">{t`None`}</option>
              {(loading || (isFetching && settingsList.length === 0)) && (
                <option value="" disabled>
                  {t`Loading servers...`}
                </option>
              )}
              {settingsList.map((e) => {
                return (
                  <option key={e.id} value={e.id}>
                    {e.serverName}
                  </option>
                )
              })}
            </Select>
          </div>
          {settingIdError ? (
            <p className="mt-1 text-xs text-error-400">{settingIdError}</p>
          ) : undefined}
        </div>
      </div>
      <div className="form-row items-center">
        <label htmlFor={`${type}-action`} className="text-label">
          <Trans>{actionOwnerName} action</Trans>
        </label>
        <div className="form-input">
          <div className="form-input-field">
            <Select
              name={`${type}-action`}
              id={`${type}-action`}
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
            </Select>
          </div>
          {accActionError ? (
            <p className="mt-1 text-xs text-error-400">{accActionError}</p>
          ) : undefined}
        </div>
      </div>
    </div>
  )
}
export default ArrAction
