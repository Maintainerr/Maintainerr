import { useLingui } from '@lingui/react/macro'
import { MediaServerType } from '@maintainerr/contracts'
import { useSettingsOutletContext } from '..'
import EmbySettings from '../Emby'
import JellyfinSettings from '../Jellyfin'
import MediaServerSelector from '../MediaServerSelector'
import PlexSettings from '../Plex'
import { ServiceStatus } from '../ServiceCard'
import { useSettingsFeedback } from '../useSettingsFeedback'

const MediaServerSettings = () => {
  const { t } = useLingui()
  const { settings } = useSettingsOutletContext()
  const { feedback, clear, showInfo, showError } = useSettingsFeedback()
  const type = settings.media_server_type ?? null

  return (
    <>
      {type ? null : <title>{t`Media server settings - Maintainerr`}</title>}
      <MediaServerSelector
        currentType={type}
        onClearFeedback={clear}
        onInfo={showInfo}
        onError={showError}
      />
      <div className="my-3 max-w-6xl">
        <ServiceStatus status={feedback} />
      </div>
      {type ? (
        <div className="border-t border-zinc-700">
          {type === MediaServerType.PLEX ? (
            <PlexSettings />
          ) : type === MediaServerType.JELLYFIN ? (
            <JellyfinSettings />
          ) : (
            <EmbySettings />
          )}
        </div>
      ) : null}
    </>
  )
}

export default MediaServerSettings
