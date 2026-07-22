import { MediaItem, MediaItemType } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import _ from 'lodash';
import {
  SonarrEpisode,
  SonarrEpisodeFile,
  SonarrSeason,
  SonarrSeries,
} from '../../../modules/api/servarr-api/interfaces/sonarr.interface';
import { ServarrService } from '../../../modules/api/servarr-api/servarr.service';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { IMediaServerService } from '../../api/media-server/media-server.interface';
import { SonarrApi } from '../../api/servarr-api/helpers/sonarr.helper';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  findMetadataLookupMatch,
  formatMetadataLookupCandidates,
  MetadataLookupCandidate,
} from '../../metadata/metadata-lookup.util';
import { MetadataService } from '../../metadata/metadata.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { RuleDto } from '../dtos/rule.dto';
import { RulesDto } from '../dtos/rules.dto';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';
import { evaluateArrDiskspaceGiB } from '../helpers/diskspace.utils';

@Injectable()
export class SonarrGetterService {
  plexProperties: Property[];

  constructor(
    private readonly servarrService: ServarrService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly metadataService: MetadataService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SonarrGetterService.name);
    const ruleConstanst = new RuleConstants();
    this.plexProperties = ruleConstanst.applications.find(
      (el) => el.id === Application.SONARR,
    ).props;
  }

  private async getMediaServer(): Promise<IMediaServerService> {
    return this.mediaServerFactory.getService();
  }

  async get(
    id: number,
    libItem: MediaItem,
    dataType?: MediaItemType,
    ruleGroup?: RulesDto,
    rule?: RuleDto,
    arrLookupCache?: ArrLookupCache,
  ) {
    if (!ruleGroup.collection?.sonarrSettingsId) {
      this.logger.error(
        `No Sonarr server configured for ${ruleGroup.collection?.title}`,
      );
      return null;
    }

    try {
      const prop = this.plexProperties.find((el) => el.id === id);

      // ARR diskspace check doesn't require a show lookup - handle early
      if (
        prop?.name === 'diskspace_remaining_gb' ||
        prop?.name === 'diskspace_total_gb'
      ) {
        const sonarrApiClient = await this.servarrService.getSonarrApiClient(
          ruleGroup.collection.sonarrSettingsId,
        );
        return await evaluateArrDiskspaceGiB(
          sonarrApiClient,
          prop.name,
          rule,
          'Sonarr',
          this.logger.warn.bind(this.logger),
        );
      }

      let origLibItem: MediaItem = undefined;
      let seasonRatingKey: number | undefined = undefined;

      if (dataType === 'season' || dataType === 'episode') {
        origLibItem = _.cloneDeep(libItem);
        seasonRatingKey = libItem.grandparentId
          ? libItem.parentIndex
          : libItem.index;

        // get (grand)parent
        const mediaServer = await this.getMediaServer();
        libItem = await mediaServer.getMetadata(
          libItem.grandparentId ? libItem.grandparentId : libItem.parentId,
        );
      }

      const lookupCandidates = await this.findLookupCandidatesFromMediaItem(
        libItem,
        arrLookupCache,
      );

      const sonarrApiClient = await this.servarrService.getSonarrApiClient(
        ruleGroup.collection.sonarrSettingsId,
      );

      // The series lookup is keyed on the resolved tvdbId and is identical for
      // every episode/season of a show. The API call stays uncached (the
      // cleanup needs post-deletion truth - #2757/#2891), but during rule
      // evaluation we dedupe it through the run-scoped memo, which is gone
      // before any deletion runs. Evict on a failed (undefined) lookup so a
      // transient error doesn't mark the whole series unresolved for the run.
      const settingsId = ruleGroup.collection.sonarrSettingsId;
      const resolveSeries = (lookupId: number) =>
        arrLookupCache
          ? arrLookupCache.memoize(
              `sonarr:${settingsId}:series:${lookupId}`,
              () => sonarrApiClient.getSeriesByTvdbId(lookupId),
              (series) => series === undefined,
            )
          : sonarrApiClient.getSeriesByTvdbId(lookupId);

      // Exact-title fallback for items whose external IDs resolve to nothing
      // (custom-agent libraries emit no usable Guids). Memoized per show like
      // resolveSeries so season/episode fan-out doesn't repeat the lookup.
      const titleKey = libItem.title?.trim().toLowerCase();
      const resolveSeriesByTitle = () =>
        arrLookupCache
          ? arrLookupCache.memoize(
              `sonarr:${settingsId}:series-title:${titleKey}`,
              () => sonarrApiClient.getTrackedSeriesByExactTitle(libItem.title),
              (series) => series === undefined,
            )
          : sonarrApiClient.getTrackedSeriesByExactTitle(libItem.title);

      let showResponse: SonarrSeries | null | undefined;

      if (lookupCandidates.length === 0) {
        // No external IDs at all. Fall back to an unambiguous exact-title
        // match against the instance's own library before giving up, with
        // the same fail-closed semantics as the id path.
        showResponse = await resolveSeriesByTitle();

        if (showResponse === undefined) {
          return undefined;
        }

        if (!showResponse?.id) {
          this.logger.warn(
            `Failed to resolve external IDs for '${libItem.title}' (media server ID '${libItem.id}'), and no unambiguous exact-title match was tracked in Sonarr. As a result, no Sonarr query could be made.`,
          );
          return null;
        }

        this.logger.debug(
          `Sonarr-Getter - resolved '${libItem.title}' via exact-title fallback (no external IDs were available).`,
        );
      } else {
        const matchedResult =
          await findMetadataLookupMatch<SonarrSeries | null>(lookupCandidates, {
            tvdb: (lookupId) => resolveSeries(lookupId),
          });
        showResponse = matchedResult?.result;
      }

      if (showResponse === undefined) {
        // The Sonarr lookup itself failed (or every candidate's lookup
        // returned undefined) - could be a transient outage. Fail closed
        // rather than substituting metadata-provider values, which would
        // silently change rule evaluation while Sonarr is down.
        return undefined;
      }

      if (!showResponse?.id) {
        // The resolved IDs matched no tracked series. Try the exact-title
        // fallback before the metadata-provider fallback so Sonarr-local
        // truth wins when the series is tracked under different IDs.
        const titleMatch = await resolveSeriesByTitle();
        if (titleMatch?.id) {
          this.logger.debug(
            `Sonarr-Getter - resolved '${libItem.title}' via exact-title fallback (external IDs matched no tracked series).`,
          );
          showResponse = titleMatch;
        }
      }

      if (!showResponse?.id) {
        // Sonarr confirmed the series isn't tracked. Fall back to the
        // configured metadata provider for properties whose value doesn't
        // depend on Sonarr's local state.
        const fallback = await this.tryMetadataFallback(
          libItem,
          prop?.name,
          dataType,
          arrLookupCache,
        );
        if (fallback.handled) {
          this.logger.debug(
            `Sonarr-Getter - '${libItem.title}' not in Sonarr; serving '${prop?.name}' from metadata provider. Is the series intentionally absent from Sonarr?`,
          );
          return fallback.value;
        }

        const attemptedIds = formatMetadataLookupCandidates(lookupCandidates);

        this.logger.warn(
          `None of the resolved external IDs [${attemptedIds}] for '${libItem.title}' matched a series in Sonarr. Is the series tracked in Sonarr?`,
        );
        return null;
      }

      const season = seasonRatingKey
        ? showResponse.seasons.find((el) => el.seasonNumber === seasonRatingKey)
        : undefined;

      // Lazy-load episode / episodeFile only if a property actually needs them.
      let episodePromise: Promise<SonarrEpisode | undefined> | undefined;
      const getEpisode = async (): Promise<SonarrEpisode | undefined> => {
        if (dataType !== 'season' && dataType !== 'episode') {
          return undefined;
        }

        if (showResponse.added === '0001-01-01T00:00:00Z') {
          return undefined;
        }

        if (!showResponse.id || !origLibItem) {
          return undefined;
        }

        episodePromise ??= (async () => {
          const seasonNumber = origLibItem.grandparentId
            ? origLibItem.parentIndex
            : origLibItem.index;

          const episodeNumbers = [
            origLibItem.grandparentId ? origLibItem.index : 1,
          ];

          const episodes = await sonarrApiClient.getEpisodes(
            showResponse.id,
            seasonNumber,
            episodeNumbers,
          );

          return episodes?.[0];
        })();

        return episodePromise;
      };

      let episodeFilePromise:
        Promise<SonarrEpisodeFile | undefined> | undefined;
      const getEpisodeFile = async (): Promise<
        SonarrEpisodeFile | undefined
      > => {
        if (dataType !== 'episode') {
          return undefined;
        }

        const episode = await getEpisode();
        if (!episode?.episodeFileId) {
          return undefined;
        }

        episodeFilePromise ??= sonarrApiClient.getEpisodeFile(
          episode.episodeFileId,
        );

        return episodeFilePromise;
      };

      let seasonEpisodesPromise:
        Promise<SonarrEpisode[] | undefined> | undefined;
      const getSeasonEpisodes = async (): Promise<
        SonarrEpisode[] | undefined
      > => {
        if (dataType !== 'season' && dataType !== 'episode') {
          return undefined;
        }

        if (showResponse.added === '0001-01-01T00:00:00Z') {
          return undefined;
        }

        if (!showResponse.id || !origLibItem) {
          return undefined;
        }

        seasonEpisodesPromise ??= sonarrApiClient.getEpisodes(
          showResponse.id,
          origLibItem.grandparentId
            ? origLibItem.parentIndex
            : origLibItem.index,
        );

        return seasonEpisodesPromise;
      };

      // Run-scoped cache for the full series episode list: one fetch per
      // show per rule-run (single-`get()` memo without the cache). Evicts on
      // transient `undefined` so one failed fetch doesn't poison the run
      // (matches `resolveSeries` above).
      let showEpisodesPromise: Promise<SonarrEpisode[] | undefined> | undefined;
      const getShowEpisodes = async (): Promise<
        SonarrEpisode[] | undefined
      > => {
        if (!showResponse.id) {
          return undefined;
        }

        showEpisodesPromise ??= arrLookupCache
          ? arrLookupCache.memoize(
              `sonarr:${settingsId}:episodes-all:${showResponse.id}`,
              () => sonarrApiClient.getEpisodes(showResponse.id),
              (episodes) => episodes === undefined,
            )
          : sonarrApiClient.getEpisodes(showResponse.id);

        return showEpisodesPromise;
      };

      // Rank maps for episodeFileRank / seasonFileRank. Identical for every
      // item of the show within a run, so cache them - otherwise a long
      // daily series re-sorts the pool once per item. The air-date cutoff is
      // captured by the first build per show, so every item of the show
      // ranks against one consistent cutoff within a run. The airDate map
      // backs the daily-series fallback (Plex items with a date but no
      // episode number); the season map ranks seasons by their newest
      // downloaded episode.
      const buildRankMaps = async (): Promise<
        | {
            rankByEpisode: Map<string, number>;
            rankByAirDate: Map<string, number>;
            rankBySeason: Map<number, number>;
          }
        | undefined
      > => {
        const episodes = await getShowEpisodes();
        if (episodes === undefined) {
          return undefined;
        }

        const nowMs = Date.now();
        const pool = episodes
          .map((e) => {
            // Sonarr emits `'0001-01-01T00:00:00Z'` as the .NET null-date
            // sentinel (see the `showResponse.added` checks above). It
            // parses to a finite very-negative ms and would otherwise sneak
            // into the pool with a bogus year-1 air date.
            const airMs =
              e.airDateUtc && e.airDateUtc !== '0001-01-01T00:00:00Z'
                ? new Date(e.airDateUtc).getTime()
                : NaN;
            return {
              seasonNumber: e.seasonNumber,
              episodeNumber: e.episodeNumber,
              hasFile: e.hasFile,
              airMs,
              // Sonarr ships `airDate` as the broadcast-day in the show's local
              // calendar (YYYY-MM-DD). Plex's `originallyAvailableAt` parses to the
              // same calendar date via ISO date-only semantics, so keying on the
              // string aligns both sides without UTC-day math (which would slip a
              // day for any primetime broadcast outside UTC).
              airDayKey:
                e.airDate && e.airDate !== '0001-01-01' ? e.airDate : null,
            };
          })
          .filter(
            (e) =>
              e.hasFile === true &&
              e.seasonNumber > 0 &&
              Number.isFinite(e.airMs) &&
              e.airMs <= nowMs,
          );

        pool.sort((a, b) => {
          if (a.airMs !== b.airMs) return b.airMs - a.airMs;
          if (b.seasonNumber !== a.seasonNumber) {
            return b.seasonNumber - a.seasonNumber;
          }
          return b.episodeNumber - a.episodeNumber;
        });

        const rankByEpisode = new Map<string, number>();
        const rankByAirDate = new Map<string, number>();
        const rankBySeason = new Map<number, number>();
        for (let i = 0; i < pool.length; i++) {
          const e = pool[i];
          const rank = i + 1;
          rankByEpisode.set(`${e.seasonNumber}:${e.episodeNumber}`, rank);
          // First-wins on same-day collisions: the newer episode of a
          // same-day double already holds the slot, which is the
          // conservative (keep) outcome when a daily-series Plex item
          // carries only the date.
          if (e.airDayKey !== null && !rankByAirDate.has(e.airDayKey)) {
            rankByAirDate.set(e.airDayKey, rank);
          }
          // Seasons rank in order of first appearance in the newest-first
          // pool, i.e. by the air date of their newest downloaded episode.
          if (!rankBySeason.has(e.seasonNumber)) {
            rankBySeason.set(e.seasonNumber, rankBySeason.size + 1);
          }
        }
        return { rankByEpisode, rankByAirDate, rankBySeason };
      };

      const getRankMaps = () =>
        arrLookupCache
          ? arrLookupCache.memoize(
              `sonarr:${settingsId}:rank-maps:${showResponse.id}`,
              buildRankMaps,
              (maps) => maps === undefined,
            )
          : buildRankMaps();

      switch (prop.name) {
        case 'addDate': {
          return showResponse.added &&
            showResponse.added !== '0001-01-01T00:00:00Z'
            ? new Date(showResponse.added)
            : null;
        }
        case 'diskSizeEntireShow': {
          if (dataType === 'season' || dataType === 'episode') {
            if (dataType === 'episode') {
              const episodeFile = await getEpisodeFile();
              return episodeFile?.size ? +episodeFile.size / 1048576 : null;
            } else {
              return season?.statistics?.sizeOnDisk
                ? +season.statistics.sizeOnDisk / 1048576
                : null;
            }
          } else {
            return showResponse.statistics?.sizeOnDisk
              ? +showResponse.statistics.sizeOnDisk / 1048576
              : null;
          }
        }
        case 'filePath': {
          return showResponse.path ? showResponse.path : null;
        }
        case 'episodeFilePath': {
          const episodeFile = await getEpisodeFile();
          return episodeFile?.path ? episodeFile.path : null;
        }
        case 'episodeNumber': {
          const episode = await getEpisode();
          return episode?.episodeNumber != null ? episode.episodeNumber : null;
        }
        case 'tags': {
          const tagIds = showResponse.tags;
          return (await sonarrApiClient.getTags())
            ?.filter((el) => tagIds.includes(el.id))
            .map((el) => el.label);
        }
        case 'seriesTitle': {
          return showResponse.title ?? null;
        }
        case 'seriesId': {
          return showResponse.id;
        }
        case 'qualityProfileId': {
          const episodeFile = await getEpisodeFile();
          if (dataType === 'episode' && episodeFile) {
            return episodeFile.quality.quality.id;
          } else {
            return showResponse.qualityProfileId;
          }
        }
        case 'firstAirDate': {
          if (dataType === 'season' || dataType === 'episode') {
            const episode = await getEpisode();
            return episode?.airDate ? new Date(episode.airDate) : null;
          } else {
            return showResponse.firstAired
              ? new Date(showResponse.firstAired)
              : null;
          }
        }
        case 'seasons': {
          if (dataType === 'season' || dataType === 'episode') {
            return season?.statistics?.totalEpisodeCount
              ? +season.statistics.totalEpisodeCount
              : null;
          } else {
            return showResponse.statistics?.seasonCount
              ? +showResponse.statistics.seasonCount
              : null;
          }
        }
        case 'status': {
          return showResponse.status ? showResponse.status : null;
        }
        case 'ended': {
          return showResponse.ended !== undefined
            ? showResponse.ended
              ? 1
              : 0
            : null;
        }
        case 'monitored': {
          if (dataType === 'season') {
            return showResponse.added !== '0001-01-01T00:00:00Z' && season
              ? season.monitored
                ? 1
                : 0
              : null;
          }

          if (dataType === 'episode') {
            const episode = await getEpisode();
            return showResponse.added !== '0001-01-01T00:00:00Z' && episode
              ? episode.monitored
                ? 1
                : 0
              : null;
          }

          return showResponse.added !== '0001-01-01T00:00:00Z'
            ? showResponse.monitored
              ? 1
              : 0
            : null;
        }
        case 'unaired_episodes': {
          // returns true if a season with unaired episodes is found in monitored seasons
          const data: SonarrSeason[] = [];
          if (dataType === 'season') {
            data.push(season);
          } else {
            data.push(...showResponse.seasons.filter((el) => el.monitored));
          }
          return (
            data.filter((el) => el.statistics?.nextAiring !== undefined)
              .length > 0
          );
        }
        case 'unaired_episodes_season': {
          // returns true if the season of an episode has unaired episodes
          return season?.statistics
            ? season.statistics.nextAiring !== undefined
            : false;
        }
        case 'seasons_monitored': {
          // returns the number of monitored seasons / episodes
          if (dataType === 'season' || dataType === 'episode') {
            return (
              (await getSeasonEpisodes())?.filter(
                (episode) => episode.monitored,
              ).length ?? null
            );
          } else {
            // Show rules intentionally keep the legacy season-count unit; season/episode rules count monitored episodes.
            return showResponse.seasons.filter((el) => el.monitored).length;
          }
        }
        case 'part_of_latest_season': {
          // returns the true when this is the latest season or the episode is part of the latest season
          if (dataType === 'season' || dataType === 'episode') {
            return season.seasonNumber && showResponse.seasons
              ? +season.seasonNumber ===
                  (
                    await this.getLastAiredOrCurrentlyAiringSeason(
                      showResponse.seasons,
                      showResponse.id,
                      sonarrApiClient,
                    )
                  )?.seasonNumber
              : false;
          }
        }
        case 'originalLanguage': {
          return showResponse.originalLanguage?.name
            ? showResponse.originalLanguage.name
            : null;
        }
        case 'seasonFinale': {
          return (await getSeasonEpisodes())?.some(
            (el) => el.finaleType === 'season' && el.hasFile,
          );
        }
        case 'seriesFinale': {
          const episodes =
            dataType === 'season'
              ? await getSeasonEpisodes()
              : await getShowEpisodes();

          return episodes?.some(
            (el) => el.finaleType === 'series' && el.hasFile,
          );
        }
        case 'seasonNumber': {
          return season.seasonNumber;
        }
        case 'rating': {
          return showResponse.ratings?.value ?? null;
        }
        case 'ratingVotes': {
          return showResponse.ratings?.votes ?? null;
        }
        case 'fileQualityCutoffMet': {
          const episodeFile = await getEpisodeFile();
          return episodeFile?.qualityCutoffNotMet != null
            ? !episodeFile.qualityCutoffNotMet
            : false;
        }
        case 'fileQualityName': {
          const episodeFile = await getEpisodeFile();
          return episodeFile?.quality?.quality?.name ?? null;
        }
        case 'qualityProfileName': {
          const showProfile = showResponse.qualityProfileId;

          return (await sonarrApiClient.getProfiles())?.find(
            (el) => el.id === showProfile,
          )?.name;
        }
        case 'fileAudioLanguages': {
          const episodeFile = await getEpisodeFile();
          return episodeFile?.mediaInfo?.audioLanguages ?? null;
        }
        case 'seriesType': {
          return showResponse.seriesType ?? null;
        }
        case 'missing_episodes_season': {
          return season?.statistics
            ? season.statistics.episodeCount -
                season.statistics.episodeFileCount
            : null;
        }
        case 'missing_episodes_show': {
          return showResponse.statistics
            ? showResponse.statistics.episodeCount -
                showResponse.statistics.episodeFileCount
            : null;
        }
        case 'seasonFileRank': {
          // Rank a season within its show by the air date of its newest
          // downloaded episode (newest season = 1). Seasons without any
          // downloaded episode take no rank slot; specials (S00) are
          // excluded. Out-of-pool seasons get rank `null` so the comparator
          // stays fail-closed. Pair with a scope filter (`Sonarr.seriesId`)
          // to avoid library-wide application.
          if (dataType !== 'season') {
            return null;
          }

          const rankMaps = await getRankMaps();
          if (rankMaps === undefined) {
            return undefined;
          }

          return rankMaps.rankBySeason.get(seasonRatingKey) ?? null;
        }
        case 'episodeFileRank': {
          // Rank an episode within its show by air date (newest = 1) among
          // the episodes currently on disk. Pool requires `hasFile === true`
          // and excludes specials (S00), unaired, and null-airDate episodes;
          // out-of-pool episodes get rank `null` so the comparator stays
          // fail-closed. Pair with a scope filter (`Sonarr.tags` or
          // `Sonarr.seriesTitle`) to avoid library-wide application.
          if (dataType !== 'episode' || !origLibItem) {
            return null;
          }

          const rankMaps = await getRankMaps();
          if (rankMaps === undefined) {
            return undefined;
          }
          const { rankByEpisode, rankByAirDate } = rankMaps;
          if (rankByEpisode.size === 0) {
            return null;
          }

          const targetSeasonNumber = origLibItem.grandparentId
            ? origLibItem.parentIndex
            : origLibItem.index;
          const targetEpisodeNumber = origLibItem.grandparentId
            ? origLibItem.index
            : 1;

          const directRank = rankByEpisode.get(
            `${targetSeasonNumber}:${targetEpisodeNumber}`,
          );
          if (directRank !== undefined) {
            return directRank;
          }

          // Daily-series fallback: Plex episodes for daily-air shows carry
          // `parentIndex = <year>` but no `index`, so the season:episode
          // lookup misses. Sonarr identifies these episodes by air date, so
          // when there's no episode number to key by, fall back to the
          // airDate map. `originallyAvailableAt` is mapped to a Date by the
          // Plex/Jellyfin/Emby adapters; an invalid Date or the .NET null
          // sentinel returns null (fail-closed).
          if (targetEpisodeNumber === undefined) {
            const target = origLibItem.originallyAvailableAt;
            if (!(target instanceof Date)) {
              return null;
            }
            const targetMs = target.getTime();
            if (!Number.isFinite(targetMs)) {
              return null;
            }
            // Reject the .NET null sentinel symmetrically with the pool side.
            if (target.toISOString() === '0001-01-01T00:00:00.000Z') {
              return null;
            }
            // ISO date-only parsing of Plex/Jellyfin/Emby `originallyAvailableAt`
            // lands the Date at UTC-midnight of the broadcast date, so the leading
            // 10 chars are the broadcast-day YYYY-MM-DD - matching Sonarr's
            // `airDate` shape exactly.
            const targetDayKey = target.toISOString().slice(0, 10);
            return rankByAirDate.get(targetDayKey) ?? null;
          }

          return null;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Sonarr-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
      );
      this.logger.debug(
        `Sonarr-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Retrieves the last season from the given array of seasons.
   *
   * @param {SonarrSeason[]} seasons - The array of seasons to search through.
   * @param {number} showId - The ID of the show.
   * @return {Promise<SonarrSeason | undefined>} The last season found, or undefined if none is found.
   */
  private async getLastAiredOrCurrentlyAiringSeason(
    seasons: SonarrSeason[],
    showId: number,
    apiClient: SonarrApi,
  ): Promise<SonarrSeason | undefined> {
    // `seasons` belongs to the run-shared memoized series; reversing in place
    // corrupts season order for the show's other (concurrently evaluated)
    // seasons (#3153). Reverse a copy.
    for (const s of [...seasons].reverse()) {
      const epResp = await apiClient.getEpisodes(showId, s.seasonNumber, [1]);

      if (epResp[0]?.airDateUtc === undefined) {
        continue;
      }

      const airDate = new Date(epResp[0].airDateUtc);
      const now = new Date();

      if (airDate > now) {
        continue;
      }

      return s;
    }

    return undefined;
  }

  public async findLookupCandidatesFromMediaItem(
    libItem: MediaItem,
    arrLookupCache?: ArrLookupCache,
  ): Promise<MetadataLookupCandidate[]> {
    // Candidate resolution (media-server ids -> validated provider ids) is
    // identical for an item across every condition in a run, yet ran once per
    // condition - redundant CPU, response cloning and duplicate logs (#3285).
    // Dedupe it through the same run-scoped memo the arr identity lookup uses.
    // libItem here is already the parent show (season/episode items are resolved
    // up to it above), so the key collapses every season/episode of a show onto
    // one entry. Evict an empty result so a transient metadata-provider failure
    // retries next condition instead of sticking (mirrors resolveSeries's
    // evict-on-failure and keeps the #3125 fail-closed behaviour).
    const resolve = () =>
      this.metadataService.resolveLookupCandidatesFromMediaItemForService(
        libItem,
        'sonarr',
      );

    return arrLookupCache
      ? arrLookupCache.memoize(
          `metadata:sonarr:${libItem.id}`,
          resolve,
          (candidates) => candidates.length === 0,
        )
      : resolve();
  }

  // Sonarr properties whose semantics match cleanly across Sonarr / TMDB /
  // TVDB. Deliberately excluded even though providers expose something
  // similar: `status` (Sonarr lowercase enum vs provider free-form strings),
  // `originalLanguage` (full name vs ISO 639-1 vs ISO 639-2/B), and `rating`
  // (different scales / aggregations). Sonarr-only state (monitored, tags,
  // filePath, diskSize, …) is also absent - providers can't supply it.
  private static readonly METADATA_FALLBACK_SUPPORTED = new Set([
    'ended',
    'firstAirDate',
    'seasons',
  ]);

  private async tryMetadataFallback(
    libItem: MediaItem,
    propName: string | undefined,
    dataType: MediaItemType | undefined,
    arrLookupCache?: ArrLookupCache,
  ): Promise<
    { handled: false } | { handled: true; value: number | string | Date | null }
  > {
    if (
      !propName ||
      !SonarrGetterService.METADATA_FALLBACK_SUPPORTED.has(propName)
    ) {
      return { handled: false };
    }

    // At season/episode scope these properties mean episode-specific values
    // that a show-level provider record can't supply.
    if (
      (propName === 'firstAirDate' || propName === 'seasons') &&
      (dataType === 'season' || dataType === 'episode')
    ) {
      return { handled: false };
    }

    // Same per-condition redundancy as findLookupCandidatesFromMediaItem
    // (#3285): dedupe this resolution through the run-scoped memo. A DISTINCT key
    // from the candidate memo - this fallback resolves under the default
    // (all-provider) policy, not the Sonarr {tvdb} policy, so it can produce a
    // different result for the same show id. Evict an unresolved / non-tv result
    // so a transient metadata-provider failure retries next condition.
    const resolveTvIds = () =>
      this.metadataService.resolveIdsFromMediaItem(libItem);
    const ids = await (arrLookupCache
      ? arrLookupCache.memoize(
          `metadata:sonarr:details:${libItem.id}`,
          resolveTvIds,
          (resolved) => !resolved || resolved.type !== 'tv',
        )
      : resolveTvIds());
    if (!ids || ids.type !== 'tv') {
      return { handled: false };
    }

    // Merge across every configured provider so a partial primary record
    // doesn't mask a field a secondary could supply.
    const details = await this.metadataService.getDetails(ids, 'tv', {
      merge: true,
    });
    if (!details) {
      return { handled: false };
    }

    switch (propName) {
      case 'ended':
        return {
          handled: true,
          value: details.ended === undefined ? null : details.ended ? 1 : 0,
        };
      case 'firstAirDate':
        return {
          handled: true,
          value: details.firstAirDate ? new Date(details.firstAirDate) : null,
        };
      case 'seasons':
        // Match the existing Sonarr-path truthiness check (0 → null).
        return {
          handled: true,
          value: details.seasonCount ? details.seasonCount : null,
        };
    }

    return { handled: false };
  }
}
