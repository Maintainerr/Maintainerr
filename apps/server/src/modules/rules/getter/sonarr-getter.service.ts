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
import { TmdbIdService } from '../../../modules/api/tmdb-api/tmdb-id.service';
import { TmdbApiService } from '../../../modules/api/tmdb-api/tmdb.service';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { IMediaServerService } from '../../api/media-server/media-server.interface';
import { SonarrApi } from '../../api/servarr-api/helpers/sonarr.helper';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { RulesDto } from '../dtos/rules.dto';

@Injectable()
export class SonarrGetterService {
  plexProperties: Property[];

  constructor(
    private readonly servarrService: ServarrService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly tmdbApi: TmdbApiService,
    private readonly tmdbIdHelper: TmdbIdService,
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
        prop?.name === 'diskspace_remaining_mb' ||
        prop?.name === 'diskspace_total_mb'
      ) {
        if (!ruleGroup?.collection?.sonarrSettingsId) {
          this.logger.error(
            `No Sonarr server configured for ${ruleGroup?.collection?.title}`,
          );
          return null;
        }
        const sonarrApiClient = await this.servarrService.getSonarrApiClient(
          ruleGroup.collection.sonarrSettingsId,
        );
        const diskspace = await sonarrApiClient.getDiskspace();
        if (!diskspace || diskspace.length === 0) return null;
        const totalFree = diskspace.reduce(
          (acc, d) => acc + (d.freeSpace ?? 0),
          0,
        );
        const totalSpace = diskspace.reduce(
          (acc, d) => acc + (d.totalSpace ?? 0),
          0,
        );
        return prop.name === 'diskspace_remaining_mb'
          ? Math.round(totalFree / 1048576)
          : Math.round(totalSpace / 1048576);
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

      const tvdbIds = await this.findAllTvdbIdsFromMediaItem(libItem);

      if (!tvdbIds || tvdbIds.length === 0) {
        this.logger.warn(
          `[TVDB] Failed to fetch tvdb id for '${libItem.title}' with id '${libItem.id}. As a result, no Sonarr query could be made.`,
        );
        return null;
      }

      const sonarrApiClient = await this.servarrService.getSonarrApiClient(
        ruleGroup.collection.sonarrSettingsId,
      );

      let showResponse: SonarrSeries | undefined;
      let attemptCount = 0;
      for (const tvdbId of tvdbIds) {
        attemptCount++;
        showResponse = await sonarrApiClient.getSeriesByTvdbId(tvdbId);
        if (showResponse?.id) {
          if (attemptCount > 1) {
            this.logger.debug(
              `[TVDB] Found '${libItem.title}' in Sonarr using TVDB ID ${tvdbId} (attempt ${attemptCount}/${tvdbIds.length}). Consider checking upstream provider data quality.`,
            );
          }
          break;
        }
      }

      if (!showResponse?.id) {
        this.logger.warn(
          `[TVDB] None of the TVDB IDs [${tvdbIds.join(', ')}] for '${libItem.title}' matched a series in Sonarr.`,
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
            .filter((el) => tagIds.includes(el.id))
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
            return season?.statistics?.episodeCount
              ? +season.statistics.episodeCount
              : null;
          } else {
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
          const episodes = await sonarrApiClient.getEpisodes(
            showResponse.id,
            origLibItem.index,
          );

          if (!episodes) {
            return null;
          }

          return episodes.some(
            (el) => el.finaleType === 'season' && el.hasFile,
          );
        }
        case 'seriesFinale': {
          const episodes = await sonarrApiClient.getEpisodes(
            showResponse.id,
            dataType === 'season' ? origLibItem.index : undefined,
          );

          if (!episodes) {
            return null;
          }

          return episodes.some(
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
          ).name;
        }
        case 'fileAudioLanguages': {
          const episodeFile = await getEpisodeFile();
          return episodeFile?.mediaInfo?.audioLanguages ?? null;
        }
        case 'seriesType': {
          return showResponse.seriesType ?? null;
        }
      }
    } catch (e) {
      this.logger.warn(
        `Sonarr-Getter - Action failed for '${libItem.title}' with id '${libItem.id}': ${e.message}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }

  /**
   * Retrieves the last season from the given array of seasons.
   *
   * @param {SonarrSeason[]} seasons - The array of seasons to search through.
   * @param {number} showId - The ID of the show.
   * @return {Promise<SonarrSeason>} The last season found, or undefined if none is found.
   */
  private async getLastAiredOrCurrentlyAiringSeason(
    seasons: SonarrSeason[],
    showId: number,
    apiClient: SonarrApi,
  ): Promise<SonarrSeason> {
    for (const s of seasons.reverse()) {
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

  public async findAllTvdbIdsFromMediaItem(
    libItem: MediaItem,
  ): Promise<number[]> {
    const tvdbIds: number[] = [];

    if (libItem.providerIds?.tvdb) {
      for (const tvdbId of libItem.providerIds.tvdb) {
        const numId = Number(tvdbId);
        if (numId && !tvdbIds.includes(numId)) {
          tvdbIds.push(numId);
        }
      }
    }

    if (tvdbIds.length === 0) {
      const mediaServer = await this.getMediaServer();
      const metadata = await mediaServer.getMetadata(libItem.id);
      if (metadata?.providerIds?.tvdb) {
        for (const tvdbId of metadata.providerIds.tvdb) {
          const numId = Number(tvdbId);
          if (numId && !tvdbIds.includes(numId)) {
            tvdbIds.push(numId);
          }
        }
      }
    }

    // Last resort: try to get TVDB via TMDB
    if (tvdbIds.length === 0) {
      const tmdbResp = await this.tmdbIdHelper.getTmdbIdFromMediaItem(libItem);
      const tmdbId = tmdbResp?.id;
      if (tmdbId) {
        const tmdbShow = await this.tmdbApi.getTvShow({ tvId: tmdbId });
        if (tmdbShow?.external_ids?.tvdb_id) {
          tvdbIds.push(tmdbShow.external_ids.tvdb_id);
        }
      }
    }

    return tvdbIds;
  }
}
