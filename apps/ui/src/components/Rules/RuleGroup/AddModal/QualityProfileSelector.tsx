import { useQualityProfiles } from '../../../../api/servarr'
import { Select } from '../../../Forms/Select'

interface QualityProfileSelectorProps {
  type: 'Radarr' | 'Sonarr'
  settingId?: number | null
  qualityProfileId?: number | null
  onUpdate: (qualityProfileId?: number) => void
  error?: string
}

const QualityProfileSelector = (props: QualityProfileSelectorProps) => {
  const { data: profiles = [], isLoading } = useQualityProfiles(
    props.type.toLowerCase() as 'radarr' | 'sonarr',
    props.settingId,
  )

  const selectedProfile =
    props.qualityProfileId == null ? '-1' : props.qualityProfileId.toString()

  return (
    <div className="form-row items-center">
      <label htmlFor={`${props.type}-quality-profile`} className="text-label">
        {props.type} quality profile *
        <p className="text-xs font-normal">
          Target quality profile to change to
        </p>
      </label>
      <div className="form-input">
        <div className="form-input-field">
          <Select
            name={`${props.type}-quality-profile`}
            id={`${props.type}-quality-profile`}
            value={selectedProfile}
            disabled={!props.settingId || isLoading}
            onChange={(e) => {
              props.onUpdate(+e.target.value)
            }}
          >
            {selectedProfile === '-1' && (
              <option value="-1" disabled>
                Select a quality profile
              </option>
            )}
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
            {isLoading && (
              <option value="" disabled>
                Loading profiles...
              </option>
            )}
          </Select>
        </div>
        {props.error && (
          <p className="mt-1 text-xs text-error-400">{props.error}</p>
        )}
      </div>
    </div>
  )
}

export default QualityProfileSelector
