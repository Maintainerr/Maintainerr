import { stripTrailingSlashes } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsDataService } from '../../settings/settings-data.service';
import { ExternalApiService } from '../external-api/external-api.service';
import cacheManager from '../lib/cache';
import {
  SportarrHubEpisode,
  SportarrHubEpisodesResponse,
  SportarrHubLeague,
  SportarrHubSeason,
  SportarrHubSeasonsResponse,
} from './interfaces/sportarr-hub.interface';

// sportarr.net, which Sportarr itself calls the hub. A Sportarr install polls
// it and re-serves the same /api/metadata/agents routes from its own database,
// so this is the source of last resort rather than the only one.
const SPORTARR_HUB_URL = 'https://sportarr.net';
const METADATA_PATH = '/api/metadata';

// A league's artwork and description change rarely and every card asks for
// them. Passed explicitly because ExternalApiService writes its own 20 minute
// default when a caller omits one, which would override the cache's stdTtl.
const METADATA_TTL_SECONDS = 21600; // 6 hours

// The public agent API, the same one the Sportarr media server agents read,
// keyed by the league id they stamp on a show. No API key on either source.
@Injectable()
export class SportarrHubApiService extends ExternalApiService {
  constructor(
    private readonly settings: SettingsDataService,
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SportarrHubApiService.name);
    // Every read passes an absolute URL, so this base only ever applies if one
    // is ever added that does not.
    super(`${SPORTARR_HUB_URL}${METADATA_PATH}`, {}, logger, {
      nodeCache: cacheManager.getCache('sportarrhub').data,
    });
  }

  async getLeague(leagueId: string): Promise<SportarrHubLeague | undefined> {
    return (await this.resolveSource(leagueId))?.league;
  }

  async getSeasons(leagueId: string): Promise<SportarrHubSeason[]> {
    const source = await this.resolveSource(leagueId);
    if (!source) {
      return [];
    }
    const response = await this.read<SportarrHubSeasonsResponse>(
      `${this.seriesUrl(source.base, leagueId)}/seasons`,
    );
    return response?.seasons ?? [];
  }

  async getSeasonEpisodes(
    leagueId: string,
    seasonNumber: number,
  ): Promise<SportarrHubEpisode[]> {
    const source = await this.resolveSource(leagueId);
    if (!source) {
      return [];
    }
    const response = await this.read<SportarrHubEpisodesResponse>(
      `${this.seriesUrl(source.base, leagueId)}/season/${seasonNumber}/episodes`,
    );
    return response?.episodes ?? [];
  }

  /**
   * Where to look, in order.
   *
   * A configured Sportarr instance is preferred: it syncs the hub and mirrors
   * the same agent routes from its own database, so the lookup stays on the
   * user's own network and costs no third-party request. It only holds the
   * leagues it monitors, though, so the hub stays as the fallback for a league
   * it does not have and for an agent-only setup with no instance at all.
   */
  private async metadataSources(): Promise<string[]> {
    const configured = await this.settings.getSportarrSettings();
    // A failed settings read answers a status object rather than throwing.
    const instances = Array.isArray(configured)
      ? configured
          .map((setting) => setting.url)
          .filter((url): url is string => Boolean(url))
          .map((url) => `${stripTrailingSlashes(url)}${METADATA_PATH}`)
      : [];

    return [...new Set([...instances, `${SPORTARR_HUB_URL}${METADATA_PATH}`])];
  }

  /**
   * The first source that holds the league, and its record.
   *
   * The sub-routes cannot each pick their own source: a season episode list
   * answers `{ episodes: [] }` for a league the instance does not monitor,
   * which is indistinguishable from a season that has no events. Only the
   * league route says so unambiguously, so it decides for all three.
   */
  private async resolveSource(
    leagueId: string,
  ): Promise<{ base: string; league: SportarrHubLeague } | undefined> {
    for (const base of await this.metadataSources()) {
      const league = await this.read<SportarrHubLeague & { error?: string }>(
        this.seriesUrl(base, leagueId),
      );
      // Both sources answer 200 with an error field for a league they lack.
      if (league && !league.error) {
        return { base, league };
      }
    }
    return undefined;
  }

  private seriesUrl(base: string, leagueId: string): string {
    return `${base}/agents/series/${encodeURIComponent(leagueId)}`;
  }

  // Absolute, so each source caches under its own host and one never serves
  // another's answer for the same path.
  private read<T>(url: string): Promise<T> {
    return this.get<T>(url, undefined, METADATA_TTL_SECONDS);
  }
}
