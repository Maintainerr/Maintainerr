import { CONNECTION_TEST_TIMEOUT_MS } from '../../../../utils/connection-error';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { NO_TIMEOUT } from '../../lib/httpTimeouts';
import {
  ServarrApi,
  SLOW_INSTANCE_TIMEOUT_MS,
} from '../common/servarr-api.service';
import {
  SportarrDownloadHistoryItem,
  SportarrEvent,
  SportarrInfo,
  SportarrLeague,
  SportarrQualityProfile,
} from '../interfaces/sportarr.interface';

// Native Sportarr client. Unlike the Sonarr helper this talks to Sportarr's
// own /api/* endpoints (leagues/events), not the Sonarr-v3 compatibility
// shim, so nothing here is shared with or affected by the Sonarr/Radarr
// clients. Sportarr accepts the api key as the same ?apikey= query param the
// base ServarrApi already applies, so the base HTTP machinery is reused as-is
// with the url pointed at /api/ instead of /api/v3/.
export class SportarrApi extends ServarrApi<{
  leagueId: number;
  eventId: number;
}> {
  constructor(
    {
      url,
      apiKey,
      cacheName,
    }: {
      url: string;
      apiKey: string;
      cacheName?: string;
    },
    protected readonly logger: MaintainerrLogger,
  ) {
    super({ url, apiKey, cacheName }, logger);
    this.logger.setContext(SportarrApi.name);
  }

  public async info(): Promise<SportarrInfo> {
    try {
      const info: SportarrInfo = (
        await this.axios.get(`system/status`, {
          signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
        })
      ).data;
      return info ? info : null;
    } catch (error) {
      this.logger.warn("Couldn't fetch Sportarr info.. Is Sportarr up?");
      this.logger.debug(error);
      return null;
    }
  }

  // undefined = the fetch itself failed; callers fail closed.
  public async getLeagues(): Promise<SportarrLeague[] | undefined> {
    const response = await this.getWithoutCache<SportarrLeague[]>('/leagues', {
      timeout: SLOW_INSTANCE_TIMEOUT_MS,
    });
    if (response === undefined) {
      this.logger.warn('Failed to retrieve leagues');
    }
    return response;
  }

  // Full detail for one league (the list omits monitored/counts). Uncached so
  // post-deletion cleanup reads fresh state, mirroring the Sonarr client.
  public async getLeague(id: number): Promise<SportarrLeague | undefined> {
    try {
      const response = await this.getWithoutCache<SportarrLeague>(
        `/leagues/${id}`,
        { timeout: SLOW_INSTANCE_TIMEOUT_MS },
      );
      return response ?? undefined;
    } catch (error) {
      this.logger.warn(`Failed to retrieve league ${id}`);
      this.logger.debug(error);
      return undefined;
    }
  }

  // Resolve a league by its Sportarr external id (e.g. lg-000278), the id
  // carried in the Plex item's guid. Same null/undefined contract as the
  // Sonarr resolver: undefined = the lookup itself failed (fail closed),
  // null = Sportarr is reachable but tracks no league with that id. Callers
  // resolving many leagues in one pass can hand in a pre-fetched list so the
  // whole /leagues pull isn't repeated per league.
  public async getLeagueByExternalId(
    externalId: string,
    leagues?: SportarrLeague[],
  ): Promise<SportarrLeague | null | undefined> {
    const needle = externalId?.trim().toLowerCase();
    if (!needle) {
      return null;
    }

    const list = leagues ?? (await this.getLeagues());
    if (list === undefined) {
      return undefined;
    }

    const match = list.find(
      (l) => (l.externalId ?? '').toLowerCase() === needle,
    );
    if (!match) {
      return null;
    }

    // The list row lacks monitored/counts, so fetch the detail for the
    // resolved id. A failed detail fetch is a transient error, not a miss.
    return await this.getLeague(match.id);
  }

  // undefined = the fetch itself failed (callers must fail closed - treating
  // an outage as "league has no events" would make count-based rules match
  // everything); [] = the league genuinely has no events.
  public async getLeagueEvents(
    leagueId: number,
  ): Promise<SportarrEvent[] | undefined> {
    const response = await this.getWithoutCache<SportarrEvent[]>(
      `/leagues/${leagueId}/events`,
      { timeout: SLOW_INSTANCE_TIMEOUT_MS },
    );
    if (response === undefined) {
      this.logger.warn(`Failed to retrieve events for league ${leagueId}`);
    }
    return response;
  }

  // Grab history for a league, one row per grab mapping the event to the id a
  // download client uses to remove the backing torrent/nzb. Used to clean the
  // download client after a delete. Uncached so it reflects current state.
  public async getLeagueDownloadHistory(
    leagueId: number,
  ): Promise<SportarrDownloadHistoryItem[]> {
    try {
      const response = await this.getWithoutCache<
        SportarrDownloadHistoryItem[]
      >(`/leagues/${leagueId}/download-history`, {
        timeout: SLOW_INSTANCE_TIMEOUT_MS,
      });
      return response ?? [];
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve download history for league ${leagueId}`,
      );
      this.logger.debug(error);
      return [];
    }
  }

  // undefined = the fetch itself failed; callers fail closed rather than
  // treat an outage as "no profiles exist".
  public async getQualityProfiles(): Promise<
    SportarrQualityProfile[] | undefined
  > {
    const response =
      await this.get<SportarrQualityProfile[]>('/qualityprofile');
    if (response === undefined) {
      this.logger.warn('Failed to retrieve quality profiles');
    }
    return response;
  }

  public async deleteLeague(
    leagueId: number,
    deleteFiles = true,
  ): Promise<boolean> {
    try {
      await this.axios.delete(`/leagues/${leagueId}`, {
        params: { deleteFiles },
        timeout: NO_TIMEOUT,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to delete league ${leagueId}`);
      this.logger.debug(error);
      return false;
    }
  }

  // Delete the file(s) attached to a single event, leaving the event tracked.
  // This is the episode-scope delete for sports (remove a watched game).
  public async deleteEventFiles(eventId: number): Promise<boolean> {
    try {
      await this.axios.delete(`/events/${eventId}/files`, {
        timeout: NO_TIMEOUT,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to delete files for event ${eventId}`);
      this.logger.debug(error);
      return false;
    }
  }

  public async setLeagueMonitored(
    leagueId: number,
    monitored: boolean,
  ): Promise<boolean> {
    return this.putLeague(leagueId, { monitored });
  }

  public async setLeagueQualityProfile(
    leagueId: number,
    qualityProfileId: number,
  ): Promise<boolean> {
    return this.putLeague(leagueId, { qualityProfileId });
  }

  public async setEventMonitored(
    eventId: number,
    monitored: boolean,
  ): Promise<boolean> {
    try {
      await this.axios.put(
        `/events/${eventId}`,
        { monitored },
        { timeout: SLOW_INSTANCE_TIMEOUT_MS },
      );
      return true;
    } catch (error) {
      this.logger.warn(`Failed to update event ${eventId}`);
      this.logger.debug(error);
      return false;
    }
  }

  // Season is Sportarr's season label (calendar year, e.g. "2026"). The
  // native toggle sets every event in that season to the requested state.
  public async setSeasonMonitored(
    leagueId: number,
    season: string,
    monitored: boolean,
  ): Promise<boolean> {
    try {
      await this.axios.put(
        `/leagues/${leagueId}/seasons/${encodeURIComponent(season)}/toggle`,
        { monitored },
        { timeout: SLOW_INSTANCE_TIMEOUT_MS },
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to set season ${season} monitored for league ${leagueId}`,
      );
      this.logger.debug(error);
      return false;
    }
  }

  private async putLeague(
    leagueId: number,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      await this.axios.put(`/leagues/${leagueId}`, body, {
        timeout: SLOW_INSTANCE_TIMEOUT_MS,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to update league ${leagueId}`);
      this.logger.debug(error);
      return false;
    }
  }
}
