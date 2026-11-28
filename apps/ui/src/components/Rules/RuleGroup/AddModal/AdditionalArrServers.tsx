import { Trans } from '@lingui/react/macro'
import { useServarrSettings } from '../../../../api/settings'
import { CheckboxGroup } from '../../../Forms/CheckboxGroup'

interface AdditionalArrServersProps {
  type: 'Radarr' | 'Sonarr'
  primarySettingId: number
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

// The other servers of the collection's own *arr that repeat its delete, for a
// second copy (a 4K version, say) the media server merges into the same item.
// Hidden while there is no other server to pick.
const AdditionalArrServers = (props: AdditionalArrServersProps) => {
  // Named so the message carries {serviceName} rather than an opaque {0}.
  const serviceName = props.type
  const { data: settings } = useServarrSettings(
    props.type === 'Radarr' ? 'radarr' : 'sonarr',
  )
  const otherServers = (settings ?? []).filter(
    (setting) => setting.id !== props.primarySettingId,
  )

  if (otherServers.length === 0) {
    return null
  }

  const toggle = (id: number, checked: boolean) =>
    props.onChange(
      checked
        ? [...props.selectedIds, id]
        : props.selectedIds.filter((selected) => selected !== id),
    )

  return (
    <div className="form-row">
      <label className="text-label">
        <Trans>Also Delete from Other {serviceName} Servers</Trans>
        <p className="text-xs font-normal">
          {props.type === 'Radarr' ? (
            <Trans>
              Removes the same movie, matched by its TMDB ID, from these servers
              as well, such as one holding a 4K copy
            </Trans>
          ) : (
            <Trans>
              Removes the same show, matched by its TVDB ID, from these servers
              as well, such as one holding a 4K copy
            </Trans>
          )}
        </p>
      </label>
      <div className="form-input">
        <div className="flex flex-col gap-2 pt-2">
          {otherServers.map((setting) => (
            <CheckboxGroup
              key={setting.id}
              id={`additional-${props.type}-server-${setting.id}`}
              label={setting.serverName}
              checked={props.selectedIds.includes(setting.id)}
              onChange={(e) => toggle(setting.id, e.target.checked)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default AdditionalArrServers
