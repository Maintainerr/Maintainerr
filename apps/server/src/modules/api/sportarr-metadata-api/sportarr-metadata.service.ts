import { stripTrailingSlashes } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import axiosRetry from 'axios-retry';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsDataService } from '../../settings/settings-data.service';
import { ExternalApiService } from '../external-api/external-api.service';
import cacheManager from '../lib/cache';
import { isRetryableRateLimit, rateLimitWaitMs } from '../lib/httpRetry';
import {
  SportarrMetadataEpisode,
  SportarrMetadataLeague,
  SportarrMetadataSeason,
} from './interfaces/sportarr-metadata.interface';

export const SPORTARR_NET_URL = 'https://sportarr.net';
const METADATA_PATH = '/api/metadata';

// League artwork changes rarely and every card asks for it. Passed on every
// read because ExternalApiService writes its own 20 minute default when a
// caller omits one, which would override the cache's stdTtl.
const CACHE_TTL_SECONDS = 21600;

type LeagueAnswer = SportarrMetadataLeague & { error?: string };

// Sportarr's metadata agent API, keyed by the league id the Sportarr media
// server agents stamp on a show. A Sportarr instance serves the same routes as
// sportarr.net, but only for the leagues it tracks, so a league is read from
// the first configured connection that knows it, and from sportarr.net
// otherwise while the setting allows.
@Injectable()
export class SportarrMetadataApiService extends ExternalApiService {
  constructor(
    private readonly settings: SettingsDataService,
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SportarrMetadataApiService.name);
    // Every read passes an absolute URL, so each source caches under its own
    // host and one never serves another's answer for the same path.
    super('', {}, logger, {
      nodeCache: cacheManager.getCache('sportarrmetadata').data,
      // The standard transient policy, plus a wait for the 429 Sportarr's
      // rate limiter declares.
      retry: {
        retryCondition: (error) =>
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          isRetryableRateLimit(error),
        retryDelay: (retryCount, error) =>
          rateLimitWaitMs(error) ||
          axiosRetry.exponentialDelay(retryCount, error),
      },
    });
  }

  async getLeague(
    leagueId: string,
  ): Promise<SportarrMetadataLeague | undefined> {
    return (await this.resolveSource(leagueId))?.league;
  }

  async getSeasons(leagueId: string): Promise<SportarrMetadataSeason[]> {
    const source = await this.resolveSource(leagueId);
    if (!source) {
      return [];
    }
    const response = await this.read<{ seasons?: SportarrMetadataSeason[] }>(
      `${this.seriesUrl(source.base, leagueId)}/seasons`,
    );
    return response?.seasons ?? [];
  }

  async getSeasonEpisodes(
    leagueId: string,
    seasonNumber: number,
  ): Promise<SportarrMetadataEpisode[]> {
    const source = await this.resolveSource(leagueId);
    if (!source) {
      return [];
    }
    const response = await this.read<{ episodes?: SportarrMetadataEpisode[] }>(
      `${this.seriesUrl(source.base, leagueId)}/season/${seasonNumber}/episodes`,
    );
    return response?.episodes ?? [];
  }

  /** True when at least one place can be read: a connection, or sportarr.net while allowed. */
  async hasSource(): Promise<boolean> {
    return (await this.sources()).length > 0;
  }

  /**
   * Where to look, in order: every configured Sportarr connection, then
   * sportarr.net unless SPORTARR_NET=off in the environment.
   */
  private async sources(): Promise<string[]> {
    const configured = await this.settings.getSportarrSettings();
    // A failed settings read answers a status object rather than throwing.
    const connections = Array.isArray(configured)
      ? configured
          .map((setting) => setting.url)
          .filter((url): url is string => Boolean(url))
          .map((url) => `${stripTrailingSlashes(url)}${METADATA_PATH}`)
      : [];
    const sources = new Set(connections);
    if (process.env.SPORTARR_NET !== 'off') {
      sources.add(`${SPORTARR_NET_URL}${METADATA_PATH}`);
    }
    return [...sources];
  }

  /**
   * The first source that holds the league, and its record.
   *
   * The sub-routes cannot each pick their own source: a season episode list
   * answers `{ episodes: [] }` for a league the connection does not track,
   * which is indistinguishable from a season that has no events. Only the
   * league route says so unambiguously, so it decides for all three.
   */
  private async resolveSource(
    leagueId: string,
  ): Promise<{ base: string; league: SportarrMetadataLeague } | undefined> {
    for (const base of await this.sources()) {
      const league = await this.read<LeagueAnswer>(
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

  private read<T>(url: string): Promise<T | undefined> {
    return this.get<T>(url, undefined, CACHE_TTL_SECONDS);
  }
}
