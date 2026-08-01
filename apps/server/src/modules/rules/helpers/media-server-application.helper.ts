import { MediaServerType } from '@maintainerr/contracts';
import { Application } from '../constants/rules.constants';

/**
 * Single source of truth mapping each supported media server to its rule
 * `Application` id. The `Record<MediaServerType, …>` type is exhaustive - adding
 * a new media server to `MediaServerType` is a compile error until it is mapped
 * here, which keeps every consumer in step with the supported-server list.
 *
 * Lives here rather than beside its first consumer (RuleMigrationService) so
 * the rules layer can use it without importing from settings.
 */
export const MEDIA_SERVER_TYPE_TO_APP: Record<MediaServerType, Application> = {
  [MediaServerType.PLEX]: Application.PLEX,
  [MediaServerType.JELLYFIN]: Application.JELLYFIN,
  [MediaServerType.EMBY]: Application.EMBY,
};

/**
 * Apps that represent the media server itself and therefore differ between
 * servers. Every other app (Radarr, Sonarr, Seerr, Tautulli) is media-server
 * independent and means the same thing whatever is configured.
 */
export const MEDIA_SERVER_APPS = new Set<Application>(
  Object.values(MEDIA_SERVER_TYPE_TO_APP),
);

export const isMediaServerApplication = (application: number): boolean =>
  MEDIA_SERVER_APPS.has(application);

/**
 * The application a rule's value will actually be read from.
 *
 * A rule stores the app it was authored against, but the getter routes every
 * media-server app to whichever server is configured and looks the property id
 * up in *that* server's list. A rule authored on Plex and left unmigrated after
 * a switch to Jellyfin therefore reads Jellyfin's property with that id. Naming
 * it from the stored app would describe a different property than the one that
 * produced the value - property ids do not line up across servers (id 39 is
 * `collectionsIncludingSmart` on Plex and `favoritedBy` on Jellyfin).
 *
 * Returns the stored application unchanged for non-media-server apps, and when
 * the configured server is unknown.
 */
export const resolveValueApplication = (
  storedApplication: number,
  configuredServerType: MediaServerType | undefined | null,
): number => {
  if (!configuredServerType || !isMediaServerApplication(storedApplication)) {
    return storedApplication;
  }
  return MEDIA_SERVER_TYPE_TO_APP[configuredServerType] ?? storedApplication;
};
