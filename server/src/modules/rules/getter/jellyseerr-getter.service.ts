import { Injectable } from '@nestjs/common';
import _ from 'lodash';
import {
  JellyseerrApiService,
  JellyseerrMediaStatus,
  JellyseerrMovieResponse,
  JellyseerrSeasonRequest,
  JellyseerrSeasonResponse,
  JellyseerrTVRequest,
  JellyseerrTVResponse,
} from '../../api/jellyseerr-api/jellyseerr-api.service';
import { EPlexDataType } from '../../api/plex-api/enums/plex-data-type-enum';
import { PlexLibraryItem } from '../../api/plex-api/interfaces/library.interfaces';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { TmdbIdService } from '../../api/tmdb-api/tmdb-id.service';
import { TmdbApiService } from '../../api/tmdb-api/tmdb.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';

@Injectable()
export class JellyseerrGetterService {
  appProperties: Property[];

  constructor(
    private readonly jellyseerrApi: JellyseerrApiService,
    private readonly tmdbApi: TmdbApiService,
    private readonly plexApi: PlexApiService,
    private readonly tmdbIdHelper: TmdbIdService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(JellyseerrGetterService.name);
    const ruleConstanst = new RuleConstants();
    this.appProperties = ruleConstanst.applications.find(
      (el) => el.id === Application.JELLYSEERR,
    ).props;
  }

  async get(id: number, libItem: PlexLibraryItem, dataType?: EPlexDataType) {
    try {
      let origLibItem = undefined;
      let seasonMediaResponse: JellyseerrSeasonResponse = undefined;
      let tvMediaResponse: JellyseerrTVResponse = undefined;
      let movieMediaResponse: JellyseerrMovieResponse = undefined;

      // get original show in case of season / episode
      if (
        dataType === EPlexDataType.SEASONS ||
        dataType === EPlexDataType.EPISODES
      ) {
        origLibItem = _.cloneDeep(libItem);
        libItem = (await this.plexApi.getMetadata(
          dataType === EPlexDataType.SEASONS
            ? libItem.parentRatingKey
            : libItem.grandparentRatingKey,
        )) as unknown as PlexLibraryItem;
      }

      const prop = this.appProperties.find((el) => el.id === id);
      const metadata = await this.plexApi.getMetadata(libItem.ratingKey);
      const tmdb = await this.tmdbIdHelper.getTmdbIdFromPlexData(metadata);
      // const jellyseerrUsers = await this.jellyseerrApi.getUsers();

      if (tmdb && tmdb.id) {
        if (libItem.type === 'movie') {
          movieMediaResponse = await this.jellyseerrApi.getMovie(
            tmdb.id.toString(),
          );
        } else {
          tvMediaResponse = await this.jellyseerrApi.getShow(
            tmdb.id.toString(),
          );
          if (
            dataType === EPlexDataType.SEASONS ||
            dataType === EPlexDataType.EPISODES
          ) {
            seasonMediaResponse = await this.jellyseerrApi.getSeason(
              tmdb.id.toString(),
              dataType === EPlexDataType.SEASONS
                ? origLibItem.index
                : origLibItem.parentIndex,
            );
            if (!seasonMediaResponse) {
              this.logger.debug(
                `Couldn't fetch season data for '${libItem.title}' season ${
                  dataType === EPlexDataType.SEASONS
                    ? origLibItem.index
                    : origLibItem.parentIndex
                } from Jellyseerr. As a result, unreliable results are expected.`,
              );
            }
          }
        }
      } else {
        this.logger.debug(
          `Couldn't find tmdb id for media '${libItem.title}' with id '${libItem.ratingKey}'. As a result, no Jellyseerr query could be made.`,
        );
      }

      const mediaResponse: JellyseerrTVResponse | JellyseerrMovieResponse =
        tvMediaResponse ?? movieMediaResponse;

      if (mediaResponse?.mediaInfo) {
        switch (prop.name) {
          case 'addUser': {
            try {
              const plexUsers = await this.plexApi.getCorrectedUsers();
              const userNames: string[] = [];
              if (mediaResponse.mediaInfo.requests) {
                for (const request of mediaResponse.mediaInfo.requests) {
                  // for seasons, only add if user requested the correct season
                  if (
                    (dataType === EPlexDataType.SEASONS ||
                      dataType === EPlexDataType.EPISODES) &&
                    request.type === 'tv'
                  ) {
                    const includesSeason = this.includesSeason(
                      request.seasons,
                      dataType === EPlexDataType.SEASONS
                        ? origLibItem.index
                        : origLibItem.parentIndex,
                    );
                    if (includesSeason) {
                      if (request.requestedBy?.userType === 2) {
                        userNames.push(request.requestedBy?.username);
                      } else if (
                        request.requestedBy?.userType === 3 ||
                        request.requestedBy?.userType === 4
                      ) {
                        userNames.push(request.requestedBy?.jellyfinUsername);
                      } else {
                        const user = plexUsers.find(
                          (u) => u.plexId === request.requestedBy?.plexId,
                        )?.username;

                        if (user) {
                          userNames.push(user);
                        }
                      }
                    }
                  } else {
                    // for shows and movies, add every request user
                    if (request.requestedBy?.userType === 2) {
                      userNames.push(request.requestedBy?.username);
                    } else if (
                      request.requestedBy?.userType === 3 ||
                      request.requestedBy?.userType === 4
                    ) {
                      userNames.push(request.requestedBy?.jellyfinUsername);
                    } else {
                      const user = plexUsers.find(
                        (u) => u.plexId === request.requestedBy?.plexId,
                      )?.username;

                      if (user) {
                        userNames.push(user);
                      }
                    }
                  }
                }
                return [...new Set(userNames)]; // return only unique usernames
              }
              return [];
            } catch (e) {
              this.logger.warn("Couldn't get addUser from Jellyseerr");
              this.logger.debug(e);
            }
          }
          case 'amountRequested': {
            return [EPlexDataType.SEASONS, EPlexDataType.EPISODES].includes(
              dataType,
            )
              ? this.getSeasonRequests(origLibItem, tvMediaResponse).length
              : mediaResponse?.mediaInfo.requests.length;
          }
          case 'requestDate': {
            if (
              [EPlexDataType.SEASONS, EPlexDataType.EPISODES].includes(dataType)
            ) {
              const createdAt = this.getSeasonRequests(
                origLibItem,
                tvMediaResponse,
              )[0]?.createdAt;

              return createdAt ? new Date(createdAt) : null;
            }
            return mediaResponse?.mediaInfo?.requests[0]?.createdAt
              ? new Date(mediaResponse?.mediaInfo?.requests[0]?.createdAt)
              : null;
          }
          case 'releaseDate': {
            if (libItem.type === 'movie') {
              return movieMediaResponse?.releaseDate
                ? new Date(movieMediaResponse?.releaseDate)
                : null;
            } else {
              if (EPlexDataType.EPISODES === dataType) {
                const ep = seasonMediaResponse.episodes?.find(
                  (el) => el.episodeNumber === origLibItem.index,
                );
                return ep?.airDate ? new Date(ep.airDate) : null;
              } else if (EPlexDataType.SEASONS === dataType) {
                return seasonMediaResponse?.airDate
                  ? new Date(seasonMediaResponse.airDate)
                  : null;
              } else {
                return tvMediaResponse?.firstAirDate
                  ? new Date(tvMediaResponse.firstAirDate)
                  : null;
              }
            }
          }
          case 'approvalDate': {
            if (
              [EPlexDataType.SEASONS, EPlexDataType.EPISODES].includes(dataType)
            ) {
              const season = this.getSeasonRequests(
                origLibItem,
                tvMediaResponse,
              )[0];
              if (season && season.media) {
                if (
                  season.media.status >=
                  JellyseerrMediaStatus.PARTIALLY_AVAILABLE
                ) {
                  return new Date(season.media.updatedAt);
                }
              }
              return null;
            } else {
              return mediaResponse?.mediaInfo.status >=
                JellyseerrMediaStatus.PARTIALLY_AVAILABLE
                ? new Date(mediaResponse?.mediaInfo?.updatedAt)
                : null;
            }
          }
          case 'mediaAddedAt': {
            if (
              [EPlexDataType.SEASONS, EPlexDataType.EPISODES].includes(dataType)
            ) {
              const season = this.getSeasonRequests(
                origLibItem,
                tvMediaResponse,
              )[0];
              if (season && season.media) {
                if (
                  season.media.status >=
                  JellyseerrMediaStatus.PARTIALLY_AVAILABLE
                ) {
                  return new Date(season.media.mediaAddedAt);
                }
              }
              return null;
            } else {
              return mediaResponse?.mediaInfo.status >=
                JellyseerrMediaStatus.PARTIALLY_AVAILABLE
                ? new Date(mediaResponse?.mediaInfo?.mediaAddedAt)
                : null;
            }
          }
          case 'isRequested': {
            try {
              if (
                [EPlexDataType.SEASONS, EPlexDataType.EPISODES].includes(
                  dataType,
                )
              ) {
                return this.getSeasonRequests(origLibItem, tvMediaResponse)
                  .length > 0
                  ? 1
                  : 0;
              } else {
                return mediaResponse?.mediaInfo.requests.length > 0 ? 1 : 0;
              }
            } catch (e) {
              return 0;
            }
          }
          default: {
            return null;
          }
        }
      } else {
        this.logger.debug(
          `Couldn't fetch Jellyseerr metadate for media '${libItem.title}' with id '${libItem.ratingKey}'. As a result, no Jellyseerr query could be made.`,
        );
        return null;
      }
    } catch (e) {
      this.logger.warn(
        `Jellyseerr-Getter - Action failed for '${libItem.title}' with id '${libItem.ratingKey}': ${e.message}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }

  private getSeasonRequests(
    libItem: PlexLibraryItem,
    mediaResponse: JellyseerrTVResponse,
  ) {
    const seasonRequests: JellyseerrTVRequest[] = [];
    mediaResponse.mediaInfo?.requests.forEach((el) => {
      const season = el.seasons.find(
        (season) =>
          +season.seasonNumber ===
          (libItem.type === 'episode' ? +libItem.parentIndex : +libItem.index),
      );
      if (season) {
        seasonRequests.push(el);
      }
    });
    return seasonRequests;
  }

  private includesSeason(
    seasons: JellyseerrSeasonRequest[],
    seasonNumber: number,
  ) {
    const season = seasons.find(
      (season) => season.seasonNumber === seasonNumber,
    );
    return season !== undefined;
  }
}
