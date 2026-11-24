import { Trans, useLingui } from '@lingui/react/macro'
import { MEDIA_SERVER_ACTIONS, ServarrAction } from '@maintainerr/contracts'
import { useEffect } from 'react'
import { useServarrSettings } from '../../../../../api/settings'
import { Select } from '../../../../Forms/Select'

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
  // Set when the collection's *arr cannot take the action, also when that *arr
  // is of another kind and so not shown here (#4137).
  actionUnsupported?: boolean
}

interface Option {
  id: number
  name: string
}

// The labels are keyed by exactly the listed actions, so each one needs a name.
export const toActionOptions = <A extends ServarrAction>(
  actions: readonly A[],
  labels: Record<NoInfer<A>, string>,
): Option[] => actions.map((id) => ({ id, name: labels[id] }))

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
    actionUnsupported = false,
  } = props
  const selectedSetting = settingId?.toString() ?? ''
  const {
    data: settings,
    isLoading: loading,
    isFetching,
    isError,
  } = useServarrSettings(type.toLowerCase() as 'radarr' | 'sonarr' | 'sportarr')
  const settingsList = settings ?? []
  const savedServerListed = settingsList.some(
    (setting) => setting.id === settingId,
  )
  const action = arrAction ?? 0

  const handleSelectedSettingIdChange = (id?: number | null) => {
    const actionUpdate = id == null ? 0 : action
    onUpdate(actionUpdate, id)
  }

  const handleActionChange = (value: number) => {
    onUpdate(value, settingId)
  }

  useEffect(() => {
    // Only a list fetched now shows the saved server gone: a cached one may
    // predate it, and a failed refresh keeps the cached one.
    if (!settings || isFetching || isError) {
      return
    }

    if (
      settingId &&
      settings.find((setting) => setting.id === settingId) == null
    ) {
      onUpdate(0, undefined)
    }
  }, [onUpdate, settingId, settings, isFetching, isError])

  const noneServerSelected = selectedSetting === ''
  // Always a proper name (Plex, Radarr, ...) or the caller's translated
  // fallback - never a bare translated noun assembled here.
  const actionOwnerName = noneServerSelected ? mediaServerName : type

  const options: Option[] = noneServerSelected
    ? toActionOptions(MEDIA_SERVER_ACTIONS, {
        [ServarrAction.DELETE]: t`Delete`,
        [ServarrAction.DO_NOTHING]: t`Do nothing`,
      })
    : providedOptions
  // A stored action this server cannot take would otherwise show as the first
  // option, while saving kept the stored one (#4137).
  const unsupported =
    actionUnsupported || !options.some((option) => option.id === action)

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
              {(loading ||
                (isFetching && settingsList.length === 0) ||
                (selectedSetting !== '' && !savedServerListed)) && (
                // Stands in for a saved server the list does not show yet,
                // which would otherwise show as None while Save kept it.
                <option value={selectedSetting} disabled>
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
              error={unsupported}
              onChange={(e) => {
                handleActionChange(+e.target.value)
              }}
            >
              {unsupported && (
                <option value={action} disabled>
                  {t`Stored action (unsupported)`}
                </option>
              )}
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
