import { stripTrailingSlashes } from '@maintainerr/contracts';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsDataService } from '../../settings/settings-data.service';
import { ExternalApiService } from '../external-api/external-api.service';
import cacheManager from '../lib/cache';
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

// One page of cards walks the sources many times over, and the connection
// list lives in SQLite. Short, so a connection someone just added answers the
// next card rather than the next page.
const SOURCE_LIST_TTL_MS = 5000;

// How long a source that answered nothing at all is left alone. Without it
// every card pays the connect timeout again, so one unreachable source costs
// seconds per league on every page load.
const SOURCE_FAILURE_COOLDOWN_MS = 60000;

type LeagueAnswer = SportarrMetadataLeague & { error?: string };

// Sportarr's metadata agent API, keyed by the league id the Sportarr media
// server agents stamp on a show. A Sportarr instance serves the same routes as
// sportarr.net, but only for the leagues it tracks, so a league is read from
// the first configured connection that knows it, and from sportarr.net for
// one none of them tracks when the environment asks for that.
@Injectable()
export class SportarrMetadataApiService
  extends ExternalApiService
  implements OnModuleInit
{
  private configuredSources?: { sources: string[]; readAt: number };
  private sourceRead?: Promise<string[]>;
  private readonly unreachableUntil = new Map<string, number>();

  constructor(
    private readonly settings: SettingsDataService,
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SportarrMetadataApiService.name);
    // Every read passes an absolute URL, so each source caches under its own
    // host and one never serves another's answer for the same path. The base
    // only applies if a relative read is ever added.
    super(`${SPORTARR_NET_URL}${METADATA_PATH}`, {}, logger, {
      nodeCache: cacheManager.getCache('sportarrmetadata').data,
    });
  }

  // The provider's isAvailable() is synchronous and the connections live in
  // the database, so it reads an answer this keeps current. Seed it here, or
  // the first lookup after a restart sees a provider with nowhere to read.
  async onModuleInit(): Promise<void> {
    await this.sources();
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

  /**
   * Whether anything is configured to read from, asked of the database rather
   * than of what the last lookup saw.
   */
  async hasSource(): Promise<boolean> {
    return (await this.readConfiguredSources()).length > 0;
  }

  /**
   * Whether anything is worth asking right now, for the provider's
   * synchronous isAvailable(). A provider with nowhere to go has to stand
   * down: it claims the alias ids too, and a claim it cannot answer fails the
   * whole resolution, taking ids other providers could still resolve with it.
   *
   * Worked out from what the class already holds rather than remembered from
   * the last walk. Standing down stops the walks, so a remembered answer
   * would have no way back once every source had been slow once.
   */
  hasReachableSource(): boolean {
    const now = Date.now();
    const cached = this.configuredSources;

    // Standing down stops the walks, and the walks are what refresh this
    // list, so an install that boots with nothing configured would stay shut
    // until a restart. Read again, out of band, whenever what we hold is
    // empty or old. The answer below is still the one we hold; the next call
    // sees the new list.
    if (
      !cached ||
      cached.sources.length === 0 ||
      now - cached.readAt >= SOURCE_LIST_TTL_MS
    ) {
      void this.refreshConfiguredSources();
    }

    return (cached?.sources ?? []).some(
      (source) => (this.unreachableUntil.get(source) ?? 0) <= now,
    );
  }

  /** One read at a time, however many callers ask while it is in flight. */
  private refreshConfiguredSources(): Promise<string[]> {
    this.sourceRead ??= this.readConfiguredSources().finally(() => {
      this.sourceRead = undefined;
    });
    return this.sourceRead;
  }

  /** Every source worth asking right now, in order. */
  private async sources(): Promise<string[]> {
    const cached = this.configuredSources;
    const configured =
      cached && Date.now() - cached.readAt < SOURCE_LIST_TTL_MS
        ? cached.sources
        : await this.refreshConfiguredSources();

    const now = Date.now();
    return configured.filter(
      (source) => (this.unreachableUntil.get(source) ?? 0) <= now,
    );
  }

  /**
   * The configured places, in order: every Sportarr connection, then
   * sportarr.net only when SPORTARR_NET=on says so. Off by default, so an
   * install that has never heard of Sportarr never calls it.
   */
  private async readConfiguredSources(): Promise<string[]> {
    const configured = await this.settings.getSportarrSettings();
    // A failed settings read answers a status object rather than throwing.
    const connections = Array.isArray(configured)
      ? configured
          .map((setting) => setting.url)
          .filter((url): url is string => Boolean(url))
          .map((url) => `${stripTrailingSlashes(url)}${METADATA_PATH}`)
      : [];
    const sources = new Set(connections);
    if (process.env.SPORTARR_NET === 'on') {
      sources.add(`${SPORTARR_NET_URL}${METADATA_PATH}`);
    }

    this.configuredSources = { sources: [...sources], readAt: Date.now() };
    return this.configuredSources.sources;
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

      if (league === undefined) {
        // Nothing came back at all, so the source is down rather than short of
        // this one league.
        this.unreachableUntil.set(
          base,
          Date.now() + SOURCE_FAILURE_COOLDOWN_MS,
        );
        continue;
      }

      // A source answers 200 with an error field for a league it lacks.
      if (!league.error) {
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
