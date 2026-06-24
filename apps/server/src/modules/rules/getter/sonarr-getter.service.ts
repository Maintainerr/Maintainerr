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

      const lookupCandidates =
        await this.findLookupCandidatesFromMediaItem(libItem);

      if (lookupCandidates.length === 0) {
        this.logger.warn(
          `Failed to resolve external IDs for '${libItem.title}' (media server ID '${libItem.id}'). As a result, no Sonarr query could be made.`,
        );
        return null;
      }

      const sonarrApiClient = await this.servarrService.getSonarrApiClient(
        ruleGroup.collection.sonarrSettingsId,
      );

      // The series lookup is keyed on the resolved tvdbId and is identical for
      // every episode/season of a show. The API call stays uncached (the
      // cleanup needs post-deletion truth — #2757/#2891), but during rule
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

      const matchedResult = await findMetadataLookupMatch<SonarrSeries | null>(
        lookupCandidates,
        {
          tvdb: (lookupId) => resolveSeries(lookupId),
        },
      );
      const showResponse: SonarrSeries | null | undefined =
        matchedResult?.result;

      if (showResponse === undefined) {
        // The Sonarr lookup itself failed (or every candidate's lookup
        // returned undefined) — could be a transient outage. Fail closed
        // rather than substituting metadata-provider values, which would
        // silently change rule evaluation while Sonarr is down.
        return undefined;
      }

      if (!showResponse?.id) {
        // Sonarr confirmed the series isn't tracked. Fall back to the
        // configured metadata provider for properties whose value doesn't
        // depend on Sonarr's local state.
        const fallback = await this.tryMetadataFallback(
          libItem,
          prop?.name,
          dataType,
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
        | Promise<SonarrEpisodeFile | undefined>
        | undefined;
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
        | Promise<SonarrEpisode[] | undefined>
        | undefined;
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

      let showEpisodesPromise: Promise<SonarrEpisode[] | undefined> | undefined;
      const getShowEpisodes = async (): Promise<
        SonarrEpisode[] | undefined
      > => {
        if (!showResponse.id) {
          return undefined;
        }

        showEpisodesPromise ??= sonarrApiClient.getEpisodes(showResponse.id);

        return showEpisodesPromise;
      };

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
  ): Promise<MetadataLookupCandidate[]> {
    return this.metadataService.resolveLookupCandidatesFromMediaItemForService(
      libItem,
      'sonarr',
    );
  }

  // Sonarr properties whose semantics match cleanly across Sonarr / TMDB /
  // TVDB. Deliberately excluded even though providers expose something
  // similar: `status` (Sonarr lowercase enum vs provider free-form strings),
  // `originalLanguage` (full name vs ISO 639-1 vs ISO 639-2/B), and `rating`
  // (different scales / aggregations). Sonarr-only state (monitored, tags,
  // filePath, diskSize, …) is also absent — providers can't supply it.
  private static readonly METADATA_FALLBACK_SUPPORTED = new Set([
    'ended',
    'firstAirDate',
    'seasons',
  ]);

  private async tryMetadataFallback(
    libItem: MediaItem,
    propName: string | undefined,
    dataType: MediaItemType | undefined,
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

    const ids = await this.metadataService.resolveIdsFromMediaItem(libItem);
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
