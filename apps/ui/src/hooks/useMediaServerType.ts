import { MediaServerType } from '@maintainerr/contracts'
import { type ISettings, useSettings } from '../api/settings'

type MediaServerSetupSettings =
  | Pick<
      ISettings,
      | 'media_server_type'
      | 'plex_hostname'
      | 'plex_name'
      | 'plex_port'
      | 'plex_auth_token'
      | 'jellyfin_url'
      | 'jellyfin_api_key'
    >
  | null
  | undefined

export const hasSelectedMediaServerType = (
  settings: MediaServerSetupSettings,
): boolean => Boolean(settings?.media_server_type)

export const hasCompletedMediaServerSetup = (
  settings: MediaServerSetupSettings,
): boolean => {
  if (!settings?.media_server_type) {
    return false
  }

  if (settings.media_server_type === MediaServerType.JELLYFIN) {
    return Boolean(settings.jellyfin_url && settings.jellyfin_api_key)
  }

  if (settings.media_server_type === MediaServerType.PLEX) {
    return Boolean(
      settings.plex_hostname &&
      settings.plex_name &&
      settings.plex_port &&
      settings.plex_auth_token,
    )
  }

  return false
}

/**
 * Hook to get the current media server type from settings.
 * Used for conditional rendering and feature detection in UI components.
 */
export function useMediaServerType() {
  const { data: settings, isLoading } = useSettings()

  const mediaServerType = settings?.media_server_type as
    | MediaServerType
    | null
    | undefined
  const isSetupComplete = hasCompletedMediaServerSetup(settings)

  return {
    mediaServerType,
    isLoading,
    isPlex: mediaServerType === MediaServerType.PLEX,
    isJellyfin: mediaServerType === MediaServerType.JELLYFIN,
    isMediaServerTypeSelected: hasSelectedMediaServerType(settings),
    isSetupComplete,
    isNotConfigured: !isSetupComplete,
  }
}
