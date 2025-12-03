import { Injectable } from '@nestjs/common';
import _ from 'lodash';
import { PlexLibraryItem } from '../../../modules/api/plex-api/interfaces/library.interfaces';
import { PlexMetadata } from '../../../modules/api/plex-api/interfaces/media.interface';
import { SonarrSeason } from '../../../modules/api/servarr-api/interfaces/sonarr.interface';
import { ServarrService } from '../../../modules/api/servarr-api/servarr.service';
import { TmdbIdService } from '../../../modules/api/tmdb-api/tmdb-id.service';
import { TmdbApiService } from '../../../modules/api/tmdb-api/tmdb.service';
import { EPlexDataType } from '../../api/plex-api/enums/plex-data-type-enum';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
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
    private readonly plexApi: PlexApiService,
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
  async get(
    id: number,
    libItem: PlexLibraryItem,
    dataType?: EPlexDataType,
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
      let origLibItem: PlexLibraryItem = undefined;
      let seasonRatingKey: number | undefined = undefined;

      if (
        dataType === EPlexDataType.SEASONS ||
        dataType === EPlexDataType.EPISODES
      ) {
        origLibItem = _.cloneDeep(libItem);
        seasonRatingKey = libItem.grandparentRatingKey
          ? libItem.parentIndex
          : libItem.index;

        // get (grand)parent
        libItem = (await this.plexApi.getMetadata(
          libItem.grandparentRatingKey
            ? libItem.grandparentRatingKey
            : libItem.parentRatingKey,
        )) as unknown as PlexLibraryItem;
      }

      const tvdbId = await this.findTvdbidFromPlexLibItem(libItem);

      if (!tvdbId) {
        this.logger.warn(
          `[TVDB] Failed to fetch tvdb id for '${libItem.title}' with id '${libItem.ratingKey}. As a result, no Sonarr query could be made.`,
        );
        return null;
      }

      const sonarrApiClient = await this.servarrService.getSonarrApiClient(
        ruleGroup.collection.sonarrSettingsId,
      );

      const showResponse = await sonarrApiClient.getSeriesByTvdbId(tvdbId);

      if (!showResponse?.id) {
        return null;
      }

      const season = seasonRatingKey
        ? showResponse.seasons.find((el) => el.seasonNumber === seasonRatingKey)
        : undefined;

      // fetch episode or first episode of the season
      const episode =
        [EPlexDataType.SEASONS, EPlexDataType.EPISODES].includes(dataType) &&
        showResponse.added !== '0001-01-01T00:00:00Z'
          ? (showResponse.id
              ? await sonarrApiClient.getEpisodes(
                  showResponse.id,
                  origLibItem.grandparentRatingKey
                    ? origLibItem.parentIndex
                    : origLibItem.index,
                  [origLibItem.grandparentRatingKey ? origLibItem.index : 1],
                )
              : [])[0]
          : undefined;

      const episodeFile =
        episode?.episodeFileId && dataType === EPlexDataType.EPISODES
          ? await sonarrApiClient.getEpisodeFile(episode.episodeFileId)
          : undefined;

      switch (prop.name) {
        case 'addDate': {
          return showResponse.added &&
            showResponse.added !== '0001-01-01T00:00:00Z'
            ? new Date(showResponse.added)
            : null;
        }
        case 'diskSizeEntireShow': {
          if (
            [EPlexDataType.SEASONS, EPlexDataType.EPISODES].includes(dataType)
          ) {
            if (dataType === EPlexDataType.EPISODES) {
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
          return episodeFile?.path ? episodeFile.path : null;
        }
        case 'episodeNumber': {
          return episode?.episodeNumber != null ? episode.episodeNumber : null;
        }
        case 'tags': {
          const tagIds = showResponse.tags;
          return (await sonarrApiClient.getTags())
            .filter((el) => tagIds.includes(el.id))
            .map((el) => el.label);
        }
        case 'qualityProfileId': {
          if ([EPlexDataType.EPISODES].includes(dataType) && episodeFile) {
            return episodeFile.quality.quality.id;
          } else {
            return showResponse.qualityProfileId;
          }
        }
        case 'firstAirDate': {
          if (
            [EPlexDataType.SEASONS, EPlexDataType.EPISODES].includes(dataType)
          ) {
            return episode?.airDate ? new Date(episode.airDate) : null;
          } else {
            return showResponse.firstAired
              ? new Date(showResponse.firstAired)
              : null;
          }
        }
        case 'seasons': {
          if (
            [EPlexDataType.SEASONS, EPlexDataType.EPISODES].includes(dataType)
          ) {
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
          if (dataType === EPlexDataType.SEASONS) {
            return showResponse.added !== '0001-01-01T00:00:00Z' && season
              ? season.monitored
                ? 1
                : 0
              : null;
          }

          if (dataType === EPlexDataType.EPISODES) {
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
          if (dataType === EPlexDataType.SEASONS) {
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
          if (
            [EPlexDataType.SEASONS, EPlexDataType.EPISODES].includes(dataType)
          ) {
            return season?.statistics?.episodeCount
              ? +season.statistics.episodeCount
              : null;
          } else {
            return showResponse.seasons.filter((el) => el.monitored).length;
          }
        }
        case 'part_of_latest_season': {
          // returns the true when this is the latest season or the episode is part of the latest season
          if (
            [EPlexDataType.SEASONS, EPlexDataType.EPISODES].includes(dataType)
          ) {
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
            origLibItem.index,
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
          return episodeFile?.qualityCutoffNotMet != null
            ? !episodeFile.qualityCutoffNotMet
            : false;
        }
        case 'fileQualityName': {
          return episodeFile?.quality?.quality?.name ?? null;
        }
        case 'qualityProfileName': {
          const showProfile = showResponse.qualityProfileId;

          return (await sonarrApiClient.getProfiles())?.find(
            (el) => el.id === showProfile,
          ).name;
        }
        case 'fileAudioLanguages': {
          return episodeFile?.mediaInfo?.audioLanguages ?? null;
        }
        case 'seriesType': {
          return showResponse.seriesType ?? null;
        }
      }
    } catch (e) {
      this.logger.warn(
        `Sonarr-Getter - Action failed for '${libItem.title}' with id '${libItem.ratingKey}': ${e.message}`,
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

  public async findTvdbidFromPlexLibItem(libItem: PlexLibraryItem) {
    let tvdbid = this.getGuidFromPlexLibItem(libItem, 'tvdb');
    if (!tvdbid) {
      const plexMetaData = await this.plexApi.getMetadata(libItem.ratingKey);
      tvdbid = this.getGuidFromPlexLibItem(plexMetaData, 'tvdb');
      if (!tvdbid) {
        const resp = await this.tmdbIdHelper.getTmdbIdFromPlexData(libItem);
        const tmdb = resp?.id ? resp.id : undefined;
        if (tmdb) {
          const tmdbShow = await this.tmdbApi.getTvShow({ tvId: tmdb });
          if (tmdbShow?.external_ids?.tvdb_id) {
            tvdbid = tmdbShow.external_ids.tvdb_id;
          }
        }
      }
    }

    if (!tvdbid) {
      console.warn(
        `Couldn't find tvdb id for '${libItem.title}', can not run Sonarr rules against this item`,
      );
    }
    return tvdbid;
  }

  private getGuidFromPlexLibItem(
    libItem: PlexLibraryItem | PlexMetadata,
    guiID: 'tvdb' | 'imdb' | 'tmdb',
  ) {
    return libItem.Guid
      ? +libItem.Guid.find((el) => el.id.includes(guiID))?.id?.split('://')[1]
      : libItem.guid.includes(guiID)
        ? +libItem.guid.split('://')[1].split('?')[0]
        : undefined;
  }
}
