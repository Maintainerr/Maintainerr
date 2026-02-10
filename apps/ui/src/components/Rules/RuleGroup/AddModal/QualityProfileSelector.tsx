import { useQualityProfiles } from '../../../../api/servarr'

interface QualityProfileSelectorProps {
  type: 'Radarr' | 'Sonarr'
  settingId?: number | null
  qualityProfileId?: number | null
  onUpdate: (qualityProfileId?: number | null) => void
  error?: string
}

const QualityProfileSelector = (props: QualityProfileSelectorProps) => {
  const { data: profiles = [], isLoading } = useQualityProfiles(
    props.type.toLowerCase() as 'radarr' | 'sonarr',
    props.settingId,
  )

  const selectedProfile =
    props.qualityProfileId === undefined
      ? '-1'
      : (props.qualityProfileId?.toString() ?? '')

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
          <select
            name={`${props.type}-quality-profile`}
            id={`${props.type}-quality-profile`}
            value={selectedProfile}
            disabled={!props.settingId || isLoading}
            onChange={(e) => {
              props.onUpdate(e.target.value === '' ? null : +e.target.value)
            }}
          >
            {selectedProfile === '-1' && (
              <option value="-1" disabled>
                Select a quality profile
              </option>
            )}
            <option value="">None</option>
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
          </select>
        </div>
        {props.error && (
          <p className="mt-1 text-xs text-red-400">{props.error}</p>
        )}
      </div>
    </div>
  )
}

export default QualityProfileSelector
