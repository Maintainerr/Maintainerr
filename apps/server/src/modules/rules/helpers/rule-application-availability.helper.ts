import { Application, MediaServerType } from '@maintainerr/contracts';
import { Settings } from '../../settings/entities/settings.entities';

/** *arr instances live per instance, not on the settings singleton. */
export interface ServarrAvailability {
  radarr: boolean;
  sonarr: boolean;
  sportarr: boolean;
}

// Companions bound to one media server. The media-server Applications are
// deliberately absent: `resolveValueApplication` remaps those after a migration.
const MEDIA_SERVER_BY_APPLICATION: Partial<
  Record<Application, MediaServerType>
> = {
  [Application.TAUTULLI]: MediaServerType.PLEX,
  [Application.STREAMYSTATS]: MediaServerType.JELLYFIN,
};

/**
 * Applications that cannot produce a value here: not set up, or not this media
 * server's companion. Shared by the rule editor's filter and the executor's
 * warning, so both say the same thing.
 *
 * Settings only, never reachability - an unreachable integration is transient
 * and the getters already handle it.
 */
export const unavailableRuleApplications = (
  settings: Settings | null | undefined,
  servarr: ServarrAvailability,
): Application[] => {
  if (!settings) {
    return [];
  }

  const unavailable = new Set<Application>();

  if (!settings.seerr_api_key || !settings.seerr_url) {
    unavailable.add(Application.SEERR);
  }
  if (!servarr.radarr) {
    unavailable.add(Application.RADARR);
  }
  if (!servarr.sonarr) {
    unavailable.add(Application.SONARR);
  }
  if (!servarr.sportarr) {
    unavailable.add(Application.SPORTARR);
  }
  if (!settings.tautulli_url || !settings.tautulli_api_key) {
    unavailable.add(Application.TAUTULLI);
  }
  if (!settings.streamystats_url || !settings.jellyfin_api_key) {
    unavailable.add(Application.STREAMYSTATS);
  }
  if (
    !settings.tracearr_url ||
    !settings.tracearr_api_key ||
    !settings.tracearr_server_id
  ) {
    unavailable.add(Application.TRACEARR);
  }

  // Migration carries companion operands across a server change, so a
  // configured Tautulli can end up on Jellyfin holding the other server's ids.
  if (settings.media_server_type) {
    for (const [application, requiredServer] of Object.entries(
      MEDIA_SERVER_BY_APPLICATION,
    )) {
      if (settings.media_server_type !== requiredServer) {
        unavailable.add(Number(application) as Application);
      }
    }
  }

  return [...unavailable];
};
