import { MediaServerType } from '@maintainerr/contracts'
import { useSettings } from '../api/settings'

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

  return {
    mediaServerType,
    isLoading,
    isPlex: mediaServerType === MediaServerType.PLEX,
    isJellyfin: mediaServerType === MediaServerType.JELLYFIN,
    isNotConfigured: !mediaServerType,
  }
}
